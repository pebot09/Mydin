// Previsão do que vem pela frente.
//
// Para quem vive de renda variável, a pergunta mais útil não é "quanto gastei"
// — é "o que ainda vai cair e o que ainda vou pagar". Este módulo detecta o que
// se repete todo mês (mensalidade, aluguel, terapia, assinatura) e projeta as
// próximas ocorrências, juntando com as parcelas de cartão já lançadas.
//
// Nada aqui é cadastro: tudo é inferido do próprio extrato.

import { estado, pessoa as buscarPessoa } from './store.js';
import { chaveEstabelecimento } from './classify.js';
import { CAT_POR_ID } from './dominio.js';
import { hoje, mesAtual, mesMenos, diasNoMes, realizada, mediana } from './analytics.js';

/** Identidade da fonte de um lançamento: a pessoa, ou o estabelecimento. */
function chaveFonte(t) {
  if (t.pessoaId) return 'p:' + t.pessoaId;
  if (t.conta === 'cartao' && t.descricao) {
    const k = chaveEstabelecimento(t.descricao);
    return k && k.length >= 4 ? 'e:' + k : null;
  }
  return null;
}

function rotuloFonte(chave, txs) {
  const base = chave.split('|')[0];
  if (base.startsWith('p:')) {
    const p = buscarPessoa(base.slice(2));
    if (p) return p.nome;
  }
  const d = txs[txs.length - 1].descricao || '';
  return d.split(' - ')[0].slice(0, 42) || 'Lançamento';
}

function diaDoMes(iso) { return Number(iso.slice(8, 10)); }

/** Data de um dia típico dentro de um mês, respeitando meses curtos. */
function dataNoMes(ym, dia) {
  return ym + '-' + String(Math.min(dia, diasNoMes(ym))).padStart(2, '0');
}

/**
 * Detecta o que se repete. Uma fonte é recorrente quando aparece em pelo menos
 * `minMeses` meses distintos dentro da janela E ainda apareceu no mês corrente
 * ou no anterior (senão é coisa que já acabou).
 */
export function recorrencias({ janela = 6, minMeses = 3 } = {}) {
  const mesCorrente = mesAtual();
  const mesAnterior = mesMenos(mesCorrente, 1);
  const limite = mesMenos(mesCorrente, janela - 1);

  const grupos = new Map();
  for (const t of estado.transacoes) {
    if (!realizada(t) || t.especial || t.categoria === 'INT') continue;
    if (t.data.slice(0, 7) < limite) continue;
    const k = chaveFonte(t);
    if (!k) continue;
    // entradas e saídas da mesma pessoa são recorrências diferentes
    const chave = k + (t.valorCent > 0 ? '|+' : '|-');
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(t);
  }

  const out = [];
  for (const [chave, lista] of grupos) {
    const txs = lista.sort((a, b) => a.data.localeCompare(b.data));
    const meses = [...new Set(txs.map((t) => t.data.slice(0, 7)))];
    if (meses.length < minMeses) continue;
    if (!meses.includes(mesCorrente) && !meses.includes(mesAnterior)) continue;

    const valores = txs.map((t) => Math.abs(t.valorCent));
    const valorCent = Math.round(mediana(valores));
    if (!valorCent) continue;
    const dias = txs.map((t) => diaDoMes(t.data));
    const dia = Math.round(mediana(dias));
    const ultima = txs[txs.length - 1].data;

    // ~1 vez por mês: gasto que acontece 8× no mês é hábito, não compromisso
    const porMes = txs.length / meses.length;
    // sempre por volta do mesmo dia: se a data pula o mês todo, não é agenda
    const dispersaoDia = mediana(dias.map((d) => Math.abs(d - dia)));

    // o quanto o valor varia de mês para mês (0 = sempre igual)
    const variacao = mediana(valores.map((v) => Math.abs(v - valorCent))) / valorCent;
    // confiança: cobertura dos meses da janela, penalizada por valor instável
    const cobertura = meses.length / Math.min(janela, mesesDisponiveis(limite));
    const confianca = Math.max(0, Math.min(1, cobertura * (1 - Math.min(1, variacao))));

    const jaVeioNoMes = meses.includes(mesCorrente);
    const esperadaNoMes = dataNoMes(mesCorrente, dia);
    let proxima, atrasada = false;
    if (jaVeioNoMes) {
      proxima = dataNoMes(mesMenos(mesCorrente, -1), dia);
    } else if (esperadaNoMes >= hoje()) {
      proxima = esperadaNoMes;
    } else {
      proxima = esperadaNoMes;
      atrasada = true;
    }

    out.push({
      chave,
      rotulo: rotuloFonte(chave, txs),
      entrada: txs[0].valorCent > 0,
      valorCent,
      dia,
      categoria: txs[txs.length - 1].categoria || null,
      pessoaId: txs[txs.length - 1].pessoaId || null,
      meses: meses.length,
      porMes,
      dispersaoDia,
      agendavel: porMes <= 1.35 && dispersaoDia <= 4,
      variacao,
      confianca,
      ultima,
      proxima,
      atrasada,
    });
  }
  return out.sort((a, b) => b.valorCent - a.valorCent);
}

function mesesDisponiveis(limite) {
  const s = new Set();
  for (const t of estado.transacoes) {
    if (realizada(t) && t.data.slice(0, 7) >= limite) s.add(t.data.slice(0, 7));
  }
  return Math.max(1, s.size);
}

/**
 * Agenda dos próximos `dias`. Junta o que já está lançado (parcelas de cartão
 * com data futura — certo) com o que se repete (previsto), e o que já devia ter
 * caído e não caiu (atrasado).
 */
export function proximosLancamentos(dias = 30, opcoes = {}) {
  const h = hoje();
  const limite = new Date(Date.parse(h) + dias * 86400000).toISOString().slice(0, 10);
  const itens = [];

  // Já lançado no extrato com data futura: não é palpite.
  for (const t of estado.transacoes) {
    if (t.data <= h || t.data > limite || t.especial) continue;
    const p = buscarPessoa(t.pessoaId);
    itens.push({
      data: t.data,
      rotulo: p ? p.nome : (t.descricao || 'Lançamento'),
      valorCent: t.valorCent,
      categoria: t.categoria,
      certeza: 'confirmado',
      detalhe: t.conta === 'cartao' ? 'no cartão' : 'já lançado',
    });
  }

  // O que já está lançado tem prioridade: uma previsão para a mesma fonte na
  // mesma janela seria a mesma cobrança contada duas vezes.
  const jaLancado = new Map();
  for (const t of estado.transacoes) {
    if (t.data <= h || t.data > limite || t.especial) continue;
    const k = chaveFonte(t);
    if (k) jaLancado.set(k + (t.valorCent > 0 ? '|+' : '|-'), t.data);
  }

  // Previsto pela repetição.
  const minConfianca = opcoes.minConfianca === undefined ? 0.45 : opcoes.minConfianca;
  for (const r of recorrencias(opcoes)) {
    if (!r.agendavel) continue;
    if (r.confianca < minConfianca) continue;
    if (r.proxima > limite) continue;
    if (jaLancado.has(r.chave)) continue;
    itens.push({
      data: r.proxima,
      rotulo: r.rotulo,
      valorCent: r.entrada ? r.valorCent : -r.valorCent,
      categoria: r.categoria,
      certeza: r.atrasada ? 'atrasado' : 'previsto',
      detalhe: r.atrasada ? 'esperado dia ' + r.dia : 'todo mês, dia ' + r.dia,
      confianca: r.confianca,
    });
  }

  itens.sort((a, b) => a.data.localeCompare(b.data) || b.valorCent - a.valorCent);

  const entra = itens.filter((i) => i.valorCent > 0).reduce((a, i) => a + i.valorCent, 0);
  const sai = itens.filter((i) => i.valorCent < 0).reduce((a, i) => a + -i.valorCent, 0);
  return { itens, entra, sai, liquido: entra - sai, dias, ate: limite };
}

/**
 * Custo fixo previsto por mês: a soma das saídas recorrentes de alta confiança.
 * É o "piso" do seu mês — o que você paga mesmo sem trabalhar.
 */
export function pisoMensal(minConfianca = 0.6) {
  const rs = recorrencias().filter((r) => !r.entrada && r.agendavel && r.confianca >= minConfianca);
  const total = rs.reduce((a, r) => a + r.valorCent, 0);
  return { totalCent: total, itens: rs };
}

/**
 * Cobranças pequenas que se repetem todo mês — o vazamento silencioso.
 * Cada uma é irrelevante sozinha; juntas costumam valer uma conta grande.
 */
export function pequenasRecorrencias(tetoCent = 12000) {
  return recorrencias()
    .filter((r) => !r.entrada && r.agendavel && r.valorCent <= tetoCent && r.confianca >= 0.5)
    .filter((r) => {
      const g = CAT_POR_ID[r.categoria];
      return !g || g.grupo === 'despesa';
    });
}
