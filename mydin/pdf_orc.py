"""Geração de PDF de orçamento para projetos de música."""
import datetime as dt

from fpdf import FPDF

MODALIDADES = {
    "por_hora": "Por hora",
    "gravacao_unica": "Gravação única",
    "por_musica": "Por música",
    "pacote": "Pacote de músicas",
}


def _fmt(cent):
    v = f"{cent / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {v}"


def _latin(s):
    """Fontes core do PDF são latin-1 — troca o que não couber."""
    return str(s).replace("—", "-").replace("–", "-").encode("latin-1", "replace").decode("latin-1")


def gerar_pdf_orcamento(projeto, cliente, nome_titular=""):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(True, margin=20)

    pdf.set_font("helvetica", "B", 22)
    pdf.cell(0, 12, "Orçamento - Produção Musical", new_x="LMARGIN", new_y="NEXT")
    if nome_titular:
        pdf.set_font("helvetica", "", 11)
        pdf.cell(0, 7, nome_titular, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 10)
    pdf.set_text_color(120)
    pdf.cell(0, 6, "Emitido em " + dt.date.today().strftime("%d/%m/%Y"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0)
    pdf.ln(6)

    def linha(rotulo, valor):
        pdf.set_font("helvetica", "B", 11)
        pdf.cell(45, 8, rotulo)
        pdf.set_font("helvetica", "", 11)
        pdf.multi_cell(0, 8, _latin(valor), new_x="LMARGIN", new_y="NEXT")

    linha("Cliente:", cliente["nome"] if cliente else "-")
    linha("Projeto:", projeto["titulo"])
    linha("Modalidade:", MODALIDADES.get(projeto["modalidade"], projeto["modalidade"]))
    if projeto["descricao"]:
        linha("Descrição:", projeto["descricao"])
    pdf.ln(4)

    pdf.set_fill_color(240, 240, 240)
    pdf.set_font("helvetica", "B", 13)
    pdf.cell(0, 12, "  Valor total: " + _fmt(projeto["valor_orcado_cent"]), fill=True,
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    sinal = projeto["valor_sinal_cent"] or projeto["valor_orcado_cent"] // 2
    saldo = projeto["valor_saldo_cent"] or (projeto["valor_orcado_cent"] - sinal)
    pdf.set_font("helvetica", "", 11)
    pdf.cell(0, 7, f"Condições: {_fmt(sinal)} de sinal para início + {_fmt(saldo)} na entrega.",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)
    pdf.set_font("helvetica", "I", 9)
    pdf.set_text_color(120)
    pdf.cell(0, 6, "Orçamento válido por 30 dias.", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
