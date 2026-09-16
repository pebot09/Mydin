// Tela "Hoje" — responde a única pergunta que importa ao abrir o app:
// estou bem, e o que precisa da minha atenção agora?

import * as A from '../analytics.js';
import { moeda, moedaRedonda, moedaSinal, mesLongo, mesBR, pct, pctSinal, num, plural, eixoMoeda } from '../format.js';
import { cartao, secao, ligarDicas, tom, irPara, $, $$, esc } from '../ui.js';
import { sparkline, barrasDivergentes } from '../charts.js';

const ICONE = { grave: '●', atencao: '▲', leve: '•' };

export function render(host) {
  const mes = A.mesAtual();
  const serie = A.serieMensal();
  const pat = A.patrimonio();
  const variacao = A.variacaoPatrimonioMes(mes);
  const f = A.folego();
  const taxa = A.taxaPoupanca();
  const ritmo = A.ritmoDoMes();
  const ens = A.receitaEnsinoMes(mes);
  const mus = A.receitaMusicaMes(mes);
  const g = A.gastoMes(mes);
  const caixa = A.caixaRealMes(mes);
  const alertas = A.alertas();
  const futuros = A.comprometidoFuturo();

  if (!serie.length) {
    host.innerHTML = `
      <div class="vazio">
        <p><strong>Nada importado ainda.</strong><br>
        Traga seus extratos OFX do Nubank e o app monta tudo sozinho.</p>
      </div>`;
    const b = document.createElement('button');
    b.className = 'botao';
    b.textContent = 'Importar extratos';
    b.addEventListener('click', () => irPara('dados', { aba: 'importar' }));
    host.querySelector('.vazio').appendChild(b);
    return;
  }

  const folegoTom = f.meses === null ? '' : f.meses < 3 ? 'ruim' : f.meses < f.alvoMeses ? '' : 'bom';

  host.innerHTML = `
    <div class="cartoes">
      ${cartao({
        rotulo: 'Patrimônio',
        valor: moeda(pat),
        sub: `<span class="${tom(variacao)}">${moedaSinal(variacao)}</span> em ${mesLongo(mes)}
              <div id="spark-pat" style="margin-top:6px"></div>`,
        tom: 'destaque',
        dica: 'Conta + poupança/investimentos. É o termômetro real: mesmo que toda a '
          + 'categorização esteja errada, este número continua certo, porque o saldo vem do próprio banco.',
      })}
      ${cartao({
        rotulo: 'Fôlego',
        valor: f.meses === null ? '—' : num(f.meses, 1) + ' <span class="fraco" style="font-size:.6em">meses</span>',
        sub: f.meses === null ? 'Sem histórico de gasto ainda'
          : `Queima ${moedaRedonda(f.burnCent)}/mês · meta ${f.alvoMeses} meses`,
        tom: folegoTom,
        dica: 'Quantos meses o patrimônio sustenta o seu ritmo de gasto se a receita parar hoje. '
          + 'A queima é medida pelo dinheiro que realmente saiu da conta e do cartão, então '
          + 'este número não melhora só porque falta classificar lançamento.',
      })}
      ${cartao({
        rotulo: 'Taxa de poupança',
        valor: taxa === null ? '—' : pct(taxa),
        sub: (taxa === null
            ? 'Sem meses fechados para medir'
            : taxa >= 0
              ? `De cada R$ 100 que entram, sobram R$ ${Math.round(taxa)}`
              : `Para cada R$ 100 que entram, você gasta R$ ${Math.round(100 - taxa)}`)
          + '<br><span class="mini">média dos 3 últimos meses fechados</span>',
        tom: taxa === null ? '' : taxa >= 20 ? 'bom' : taxa < 0 ? 'ruim' : '',
        dica: '(Entrou − saiu) ÷ entrou nos últimos 3 meses fechados, pelo caixa real. '
          + 'Abaixo de zero, você está consumindo patrimônio para viver.',
      })}
      ${cartao({
        rotulo: 'Ritmo do mês',
        valor: moedaRedonda(ritmo.gastoAteHoje),
        sub: ritmo.deltaPct === null
          ? 'Sem meses anteriores para comparar'
          : `<span class="${ritmo.deltaPct > 0 ? 'ruim' : 'bom'}">${pctSinal(ritmo.deltaPct)}</span>
             vs. média até o dia ${ritmo.dia}<br>
             <span class="mini">no ritmo atual fecha em ${moedaRedonda(ritmo.projecao)}</span>`,
        tom: ritmo.deltaPct !== null && ritmo.deltaPct > 20 ? 'ruim' : '',
        dica: 'Tudo que saiu da conta e do cartão até hoje, comparado ao que costumava ter '
          + 'saído até este mesmo dia nos 3 meses anteriores. Serve para corrigir a rota antes do mês acabar.',
      })}
    </div>

    ${alertas.length ? secao('Precisa de você',
      alertas.map((a, i) => `
        <div class="alerta-item ${a.nivel}">
          <span class="alerta-marca ${a.nivel === 'grave' ? 'ruim' : ''}">${ICONE[a.nivel]}</span>
          <div class="alerta-corpo">
            <div class="alerta-titulo">${esc(a.titulo)}</div>
            <div class="alerta-texto">${esc(a.texto)}</div>
          </div>
          ${a.acao ? `<button type="button" data-alerta="${i}">${esc(a.acao.texto)}</button>` : ''}
        </div>`).join('')) : ''}

    ${secao(mesLongo(mes), `
      <div class="painel">
        <table class="tabela">
          <tr><td>Receita</td><td><strong>${moeda(ens.cent + mus)}</strong></td></tr>
          <tr><td class="fraco">— Ensino (${ens.pagantes} ${plural(ens.pagantes, 'pagante', 'pagantes')})</td>
              <td>${moeda(ens.cent)}</td></tr>
          <tr><td class="fraco">— Música</td><td>${moeda(mus)}</td></tr>
          <tr><td>Gasto</td><td><strong>${moeda(g.total)}</strong></td></tr>
          <tr><td class="fraco">— Fixo</td><td>${moeda(g.fixo)}</td></tr>
          <tr><td class="fraco">— Variável</td><td>${moeda(g.variavel)}</td></tr>
          <tr><td><strong>Sobra contábil</strong></td>
              <td class="${tom(ens.cent + mus - g.total)}"><strong>${moedaSinal(ens.cent + mus - g.total)}</strong></td></tr>
          <tr><td><strong>Caixa real</strong></td>
              <td class="${tom(caixa.liquido)}"><strong>${moedaSinal(caixa.liquido)}</strong></td></tr>
          <tr><td><strong>Variação de patrimônio</strong></td>
              <td class="${tom(variacao)}"><strong>${moedaSinal(variacao)}</strong></td></tr>
        </table>
        <p class="nota">“Sobra contábil” só conta o que está categorizado; “caixa real” conta
        tudo que entrou e saiu. Quando as duas se afastam, é sinal de que falta classificar —
        não de que você ficou mais pobre.</p>
      </div>`)}

    ${secao('Sobrou ou faltou', `
      <div class="painel">
        <div class="grafico" id="g-sobra"></div>
        <p class="nota">Dinheiro que entrou menos dinheiro que saiu, de verdade — sem depender
        de nenhuma categoria estar certa. Barra para baixo = mês que consumiu reserva.</p>
      </div>`, 'Caixa real, mês a mês')}

    ${futuros.length ? secao('Já comprometido', `
      <div class="painel">
        <table class="tabela">
          <tr><th>Fatura</th><th>Parcelas</th><th>Valor</th></tr>
          ${futuros.map((x) => `<tr><td>${mesBR(x.mes)}</td><td>${x.n}</td>
            <td><strong>${moeda(x.cent)}</strong></td></tr>`).join('')}
        </table>
        <p class="nota">Parcelas do cartão já lançadas para a frente. Não são gasto deste mês,
        mas já estão reservadas do seu futuro.</p>
      </div>`) : ''}
  `;

  // sparkline do patrimônio (12 meses)
  const ultimos = serie.slice(-12);
  if (ultimos.length > 1) {
    sparkline($('#spark-pat', host), ultimos.map((s) => s.patrimonio), { largura: 120, altura: 30 });
  }

  const sobras = serie.slice(-12);
  barrasDivergentes($('#g-sobra', host), {
    rotulos: sobras.map((s) => mesBR(s.mes)),
    valores: sobras.map((s) => s.caixaLiquido),
    fmt: moeda,
    fmtEixo: eixoMoeda,
  });

  $$('[data-alerta]', host).forEach((b) => {
    b.addEventListener('click', () => {
      const a = alertas[Number(b.dataset.alerta)].acao;
      irPara(a.rota, { aba: a.aba });
    });
  });
  ligarDicas(host);
}
