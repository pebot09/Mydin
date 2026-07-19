"""Rotas do Mydin."""
import datetime as dt
import re

from flask import (Blueprint, flash, redirect, render_template, request,
                   send_file, url_for)

from . import services as sv
from .classify import aplicar_classificacao, _norm
from .db import TURMAS, cfg, cfg_int, get_db, novo_id, set_cfg
from .importer import importar_ofx
from .pdf_orc import gerar_pdf_orcamento
from .xlsx_io import exportar, nome_backup, restaurar

bp = Blueprint("mydin", __name__)


@bp.app_context_processor
def _nav():
    db = get_db()
    n = db.execute("SELECT COUNT(*) n FROM transacoes WHERE status_revisao='revisar'").fetchone()["n"]
    return {"nav_revisao": n}


def parse_moeda(s):
    """'1.234,56' / '1234.56' / '1234' → centavos (int) ou None."""
    s = (s or "").strip().replace("R$", "").strip()
    if not s:
        return None
    s = s.replace(".", "").replace(",", ".") if "," in s else s
    try:
        return int(round(float(s) * 100))
    except ValueError:
        return None


def categorias(db, grupos=None):
    q = "SELECT * FROM categorias"
    if grupos:
        q += " WHERE grupo IN (%s)" % ",".join("?" * len(grupos))
        return db.execute(q + " ORDER BY grupo, id", grupos).fetchall()
    return db.execute(q + " ORDER BY grupo, id").fetchall()


# ───────────────────────── Painel principal ─────────────────────────

@bp.route("/")
def dashboard():
    db = get_db()
    mes = request.args.get("mes") or sv.mes_atual()
    rec_ens, pagantes = sv.receita_ensino_mes(db, mes)
    fixo, variavel, gastos = sv.custo_fixo_variavel_mes(db, mes)
    n_revisao = db.execute(
        "SELECT COUNT(*) n FROM transacoes WHERE status_revisao='revisar'").fetchone()["n"]
    return render_template(
        "dashboard.html", mes=mes,
        patrimonio=sv.patrimonio(db),
        saldo_conta=sv.saldo_conta(db),
        saldo_poupanca=sv.saldo_poupanca(db),
        variacao=sv.variacao_patrimonio_mes(db, mes),
        receita_ens=rec_ens, pagantes=pagantes,
        receita_mus=sv.receita_musica_mes(db, mes),
        fixo=fixo, variavel=variavel, gastos=gastos,
        piso_fixo=cfg_int(db, "piso_fixo_cent"),
        nao_pagaram=sv.alunos_sem_pagamento_mes(db, mes),
        n_revisao=n_revisao,
        futuros=sv.compromissos_futuros(db),
        meses=sv.meses_com_dados(db),
    )


# ───────────────────────── Importação ─────────────────────────

@bp.route("/importar", methods=["GET", "POST"])
def importar():
    db = get_db()
    if request.method == "POST":
        arquivos = [(f.filename, f.read()) for f in request.files.getlist("arquivos")
                    if f and f.filename]
        if not arquivos:
            flash("Nenhum arquivo selecionado.", "erro")
            return redirect(url_for("mydin.importar"))
        resultados, n_auto, n_rev = importar_ofx(db, arquivos)
        return render_template("importar.html", resultados=resultados,
                               n_auto=n_auto, n_rev=n_rev)
    return render_template("importar.html", resultados=None)


# ───────────────────────── Fila de revisão ─────────────────────────

@bp.route("/revisao")
def revisao():
    db = get_db()
    txs = db.execute(
        """SELECT t.*, c.nome contato_nome, c.tipo contato_tipo, c.sempre_revisar
           FROM transacoes t LEFT JOIN contatos c ON c.id=t.contato_id
           WHERE t.status_revisao='revisar'
           ORDER BY c.nome IS NULL, c.nome, t.data DESC""").fetchall()
    return render_template("revisao.html", txs=txs, cats=categorias(db))


@bp.route("/revisao/classificar", methods=["POST"])
def revisao_classificar():
    db = get_db()
    ids = request.form.getlist("ids")
    categoria = request.form.get("categoria_id") or None
    if not ids or not categoria:
        flash("Selecione lançamentos e uma categoria.", "erro")
        return redirect(url_for("mydin.revisao"))
    for tid in ids:
        db.execute(
            "UPDATE transacoes SET categoria_id=?, status_revisao='confirmado' WHERE id=?",
            (categoria, tid))
    n_regras = 0
    if request.form.get("criar_regra"):
        n_regras = _criar_regras(db, ids, categoria)
    db.commit()
    msg = f"{len(ids)} lançamento(s) classificados como {categoria}."
    if n_regras:
        msg += f" {n_regras} regra(s) permanente(s) criada(s) e aplicada(s)."
    flash(msg, "ok")
    return redirect(url_for("mydin.revisao"))


def _criar_regras(db, ids, categoria):
    """Cria regras permanentes a partir dos lançamentos classificados:
    contato (conta) ou estabelecimento (cartão). Reaplica nos não confirmados."""
    n = 0
    vistos = set()
    for tid in ids:
        tx = db.execute("SELECT * FROM transacoes WHERE id=?", (tid,)).fetchone()
        if not tx:
            continue
        if tx["conta"] == "nucartao":
            padrao = _norm(tx["descricao"])[:60]
            if padrao and ("est", padrao) not in vistos:
                vistos.add(("est", padrao))
                db.execute(
                    "INSERT INTO regras (id, tipo, padrao, categoria_id) VALUES (?,?,?,?)",
                    (novo_id(), "estabelecimento", padrao, categoria))
                n += 1
        elif tx["contato_id"] and ("cont", tx["contato_id"]) not in vistos:
            vistos.add(("cont", tx["contato_id"]))
            db.execute(
                "INSERT INTO regras (id, tipo, contato_id, categoria_id) VALUES (?,?,?,?)",
                (novo_id(), "contato", tx["contato_id"], categoria))
            n += 1
    aplicar_classificacao(db)  # aplica retroativamente nos não confirmados
    return n


# ───────────────────────── Transações ─────────────────────────

@bp.route("/transacoes")
def transacoes():
    db = get_db()
    where, params = ["1=1"], []
    mes = request.args.get("mes")
    if mes:
        where.append("substr(t.data,1,7)=?")
        params.append(mes)
    cat = request.args.get("categoria")
    if cat == "(sem)":
        where.append("t.categoria_id IS NULL")
    elif cat:
        where.append("t.categoria_id=?")
        params.append(cat)
    conta = request.args.get("conta")
    if conta:
        where.append("t.conta=?")
        params.append(conta)
    contato = request.args.get("contato")
    if contato:
        where.append("t.contato_id=?")
        params.append(contato)
    q = request.args.get("q")
    if q:
        where.append("(t.descricao LIKE ? OR c.nome LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    txs = db.execute(
        f"""SELECT t.*, c.nome contato_nome FROM transacoes t
            LEFT JOIN contatos c ON c.id=t.contato_id
            WHERE {' AND '.join(where)}
            ORDER BY t.data DESC LIMIT 500""", params).fetchall()
    total = sum(t["valor_cent"] for t in txs)
    return render_template("transacoes.html", txs=txs, cats=categorias(db),
                           total=total, meses=sv.meses_com_dados(db))


@bp.route("/transacoes/nova", methods=["GET", "POST"])
def transacao_nova():
    db = get_db()
    if request.method == "POST":
        valor = parse_moeda(request.form.get("valor"))
        data = request.form.get("data") or sv.hoje()
        if valor is None or valor == 0:
            flash("Valor inválido.", "erro")
            return redirect(url_for("mydin.transacao_nova"))
        if request.form.get("tipo") == "saida":
            valor = -abs(valor)
        else:
            valor = abs(valor)
        tid = novo_id()
        db.execute(
            """INSERT INTO transacoes (id, data, valor_cent, tipo, categoria_id, descricao,
               origem, conta, contato_id, projeto_id, status_revisao)
               VALUES (?,?,?,?,?,?,'manual','manual',?,?,'confirmado')""",
            (tid, data, valor, "entrada" if valor > 0 else "saida",
             request.form.get("categoria_id") or None,
             request.form.get("descricao"),
             request.form.get("contato_id") or None,
             request.form.get("projeto_id") or None))
        db.commit()
        flash("Lançamento manual criado.", "ok")
        return redirect(url_for("mydin.transacao_edit", tid=tid))
    contatos = db.execute("SELECT id, nome FROM contatos ORDER BY nome").fetchall()
    projetos = db.execute("SELECT id, titulo FROM projetos ORDER BY criado_em DESC").fetchall()
    return render_template("transacao_form.html", tx=None, cats=categorias(db),
                           contatos=contatos, projetos=projetos, reembolsos=[], pago_estudio=None)


@bp.route("/transacoes/<tid>", methods=["GET", "POST"])
def transacao_edit(tid):
    db = get_db()
    tx = db.execute(
        """SELECT t.*, c.nome contato_nome FROM transacoes t
           LEFT JOIN contatos c ON c.id=t.contato_id WHERE t.id=?""", (tid,)).fetchone()
    if not tx:
        flash("Transação não encontrada.", "erro")
        return redirect(url_for("mydin.transacoes"))
    if request.method == "POST":
        db.execute(
            """UPDATE transacoes SET categoria_id=?, contato_id=?, projeto_id=?,
               compartilhada=?, meia=?, compra_pai_id=?, status_revisao='confirmado', especial=?
               WHERE id=?""",
            (request.form.get("categoria_id") or None,
             request.form.get("contato_id") or None,
             request.form.get("projeto_id") or None,
             1 if request.form.get("compartilhada") else 0,
             1 if request.form.get("meia") else 0,
             request.form.get("compra_pai_id") or None,
             tx["especial"], tid))
        db.commit()
        flash("Transação atualizada.", "ok")
        return redirect(url_for("mydin.transacao_edit", tid=tid))
    contatos = db.execute("SELECT id, nome FROM contatos ORDER BY nome").fetchall()
    projetos = db.execute("SELECT id, titulo FROM projetos ORDER BY criado_em DESC").fetchall()
    # reembolsos vinculáveis (regra I): entradas REEMB do mesmo período
    reembolsos = db.execute(
        """SELECT t.*, c.nome contato_nome FROM transacoes t
           LEFT JOIN contatos c ON c.id=t.contato_id
           WHERE t.compra_pai_id=? ORDER BY t.data""", (tid,)).fetchall()
    pago_estudio = None
    if tx["categoria_id"] == "EST" and tx["valor_cent"] < 0:
        aluguel = cfg_int(db, "aluguel_estudio_cent")
        if -tx["valor_cent"] < aluguel:
            pago_estudio = aluguel + tx["valor_cent"]  # diferença trocada por trabalho
    return render_template("transacao_form.html", tx=tx, cats=categorias(db),
                           contatos=contatos, projetos=projetos,
                           reembolsos=reembolsos, pago_estudio=pago_estudio)


@bp.route("/transacoes/<tid>/abatimento", methods=["POST"])
def abatimento(tid):
    """Regra B: paguei menos que R$ 1.500 de aluguel → diferença é trabalho meu.
    Cria o par: saída EST + entrada SUB pela diferença (patrimônio inalterado)."""
    db = get_db()
    tx = db.execute("SELECT * FROM transacoes WHERE id=?", (tid,)).fetchone()
    if not tx or tx["categoria_id"] != "EST" or tx["valor_cent"] >= 0:
        flash("Abatimento só se aplica a pagamentos de aluguel do estúdio (EST).", "erro")
        return redirect(url_for("mydin.transacao_edit", tid=tid))
    aluguel = cfg_int(db, "aluguel_estudio_cent")
    diff = aluguel + tx["valor_cent"]
    if diff <= 0:
        flash("Pagamento já cobre o aluguel cheio — nada a abater.", "erro")
        return redirect(url_for("mydin.transacao_edit", tid=tid))
    ja = db.execute(
        "SELECT 1 FROM transacoes WHERE especial='abatimento' AND compra_pai_id=?", (tid,)).fetchone()
    if ja:
        flash("Abatimento já registrado para este pagamento.", "erro")
        return redirect(url_for("mydin.transacao_edit", tid=tid))
    memo = f"Abatimento aluguel estúdio {tx['data'][:7]} — trabalho trocado por aluguel"
    db.execute(
        """INSERT INTO transacoes (id, data, valor_cent, tipo, categoria_id, descricao,
           origem, conta, contato_id, status_revisao, especial, compra_pai_id)
           VALUES (?,?,?,?,?,?,'manual','ajuste',?,'confirmado','abatimento',?)""",
        (novo_id(), tx["data"], -diff, "saida", "EST", memo, tx["contato_id"], tid))
    db.execute(
        """INSERT INTO transacoes (id, data, valor_cent, tipo, categoria_id, descricao,
           origem, conta, contato_id, status_revisao, especial, compra_pai_id)
           VALUES (?,?,?,?,?,?,'manual','ajuste',?,'confirmado','abatimento',?)""",
        (novo_id(), tx["data"], diff, "entrada", "SUB", memo, tx["contato_id"], tid))
    db.commit()
    flash(f"Abatimento registrado: EST completa R$ 1.500 e SUB recebe a diferença.", "ok")
    return redirect(url_for("mydin.transacao_edit", tid=tid))


# ───────────────────────── Contatos ─────────────────────────

@bp.route("/contatos")
def contatos():
    db = get_db()
    q = request.args.get("q", "")
    rows = db.execute(
        """SELECT c.*, a.nome aluno_nome,
                  (SELECT COUNT(*) FROM transacoes t WHERE t.contato_id=c.id) n_tx
           FROM contatos c LEFT JOIN alunos a ON a.id=c.aluno_id
           WHERE c.nome LIKE ? OR c.cpf_mascarado LIKE ?
           ORDER BY n_tx DESC, c.nome""", (f"%{q}%", f"%{q}%")).fetchall()
    return render_template("contatos.html", contatos=rows, q=q)


@bp.route("/contatos/novo", methods=["POST"])
def contato_novo():
    db = get_db()
    nome = (request.form.get("nome") or "").strip()
    if not nome:
        flash("Nome é obrigatório.", "erro")
        return redirect(url_for("mydin.contatos"))
    cid = novo_id()
    db.execute(
        "INSERT INTO contatos (id, nome, cpf_mascarado, tipo) VALUES (?,?,?,?)",
        (cid, nome, request.form.get("cpf_mascarado") or None,
         request.form.get("tipo") or "desconhecido"))
    db.commit()
    return redirect(url_for("mydin.contato_edit", cid=cid))


@bp.route("/contatos/<cid>", methods=["GET", "POST"])
def contato_edit(cid):
    db = get_db()
    c = db.execute("SELECT * FROM contatos WHERE id=?", (cid,)).fetchone()
    if not c:
        flash("Contato não encontrado.", "erro")
        return redirect(url_for("mydin.contatos"))
    if request.method == "POST":
        db.execute(
            """UPDATE contatos SET nome=?, cpf_mascarado=?, tipo=?, aluno_id=?, sempre_revisar=?
               WHERE id=?""",
            ((request.form.get("nome") or c["nome"]).strip(),
             request.form.get("cpf_mascarado") or None,
             request.form.get("tipo") or "desconhecido",
             request.form.get("aluno_id") or None,
             1 if request.form.get("sempre_revisar") else 0, cid))
        if request.form.get("reclassificar"):
            aplicar_classificacao(db)
        db.commit()
        flash("Contato atualizado.", "ok")
        return redirect(url_for("mydin.contato_edit", cid=cid))
    alunos = db.execute("SELECT id, nome FROM alunos ORDER BY nome").fetchall()
    txs = db.execute(
        "SELECT * FROM transacoes WHERE contato_id=? ORDER BY data DESC LIMIT 50", (cid,)).fetchall()
    regras = db.execute(
        "SELECT * FROM regras WHERE contato_id=?", (cid,)).fetchall()
    eh_vendedor = db.execute("SELECT 1 FROM vendedores_med WHERE contato_id=?", (cid,)).fetchone()
    return render_template("contato_form.html", c=c, alunos=alunos, txs=txs,
                           regras=regras, eh_vendedor=bool(eh_vendedor), cats=categorias(db))


@bp.route("/contatos/<cid>/regra", methods=["POST"])
def contato_regra(cid):
    db = get_db()
    categoria = request.form.get("categoria_id")
    if categoria:
        db.execute("DELETE FROM regras WHERE tipo='contato' AND contato_id=?", (cid,))
        db.execute("INSERT INTO regras (id, tipo, contato_id, categoria_id) VALUES (?,?,?,?)",
                   (novo_id(), "contato", cid, categoria))
        aplicar_classificacao(db)
        db.commit()
        flash("Regra criada e aplicada aos lançamentos não confirmados.", "ok")
    return redirect(url_for("mydin.contato_edit", cid=cid))


@bp.route("/contatos/<cid>/vendedor-med", methods=["POST"])
def contato_vendedor(cid):
    db = get_db()
    if request.form.get("remover"):
        db.execute("DELETE FROM vendedores_med WHERE contato_id=?", (cid,))
        flash("Removido da lista de vendedores de medicina.", "ok")
    else:
        db.execute("INSERT OR IGNORE INTO vendedores_med (id, contato_id) VALUES (?,?)",
                   (novo_id(), cid))
        aplicar_classificacao(db)
        flash("Adicionado como vendedor de medicina (MED automático).", "ok")
    db.commit()
    return redirect(url_for("mydin.contato_edit", cid=cid))


# ───────────────────────── Alunos / Ensino ─────────────────────────

@bp.route("/ensino")
def ensino():
    db = get_db()
    mes = request.args.get("mes") or sv.mes_atual()
    painel = sv.painel_ensino(db, mes)
    alunos = db.execute(
        """SELECT a.*, GROUP_CONCAT(c.nome, ', ') pagadores
           FROM alunos a LEFT JOIN contatos c ON c.aluno_id=a.id
           GROUP BY a.id ORDER BY a.ativo DESC, a.turma, a.nome""").fetchall()
    return render_template("ensino.html", p=painel, alunos=alunos, turmas=TURMAS,
                           meses=sv.meses_com_dados(db), mes=mes)


@bp.route("/alunos/novo", methods=["POST"])
def aluno_novo():
    db = get_db()
    nome = (request.form.get("nome") or "").strip()
    if not nome:
        flash("Nome do aluno é obrigatório.", "erro")
        return redirect(url_for("mydin.ensino"))
    cota = parse_moeda(request.form.get("valor_cota")) or cfg_int(db, "valor_cota_cent")
    db.execute("INSERT INTO alunos (id, nome, turma, ativo, valor_cota_cent) VALUES (?,?,?,1,?)",
               (novo_id(), nome, request.form.get("turma") or None, cota))
    db.commit()
    flash("Aluno cadastrado. Vincule o(s) pagador(es) na tela de contatos.", "ok")
    return redirect(url_for("mydin.ensino"))


@bp.route("/alunos/<aid>", methods=["POST"])
def aluno_edit(aid):
    db = get_db()
    cota = parse_moeda(request.form.get("valor_cota"))
    db.execute("UPDATE alunos SET nome=?, turma=?, ativo=?, valor_cota_cent=COALESCE(?, valor_cota_cent) WHERE id=?",
               ((request.form.get("nome") or "").strip() or None,
                request.form.get("turma") or None,
                1 if request.form.get("ativo") else 0, cota, aid))
    db.commit()
    return redirect(url_for("mydin.ensino"))


# ───────────────────────── Projetos (música) ─────────────────────────

MODALIDADES = ["por_hora", "gravacao_unica", "por_musica", "pacote"]


@bp.route("/projetos")
def projetos():
    db = get_db()
    rows = db.execute(
        """SELECT p.*, c.nome cliente_nome,
                  (SELECT COALESCE(SUM(horas),0) FROM registros_tempo r WHERE r.projeto_id=p.id) horas,
                  (SELECT COALESCE(SUM(valor_cent),0) FROM transacoes t WHERE t.projeto_id=p.id AND t.valor_cent>0) recebido
           FROM projetos p LEFT JOIN contatos c ON c.id=p.cliente_id
           ORDER BY CASE p.status WHEN 'em_andamento' THEN 0 WHEN 'aprovado' THEN 1
                    WHEN 'orcamento' THEN 2 ELSE 3 END, p.criado_em DESC""").fetchall()
    concluidos, medias = sv.comparativo_projetos(db)
    clientes = db.execute("SELECT id, nome FROM contatos ORDER BY nome").fetchall()
    return render_template("projetos.html", projetos=rows, clientes=clientes,
                           modalidades=MODALIDADES, concluidos=concluidos, medias=medias)


@bp.route("/projetos/novo", methods=["POST"])
def projeto_novo():
    db = get_db()
    titulo = (request.form.get("titulo") or "").strip()
    if not titulo:
        flash("Título é obrigatório.", "erro")
        return redirect(url_for("mydin.projetos"))
    valor = parse_moeda(request.form.get("valor_orcado")) or 0
    sinal = parse_moeda(request.form.get("valor_sinal"))
    if sinal is None:
        sinal = valor // 2  # tipicamente 50% de sinal
    pid = novo_id()
    db.execute(
        """INSERT INTO projetos (id, cliente_id, titulo, descricao, modalidade,
           valor_orcado_cent, valor_sinal_cent, valor_saldo_cent)
           VALUES (?,?,?,?,?,?,?,?)""",
        (pid, request.form.get("cliente_id") or None, titulo,
         request.form.get("descricao"), request.form.get("modalidade") or "por_hora",
         valor, sinal, valor - sinal))
    db.commit()
    return redirect(url_for("mydin.projeto_detalhe", pid=pid))


@bp.route("/projetos/<pid>", methods=["GET", "POST"])
def projeto_detalhe(pid):
    db = get_db()
    r = sv.resumo_projeto(db, pid)
    if not r:
        flash("Projeto não encontrado.", "erro")
        return redirect(url_for("mydin.projetos"))
    if request.method == "POST":
        valor = parse_moeda(request.form.get("valor_orcado"))
        sinal = parse_moeda(request.form.get("valor_sinal"))
        saldo = parse_moeda(request.form.get("valor_saldo"))
        db.execute(
            """UPDATE projetos SET titulo=?, descricao=?, modalidade=?, cliente_id=?,
               valor_orcado_cent=COALESCE(?, valor_orcado_cent),
               valor_sinal_cent=COALESCE(?, valor_sinal_cent),
               valor_saldo_cent=COALESCE(?, valor_saldo_cent),
               sinal_pago=?, saldo_pago=? WHERE id=?""",
            ((request.form.get("titulo") or r["projeto"]["titulo"]).strip(),
             request.form.get("descricao"),
             request.form.get("modalidade") or r["projeto"]["modalidade"],
             request.form.get("cliente_id") or None,
             valor, sinal, saldo,
             1 if request.form.get("sinal_pago") else 0,
             1 if request.form.get("saldo_pago") else 0, pid))
        db.commit()
        flash("Projeto atualizado.", "ok")
        return redirect(url_for("mydin.projeto_detalhe", pid=pid))
    tempos = db.execute(
        "SELECT * FROM registros_tempo WHERE projeto_id=? ORDER BY data DESC", (pid,)).fetchall()
    txs = db.execute(
        "SELECT * FROM transacoes WHERE projeto_id=? ORDER BY data DESC", (pid,)).fetchall()
    parcelas = db.execute(
        "SELECT * FROM pendencias WHERE projeto_id=? ORDER BY data_esperada", (pid,)).fetchall()
    clientes = db.execute("SELECT id, nome FROM contatos ORDER BY nome").fetchall()
    return render_template("projeto_detalhe.html", r=r, tempos=tempos, txs=txs,
                           parcelas=parcelas, clientes=clientes, modalidades=MODALIDADES)


@bp.route("/projetos/<pid>/status", methods=["POST"])
def projeto_status(pid):
    db = get_db()
    status = request.form.get("status")
    if status in ("orcamento", "aprovado", "em_andamento", "concluido"):
        db.execute("UPDATE projetos SET status=?, concluido_em=? WHERE id=?",
                   (status, sv.hoje() if status == "concluido" else None, pid))
        db.commit()
        flash(f"Status: {status.replace('_', ' ')}.", "ok")
    return redirect(url_for("mydin.projeto_detalhe", pid=pid))


@bp.route("/projetos/<pid>/tempo", methods=["POST"])
def projeto_tempo(pid):
    """Registro de tempo — cronômetro (segundos medidos no navegador) OU manual (horas)."""
    db = get_db()
    metodo = request.form.get("metodo", "manual")
    if metodo == "cronometro":
        try:
            segundos = int(request.form.get("segundos", "0"))
        except ValueError:
            segundos = 0
        horas = round(segundos / 3600, 2)
    else:
        try:
            horas = float((request.form.get("horas") or "0").replace(",", "."))
        except ValueError:
            horas = 0
    if horas <= 0:
        flash("Tempo inválido.", "erro")
        return redirect(url_for("mydin.projeto_detalhe", pid=pid))
    db.execute(
        "INSERT INTO registros_tempo (id, projeto_id, data, horas, descricao, metodo) VALUES (?,?,?,?,?,?)",
        (novo_id(), pid, request.form.get("data") or sv.hoje(), horas,
         request.form.get("descricao"), metodo))
    db.commit()
    flash(f"{horas:.2f}h registradas ({metodo}).", "ok")
    return redirect(url_for("mydin.projeto_detalhe", pid=pid))


@bp.route("/projetos/<pid>/tempo/<rid>/excluir", methods=["POST"])
def projeto_tempo_excluir(pid, rid):
    db = get_db()
    db.execute("DELETE FROM registros_tempo WHERE id=? AND projeto_id=?", (rid, pid))
    db.commit()
    return redirect(url_for("mydin.projeto_detalhe", pid=pid))


@bp.route("/projetos/<pid>/parcelas", methods=["POST"])
def projeto_parcelas(pid):
    """Cliente parcelou (ex.: 4× R$ 500) → gera pendências para as parcelas futuras."""
    db = get_db()
    p = db.execute("SELECT * FROM projetos WHERE id=?", (pid,)).fetchone()
    try:
        n = int(request.form.get("n_parcelas", "0"))
    except ValueError:
        n = 0
    valor = parse_moeda(request.form.get("valor_parcela"))
    inicio = request.form.get("primeira_data") or sv.hoje()
    if not p or n < 1 or not valor:
        flash("Informe nº de parcelas e valor.", "erro")
        return redirect(url_for("mydin.projeto_detalhe", pid=pid))
    d = dt.date.fromisoformat(inicio)
    for i in range(n):
        venc = (d.replace(day=1) + dt.timedelta(days=32 * i)).replace(day=min(d.day, 28))
        db.execute(
            """INSERT INTO pendencias (id, tipo, contato_id, projeto_id, valor_esperado_cent,
               data_esperada, obs) VALUES (?,?,?,?,?,?,?)""",
            (novo_id(), "parcela_projeto", p["cliente_id"], pid, valor, venc.isoformat(),
             f"Parcela {i + 1}/{n}"))
    db.commit()
    flash(f"{n} parcelas geradas.", "ok")
    return redirect(url_for("mydin.projeto_detalhe", pid=pid))


@bp.route("/projetos/<pid>/pdf")
def projeto_pdf(pid):
    db = get_db()
    p = db.execute("SELECT * FROM projetos WHERE id=?", (pid,)).fetchone()
    if not p:
        return redirect(url_for("mydin.projetos"))
    cliente = None
    if p["cliente_id"]:
        cliente = db.execute("SELECT * FROM contatos WHERE id=?", (p["cliente_id"],)).fetchone()
    pdf = gerar_pdf_orcamento(p, cliente, cfg(db, "nome_titular", ""))
    import io
    slug = re.sub(r"[^a-z0-9]+", "-", p["titulo"].lower()).strip("-") or "projeto"
    return send_file(io.BytesIO(pdf), mimetype="application/pdf", as_attachment=True,
                     download_name=f"orcamento-{slug}.pdf")


# ───────────────────────── Contas a receber ─────────────────────────

@bp.route("/pendencias")
def pendencias():
    db = get_db()
    mensalidades, abertas, reemb = sv.contas_a_receber(db)
    contatos_l = db.execute("SELECT id, nome FROM contatos ORDER BY nome").fetchall()
    return render_template("pendencias.html", mensalidades=mensalidades,
                           pendencias=abertas, reembolsos=reemb, contatos=contatos_l)


@bp.route("/pendencias/nova", methods=["POST"])
def pendencia_nova():
    db = get_db()
    valor = parse_moeda(request.form.get("valor"))
    if not valor:
        flash("Valor inválido.", "erro")
        return redirect(url_for("mydin.pendencias"))
    db.execute(
        """INSERT INTO pendencias (id, tipo, contato_id, valor_esperado_cent, data_esperada, obs)
           VALUES (?,?,?,?,?,?)""",
        (novo_id(), request.form.get("tipo") or "reembolso",
         request.form.get("contato_id") or None, valor,
         request.form.get("data_esperada") or None, request.form.get("obs")))
    db.commit()
    flash("Pendência criada.", "ok")
    return redirect(url_for("mydin.pendencias"))


@bp.route("/pendencias/<pid>/status", methods=["POST"])
def pendencia_status(pid):
    db = get_db()
    status = request.form.get("status")
    if status in ("aberta", "paga", "cancelada"):
        db.execute("UPDATE pendencias SET status=? WHERE id=?", (status, pid))
        db.commit()
    ref = request.form.get("voltar") or url_for("mydin.pendencias")
    return redirect(ref)


# ───────────────────────── Estatísticas ─────────────────────────

@bp.route("/estatisticas")
def estatisticas():
    db = get_db()
    return render_template("estatisticas.html", e=sv.estatisticas(db))


# ───────────────────────── Backup ─────────────────────────

@bp.route("/backup", methods=["GET", "POST"])
def backup():
    db = get_db()
    if request.method == "POST":
        f = request.files.get("arquivo")
        if not f or not f.filename:
            flash("Selecione um arquivo .xlsx de backup.", "erro")
            return redirect(url_for("mydin.backup"))
        if not request.form.get("confirmar"):
            flash("Marque a confirmação — a restauração SUBSTITUI todos os dados atuais.", "erro")
            return redirect(url_for("mydin.backup"))
        try:
            contagens = restaurar(db, f.read())
        except Exception as e:
            flash(f"Falha na restauração: {e}", "erro")
            return redirect(url_for("mydin.backup"))
        flash("Backup restaurado: " + ", ".join(f"{t}={n}" for t, n in contagens.items()), "ok")
        return redirect(url_for("mydin.dashboard"))
    return render_template("backup.html")


@bp.route("/backup/exportar")
def backup_exportar():
    db = get_db()
    return send_file(exportar(db),
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     as_attachment=True, download_name=nome_backup())


# ───────────────────────── Configurações ─────────────────────────

@bp.route("/config", methods=["GET", "POST"])
def config():
    db = get_db()
    if request.method == "POST":
        set_cfg(db, "nome_titular", (request.form.get("nome_titular") or "").strip())
        for chave in ("valor_cota_cent", "aluguel_estudio_cent", "piso_fixo_cent",
                      "saldo_inicial_conta_cent", "saldo_inicial_poupanca_cent"):
            v = parse_moeda(request.form.get(chave))
            if v is not None:
                set_cfg(db, chave, v)
        cap = request.form.get("capacidade_turma")
        if cap and cap.isdigit():
            set_cfg(db, "capacidade_turma", cap)
        db.commit()
        flash("Configurações salvas.", "ok")
        return redirect(url_for("mydin.config"))
    valores = {r["chave"]: r["valor"] for r in db.execute("SELECT * FROM config")}
    vendedores = db.execute(
        """SELECT v.id vid, c.* FROM vendedores_med v JOIN contatos c ON c.id=v.contato_id
           ORDER BY c.nome""").fetchall()
    regras = db.execute(
        """SELECT r.*, c.nome contato_nome FROM regras r
           LEFT JOIN contatos c ON c.id=r.contato_id ORDER BY r.criado_em DESC""").fetchall()
    return render_template("config.html", v=valores, vendedores=vendedores, regras=regras)


@bp.route("/regras/<rid>/excluir", methods=["POST"])
def regra_excluir(rid):
    db = get_db()
    db.execute("DELETE FROM regras WHERE id=?", (rid,))
    db.commit()
    flash("Regra removida.", "ok")
    return redirect(request.form.get("voltar") or url_for("mydin.config"))
