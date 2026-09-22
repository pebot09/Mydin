// Todo o cálculo analítico. Nenhum DOM aqui — só números.
//
// PRINCÍPIO: a saúde financeira é medida pela variação do PATRIMÔNIO
// (conta + poupança), imune a erro de classificação. A categorização serve
// para ENTENDER o fluxo, não para dizer se você está bem. O app mostra as
// duas coisas e, de propósito, mostra também a diferença entre elas.

import { estado, pessoa as buscarPessoa, aluno as buscarAluno } from './store.js';
import { CAT_POR_ID, CATEGORIAS_FIXAS, TURMAS } from './dominio.js';

// ───────────────────────── Datas ─────────────────────────

export function hoje() {
  const d = new Date();
  return [d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')].join('-');
}

export function mesAtual() { return hoje().slice(0, 7); }

/** '2026-09' menos n meses. */
export function mesMenos(ym, n) {
  const ano = Number(ym.slice(0, 4));
  const mes = Number(ym.slice(5, 7));
  const idx = ano * 12 + (mes - 1) - n;
  return String(Math.floor(idx / 12)).padStart(4, '0') + '-'
    + String((idx % 12) + 1).padStart(2, '0');
}

export function fimDoMes(ym) {
  const ano = Number(ym.slice(0, 4));
  const mes = Number(ym.slice(5, 7));
  const d = new Date(Date.UTC(ano, mes, 0));
  return ym + '-' + String(d.getUTCDate()).padStart(2, '0');
}

export function diasNoMes(ym) {
  return Number(fimDoMes(ym).slice(8, 10));
}

/** Último dia já ocorrido do mês (hoje, se o mês for o corrente). */
export function fimEfetivo(ym) {
  const f = fimDoMes(ym);
  const h = hoje();
  return f < h ? f : h;
}

// ───────────────────────── Cache ─────────────────────────

let cache = {};
export function limparCache() { cache = {}; }
function memo(chave, fn) {
  if (!(chave in cache)) cache[chave] = fn();
  return cache[chave];
}

// ───────────────────────── Filtros base ─────────────────────────

const ehDespesa = (t) => CAT_POR_ID[t.categoria] && CAT_POR_ID[t.categoria].grupo === 'despesa';
const ehEspecial = (t) => !!t.especial || (CAT_POR_ID[t.categoria] && CAT_POR_ID[t.categoria].grupo === 'especial');

/** Lançamento já aconteceu? (parcela futura do cartão é compromisso, não gasto) */
export function realizada(t) { return t.data <= hoje(); }

export function transacoesDoMes(ym) {
  return estado.transacoes.filter((t) => t.data.slice(0, 7) === ym);
}

export function transacoesNoPeriodo(de, ate) {
  return estado.transacoes.filter((t) => t.data >= de && t.data <= ate);
}

// ───────────────────────── Patrimônio ─────────────────────────

/** Σ de todo o extrato da conta até a data (inclui pagamento de fatura, repasses…). */
function somaContaAte(iso) {
  const limite = iso < hoje() ? iso : hoje();   // lançamento com data futura não mexe no saldo de hoje
  let s = 0;
  for (const t of estado.transacoes) {
    if (t.conta === 'conta' && t.data <= limite) s += t.valorCent;
  }
  return s;
}

/**
 * Saldo da conta em qualquer data, ancorado no saldo que o banco informou.
 * saldo(x) = B + Σ(até x) − Σ(até D), onde B é o saldo do banco na data D.
 */
export function saldoConta(ate = hoje()) {
  const B = Number(estado.config.saldoContaCent) || 0;
  const D = estado.config.saldoContaData;
  if (!D) return somaContaAte(ate);
  return B + somaContaAte(ate) - somaContaAte(D);
}

/**
 * Poupança/investimentos: o valor de HOJE é o que você informa (você sabe o
 * número real). Para trás, reconstrói descontando as aplicações posteriores.
 */
export function saldoPoupanca(ate = hoje()) {
  const atual = Number(estado.config.saldoPoupancaCent) || 0;
  const ref = estado.config.saldoPoupancaData || hoje();
  if (ate >= ref) return atual;
  let depois = 0;
  for (const t of estado.transacoes) {
    if (t.conta === 'conta' && t.categoria === 'INT' && t.data > ate && t.data <= ref) {
      depois += -t.valorCent;   // aplicação = saída da conta = entrada na poupança
    }
  }
  return atual - depois;
}

export function patrimonio(ate = hoje()) {
  return saldoConta(ate) + saldoPoupanca(ate);
}

export function variacaoPatrimonioMes(ym) {
  const fimAnterior = fimDoMes(mesMenos(ym, 1));
  return patrimonio(fimEfetivo(ym)) - patrimonio(fimAnterior);
}

export function temAncora() {
  return !!estado.config.saldoContaData;
}

// ───────────────────────── Receita ─────────────────────────

/** Alunos distintos que pagaram no mês (via pessoa → aluno). */
export function alunosPagantesMes(ym) {
  const porAluno = new Map();
  for (const t of transacoesDoMes(ym)) {
    if (t.categoria !== 'ENS' || t.valorCent <= 0) continue;
    const p = buscarPessoa(t.pessoaId);
    if (!p || !p.alunoId) continue;
    const a = buscarAluno(p.alunoId);
    if (!a) continue;
    const atual = porAluno.get(a.id) || { aluno: a, meia: false, pagoCent: 0 };
    atual.meia = atual.meia || !!t.meia;
    atual.pagoCent += t.valorCent;
    porAluno.set(a.id, atual);
  }
  return [...porAluno.values()];
}

/**
 * Receita de ensino = nº de pagantes × cota (meia = metade).
 * NÃO é a soma do que cada um pagou — é a regra do negócio.
 */
export function receitaEnsinoMes(ym) {
  const pagantes = alunosPagantesMes(ym);
  const cotaPadrao = Number(estado.config.cotaCent) || 23250;
  let total = 0, caixa = 0;
  for (const p of pagantes) {
    const cota = p.aluno.cotaCent || cotaPadrao;
    total += p.meia ? Math.round(cota / 2) : cota;
    caixa += p.pagoCent;
  }
  return { cent: total, caixaCent: caixa, pagantes: pagantes.length, lista: pagantes };
}

export function receitaMusicaMes(ym) {
  let s = 0;
  for (const t of transacoesDoMes(ym)) {
    if (t.valorCent > 0 && (t.categoria === 'MUS' || t.categoria === 'SUB')) s += t.valorCent;
  }
  return s;
}

/** Entradas ENS sem aluno vinculado — não contam pagante e distorcem o painel. */
export function ensinoSemAluno(ym) {
  return transacoesDoMes(ym).filter((t) => {
    if (t.categoria !== 'ENS' || t.valorCent <= 0) return false;
    const p = buscarPessoa(t.pessoaId);
    return !p || !p.alunoId;
  });
}

// ───────────────────────── Gasto ─────────────────────────

/**
 * Gastos por categoria no período, líquidos: uma entrada na mesma categoria
 * abate (ex.: ajuda da mãe deixa a terapia líquida). Só o que já aconteceu.
 */
export function gastosPorCategoria(de, ate) {
  const mapa = new Map();
  for (const t of estado.transacoes) {
    if (t.data < de || t.data > ate || !realizada(t)) continue;
    if (!ehDespesa(t)) continue;
    const atual = mapa.get(t.categoria) || { categoria: t.categoria, cent: 0, n: 0 };
    atual.cent += -t.valorCent;
    atual.n++;
    mapa.set(t.categoria, atual);
  }
  return [...mapa.values()].filter((x) => x.cent !== 0).sort((a, b) => b.cent - a.cent);
}

export function gastoMes(ym) {
  const linhas = gastosPorCategoria(ym + '-01', fimEfetivo(ym));
  let fixo = 0, variavel = 0;
  for (const l of linhas) {
    if (CATEGORIAS_FIXAS.includes(l.categoria)) fixo += l.cent; else variavel += l.cent;
  }
  return { fixo, variavel, total: fixo + variavel, linhas };
}

/** Saídas que você ainda não classificou — o buraco no relatório. */
export function naoCategorizadas(de, ate) {
  return estado.transacoes.filter((t) =>
    t.data >= de && t.data <= ate && realizada(t)
    && t.valorCent < 0 && !t.categoria && !t.especial);
}

/** Parcelas do cartão lançadas para o futuro: comprometido, não gasto. */
export function comprometidoFuturo() {
  const mapa = new Map();
  for (const t of estado.transacoes) {
    if (t.conta !== 'cartao' || t.valorCent >= 0 || t.data <= hoje()) continue;
    const ym = t.data.slice(0, 7);
    const atual = mapa.get(ym) || { mes: ym, cent: 0, n: 0 };
    atual.cent += -t.valorCent;
    atual.n++;
    mapa.set(ym, atual);
  }
  return [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

// ───────────────────────── Caixa real ─────────────────────────
//
// Os indicadores de saúde NÃO podem depender da categorização: se metade dos
// lançamentos está na fila de revisão, um "gasto por categoria" subestima a
// realidade e o app diria que você está ótimo. Então fôlego, taxa de poupança
// e ritmo do mês são calculados sobre o DINHEIRO QUE SE MEXEU de verdade.
//
// Ficam de fora só o que não é fluxo: transferência para você mesmo (INT) e as
// duas pernas do pagamento de fatura. Estorno e reembolso abatem a saída.

function ehFluxoReal(t) {
  if (!realizada(t)) return false;
  if (t.especial) return false;          // pagamento de fatura: as duas pernas somem
  if (t.categoria === 'INT') return false; // poupança: muda de bolso, não sai
  return true;
}

const ehDevolucao = (t) => t.categoria === 'ESTORNO' || t.categoria === 'REEMB';

/** Entrada e saída efetivas do período, independentes de categorização. */
export function caixaReal(de, ate) {
  let entrada = 0, saida = 0;
  for (const t of estado.transacoes) {
    if (t.data < de || t.data > ate || !ehFluxoReal(t)) continue;
    if (t.valorCent > 0) {
      if (ehDevolucao(t)) saida -= t.valorCent;   // devolução abate o gasto
      else entrada += t.valorCent;
    } else {
      saida += -t.valorCent;
    }
  }
  return { entrada, saida: Math.max(0, saida), liquido: entrada - Math.max(0, saida) };
}

export function caixaRealMes(ym) {
  return caixaReal(ym + '-01', fimEfetivo(ym));
}

// ───────────────────────── Série mensal ─────────────────────────

export function mesesComDados() {
  return memo('meses', () => {
    const s = new Set();
    for (const t of estado.transacoes) {
      if (realizada(t)) s.add(t.data.slice(0, 7));
    }
    return [...s].sort();
  });
}

/** Meses completos (exclui o mês corrente, que ainda está rodando). */
export function mesesCompletos() {
  return mesesComDados().filter((m) => m < mesAtual());
}

/**
 * A série que alimenta quase todos os gráficos.
 * sobraContabil = receita − gasto (o que a categorização explica)
 * variacaoPatrimonio = a verdade. A diferença é o que falta explicar.
 */
export function serieMensal() {
  return memo('serie', () => mesesComDados().map((mes) => {
    const ens = receitaEnsinoMes(mes);
    const mus = receitaMusicaMes(mes);
    const g = gastoMes(mes);
    const receita = ens.cent + mus;
    const caixa = caixaRealMes(mes);
    return {
      mes,
      entradaReal: caixa.entrada,
      saidaReal: caixa.saida,
      caixaLiquido: caixa.liquido,
      receitaEns: ens.cent,
      receitaEnsCaixa: ens.caixaCent,
      pagantes: ens.pagantes,
      receitaMus: mus,
      receita,
      gastoFixo: g.fixo,
      gastoVar: g.variavel,
      gasto: g.total,
      sobra: receita - g.total,
      patrimonio: patrimonio(fimEfetivo(mes)),
      variacaoPatrimonio: variacaoPatrimonioMes(mes),
    };
  }));
}

export function serieDeMes(ym) {
  return serieMensal().find((s) => s.mes === ym) || null;
}

// ───────────────────────── Indicadores de saúde ─────────────────────────

function media(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function mediana(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Ritmo de queima: saída real média dos últimos n meses COMPLETOS.
 * Usa caixa, não categoria — não adianta o relatório estar bonito se o
 * dinheiro saiu.
 */
export function burnMensal(n = 3) {
  const serie = serieMensal().filter((s) => s.mes < mesAtual()).slice(-n);
  return Math.round(media(serie.map((s) => s.saidaReal)));
}

export function receitaMedia(n = 3) {
  const serie = serieMensal().filter((s) => s.mes < mesAtual()).slice(-n);
  return Math.round(media(serie.map((s) => s.entradaReal)));
}

/**
 * Fôlego: quantos meses o patrimônio sustenta o ritmo atual de gasto,
 * supondo receita zero. É a pergunta "se tudo parar, quanto tempo eu tenho?".
 */
export function folego(n = 3) {
  const burn = burnMensal(n);
  const pat = patrimonio();
  return {
    meses: burn > 0 ? pat / burn : null,
    burnCent: burn,
    patrimonioCent: pat,
    alvoMeses: Number(estado.config.reservaAlvoMeses) || 6,
  };
}

/** Taxa de poupança: quanto de cada real que entra sobra. Sobre caixa real. */
export function taxaPoupanca(n = 3) {
  const serie = serieMensal().filter((s) => s.mes < mesAtual()).slice(-n);
  const rec = serie.reduce((a, s) => a + s.entradaReal, 0);
  const gas = serie.reduce((a, s) => a + s.saidaReal, 0);
  return rec > 0 ? ((rec - gas) / rec) * 100 : null;
}

/**
 * Ritmo do mês corrente: o gasto até hoje comparado ao MESMO dia dos meses
 * anteriores, e a projeção de fechamento. Responde "estou gastando demais?"
 * antes do mês acabar — quando ainda dá para corrigir.
 */
export function ritmoDoMes(n = 3) {
  const mes = mesAtual();
  const dia = Number(hoje().slice(8, 10));
  const gastoAteHoje = caixaReal(mes + '-01', hoje()).saida;

  const comparaveis = [];
  for (let i = 1; i <= n; i++) {
    const m = mesMenos(mes, i);
    if (!mesesComDados().includes(m)) continue;
    const ateDia = m + '-' + String(Math.min(dia, diasNoMes(m))).padStart(2, '0');
    comparaveis.push({
      mes: m,
      ateDia: caixaReal(m + '-01', ateDia).saida,
      total: caixaReal(m + '-01', fimDoMes(m)).saida,
    });
  }
  if (!comparaveis.length) {
    return { dia, gastoAteHoje, mediaAteDia: null, projecao: null, deltaPct: null };
  }
  const mediaAteDia = Math.round(media(comparaveis.map((c) => c.ateDia)));
  const mediaTotal = Math.round(media(comparaveis.map((c) => c.total)));
  // projeção: proporção histórica entre "até o dia D" e "mês fechado"
  const fracao = mediaAteDia > 0 ? mediaAteDia / mediaTotal : dia / diasNoMes(mes);
  const projecao = fracao > 0 ? Math.round(gastoAteHoje / fracao) : null;
  return {
    dia,
    gastoAteHoje,
    mediaAteDia,
    mediaTotal,
    projecao,
    deltaPct: mediaAteDia > 0 ? ((gastoAteHoje - mediaAteDia) / mediaAteDia) * 100 : null,
  };
}

/**
 * Ponto de equilíbrio: quantos alunos pagantes cobrem o custo fixo, e quantos
 * cobrem o custo total. Traduz o negócio em uma meta contável.
 */
export function pontoEquilibrio(n = 3) {
  const serie = serieMensal().filter((s) => s.mes < mesAtual()).slice(-n);
  const cota = Number(estado.config.cotaCent) || 23250;
  const fixo = Math.round(media(serie.map((s) => s.gastoFixo)));
  const total = Math.round(media(serie.map((s) => s.saidaReal)));
  const musica = Math.round(media(serie.map((s) => s.receitaMus)));
  return {
    cotaCent: cota,
    fixoCent: fixo,
    totalCent: total,
    musicaCent: musica,
    alunosParaFixo: cota > 0 ? fixo / cota : null,
    alunosParaTotal: cota > 0 ? total / cota : null,
    alunosParaTotalComMusica: cota > 0 ? Math.max(0, total - musica) / cota : null,
  };
}

/**
 * Reconciliação: a sobra que a categorização explica versus a variação real do
 * patrimônio. Uma diferença grande significa que falta classificar algo —
 * não que você ficou mais pobre.
 */
export function reconciliacao(n = 6) {
  const serie = serieMensal().slice(-n);
  return serie.map((s) => ({
    mes: s.mes,
    sobra: s.sobra,
    variacao: s.variacaoPatrimonio,
    diferenca: s.variacaoPatrimonio - s.sobra,
  }));
}

/**
 * Para onde foi cada real que entrou no período: gasto, guardado, ou livre.
 * Responde de uma vez a pergunta que uma lista de categorias não responde —
 * "entrou tanto; e aí?".
 */
export function destinoDoQueEntrou(de, ate) {
  const c = caixaReal(de, ate);
  let guardado = 0;
  for (const t of estado.transacoes) {
    if (t.data < de || t.data > ate || !realizada(t)) continue;
    if (t.conta === 'conta' && t.categoria === 'INT') guardado += -t.valorCent;
  }
  guardado = Math.max(0, guardado);
  // o que sobrou parado na conta, sem ter sido gasto nem transferido
  const livre = c.entrada - c.saida - guardado;
  return { entrada: c.entrada, gastos: c.saida, guardado, livre };
}

/** Meses seguidos fechando no azul, e quantos dos últimos 6 foram positivos. */
export function sequenciaPositiva(janela = 6) {
  const serie = serieMensal().filter((s) => s.mes < mesAtual());
  let seguidos = 0;
  for (let i = serie.length - 1; i >= 0; i--) {
    if (serie[i].caixaLiquido > 0) seguidos++; else break;
  }
  const ultimos = serie.slice(-janela);
  return {
    seguidos,
    positivos: ultimos.filter((s) => s.caixaLiquido > 0).length,
    de: ultimos.length,
  };
}

/** Melhor e pior mês de cada medida, com o mês junto para dar contexto. */
export function extremos() {
  const serie = serieMensal().filter((s) => s.mes < mesAtual());
  if (!serie.length) return null;
  const por = (chave) => {
    const ord = [...serie].sort((a, b) => a[chave] - b[chave]);
    return { pior: ord[0], melhor: ord[ord.length - 1] };
  };
  return { caixa: por('caixaLiquido'), entrada: por('entradaReal'), saida: por('saidaReal') };
}

/**
 * Meta de reserva em reais, derivada da meta de fôlego — sem cadastro nenhum:
 * quantos meses você quer aguentar × quanto você queima por mês.
 */
export function metaReserva() {
  const f = folego();
  if (!f.burnCent) return null;
  const alvoCent = f.burnCent * f.alvoMeses;
  return {
    alvoCent,
    atualCent: f.patrimonioCent,
    pct: alvoCent ? (f.patrimonioCent / alvoCent) * 100 : 0,
    faltamCent: Math.max(0, alvoCent - f.patrimonioCent),
    meses: f.alvoMeses,
    burnCent: f.burnCent,
  };
}

// ───────────────────────── Comparação e mudança ─────────────────────────

/**
 * Gastos por categoria no período com Δ contra a janela anterior de mesmo
 * tamanho. Responde "o que mudou?" — a pergunta que um total não responde.
 */
export function gastosComparados(de, ate) {
  // A janela anterior é deslocada em MESES, não em dias: uma despesa mensal fixa
  // deve cair na mesma posição dos dois lados, senão ela "salta 50%" sozinha.
  // Se o período atual está no meio do mês, o anterior é truncado no mesmo dia.
  const mesIni = de.slice(0, 7);
  const mesFim = ate.slice(0, 7);
  const n = (Number(mesFim.slice(0, 4)) * 12 + Number(mesFim.slice(5, 7)))
          - (Number(mesIni.slice(0, 4)) * 12 + Number(mesIni.slice(5, 7))) + 1;

  const mesIniAnt = mesMenos(mesIni, n);
  const mesFimAnt = mesMenos(mesFim, n);
  const diaFim = Number(ate.slice(8, 10));
  const fimMesFim = Number(fimDoMes(mesFim).slice(8, 10));
  const deAnt = mesIniAnt + '-01';
  const ateAnt = diaFim >= fimMesFim
    ? fimDoMes(mesFimAnt)
    : mesFimAnt + '-' + String(Math.min(diaFim, Number(fimDoMes(mesFimAnt).slice(8, 10)))).padStart(2, '0');

  const atual = gastosPorCategoria(de, ate);
  const anterior = new Map(gastosPorCategoria(deAnt, ateAnt).map((l) => [l.categoria, l.cent]));

  const linhas = atual.map((l) => {
    const ant = anterior.get(l.categoria) || 0;
    return {
      ...l,
      anteriorCent: ant,
      deltaCent: l.cent - ant,
      deltaPct: ant > 0 ? ((l.cent - ant) / ant) * 100 : null,
    };
  });
  // categorias que sumiram no período atual também são informação
  for (const [cat, ant] of anterior) {
    if (!atual.some((l) => l.categoria === cat)) {
      linhas.push({ categoria: cat, cent: 0, n: 0, anteriorCent: ant, deltaCent: -ant, deltaPct: -100 });
    }
  }
  const total = linhas.reduce((a, l) => a + l.cent, 0);
  const totalAnterior = [...anterior.values()].reduce((a, b) => a + b, 0);
  return { linhas, total, totalAnterior, janelaAnterior: { de: deAnt, ate: ateAnt } };
}

/**
 * Concentração da receita: quanto do seu dinheiro depende de uma pessoa só.
 * Concentração alta é risco — se essa pessoa some, some a receita.
 */
export function concentracaoReceita(de, ate) {
  const mapa = new Map();
  for (const t of estado.transacoes) {
    if (t.data < de || t.data > ate || !realizada(t)) continue;
    if (t.valorCent <= 0) continue;
    if (t.categoria !== 'MUS' && t.categoria !== 'SUB' && t.categoria !== 'ENS') continue;
    const p = buscarPessoa(t.pessoaId);
    const nome = p ? p.nome : '(sem contato)';
    const chave = p ? p.id : 'sem';
    const atual = mapa.get(chave) || { nome, cent: 0, n: 0, tipo: t.categoria };
    atual.cent += t.valorCent;
    atual.n++;
    mapa.set(chave, atual);
  }
  const fontes = [...mapa.values()].sort((a, b) => b.cent - a.cent);
  const total = fontes.reduce((a, f) => a + f.cent, 0);
  for (const f of fontes) f.pct = total > 0 ? (f.cent / total) * 100 : 0;
  // Índice de Herfindahl normalizado: 0 = pulverizado, 100 = tudo numa pessoa só
  const hhi = total > 0 ? fontes.reduce((a, f) => a + (f.pct / 100) ** 2, 0) * 100 : 0;
  return {
    fontes,
    total,
    maiorPct: fontes.length ? fontes[0].pct : 0,
    top3Pct: fontes.slice(0, 3).reduce((a, f) => a + f.pct, 0),
    hhi,
  };
}

export function maioresGastos(de, ate, n = 10) {
  return estado.transacoes
    .filter((t) => t.data >= de && t.data <= ate && realizada(t) && ehDespesa(t) && t.valorCent < 0)
    .sort((a, b) => a.valorCent - b.valorCent)
    .slice(0, n);
}

/**
 * Anomalias: lançamentos muito acima do padrão da própria categoria
 * (> 2,5× a mediana daquela categoria) — onde o dinheiro escapou sem você ver.
 */
export function anomalias(de, ate, fator = 2.5) {
  const porCat = new Map();
  for (const t of estado.transacoes) {
    if (!ehDespesa(t) || t.valorCent >= 0 || !realizada(t)) continue;
    if (!porCat.has(t.categoria)) porCat.set(t.categoria, []);
    porCat.get(t.categoria).push(-t.valorCent);
  }
  const medianas = new Map([...porCat].map(([c, xs]) => [c, mediana(xs)]));
  const achados = [];
  for (const t of estado.transacoes) {
    if (t.data < de || t.data > ate || !realizada(t)) continue;
    if (!ehDespesa(t) || t.valorCent >= 0) continue;
    const med = medianas.get(t.categoria) || 0;
    if (med > 0 && -t.valorCent > med * fator) {
      achados.push({ tx: t, medianaCent: Math.round(med), vezes: -t.valorCent / med });
    }
  }
  return achados.sort((a, b) => b.vezes - a.vezes);
}

// ───────────────────────── Tendência ─────────────────────────

/** Regressão linear simples sobre [y0, y1, …]. Devolve inclinação por passo. */
export function tendenciaLinear(valores) {
  const n = valores.length;
  if (n < 2) return { a: 0, b: n ? valores[0] : 0, r2: 0 };
  const mx = (n - 1) / 2;
  const my = media(valores);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - mx) * (valores[i] - my);
    sxx += (i - mx) ** 2;
    syy += (valores[i] - my) ** 2;
  }
  const a = sxx ? sxy / sxx : 0;
  const b = my - a * mx;
  const r2 = syy ? (sxy * sxy) / (sxx * syy) : 0;
  return { a, b, r2 };
}

export function mediaMovel(valores, k = 3) {
  return valores.map((_, i) => {
    const ini = Math.max(0, i - k + 1);
    const janela = valores.slice(ini, i + 1);
    return media(janela);
  });
}

/**
 * Projeção de patrimônio: extrapola a tendência dos últimos `base` meses
 * por `meses` à frente. É um cenário, não uma promessa — daí o r².
 */
export function projecaoPatrimonio(meses = 6, base = 12) {
  const serie = serieMensal().slice(-base);
  if (serie.length < 3) return null;
  const { a, b, r2 } = tendenciaLinear(serie.map((s) => s.patrimonio));
  const pontos = [];
  let ym = serie[serie.length - 1].mes;
  for (let i = 1; i <= meses; i++) {
    ym = mesMenos(ym, -1);
    pontos.push({ mes: ym, patrimonio: Math.round(a * (serie.length - 1 + i) + b) });
  }
  return { pontos, porMesCent: Math.round(a), r2, base: serie.length };
}

/** Caixa médio por mês do calendário — a sazonalidade real do negócio. */
export function sazonalidade() {
  const porMes = new Map();
  for (const s of serieMensal()) {
    const m = s.mes.slice(5, 7);
    if (!porMes.has(m)) porMes.set(m, []);
    porMes.get(m).push(s);
  }
  return [...porMes.entries()].sort().map(([m, xs]) => ({
    mes: m,
    receita: Math.round(media(xs.map((x) => x.entradaReal))),
    gasto: Math.round(media(xs.map((x) => x.saidaReal))),
    sobra: Math.round(media(xs.map((x) => x.caixaLiquido))),
    anos: xs.length,
  }));
}

/** Comparação ano a ano (12 meses correntes vs 12 anteriores). */
export function anoAAno() {
  const serie = serieMensal();
  if (serie.length < 13) return null;
  const ult = serie.slice(-12);
  const ant = serie.slice(-24, -12);
  if (!ant.length) return null;
  const soma = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
  const cmp = (k) => {
    const a = soma(ant, k), b = soma(ult, k);
    return { anterior: a, atual: b, deltaPct: a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null };
  };
  return {
    mesesAnterior: ant.length,
    receita: cmp('entradaReal'),
    gasto: cmp('saidaReal'),
    sobra: cmp('caixaLiquido'),
    receitaEns: cmp('receitaEns'),
    receitaMus: cmp('receitaMus'),
  };
}

// ───────────────────────── Ensino ─────────────────────────

/** Alunos que costumam pagar (pagaram em algum dos `janela` meses) e não pagaram no mês. */
export function alunosSemPagamento(ym, janela = 3) {
  const pagouNoMes = new Set(alunosPagantesMes(ym).map((p) => p.aluno.id));
  const recentes = new Set();
  for (let i = 1; i <= janela; i++) {
    for (const p of alunosPagantesMes(mesMenos(ym, i))) recentes.add(p.aluno.id);
  }
  return estado.alunos.filter((a) => a.ativo && recentes.has(a.id) && !pagouNoMes.has(a.id));
}

export function painelEnsino(ym) {
  const capTurma = Number(estado.config.capacidadeTurma) || 7;
  const cota = Number(estado.config.cotaCent) || 23250;
  const capacidade = capTurma * TURMAS.length;
  const potencial = cota * capacidade;
  const r = receitaEnsinoMes(ym);
  const turmas = TURMAS.map((t) => {
    const ativos = estado.alunos.filter((a) => a.ativo && a.turma === t.id);
    const pagantes = r.lista.filter((p) => p.aluno.turma === t.id);
    return {
      ...t,
      ativos: ativos.length,
      pagantes: pagantes.length,
      vagas: Math.max(0, capTurma - ativos.length),
      receitaCent: pagantes.length * cota,
    };
  });
  return {
    mes: ym,
    capacidade,
    potencialCent: potencial,
    receitaCent: r.cent,
    caixaCent: r.caixaCent,
    pagantes: r.pagantes,
    pctPotencial: potencial ? (r.cent / potencial) * 100 : 0,
    turmas,
    semTurma: estado.alunos.filter((a) => a.ativo && !a.turma).length,
    naoPagaram: alunosSemPagamento(ym),
    semAluno: ensinoSemAluno(ym),
  };
}

/**
 * Retenção: por quantos meses cada aluno ficou, e a receita que já gerou.
 * É o indicador que diz se o problema é atrair ou segurar aluno.
 */
export function retencaoAlunos() {
  const cota = Number(estado.config.cotaCent) || 23250;
  const meses = mesesComDados();
  const porAluno = new Map();
  for (const m of meses) {
    for (const p of alunosPagantesMes(m)) {
      const at = porAluno.get(p.aluno.id) || { aluno: p.aluno, meses: [], receitaCent: 0 };
      at.meses.push(m);
      at.receitaCent += p.meia ? Math.round(cota / 2) : cota;
      porAluno.set(p.aluno.id, at);
    }
  }
  const linhas = [...porAluno.values()].map((x) => ({
    aluno: x.aluno,
    nMeses: x.meses.length,
    primeiro: x.meses[0],
    ultimo: x.meses[x.meses.length - 1],
    receitaCent: x.receitaCent,
    ativoAgora: x.meses.includes(mesAtual()) || x.meses.includes(mesMenos(mesAtual(), 1)),
  })).sort((a, b) => b.nMeses - a.nMeses);

  const duracoes = linhas.filter((l) => !l.ativoAgora).map((l) => l.nMeses);
  return {
    linhas,
    duracaoMediaMeses: duracoes.length ? media(duracoes) : null,
    ltvMedioCent: duracoes.length
      ? Math.round(media(linhas.filter((l) => !l.ativoAgora).map((l) => l.receitaCent)))
      : null,
    fluxo: fluxoAlunos(),
  };
}

/** Entradas e saídas de alunos por mês — o churn visível. */
export function fluxoAlunos() {
  const meses = mesesComDados();
  const vistos = new Set();
  const anterior = new Set();
  const fluxo = [];
  for (const m of meses) {
    const agora = new Set(alunosPagantesMes(m).map((p) => p.aluno.id));
    let entraram = 0, sairam = 0;
    for (const id of agora) if (!vistos.has(id)) entraram++;
    for (const id of anterior) if (!agora.has(id)) sairam++;
    for (const id of agora) vistos.add(id);
    anterior.clear();
    for (const id of agora) anterior.add(id);
    fluxo.push({ mes: m, ativos: agora.size, entraram, sairam });
  }
  return fluxo;
}

// ───────────────────────── Alertas ─────────────────────────

/** Um alerta adiado some até esta data. */
export function alertaAdiado(chave) {
  const adiados = estado.config.alertasAdiados || {};
  return adiados[chave] && adiados[chave] > hoje();
}

/** Tudo que pede uma ação sua, em ordem de urgência. */
export function alertas() {
  const out = [];
  const mes = mesAtual();

  const revisar = estado.transacoes.filter((t) => t.status === 'revisar').length;
  if (revisar) {
    out.push({
      chave: 'revisar',
      nivel: 'atencao',
      titulo: revisar + (revisar === 1 ? ' lançamento para revisar' : ' lançamentos para revisar'),
      texto: 'Enquanto não forem classificados, os relatórios ficam incompletos.',
      acao: { texto: 'Revisar', rota: 'dados', aba: 'revisao' },
    });
  }

  const naoPagaram = alunosSemPagamento(mes);
  if (naoPagaram.length) {
    out.push({
      chave: 'sem-pagar:' + mes,
      nivel: 'atencao',
      titulo: naoPagaram.length + (naoPagaram.length === 1 ? ' aluno sem pagar' : ' alunos sem pagar'),
      texto: naoPagaram.map((a) => a.nome).join(', '),
      acao: { texto: 'Ver ensino', rota: 'ensino' },
    });
  }

  if (!temAncora()) {
    out.push({
      chave: 'sem-ancora',
      nivel: 'grave',
      titulo: 'Patrimônio sem âncora',
      texto: 'Importe um OFX da conta (ou informe o saldo) para o patrimônio ser real.',
      acao: { texto: 'Ajustar', rota: 'dados', aba: 'config' },
    });
  }

  const f = folego();
  if (f.meses !== null && f.meses < f.alvoMeses) {
    out.push({
      chave: 'folego:' + mes,
      nivel: f.meses < 3 ? 'grave' : 'atencao',
      titulo: 'Fôlego abaixo da meta',
      texto: 'Sua reserva cobre ' + f.meses.toFixed(1).replace('.', ',')
        + ' meses; a meta são ' + f.alvoMeses + '.',
      acao: { texto: 'Ver tendências', rota: 'tendencias' },
    });
  }

  const r = ritmoDoMes();
  if (r.deltaPct !== null && r.deltaPct > 20) {
    out.push({
      chave: 'ritmo:' + mes,
      nivel: 'atencao',
      titulo: 'Gasto acima do ritmo',
      texto: 'Você já gastou ' + Math.round(r.deltaPct) + '% a mais que a média para este dia do mês.',
      acao: { texto: 'Ver fluxo', rota: 'fluxo' },
    });
  }

  const semCat = naoCategorizadas(mesMenos(mes, 2) + '-01', hoje());
  if (semCat.length >= 5) {
    out.push({
      chave: 'sem-categoria',
      nivel: 'leve',
      titulo: semCat.length + ' saídas sem categoria',
      texto: 'Nos últimos 3 meses. Elas não entram em nenhum gráfico de gasto.',
      acao: { texto: 'Classificar', rota: 'dados', aba: 'revisao' },
    });
  }

  const ordem = { grave: 0, atencao: 1, leve: 2 };
  return out
    .filter((a) => !alertaAdiado(a.chave))
    .sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
