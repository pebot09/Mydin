// Parser de OFX (Nubank: extrato da conta e fatura do cartão), no navegador.
//
// Detecta o tipo pelo corpo do arquivo, extrai FITID/data/valor/MEMO e, quando
// o MEMO é de Pix, o nome + CPF mascarado do pagador (impressão digital estável
// da pessoa, mesmo que ela troque de banco).

const RE_STMTTRN = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi;
const RE_CAMPO = /<(\w+)>([^<\r\n]*)/g;
const RE_LEDGERBAL = /<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/i;
// CPF mascarado do Nubank: •••.085.407-•• (às vezes com * no lugar de •)
const RE_CPF_MASC = /[•*]{3}\.?\d{3}\.\d{3}[-.][•*]{2}/;

function decodificar(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (_) {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

export function detectarTipo(texto) {
  const t = texto.toUpperCase();
  if (t.includes('CREDITCARDMSGSRSV1')) return 'cartao';
  if (t.includes('BANKMSGSRSV1')) return 'conta';
  return null;
}

function valorCent(bruto) {
  if (!bruto) return null;
  const v = Number(String(bruto).trim().replace(',', '.'));
  return isFinite(v) ? Math.round(v * 100) : null;
}

function dataIso(bruto) {
  const s = String(bruto || '').trim();
  if (s.length >= 8 && /^\d{8}/.test(s)) {
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }
  return null;
}

function campos(bloco) {
  const out = {};
  RE_CAMPO.lastIndex = 0;
  let m;
  while ((m = RE_CAMPO.exec(bloco)) !== null) out[m[1].toUpperCase()] = m[2].trim();
  return out;
}

/** Extrai [nome, cpfMascarado] de um MEMO de Pix; [null,null] se não houver. */
export function extrairPessoa(memo) {
  if (!memo) return [null, null];
  const m = RE_CPF_MASC.exec(memo);
  if (!m) return [null, null];
  const cpf = m[0].replace(/\*/g, '•');
  const partes = memo.split(' - ').map((p) => p.trim());
  let nome = null;
  for (let i = 1; i < partes.length; i++) {
    if (RE_CPF_MASC.test(partes[i])) { nome = partes[i - 1]; break; }
  }
  if (nome && /^(transfer|pagamento|pix)/i.test(nome)) nome = null;
  return [nome, cpf];
}

/**
 * Lê um OFX. Retorna { tipo, transacoes, saldo }.
 * transacoes: { data, valorCent, fitid, descricao, pessoaNome, pessoaCpf }
 * saldo: { valorCent, data } — o saldo que o PRÓPRIO BANCO informa.
 */
export function lerOfx(buffer) {
  const texto = decodificar(buffer);
  const tipo = detectarTipo(texto);
  if (!tipo) {
    throw new Error('Não parece um OFX do Nubank (sem BANKMSGSRSV1 nem CREDITCARDMSGSRSV1).');
  }

  const transacoes = [];
  RE_STMTTRN.lastIndex = 0;
  let bloco;
  while ((bloco = RE_STMTTRN.exec(texto)) !== null) {
    const c = campos(bloco[1]);
    const valor = valorCent(c.TRNAMT);
    const data = dataIso(c.DTPOSTED);
    const fitid = c.FITID;
    const memo = c.MEMO || c.NAME || '';
    if (valor === null || !data || !fitid) continue;
    const [nome, cpf] = tipo === 'conta' ? extrairPessoa(memo) : [null, null];
    transacoes.push({
      data, valorCent: valor, fitid, descricao: memo,
      pessoaNome: nome, pessoaCpf: cpf,
    });
  }

  let saldo = null;
  const mb = RE_LEDGERBAL.exec(texto);
  if (mb) {
    const c = campos(mb[1]);
    const v = valorCent(c.BALAMT);
    const d = dataIso(c.DTASOF);
    if (v !== null) saldo = { valorCent: v, data: d };
  }

  return { tipo, transacoes, saldo };
}

/** Lê um File do input e devolve o resultado do parser. */
export async function lerArquivo(file) {
  const buffer = await file.arrayBuffer();
  return lerOfx(buffer);
}
