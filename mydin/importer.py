"""Importação de OFX (arquivo único ou vários = carga histórica de pasta).

Deduplicação por FITID (id_externo UNIQUE): reimportar período sobreposto nunca duplica.
"""
from .classify import aplicar_classificacao
from .db import novo_id
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
    for nome, dados in arquivos:
        try:
            tipo, txs = parse_ofx(dados)
        except ValueError as e:
            resultados.append({"arquivo": nome, "erro": str(e)})
            continue
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
    db.commit()
    return resultados, n_auto, n_rev
