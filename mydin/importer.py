"""Importação de OFX (arquivo único ou vários = carga histórica de pasta).

Deduplicação por FITID (id_externo UNIQUE): reimportar período sobreposto nunca duplica.
"""
from .classify import aplicar_classificacao
from .db import cfg, novo_id, set_cfg
from .ofx import parse_ofx


def achar_ou_criar_contato(db, nome, cpf_mascarado):
    """Identidade do contato = CPF mascarado (impressão digital estável,
    mesmo se a pessoa pagar por bancos diferentes)."""
    row = db.execute("SELECT id, nome FROM contatos WHERE cpf_mascarado=?", (cpf_mascarado,)).fetchone()
    if row:
        return row["id"]
    cid = novo_id()
    db.execute(
        "INSERT INTO contatos (id, nome, cpf_mascarado, tipo) VALUES (?,?,?,'desconhecido')",
        (cid, nome or "(sem nome)", cpf_mascarado),
    )
    return cid


def importar_ofx(db, arquivos):
    """arquivos: lista de (nome, bytes). Retorna lista de resultados por arquivo."""
    resultados = []
    novos_ids = []
    melhor_saldo = None  # saldo do banco mais recente entre os arquivos de conta
    for nome, dados in arquivos:
        try:
            tipo, txs, saldo = parse_ofx(dados)
        except ValueError as e:
            resultados.append({"arquivo": nome, "erro": str(e)})
            continue
        if tipo == "conta" and saldo and saldo["dtasof"]:
            if melhor_saldo is None or saldo["dtasof"] >= melhor_saldo["dtasof"]:
                melhor_saldo = saldo
        conta = "nucartao" if tipo == "cartao" else "nuconta"
        origem = "import_cartao" if tipo == "cartao" else "import_conta"
        n_novas = n_dup = 0
        for t in txs:
            contato_id = None
            if t["contato_cpf"]:
                contato_id = achar_ou_criar_contato(db, t["contato_nome"], t["contato_cpf"])
            tid = novo_id()
            cur = db.execute(
                """INSERT OR IGNORE INTO transacoes
                   (id, data, valor_cent, tipo, descricao, origem, id_externo, conta, contato_id, status_revisao)
                   VALUES (?,?,?,?,?,?,?,?,?,'revisar')""",
                (tid, t["data"], t["valor_cent"],
                 "entrada" if t["valor_cent"] > 0 else "saida",
                 t["descricao"], origem, t["id_externo"], conta, contato_id),
            )
            if cur.rowcount:
                n_novas += 1
                novos_ids.append(tid)
            else:
                n_dup += 1
        resultados.append({"arquivo": nome, "tipo": tipo, "novas": n_novas, "duplicadas": n_dup})
    n_auto, n_rev = aplicar_classificacao(db, novos_ids)
    if melhor_saldo:
        calibrar_saldo_banco(db, melhor_saldo["balamt_cent"], melhor_saldo["dtasof"])
    db.commit()
    return resultados, n_auto, n_rev


def calibrar_saldo_banco(db, balamt_cent, data_iso):
    """Ancora o saldo da conta no valor que o banco informou naquela data.
    Ajusta o 'saldo inicial' para que toda a série calculada bata com a realidade —
    tornando o patrimônio imune a erro de classificação."""
    if not data_iso or db is None:
        return
    prev = cfg(db, "saldo_conta_banco_data")
    if prev and data_iso < prev:
        return  # já temos um saldo mais recente
    soma = db.execute(
        "SELECT COALESCE(SUM(valor_cent),0) s FROM transacoes WHERE conta='nuconta' AND data<=?",
        (data_iso,),
    ).fetchone()["s"]
    set_cfg(db, "saldo_conta_banco_cent", balamt_cent)
    set_cfg(db, "saldo_conta_banco_data", data_iso)
    set_cfg(db, "saldo_inicial_conta_cent", balamt_cent - soma)
