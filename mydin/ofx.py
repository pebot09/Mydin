"""Parser de OFX do Nubank — conta corrente e fatura de cartão.

Detecta o tipo pelo corpo: BANKMSGSRSV1 (conta) vs CREDITCARDMSGSRSV1 (cartão).
Extrai FITID, data, valor, MEMO e, quando presente, nome + CPF mascarado do contato.
"""
import re
from decimal import Decimal, InvalidOperation

RE_STMTTRN = re.compile(r"<STMTTRN>(.*?)(?:</STMTTRN>|(?=<STMTTRN>)|\Z)", re.S | re.I)
RE_FIELD = re.compile(r"<(\w+)>([^<\r\n]*)")
# CPF mascarado do Nubank: •••.085.407-•• (às vezes com * no lugar de •)
RE_CPF_MASC = re.compile(r"[•*]{3}\.?\d{3}\.\d{3}[-.][•*]{2}")


def detectar_tipo(texto):
    """'cartao' | 'conta' | None"""
    if "CREDITCARDMSGSRSV1" in texto.upper():
        return "cartao"
    if "BANKMSGSRSV1" in texto.upper():
        return "conta"
    return None


def _parse_valor_cent(raw):
    raw = raw.strip().replace(",", ".")
    try:
        return int(round(Decimal(raw) * 100))
    except (InvalidOperation, ValueError):
        return None


def _parse_data(raw):
    raw = raw.strip()
    if len(raw) >= 8 and raw[:8].isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    return None


def extrair_contato(memo):
    """Extrai (nome, cpf_mascarado) de um MEMO Pix do Nubank, ou (None, None).

    Formato típico: 'Transferência recebida pelo Pix - FULANO DE TAL - •••.085.407-•• - BANCO ...'
    """
    if not memo:
        return None, None
    m = RE_CPF_MASC.search(memo)
    if not m:
        return None, None
    cpf = m.group(0).replace("*", "•")
    partes = [p.strip() for p in memo.split(" - ")]
    nome = None
    for i, p in enumerate(partes):
        if RE_CPF_MASC.search(p) and i > 0:
            nome = partes[i - 1].strip()
            break
    if nome and nome.lower().startswith(("transfer", "pagamento", "pix")):
        nome = None
    return nome, cpf


def parse_ofx(conteudo_bytes):
    """Retorna (tipo, [transações]). Cada transação: dict com
    data, valor_cent, id_externo, descricao, contato_nome, contato_cpf."""
    texto = None
    for enc in ("utf-8", "latin-1"):
        try:
            texto = conteudo_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if texto is None:
        raise ValueError("Não foi possível decodificar o arquivo OFX.")

    tipo = detectar_tipo(texto)
    if tipo is None:
        raise ValueError("Arquivo não parece um OFX válido (sem BANKMSGSRSV1 nem CREDITCARDMSGSRSV1).")

    transacoes = []
    for bloco in RE_STMTTRN.findall(texto):
        campos = {}
        for tag, val in RE_FIELD.findall(bloco):
            campos[tag.upper()] = val.strip()
        valor = _parse_valor_cent(campos.get("TRNAMT", ""))
        data = _parse_data(campos.get("DTPOSTED", ""))
        fitid = campos.get("FITID")
        memo = campos.get("MEMO") or campos.get("NAME") or ""
        if valor is None or data is None or not fitid:
            continue
        nome, cpf = extrair_contato(memo) if tipo == "conta" else (None, None)
        transacoes.append({
            "data": data,
            "valor_cent": valor,
            "id_externo": fitid,
            "descricao": memo,
            "contato_nome": nome,
            "contato_cpf": cpf,
        })
    return tipo, transacoes
