// Motor de categorização automática.
//
// Princípios que não mudam:
//  • O cadastro da pessoa é a fonte da verdade — valor sozinho nunca confirma aluno.
//  • Pessoa multi-relação vai SEMPRE para revisão manual. É feature, não limitação.
//  • As duas pernas do pagamento de fatura são ignoradas (senão conta em dobro).
//  • Na dúvida, manda para a fila de revisão em vez de adivinhar.

import { estado, pessoa as buscarPessoa } from './store.js';

// Estabelecimentos do cartão reconhecidos de fábrica (substring → categoria)
const REGRAS_ESTABELECIMENTO = [
  [['99 ride', 'pg *99', 'dl*99', 'dl *99', 'uber', '99app', '99*'], 'TRA'],
  [['ifd*', 'ifood', '99food', 'ifd '], 'ALI'],
  [['farmacia', 'drogaria', 'drogasil', 'pacheco', 'droga raia', 'raia',
    'pague menos', 'venancio'], 'SAU'],
  [['apple.com', 'apple com', 'spotify', 'google ', 'google*', 'netflix',
    'amazon prime', 'amazonprime', 'prime video', 'youtube', 'hbo', 'max.com',
    'disney', 'deezer', 'icloud', 'dropbox', 'openai', 'claude.ai'], 'ASS'],
];

export const TETO_ALUNO_CENT = 70000;   // R$ 700 — teto rígido: acima disso nunca é mensalidade
export const PISO_ALUNO_CENT = 18000;   // R$ 180
const CARIDADE_CENT = 1000;             // saída < R$ 10 para pessoa física
const GERAL_CENT = 10000;               // avulso / amigo até R$ 100

/**
 * Impressão digital de um estabelecimento de cartão: as duas primeiras
 * palavras normalizadas, sem o sufixo de parcela. "IFD*IFOOD SAO PAULO" e
 * "IFD*IFOOD RIO - Parcela 2/3" caem na mesma chave.
 */
export function chaveEstabelecimento(descricao) {
  const n = normalizar(descricao).replace(/\s*-\s*parcela.*$/, '').trim();
  return n.split(' ').slice(0, 2).join(' ');
}

/** Minúsculas, sem acento, espaços normalizados. */
export function normalizar(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function casarEstabelecimento(memo) {
  for (const [padroes, cat] of REGRAS_ESTABELECIMENTO) {
    for (const p of padroes) if (memo.includes(p)) return cat;
  }
  // regras que o app aprendeu quando você classificou na fila de revisão
  for (const r of estado.regras) {
    if (r.padrao && memo.includes(r.padrao)) return r.categoria;
  }
  return null;
}

function mesesComEntradaNaFaixa(pessoaId) {
  const meses = new Set();
  for (const t of estado.transacoes) {
    if (t.pessoaId === pessoaId && t.valorCent >= PISO_ALUNO_CENT && t.valorCent <= TETO_ALUNO_CENT) {
      meses.add(t.data.slice(0, 7));
    }
  }
  return meses.size;
}

function ocorrencias(pessoaId) {
  let n = 0;
  for (const t of estado.transacoes) if (t.pessoaId === pessoaId) n++;
  return n;
}

/**
 * Classifica um lançamento. Devolve { categoria, status, especial }.
 * status: 'auto' (o app decidiu) | 'revisar' (precisa de você)
 */
export function classificar(t) {
  const memo = normalizar(t.descricao);
  const valor = t.valorCent;
  const p = buscarPessoa(t.pessoaId);

  // Pagamento de fatura: as duas pernas somem, senão o gasto conta duas vezes.
  if (t.conta === 'conta' && memo.includes('pagamento de fatura')) {
    return { categoria: null, status: 'auto', especial: 'pagamento_fatura' };
  }
  if (t.conta === 'cartao' && valor > 0 && memo.startsWith('pagamento recebido')) {
    return { categoria: null, status: 'auto', especial: 'pagamento_fatura' };
  }

  // ── Cartão de crédito ──
  if (t.conta === 'cartao') {
    if (valor > 0) return { categoria: 'ESTORNO', status: 'auto', especial: null };
    const cat = casarEstabelecimento(memo);
    if (cat) return { categoria: cat, status: 'auto', especial: null };
    return { categoria: 'CONS', status: 'auto', especial: null };
  }

  // ── Conta corrente ──
  // Transferências internas (poupança / RDB / mesma titularidade) não são fluxo.
  const inicio = memo.split(' - ')[0];
  if (memo.includes('rdb') || inicio.includes('aplicacao') || inicio.includes('resgate')) {
    return { categoria: 'INT', status: 'auto', especial: null };
  }
  const titular = normalizar(estado.config.nomeTitular);
  if (titular && p && normalizar(p.nome) === titular) {
    return { categoria: 'INT', status: 'auto', especial: null };
  }
  if (p && p.tipo === 'interno') {
    return { categoria: 'INT', status: 'auto', especial: null };
  }

  // Multi-relação nunca é adivinhado.
  if (p && (p.sempreRevisar || p.tipo === 'amigo_multi')) {
    return { categoria: null, status: 'revisar', especial: null };
  }

  // Regra permanente que você criou para esta pessoa.
  if (p && p.regraCategoria) {
    return { categoria: p.regraCategoria, status: 'auto', especial: null };
  }

  if (memo.includes('estorno') || memo.includes('devolucao')) {
    return { categoria: 'ESTORNO', status: 'revisar', especial: null };
  }

  return valor > 0 ? classificarEntrada(p, valor, t) : classificarSaida(p, valor);
}

function classificarEntrada(p, valor, t) {
  if (p) {
    // Aluno cadastrado (ou quem paga por um aluno) → ensino, automático.
    if (p.tipo === 'aluno' || p.alunoId) {
      return { categoria: 'ENS', status: 'auto', especial: null };
    }
    // Cliente de música cadastrado → toda entrada é receita de música.
    if (p.tipo === 'cliente_musica') {
      return { categoria: 'MUS', status: 'auto', especial: null };
    }
    // Desconhecido: a heurística só SUGERE (cai na revisão).
    if (p.tipo === 'desconhecido') {
      if (valor > TETO_ALUNO_CENT) return { categoria: null, status: 'revisar', especial: null };
      const dia = Number(t.data.slice(8, 10));
      const limite = Number(estado.config.diaLimiteMensalidade) || 12;
      if (valor >= PISO_ALUNO_CENT && valor <= TETO_ALUNO_CENT && dia >= 1 && dia <= limite
          && mesesComEntradaNaFaixa(p.id) >= 3) {
        return { categoria: 'ENS', status: 'revisar', especial: null };
      }
    }
  }
  return { categoria: null, status: 'revisar', especial: null };
}

function classificarSaida(p, valor) {
  const abs = -valor;
  if (p) {
    if (p.med) return { categoria: 'MED', status: 'auto', especial: null };
    if (abs < CARIDADE_CENT) return { categoria: 'CARIDADE', status: 'auto', especial: null };
    if (abs <= GERAL_CENT) {
      if (ocorrencias(p.id) <= 1) return { categoria: 'GERAL', status: 'auto', especial: null };
      if (p.tipo === 'familia' || p.tipo === 'desconhecido') {
        return { categoria: 'GERAL', status: 'auto', especial: null };
      }
    }
  } else if (abs < CARIDADE_CENT) {
    return { categoria: 'CARIDADE', status: 'auto', especial: null };
  }
  return { categoria: null, status: 'revisar', especial: null };
}

/**
 * Reaplica o motor sobre lançamentos importados que você ainda não confirmou.
 * Nunca mexe no que foi confirmado à mão. Devolve { auto, revisar, alterados }.
 */
export function reclassificar(ids = null) {
  const alvo = ids ? new Set(ids) : null;
  let auto = 0, revisar = 0;
  const alterados = [];
  for (const t of estado.transacoes) {
    if (alvo && !alvo.has(t.id)) continue;
    if (t.origem === 'manual' || t.status === 'confirmado') continue;
    const r = classificar(t);
    if (t.categoria !== r.categoria || t.status !== r.status || t.especial !== r.especial) {
      t.categoria = r.categoria;
      t.status = r.status;
      t.especial = r.especial;
      alterados.push(t);
    }
    if (r.status === 'auto') auto++; else revisar++;
  }
  return { auto, revisar, alterados };
}
