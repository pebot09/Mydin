"""Consultas e cálculos: patrimônio, painéis e estatísticas.

PRINCÍPIO CENTRAL: a saúde financeira é medida pela variação do PATRIMÔNIO
(saldo da conta + poupança/investimentos), imune a erro de classificação.
Categorização serve para entender o fluxo, não para medir se está bem.
"""
import datetime as dt

from .db import cfg, cfg_int

TURMAS = ["seg17h", "seg19h", "qui09h", "qui11h"]


def hoje():
    return dt.date.today().isoformat()


def mes_atual():
    return hoje()[:7]


# ───────────────────────── Patrimônio ─────────────────────────

def saldo_conta(db, ate=None):
    """Saldo da conta = saldo inicial + soma de TODO o extrato da conta.
    Inclui pagamento de fatura, repasses etc. — o dinheiro realmente saiu/entrou."""
    where, params = "conta='nuconta'", []
    if ate:
        where += " AND data<=?"
        params.append(ate)
    s = db.execute(f"SELECT COALESCE(SUM(valor_cent),0) s FROM transacoes WHERE {where}", params).fetchone()["s"]
    return cfg_int(db, "saldo_inicial_conta_cent") + s


def saldo_poupanca(db, ate=None):
    """Poupança = valor atual que você informa (você sabe o número real).
    Para meses passados, reconstrói a partir das transferências INT posteriores,
    mas o valor de HOJE é sempre o que você digitou — âncora imune a classificação."""
    atual = cfg_int(db, "saldo_poupanca_atual_cent")
    if not ate or ate >= hoje():
        return atual
    # desconta o que entrou na poupança DEPOIS de 'ate' (aplicações = saídas INT)
    fut = db.execute(
        "SELECT COALESCE(SUM(-valor_cent),0) s FROM transacoes WHERE conta='nuconta' AND categoria_id='INT' AND data>?",
        (ate,),
    ).fetchone()["s"]
    return atual - fut


def patrimonio(db, ate=None):
    return saldo_conta(db, ate) + saldo_poupanca(db, ate)


def saldo_banco_info(db):
    """(saldo informado pelo banco em centavos, data iso) ou (None, None)."""
    v = cfg(db, "saldo_conta_banco_cent")
    return (int(v) if v not in (None, "") else None), cfg(db, "saldo_conta_banco_data")


def variacao_patrimonio_mes(db, mes=None):
    mes = mes or mes_atual()
    ano, m = int(mes[:4]), int(mes[5:7])
    fim_anterior = (dt.date(ano, m, 1) - dt.timedelta(days=1)).isoformat()
    ultimo_dia = (dt.date(ano + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1)).isoformat()
    fim = min(ultimo_dia, hoje()) if mes == mes_atual() else ultimo_dia
    return patrimonio(db, fim) - patrimonio(db, fim_anterior)


# ───────────────────────── Receitas / gastos do mês ─────────────────────────

def _realizadas(extra=""):
    """Filtro padrão: exclui parcelas futuras do cartão (compromissos, não gastos)."""
    return f"data <= date('now') {extra}"


def receita_musica_mes(db, mes=None):
    mes = mes or mes_atual()
    row = db.execute(
        """SELECT COALESCE(SUM(valor_cent),0) s FROM transacoes
           WHERE substr(data,1,7)=? AND valor_cent>0 AND categoria_id IN ('MUS','SUB')""",
        (mes,),
    ).fetchone()
    return row["s"]


def alunos_pagantes_mes(db, mes=None):
    """Alunos distintos com pagamento ENS no mês (via contato → aluno)."""
    mes = mes or mes_atual()
    return db.execute(
        """SELECT a.id, a.nome, a.turma, a.valor_cota_cent,
                  MAX(t.meia) AS meia
           FROM transacoes t
           JOIN contatos c ON c.id = t.contato_id
           JOIN alunos a ON a.id = c.aluno_id
           WHERE substr(t.data,1,7)=? AND t.categoria_id='ENS' AND t.valor_cent>0
           GROUP BY a.id""",
        (mes,),
    ).fetchall()


def receita_ensino_mes(db, mes=None):
    """Regra A: receita de ensino = nº de pagantes × cota (R$ 232,50; meia = metade).
    NÃO depende do valor que cada aluno pagou."""
    pagantes = alunos_pagantes_mes(db, mes)
    total = 0
    for a in pagantes:
        cota = a["valor_cota_cent"] or cfg_int(db, "valor_cota_cent")
        total += cota // 2 if a["meia"] else cota
    return total, len(pagantes)


def ens_sem_aluno_mes(db, mes=None):
    """Pagamentos ENS cujo contato não está vinculado a um aluno (não contam pagante)."""
    mes = mes or mes_atual()
    return db.execute(
        """SELECT COUNT(*) n FROM transacoes t
           LEFT JOIN contatos c ON c.id=t.contato_id
           WHERE substr(t.data,1,7)=? AND t.categoria_id='ENS' AND t.valor_cent>0
             AND (c.id IS NULL OR c.aluno_id IS NULL)""",
        (mes,),
    ).fetchone()["n"]


def gastos_mes(db, mes=None):
    """Gastos por categoria (grupo despesa), líquidos: entradas na mesma categoria
    abatem (ex.: TER — ajuda da mãe deixa a terapia líquida)."""
    mes = mes or mes_atual()
    rows = db.execute(
        """SELECT t.categoria_id cat, COALESCE(SUM(-t.valor_cent),0) s
           FROM transacoes t JOIN categorias k ON k.id=t.categoria_id
           WHERE substr(t.data,1,7)=? AND k.grupo='despesa' AND t.data <= date('now')
           GROUP BY t.categoria_id""",
        (mes,),
    ).fetchall()
    return {r["cat"]: r["s"] for r in rows}


FIXAS = ["MOR", "EST", "TER", "MED"]


def custo_fixo_variavel_mes(db, mes=None):
    g = gastos_mes(db, mes)
    fixo = sum(g.get(c, 0) for c in FIXAS)
    variavel = sum(v for c, v in g.items() if c not in FIXAS)
    return fixo, variavel, g


def _mes_menos(mes, n):
    ano, m = int(mes[:4]), int(mes[5:7])
    idx = ano * 12 + (m - 1) - n
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def alunos_sem_pagamento_mes(db, mes=None, janela=3):
    """Alunos que se ESPERA que paguem e ainda não pagaram no mês.

    'Esperado' = aluno ativo que pagou em algum dos `janela` meses anteriores.
    Assim ex-alunos (sem pagamento recente) nunca aparecem como pendência —
    é a inferência 'pelo padrão' que o app deve fazer, não 'todo ativo'."""
    mes = mes or mes_atual()
    inicio = _mes_menos(mes, janela)
    return db.execute(
        """SELECT a.* FROM alunos a
           WHERE a.ativo=1
             AND EXISTS (
               SELECT 1 FROM transacoes t JOIN contatos c ON c.id=t.contato_id
               WHERE c.aluno_id=a.id AND t.categoria_id='ENS' AND t.valor_cent>0
                 AND substr(t.data,1,7) >= ? AND substr(t.data,1,7) < ?)
             AND NOT EXISTS (
               SELECT 1 FROM transacoes t JOIN contatos c ON c.id=t.contato_id
               WHERE c.aluno_id=a.id AND t.categoria_id='ENS' AND t.valor_cent>0
                 AND substr(t.data,1,7) = ?)
           ORDER BY a.turma, a.nome""",
        (inicio, mes, mes),
    ).fetchall()


def _periodo_where(mes=None, de=None, ate=None, alias="t"):
    conds, params = [f"{alias}.data <= date('now')"], []
    if mes:
        conds.append(f"substr({alias}.data,1,7)=?")
        params.append(mes)
    else:
        if de:
            conds.append(f"{alias}.data>=?")
            params.append(de)
        if ate:
            conds.append(f"{alias}.data<=?")
            params.append(ate)
    return " AND ".join(conds), params


def meses_no_periodo(db, mes=None, de=None, ate=None):
    w, p = _periodo_where(mes, de, ate)
    return [r["m"] for r in db.execute(
        f"SELECT DISTINCT substr(t.data,1,7) m FROM transacoes t WHERE {w} ORDER BY m", p)]


def despesas_por_categoria(db, mes=None, de=None, ate=None):
    """Subtotais de despesa por categoria no período (líquidos: entradas na mesma
    categoria abatem, ex.: ajuda da mãe na terapia)."""
    w, p = _periodo_where(mes, de, ate)
    rows = db.execute(
        f"""SELECT t.categoria_id cat, k.nome nome, COALESCE(SUM(-t.valor_cent),0) s, COUNT(*) n
            FROM transacoes t JOIN categorias k ON k.id=t.categoria_id
            WHERE {w} AND k.grupo='despesa'
            GROUP BY t.categoria_id ORDER BY s DESC""", p).fetchall()
    total = sum(r["s"] for r in rows)
    return rows, total


def transacoes_despesa(db, categoria, mes=None, de=None, ate=None):
    w, p = _periodo_where(mes, de, ate)
    return db.execute(
        f"""SELECT t.*, c.nome contato_nome FROM transacoes t
            LEFT JOIN contatos c ON c.id=t.contato_id
            WHERE {w} AND t.categoria_id=? ORDER BY t.data DESC""", p + [categoria]).fetchall()


def saidas_a_categorizar(db, mes=None, de=None, ate=None):
    """Saídas ainda sem categoria no período — o que falta você classificar."""
    w, p = _periodo_where(mes, de, ate)
    return db.execute(
        f"""SELECT t.*, c.nome contato_nome FROM transacoes t
            LEFT JOIN contatos c ON c.id=t.contato_id
            WHERE {w} AND t.valor_cent<0 AND t.categoria_id IS NULL
              AND t.conta IN ('nuconta','nucartao','manual') AND COALESCE(t.especial,'')=''
            ORDER BY t.data DESC""", p).fetchall()


def receita_ensino_periodo(db, mes=None, de=None, ate=None):
    total, pagantes = 0, 0
    for m in meses_no_periodo(db, mes, de, ate):
        r, n = receita_ensino_mes(db, m)
        total += r
        pagantes += n
    return total, pagantes


def receita_musica_por_cliente(db, mes=None, de=None, ate=None):
    w, p = _periodo_where(mes, de, ate)
    return db.execute(
        f"""SELECT COALESCE(c.nome,'(sem contato)') nome, COALESCE(SUM(t.valor_cent),0) s, COUNT(*) n
            FROM transacoes t LEFT JOIN contatos c ON c.id=t.contato_id
            WHERE {w} AND t.valor_cent>0 AND t.categoria_id IN ('MUS','SUB')
            GROUP BY c.id ORDER BY s DESC""", p).fetchall()


def receitas_periodo(db, mes=None, de=None, ate=None):
    ens, pagantes = receita_ensino_periodo(db, mes, de, ate)
    w, p = _periodo_where(mes, de, ate)
    mus = db.execute(
        f"""SELECT COALESCE(SUM(valor_cent),0) s FROM transacoes t
            WHERE {w} AND valor_cent>0 AND categoria_id IN ('MUS','SUB')""", p).fetchone()["s"]
    sub = db.execute(
        f"""SELECT COALESCE(SUM(valor_cent),0) s FROM transacoes t
            WHERE {w} AND valor_cent>0 AND categoria_id='SUB'""", p).fetchone()["s"]
    return {"ensino": ens, "pagantes": pagantes, "musica": mus, "sub": sub, "total": ens + mus,
            "por_cliente": receita_musica_por_cliente(db, mes, de, ate)}


def compromissos_futuros(db):
    """Parcelas do cartão lançadas para frente — comprometido, não gasto realizado."""
    return db.execute(
        """SELECT substr(data,1,7) mes, COALESCE(SUM(-valor_cent),0) s, COUNT(*) n
           FROM transacoes WHERE conta='nucartao' AND data > date('now') AND valor_cent<0
           GROUP BY substr(data,1,7) ORDER BY mes""",
    ).fetchall()


# ───────────────────────── Painel de ensino ─────────────────────────

def painel_ensino(db, mes=None):
    mes = mes or mes_atual()
    cap_turma = cfg_int(db, "capacidade_turma", 7)
    cota = cfg_int(db, "valor_cota_cent", 23250)
    capacidade = cap_turma * len(TURMAS)          # 28 vagas
    potencial = cota * capacidade                  # R$ 6.510/mês
    receita, n_pagantes = receita_ensino_mes(db, mes)
    turmas = []
    for t in TURMAS:
        ativos = db.execute("SELECT COUNT(*) n FROM alunos WHERE turma=? AND ativo=1", (t,)).fetchone()["n"]
        turmas.append({"turma": t, "ativos": ativos, "vagas": max(0, cap_turma - ativos)})
    return {
        "mes": mes,
        "capacidade": capacidade,
        "potencial_cent": potencial,
        "receita_cent": receita,
        "pagantes": n_pagantes,
        "pct_potencial": (receita / potencial * 100) if potencial else 0,
        "turmas": turmas,
        "nao_pagaram": alunos_sem_pagamento_mes(db, mes),
        "ens_sem_aluno": ens_sem_aluno_mes(db, mes),
    }


# ───────────────────────── Estatísticas ─────────────────────────

def meses_com_dados(db):
    return [r["m"] for r in db.execute(
        "SELECT DISTINCT substr(data,1,7) m FROM transacoes WHERE data<=date('now') ORDER BY m")]


def serie_mensal(db):
    """Série mensal: receita (ensino+música), gasto, sobra e patrimônio no fim do mês."""
    serie = []
    for mes in meses_com_dados(db):
        rec_ens, _ = receita_ensino_mes(db, mes)
        rec_mus = receita_musica_mes(db, mes)
        fixo, variavel, _ = custo_fixo_variavel_mes(db, mes)
        gasto = fixo + variavel
        ano, m = int(mes[:4]), int(mes[5:7])
        fim = (dt.date(ano + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1)).isoformat()
        serie.append({
            "mes": mes,
            "receita_ens": rec_ens,
            "receita_mus": rec_mus,
            "receita": rec_ens + rec_mus,
            "gasto": gasto,
            "sobra": rec_ens + rec_mus - gasto,
            "patrimonio": patrimonio(db, min(fim, hoje())),
        })
    return serie


def estatisticas(db):
    serie = serie_mensal(db)
    if not serie:
        return {"serie": [], "melhor_receita": None, "pior_receita": None,
                "melhor_sobra": None, "pior_sobra": None,
                "prop_mus": 0, "prop_ens": 0, "sazonal": []}
    melhor_r = max(serie, key=lambda s: s["receita"])
    pior_r = min(serie, key=lambda s: s["receita"])
    melhor_s = max(serie, key=lambda s: s["sobra"])
    pior_s = min(serie, key=lambda s: s["sobra"])
    tot_mus = sum(s["receita_mus"] for s in serie)
    tot_ens = sum(s["receita_ens"] for s in serie)
    tot = tot_mus + tot_ens
    # Sazonalidade: média de receita por mês do calendário (jan..dez)
    por_mes = {}
    for s in serie:
        por_mes.setdefault(s["mes"][5:7], []).append(s["receita"])
    sazonal = [{"mes": m, "media": sum(v) // len(v)} for m, v in sorted(por_mes.items())]
    return {
        "serie": serie,
        "melhor_receita": melhor_r, "pior_receita": pior_r,
        "melhor_sobra": melhor_s, "pior_sobra": pior_s,
        "prop_mus": (tot_mus / tot * 100) if tot else 0,
        "prop_ens": (tot_ens / tot * 100) if tot else 0,
        "sazonal": sazonal,
    }


# ───────────────────────── Projetos ─────────────────────────

def resumo_projeto(db, projeto_id):
    p = db.execute("SELECT * FROM projetos WHERE id=?", (projeto_id,)).fetchone()
    if not p:
        return None
    horas = db.execute(
        "SELECT COALESCE(SUM(horas),0) h FROM registros_tempo WHERE projeto_id=?", (projeto_id,)
    ).fetchone()["h"]
    recebido = db.execute(
        "SELECT COALESCE(SUM(valor_cent),0) s FROM transacoes WHERE projeto_id=? AND valor_cent>0",
        (projeto_id,),
    ).fetchone()["s"]
    valor_hora = (recebido / 100 / horas) if horas else None
    return {"projeto": p, "horas": horas, "recebido_cent": recebido, "valor_hora": valor_hora}


def comparativo_projetos(db):
    """Valor/hora real por projeto concluído e média por modalidade."""
    projetos = db.execute(
        "SELECT * FROM projetos WHERE status='concluido' ORDER BY concluido_em DESC").fetchall()
    linhas, por_modalidade = [], {}
    for p in projetos:
        r = resumo_projeto(db, p["id"])
        linhas.append(r)
        if r["horas"]:
            por_modalidade.setdefault(p["modalidade"], []).append(r["recebido_cent"] / 100 / r["horas"])
    medias = {m: sum(v) / len(v) for m, v in por_modalidade.items()}
    return linhas, medias


# ───────────────────────── Contas a receber ─────────────────────────

def contas_a_receber(db):
    mensalidades = alunos_sem_pagamento_mes(db)          # inferidas do padrão
    pendencias = db.execute(
        """SELECT p.*, c.nome contato_nome, pr.titulo projeto_titulo
           FROM pendencias p
           LEFT JOIN contatos c ON c.id=p.contato_id
           LEFT JOIN projetos pr ON pr.id=p.projeto_id
           WHERE p.status='aberta' ORDER BY p.data_esperada""").fetchall()
    reemb_abertos = db.execute(
        """SELECT t.*, c.nome contato_nome,
                  (SELECT COALESCE(SUM(r.valor_cent),0) FROM transacoes r WHERE r.compra_pai_id=t.id) recebido
           FROM transacoes t LEFT JOIN contatos c ON c.id=t.contato_id
           WHERE t.compartilhada=1 AND t.valor_cent<0
           ORDER BY t.data DESC""").fetchall()
    return mensalidades, pendencias, reemb_abertos
