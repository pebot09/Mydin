// Tela "Fluxo" — de onde vem e para onde vai, e principalmente: o que mudou.

import * as A from '../analytics.js';
import { estado, pessoa as buscarPessoa } from '../store.js';
import { nomeCategoria, CATEGORIAS_FIXAS } from '../dominio.js';
import { moeda, moedaRedonda, moedaSinal, mesBR, pct, pctSinal, num, dataBR, eixoMoeda } from '../format.js';
import { cartao, secao, ligarDicas, tom, folha, seletorPeriodo, irPara, $, esc } from '../ui.js';
import { barrasAgrupadas, ranking, legenda } from '../charts.js';

const PERIODOS = [
  { id: 'mes', nome: 'Este mês' },
  { id: '3m', nome: '3 meses' },
  { id: '6m', nome: '6 meses' },
  { id: '12m', nome: '12 meses' },
  { id: 'tudo', nome: 'Tudo' },
];

let periodo = '3m';

function intervalo(id) {
  const hoje = A.hoje();
  const mes = A.mesAtual();
  if (id === 'mes') return { de: mes + '-01', ate: hoje, meses: 1 };
  if (id === 'tudo') {
    const ms = A.mesesComDados();
    return { de: (ms[0] || mes) + '-01', ate: hoje, meses: ms.length };
  }
  const n = Number(id.replace('m', ''));
  return { de: A.mesMenos(mes, n - 1) + '-01', ate: hoje, meses: n };
}

export function render(host) {
  const serie = A.serieMensal();
  if (!serie.length) {
    host.innerHTML = '<div class="vazio"><p>Importe seus extratos para ver o fluxo.</p></div>';
    return;
  }

  const { de, ate, meses } = intervalo(periodo);
  const cmp = A.gastosComparados(de, ate);
  const conc = A.concentracaoReceita(de, ate);
  const eq = A.pontoEquilibrio();
  const semCat = A.naoCategorizadas(de, ate);
  const caixa = A.caixaReal(de, ate);

  // receita do período pela regra do negócio (cota × pagantes) + música
  const mesesNoPeriodo = serie.filter((s) => s.mes >= de.slice(0, 7) && s.mes <= ate.slice(0, 7));
  const recEns = mesesNoPeriodo.reduce((a, s) => a + s.receitaEns, 0);
  const recMus = mesesNoPeriodo.reduce((a, s) => a + s.receitaMus, 0);
  const receita = recEns + recMus;
  const gasto = cmp.total;

  const fixo = cmp.linhas.filter((l) => CATEGORIAS_FIXAS.includes(l.categoria))
    .reduce((a, l) => a + l.cent, 0);
  const variavel = gasto - fixo;

  const barras = serie.slice(-Math.max(6, Math.min(12, meses)));

  host.innerHTML = `
    <div id="sel-periodo"></div>

    <div class="cartoes">
      ${cartao({
        rotulo: 'Entrou', valor: moedaRedonda(caixa.entrada),
        sub: receita
          ? `Do que está classificado: ensino ${pct((recEns / receita) * 100)} · música ${pct((recMus / receita) * 100)}`
          : 'Nada classificado como receita ainda',
      })}
      ${cartao({
        rotulo: 'Saiu', valor: moedaRedonda(caixa.saida),
        sub: (cmp.totalAnterior > 0
          ? `Categorizado: <span class="${gasto > cmp.totalAnterior ? 'ruim' : 'bom'}">${pctSinal(((gasto - cmp.totalAnterior) / cmp.totalAnterior) * 100)}</span> vs. período anterior`
          : 'Sem período anterior para comparar')
          + `<br><span class="mini">${moedaRedonda(gasto)} categorizados de ${moedaRedonda(caixa.saida)}</span>`,
        dica: 'O valor grande é tudo que saiu da conta e do cartão — não depende de classificação. '
          + 'O gráfico de categorias abaixo só enxerga a parte já classificada; se as duas estão '
          + 'longe, há lançamento esperando na fila de revisão.',
      })}
      ${cartao({
        rotulo: 'Sobrou', valor: moedaSinal(caixa.liquido),
        tom: tom(caixa.liquido),
        sub: `${moedaRedonda(Math.round(caixa.liquido / Math.max(1, meses)))} por mês`,
      })}
      ${cartao({
        rotulo: 'Fixo × variável',
        valor: pct(gasto ? (fixo / gasto) * 100 : 0),
        sub: `do gasto é fixo<br><span class="mini">${moedaRedonda(fixo)} fixo · ${moedaRedonda(variavel)} variável</span>`,
        dica: 'Custo fixo é o que você paga mesmo num mês sem trabalho: moradia, estúdio, '
          + 'terapia, medicinas. Quanto maior a fatia fixa, menos o seu mês aguenta uma queda de receita.',
      })}
    </div>

    ${secao('Entrou × saiu', `
      <div class="painel">
        ${legenda([{ nome: 'Entrou', cor: '--serie-1' }, { nome: 'Saiu', cor: '--serie-2' }])}
        <div class="grafico" id="g-rg"></div>
        <p class="nota">Dinheiro de verdade, sem depender de categoria. A distância entre as
        duas barras é o que sobrou naquele mês.</p>
      </div>`, 'Mês a mês, para ver se a distância está abrindo ou fechando')}

    ${secao('Para onde foi', `
      <div class="painel">
        ${legenda([{ nome: 'Custo fixo', cor: '--serie-2' }, { nome: 'Variável', cor: '--serie-1' }])}
        <div id="g-cat"></div>
        <p class="nota">Toque numa categoria para ver os lançamentos. A seta compara com
        ${meses === 1 ? 'o mês anterior' : 'os ' + meses + ' meses anteriores'},
        no mesmo ponto do mês.</p>
      </div>`, 'Só a parte já classificada — mostra a composição, não o total')}

    ${secao('Ponto de equilíbrio', `
      <div class="painel">
        <table class="tabela">
          <tr><td>Alunos para cobrir o custo <strong>fixo</strong></td>
              <td><strong>${eq.alunosParaFixo === null ? '—' : num(eq.alunosParaFixo, 1)}</strong></td></tr>
          <tr><td>Alunos para cobrir <strong>tudo</strong></td>
              <td><strong>${eq.alunosParaTotal === null ? '—' : num(eq.alunosParaTotal, 1)}</strong></td></tr>
          <tr><td>…contando a música que costuma entrar</td>
              <td><strong>${eq.alunosParaTotalComMusica === null ? '—' : num(eq.alunosParaTotalComMusica, 1)}</strong></td></tr>
        </table>
        <p class="nota">Com cota de ${moeda(eq.cotaCent)} e a média de gasto dos 3 últimos meses
        fechados (${moedaRedonda(eq.totalCent)}/mês). É a sua meta traduzida em pessoas.</p>
      </div>`, 'Quantos alunos pagantes sustentam o mês')}

    ${secao('De quem depende a sua renda', `
      <div class="painel">
        <div class="cartoes" style="margin-bottom:14px">
          ${cartao({
            rotulo: 'Maior fonte', valor: pct(conc.maiorPct),
            sub: conc.fontes.length ? esc(conc.fontes[0].nome) : '—',
            tom: conc.maiorPct > 35 ? 'ruim' : '',
          })}
          ${cartao({
            rotulo: 'Top 3 juntos', valor: pct(conc.top3Pct),
            sub: conc.top3Pct > 60 ? 'Renda concentrada em poucas pessoas'
              : conc.top3Pct > 40 ? 'Concentração moderada' : 'Renda pulverizada',
            tom: conc.top3Pct > 60 ? 'ruim' : conc.top3Pct > 40 ? '' : 'bom',
          })}
        </div>
        <div id="g-conc"></div>
        <p class="nota">Concentração alta é risco: se essa pessoa parar, a receita para junto.
        Ensino pulveriza; música concentra.</p>
      </div>`, 'Concentração da receita no período')}

    ${semCat.length ? secao('Buraco no relatório', `
      <div class="painel">
        <p class="folha-texto" style="margin-bottom:12px">
          <strong>${semCat.length} ${semCat.length === 1 ? 'saída' : 'saídas'}</strong> sem categoria
          ${'somam ' + moeda(semCat.reduce((a, t) => a + -t.valorCent, 0))} e não aparecem em
          nenhum gráfico acima.</p>
        <button class="botao" type="button" id="ir-revisar">Classificar agora</button>
      </div>`) : ''}
  `;

  host.prepend($('#sel-periodo', host));
  $('#sel-periodo', host).replaceWith(seletorPeriodo(PERIODOS, periodo, (id) => {
    periodo = id;
    render(host);
    host.scrollIntoView({ block: 'start' });
  }));

  barrasAgrupadas($('#g-rg', host), {
    rotulos: barras.map((s) => mesBR(s.mes)),
    series: [
      { nome: 'Entrou', cor: '--serie-1', valores: barras.map((s) => s.entradaReal) },
      { nome: 'Saiu', cor: '--serie-2', valores: barras.map((s) => s.saidaReal) },
    ],
    fmt: moeda,
    fmtEixo: eixoMoeda,
  });

  ranking($('#g-cat', host), {
    itens: cmp.linhas.filter((l) => l.cent > 0).map((l) => ({
      rotulo: nomeCategoria(l.categoria),
      valor: l.cent,
      destaque: CATEGORIAS_FIXAS.includes(l.categoria),
      detalhe: `${l.n} ${l.n === 1 ? 'lançamento' : 'lançamentos'}` + variacaoTexto(l),
      categoria: l.categoria,
    })),
    fmt: moeda,
    aoTocar: (it) => abrirCategoria(it.categoria, de, ate),
  });

  ranking($('#g-conc', host), {
    itens: conc.fontes.slice(0, 8).map((f) => ({
      rotulo: f.nome,
      valor: f.cent,
      detalhe: pct(f.pct, 1) + ' da receita · ' + f.n + 'x',
    })),
    fmt: moeda,
  });

  const btn = $('#ir-revisar', host);
  if (btn) btn.addEventListener('click', () => irPara('dados', { aba: 'revisao' }));
  ligarDicas(host);
}

/** Texto de variação: sem seta e sem cor quando nada mudou. */
function variacaoTexto(l) {
  if (l.deltaPct === null) return ' · novo no período';
  if (Math.abs(l.deltaPct) < 0.5) return ' · igual ao período anterior';
  const subiu = l.deltaCent > 0;
  return ` · <span class="${subiu ? 'ruim' : 'bom'}">${subiu ? '↑' : '↓'} ${pctSinal(l.deltaPct)}</span> vs. anterior`;
}

/** Drill-down: os lançamentos por trás de uma categoria. */
function abrirCategoria(categoria, de, ate) {
  const txs = estado.transacoes
    .filter((t) => t.categoria === categoria && t.data >= de && t.data <= ate && A.realizada(t))
    .sort((a, b) => a.valorCent - b.valorCent);
  const total = txs.reduce((a, t) => a + -t.valorCent, 0);

  const corpo = document.createElement('div');
  corpo.innerHTML = `
    <p class="folha-texto">${txs.length} ${txs.length === 1 ? 'lançamento' : 'lançamentos'}
    · total ${moeda(total)}</p>
    <div class="lista">
      ${txs.slice(0, 120).map((t) => {
        const p = buscarPessoa(t.pessoaId);
        return `<div class="lista-item" style="cursor:default">
          <div class="lista-corpo">
            <div class="lista-titulo">${esc(p ? p.nome : (t.descricao || 'Lançamento'))}</div>
            <div class="lista-sub">${dataBR(t.data)} · ${esc(t.conta === 'cartao' ? 'cartão' : 'conta')}${p ? ' · ' + esc(t.descricao || '') : ''}</div>
          </div>
          <div class="lista-valor ${t.valorCent > 0 ? 'bom' : ''}">${moeda(-t.valorCent)}</div>
        </div>`;
      }).join('')}
    </div>
    ${txs.length > 120 ? '<p class="nota">Mostrando os 120 maiores.</p>' : ''}`;
  folha(nomeCategoria(categoria), corpo);
}
