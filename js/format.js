// Formatação pt-BR. Todo dinheiro trafega em CENTAVOS (inteiro) — nunca float.

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const FMT_BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
});
const FMT_NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** R$ 1.234,56 — entrada em centavos. */
export function moeda(cent) {
  return FMT_BRL.format((cent || 0) / 100);
}

/** Sem centavos: R$ 1.235 — para cartões e tabelas densas. */
export function moedaRedonda(cent) {
  return 'R$ ' + FMT_NUM.format(Math.round((cent || 0) / 100));
}

/** Compacto para eixos de gráfico: 4,3 mil / 12 mil / 1,2 mi */
export function moedaEixo(cent) {
  const v = (cent || 0) / 100;
  const abs = Math.abs(v);
  if (abs >= 1000000) return (v / 1000000).toFixed(1).replace('.', ',') + ' mi';
  if (abs >= 10000) return Math.round(v / 1000) + ' mil';
  if (abs >= 1000) return (v / 1000).toFixed(1).replace('.', ',') + ' mil';
  return FMT_NUM.format(Math.round(v));
}

/**
 * Rótulo de eixo de gráfico. Precisa distinguir marcas vizinhas: arredondar
 * tudo para "k" faz 500 e 1000 virarem o mesmo rótulo.
 */
export function eixoMoeda(cent) {
  const v = Math.round((cent || 0) / 100);
  const abs = Math.abs(v);
  if (abs >= 1000) {
    const k = v / 1000;
    return (Number.isInteger(k) ? String(k) : k.toFixed(1).replace('.', ',')) + 'k';
  }
  return String(v);
}

/** Com sinal explícito — para variações. */
export function moedaSinal(cent) {
  const s = (cent || 0) > 0 ? '+' : '';
  return s + moeda(cent);
}

/** '2026-09' → 'set/26' */
export function mesBR(ym) {
  if (!ym) return '';
  const [a, m] = ym.split('-');
  return MESES_CURTOS[Number(m) - 1] + '/' + a.slice(2);
}

/** '2026-09' → 'setembro de 2026' */
export function mesLongo(ym) {
  if (!ym) return '';
  const [a, m] = ym.split('-');
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return nomes[Number(m) - 1] + ' de ' + a;
}

/** '2026-09-04' → '04/09' */
export function dataBR(iso) {
  if (!iso) return '';
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

/** '2026-09-04' → '04/09/2026' */
export function dataBRLonga(iso) {
  if (!iso) return '';
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
}

/** 12.3 → '12%' (ou '12,3%' com casas) */
export function pct(v, casas = 0) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  return v.toFixed(casas).replace('.', ',') + '%';
}

/** Variação percentual com sinal: +14% / -8% */
export function pctSinal(v, casas = 0) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(casas).replace('.', ',') + '%';
}

/** 2.4 → '2,4' */
export function num(v, casas = 1) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  return v.toFixed(casas).replace('.', ',');
}

/** Plural simples: plural(1,'aluno','alunos') */
export function plural(n, sing, plur) {
  return n === 1 ? sing : plur;
}

/** Aceita '1.234,56' / '1234.56' / 'R$ 1.234,56' → centavos. */
export function parseMoeda(txt) {
  if (txt === null || txt === undefined) return 0;
  let s = String(txt).trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) s = s.replace(/\./g, '').replace(',', '.');
  else if (temVirgula) s = s.replace(',', '.');
  // só ponto: assume separador decimal (1234.56), salvo milhar tipo 1.234
  else if (temPonto && /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const v = Number(s);
  return isFinite(v) ? Math.round(v * 100) : 0;
}
