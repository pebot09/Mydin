"""Motor de categorização — regras A–I do negócio.

Princípios:
- O cadastro de contato é a fonte da verdade (valor sozinho nunca confirma aluno).
- Contatos multi-relação vão SEMPRE para revisão manual (regra H) — é feature, não limitação.
- Pagamento de fatura e a perna "Pagamento recebido" da fatura são ignorados (regra E).
- Na dúvida, manda para a fila de revisão em vez de adivinhar.
"""
import re
import unicodedata

from .db import cfg, cfg_int

# Regra F — estabelecimentos do cartão (substring em minúsculas → categoria)
REGRAS_ESTABELECIMENTO = [
    (("99 ride", "pg *99", "dl*99", "dl *99", "uber", "99app", "99*"), "TRA"),
    (("ifd*", "ifood", "99food", "ifd "), "ALI"),
    (("farmacia", "drogaria", "drogasil", "pacheco", "droga raia", "raia", "pague menos", "venancio"), "SAU"),
    (("apple.com", "apple com", "spotify", "google ", "google*", "netflix", "amazon prime", "amazonprime",
      "prime video", "youtube", "hbo", "max.com", "disney", "deezer", "icloud", "dropbox", "openai", "claude.ai"), "ASS"),
]

TETO_ALUNO_CENT = 70000      # R$ 700 — teto RÍGIDO: acima disso NUNCA é mensalidade
PISO_ALUNO_CENT = 18000      # R$ 180
CARIDADE_CENT = 1000         # saída < R$ 10 p/ pessoa física
GERAL_CENT = 10000           # avulso / amigo até R$ 100


def _norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", s).strip().lower()


def _match_estabelecimento(db, memo_lower):
    for padroes, cat in REGRAS_ESTABELECIMENTO:
        for p in padroes:
            if p in memo_lower:
                return cat
    # regras aprendidas (o app aprende: classificou "Padaria X" uma vez, vale sempre)
    for r in db.execute("SELECT padrao, categoria_id FROM regras WHERE tipo='estabelecimento'"):
        if r["padrao"] and r["padrao"] in memo_lower:
            return r["categoria_id"]
    return None


def _regra_contato(db, contato_id):
    row = db.execute(
        "SELECT categoria_id FROM regras WHERE tipo='contato' AND contato_id=? ORDER BY criado_em DESC LIMIT 1",
        (contato_id,),
    ).fetchone()
    return row["categoria_id"] if row else None


def _eh_vendedor_med(db, contato_id):
    return db.execute("SELECT 1 FROM vendedores_med WHERE contato_id=?", (contato_id,)).fetchone() is not None


def _recorrencia_meses(db, contato_id):
    """Nº de meses distintos com entrada na faixa de mensalidade para este contato."""
    row = db.execute(
        """SELECT COUNT(DISTINCT substr(data,1,7)) AS n FROM transacoes
           WHERE contato_id=? AND valor_cent BETWEEN ? AND ?""",
        (contato_id, PISO_ALUNO_CENT, TETO_ALUNO_CENT),
    ).fetchone()
    return row["n"] or 0


def _ocorrencias(db, contato_id):
    row = db.execute("SELECT COUNT(*) AS n FROM transacoes WHERE contato_id=?", (contato_id,)).fetchone()
    return row["n"] or 0


def classificar(db, tx):
    """Classifica uma transação. Retorna (categoria_id, status_revisao, especial).

    tx: dict/Row com data, valor_cent, descricao, conta, contato_id.
    """
    memo = _norm(tx["descricao"])
    valor = tx["valor_cent"]
    conta = tx["conta"]
    contato = None
    if tx["contato_id"]:
        contato = db.execute("SELECT * FROM contatos WHERE id=?", (tx["contato_id"],)).fetchone()

    # ── Regra E: as duas pontas do pagamento de fatura são ignoradas ──
    if conta == "nuconta" and "pagamento de fatura" in memo:
        return None, "auto", "pagamento_fatura"
    if conta == "nucartao" and valor > 0 and memo.startswith("pagamento recebido"):
        return None, "auto", "pagamento_fatura"

    # ── Cartão de crédito (regra F) ──
    if conta == "nucartao":
        if valor > 0:  # estorno de compra
            return "ESTORNO", "auto", None
        cat = _match_estabelecimento(db, memo)
        if cat:
            return cat, "auto", None
        return "CONS", "auto", None  # "Outros" — usuário pode criar regra depois

    # ── Conta corrente ──
    # Regra D: transferências internas (poupança / RDB / mesma titularidade)
    if "rdb" in memo or "aplicacao" in memo.split(" - ")[0] or "resgate" in memo.split(" - ")[0]:
        return "INT", "auto", None
    titular = _norm(cfg(db, "nome_titular", ""))
    if titular and contato and _norm(contato["nome"]) == titular:
        return "INT", "auto", None
    if contato and contato["tipo"] == "interno":
        return "INT", "auto", None

    # Regra H: multi-relação NUNCA é adivinhado — direto para revisão
    if contato and (contato["sempre_revisar"] or contato["tipo"] == "amigo_multi"):
        return None, "revisar", None

    # Regra permanente criada pelo usuário para este contato
    if contato:
        cat = _regra_contato(db, contato["id"])
        if cat:
            return cat, "auto", None

    if "estorno" in memo or "devolucao" in memo:
        return "ESTORNO", "revisar", None

    if valor > 0:
        return _classificar_entrada(db, contato, valor, tx)
    return _classificar_saida(db, contato, valor, memo)


def _classificar_entrada(db, contato, valor, tx):
    if contato:
        # Regra A: contato cadastrado como aluno (ou pagador vinculado a aluno) → automático
        if contato["tipo"] == "aluno" or contato["aluno_id"]:
            return "ENS", "auto", None
        # Regra B: cliente de música cadastrado → toda entrada é receita, qualquer valor
        if contato["tipo"] == "cliente_musica":
            return "MUS", "auto", None
        # Heurística de aluno não cadastrado: recorrência ≥3 meses + faixa + dia 1–12.
        # SUGERE apenas (vai para revisão) — o cadastro é a fonte da verdade.
        if contato["tipo"] == "desconhecido":
            if valor > TETO_ALUNO_CENT:
                return None, "revisar", None  # teto rígido: nunca é mensalidade
            dia = int(tx["data"][8:10])
            if (PISO_ALUNO_CENT <= valor <= TETO_ALUNO_CENT and 1 <= dia <= 12
                    and _recorrencia_meses(db, contato["id"]) >= 3):
                return "ENS", "revisar", None  # sugestão, confirma na fila
    return None, "revisar", None


def _classificar_saida(db, contato, valor, memo):
    absval = -valor
    if contato:
        # Vendedor de medicina conhecido (lista editável)
        if _eh_vendedor_med(db, contato["id"]):
            return "MED", "auto", None
        # Regra G: pix pequenos p/ pessoa física
        if absval < CARIDADE_CENT:
            return "CARIDADE", "auto", None
        if absval <= GERAL_CENT:
            if _ocorrencias(db, contato["id"]) <= 1:
                return "GERAL", "auto", None  # apareceu uma única vez
            if contato["tipo"] in ("familia", "desconhecido"):
                return "GERAL", "auto", None  # despesa com amigo ≤ R$ 100: não perguntar
    else:
        if absval < CARIDADE_CENT:
            return "CARIDADE", "auto", None
    return None, "revisar", None


def aplicar_classificacao(db, ids=None):
    """Roda o motor sobre transações importadas ainda não confirmadas.

    Não toca no que o usuário já confirmou manualmente.
    Retorna (n_auto, n_revisar).
    """
    if ids is not None and not ids:
        return 0, 0
    where = "origem != 'manual' AND status_revisao != 'confirmado'"
    params = []
    if ids is not None:
        where += " AND id IN (%s)" % ",".join("?" * len(ids))
        params = list(ids)
    rows = db.execute(f"SELECT * FROM transacoes WHERE {where}", params).fetchall()
    n_auto = n_rev = 0
    for tx in rows:
        cat, status, especial = classificar(db, tx)
        db.execute(
            "UPDATE transacoes SET categoria_id=?, status_revisao=?, especial=? WHERE id=?",
            (cat, status, especial, tx["id"]),
        )
        if status == "auto":
            n_auto += 1
        else:
            n_rev += 1
    return n_auto, n_rev
