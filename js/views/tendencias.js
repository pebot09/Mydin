// Tela "Tendências" — o que está mudando, para onde aponta, e o que fugiu do padrão.

import * as A from '../analytics.js';
import { nomeCategoria } from '../dominio.js';
import { pessoa as buscarPessoa } from '../store.js';
import { moeda, moedaRedonda, moedaSinal, mesBR, mesLongo, pct, pctSinal, num, dataBR, eixoMoeda } from '../format.js';
import { cartao, secao, ligarDicas, tom, folha, $, esc } from '../ui.js';
import { linha, barrasAgrupadas, ranking, legenda } from '../charts.js';

const MESES_CAL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function render(host) {
  const serie = A.serieMensal();
  if (serie.length < 2) {
    host.innerHTML = '<div class="vazio"><p>Tendência precisa de pelo menos dois meses de dados.</p></div>';
    return;
  }

  const proj = A.projecaoPatrimonio(6, 12);
  const saz = A.sazonalidade();
  const yoy = A.anoAAno();
  const rec = A.reconciliacao(6);
  const de = A.mesMenos(A.mesAtual(), 5) + '-01';
  const anom = A.anomalias(de, A.hoje()).slice(0, 8);
  const maiores = A.maioresGastos(de, A.hoje(), 8);

  const ultimos12 = serie.slice(-12);
  const tendReceita = A.tendenciaLinear(ultimos12.map((s) => s.entradaReal));
  const tendGasto = A.tendenciaLinear(ultimos12.map((s) => s.saidaReal));

  host.innerHTML = `
    <div class="cartoes">
      ${cartao({
        rotulo: 'Patrimônio / mês',
        valor: proj ? moedaSinal(proj.porMesCent) : '—',
        tom: proj ? tom(proj.porMesCent) : '',
        sub: proj
          ? `Tendência dos últimos ${proj.base} meses<br><span class="mini">confiança ${pct(proj.r2 * 100)}</span>`
          : 'Poucos meses para projetar',
        dica: 'Inclinação da reta que melhor descreve seu patrimônio nos últimos meses. '
          + 'A confiança (r²) diz o quanto seus dados realmente seguem uma reta: '
          + 'abaixo de 50%, trate a projeção como palpite.',
      })}
      ${cartao({
        rotulo: 'Entradas',
        valor: moedaSinal(Math.round(tendReceita.a)),
        tom: tom(tendReceita.a),
        sub: 'por mês, tendência de 12 meses',
      })}
      ${cartao({
        rotulo: 'Saídas',
        valor: moedaSinal(Math.round(tendGasto.a)),
        tom: tendGasto.a > 0 ? 'ruim' : 'bom',
        sub: 'por mês, tendência de 12 meses',
      })}
      ${cartao({
        rotulo: 'Daqui a 6 meses',
        valor: proj ? moedaRedonda(proj.pontos[proj.pontos.length - 1].patrimonio) : '—',
        sub: proj ? 'se nada mudar de rota' : '—',
      })}
    </div>

    ${secao('Patrimônio e projeção', `
      <div class="painel">
        <div class="grafico" id="g-pat"></div>
        <p class="nota">A parte tracejada é extrapolação da tendência — um cenário, não uma promessa.</p>
      </div>`, 'Fim de cada mês, com 6 meses projetados')}

    ${secao('Entradas e saídas suavizadas', `
      <div class="painel">
        ${legenda([{ nome: 'Entrou (média 3m)', cor: '--serie-1' }, { nome: 'Saiu (média 3m)', cor: '--serie-2' }])}
        <div class="grafico" id="g-mm"></div>
        <p class="nota">A média móvel tira o ruído de um mês atípico e mostra o movimento de fundo.</p>
      </div>`)}

    ${secao('Sazonalidade', `
      <div class="painel">
        ${legenda([{ nome: 'Receita média', cor: '--serie-1' }, { nome: 'Gasto médio', cor: '--serie-2' }])}
        <div class="grafico" id="g-saz"></div>
        <p class="nota">Média por mês do calendário, somando todos os anos com dados.
        Serve para reservar caixa antes do vale, não depois.</p>
      </div>`, 'O ano tem meses bons e meses apertados — e eles se repetem')}

    ${yoy ? secao('Ano contra ano', `
      <div class="painel">
        <table class="tabela">
          <tr><th>12 meses</th><th>Anterior</th><th>Atual</th><th>Δ</th></tr>
          ${[['Entrou', yoy.receita], ['— Ensino', yoy.receitaEns], ['— Música', yoy.receitaMus],
             ['Saiu', yoy.gasto], ['Sobrou', yoy.sobra]].map(([nome, d]) => `
            <tr>
              <td>${nome}</td>
              <td class="fraco">${moedaRedonda(d.anterior)}</td>
              <td><strong>${moedaRedonda(d.atual)}</strong></td>
              <td class="${nome === 'Saiu' ? (d.deltaPct > 0 ? 'ruim' : 'bom') : tom(d.deltaPct)}">
                ${d.deltaPct === null ? '—' : pctSinal(d.deltaPct)}</td>
            </tr>`).join('')}
        </table>
      </div>`) : ''}

    ${anom.length ? secao('Fugiu do padrão', `
      <div class="painel">
        <div id="g-anom"></div>
        <p class="nota">Lançamentos muito acima da mediana da própria categoria nos últimos
        6 meses. Nem todo pico é erro — mas todo pico merece um olhar.</p>
      </div>`, 'Gastos atípicos dos últimos 6 meses') : ''}

    ${secao('Maiores gastos', `
      <div class="painel">
        <div id="g-maiores"></div>
      </div>`, 'Últimos 6 meses')}

    ${secao('O que a categorização não explica', `
      <div class="painel">
        <table class="tabela">
          <tr><th>Mês</th><th>Sobra contábil</th><th>Patrimônio</th><th>Diferença</th></tr>
          ${rec.map((r) => `
            <tr>
              <td>${mesBR(r.mes)}</td>
              <td>${moedaSinal(r.sobra)}</td>
              <td>${moedaSinal(r.variacao)}</td>
              <td class="${Math.abs(r.diferenca) > 50000 ? 'ruim' : 'fraco'}">${moedaSinal(r.diferenca)}</td>
            </tr>`).join('')}
        </table>
        <p class="nota">Diferença grande e persistente quer dizer que falta classificar coisa —
        ou que existe dinheiro entrando/saindo fora do extrato importado.
        O patrimônio está certo de qualquer jeito.</p>
      </div>`, 'Reconciliação dos últimos 6 meses')}
  `;

  // patrimônio + projeção
  linha($('#g-pat', host), {
    rotulos: serie.slice(-18).map((s) => mesBR(s.mes)),
    valores: serie.slice(-18).map((s) => s.patrimonio),
    projecao: proj ? proj.pontos.map((p) => ({ rotulo: mesBR(p.mes), valor: p.patrimonio })) : [],
    fmt: moeda,
    fmtEixo: eixoMoeda,
    altura: 200,
  });

  // médias móveis
  const base = serie.slice(-12);
  const mmR = A.mediaMovel(base.map((s) => s.entradaReal), 3).map(Math.round);
  const mmG = A.mediaMovel(base.map((s) => s.saidaReal), 3).map(Math.round);
  barrasAgrupadas($('#g-mm', host), {
    rotulos: base.map((s) => mesBR(s.mes)),
    series: [
      { nome: 'Entrou (média 3m)', cor: '--serie-1', valores: mmR },
      { nome: 'Saiu (média 3m)', cor: '--serie-2', valores: mmG },
    ],
    fmt: moeda,
    fmtEixo: eixoMoeda,
  });

  barrasAgrupadas($('#g-saz', host), {
    rotulos: saz.map((s) => MESES_CAL[Number(s.mes) - 1]),
    series: [
      { nome: 'Receita média', cor: '--serie-1', valores: saz.map((s) => s.receita) },
      { nome: 'Gasto médio', cor: '--serie-2', valores: saz.map((s) => s.gasto) },
    ],
    fmt: moeda,
    fmtEixo: eixoMoeda,
  });

  if (anom.length) {
    ranking($('#g-anom', host), {
      itens: anom.map((a) => {
        const p = buscarPessoa(a.tx.pessoaId);
        return {
          rotulo: esc(p ? p.nome : (a.tx.descricao || 'Lançamento')),
          valor: -a.tx.valorCent,
          detalhe: `${dataBR(a.tx.data)} · ${nomeCategoria(a.tx.categoria)} · `
            + `${num(a.vezes, 1)}× a mediana da categoria (${moedaRedonda(a.medianaCent)})`,
          destaque: true,
        };
      }),
      fmt: moeda,
    });
  }

  ranking($('#g-maiores', host), {
    itens: maiores.map((t) => {
      const p = buscarPessoa(t.pessoaId);
      return {
        rotulo: esc(p ? p.nome : (t.descricao || 'Lançamento')),
        valor: -t.valorCent,
        detalhe: `${dataBR(t.data)} · ${nomeCategoria(t.categoria)}`,
      };
    }),
    fmt: moeda,
  });

  ligarDicas(host);
}
