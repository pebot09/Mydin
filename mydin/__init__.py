"""Mydin — gestão financeira e de trabalho, local-first."""
import datetime as dt
import os

from flask import Flask

from . import db as dbm


def fmt_moeda(cent):
    if cent is None:
        return "—"
    neg = cent < 0
    v = f"{abs(cent) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-R$ " if neg else "R$ ") + v


def fmt_data(iso):
    if not iso:
        return "—"
    try:
        return dt.date.fromisoformat(str(iso)[:10]).strftime("%d/%m/%Y")
    except ValueError:
        return str(iso)


def fmt_mes(m):
    meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
    try:
        return f"{meses[int(m[5:7]) - 1]}/{m[2:4]}"
    except (ValueError, IndexError):
        return m


TURMA_LABEL = {"seg17h": "Seg 17h", "seg19h": "Seg 19h", "qui09h": "Qui 09h", "qui11h": "Qui 11h"}


def create_app():
    app = Flask(__name__)
    # Chave apenas para assinar o cookie de sessão local (mensagens flash) —
    # gerada em runtime, nada hardcoded nem persistido.
    app.secret_key = os.urandom(32)
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024

    dbm.init_db()
    app.teardown_appcontext(dbm.close_db)

    app.jinja_env.filters["moeda"] = fmt_moeda
    app.jinja_env.filters["data_br"] = fmt_data
    app.jinja_env.filters["mes_br"] = fmt_mes
    app.jinja_env.filters["turma"] = lambda t: TURMA_LABEL.get(t, t or "—")

    from .routes import bp
    app.register_blueprint(bp)
    return app
