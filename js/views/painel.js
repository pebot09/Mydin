// Tela "Hoje" — responde a única pergunta que importa ao abrir o app:
// estou bem, o que precisa de mim agora, e o que vem pela frente?

import * as A from '../analytics.js';
import * as P from '../previsao.js';
import { salvarConfig, estado } from '../store.js';
import { nomeCategoria } from '../dominio.js';
import { moeda, moedaRedonda, moedaSinal, mesLongo, mesBR, dataBR, pct, pctSinal, num, plural,
  eixoMoeda } from '../format.js';
import { cartao, secao, ligarDicas, tom, irPara, recarregar, aviso, $, $$, esc } from '../ui.js';
import { sparkline, barrasDivergentes, proporcao, medidor } from '../charts.js';

const ICONE = { grave: '●', atencao: '▲', leve: '•' };
const DIAS_ADIAMENTO = 14;

/** A conclusão do mês em palavras, antes de qualquer número solto. */
function resumoDoTopo({ mes, caixa, folego }) {
  const partes = [];
  if (caixa.entrada > 0) {
    const p = (caixa.liquido / caixa.entrada) * 100;
    partes.push(`Em ${mesLongo(mes)} entraram <strong>${moedaRedonda(caixa.entrada)}</strong>`
      + ` e saíram <strong>${moedaRedonda(caixa.saida)}</strong> — `
      + (caixa.liquido >= 0
        ? `sobrou <strong class="bom">${moedaRedonda(caixa.liquido)}</strong>, ${pct(p)} do que entrou.`
        : `faltaram <strong class="ruim">${moedaRedonda(-caixa.liquido)}</strong>, que saíram da reserva.`));
  } else {
    partes.push(`Nada entrou ainda em ${mesLongo(mes)}.`);
  }
  if (folego.meses !== null) {
    partes.push(folego.meses >= folego.alvoMeses
      ? `Sua reserva cobre <strong>${num(folego.meses, 1)} meses</strong> de gasto, acima da meta de ${folego.alvoMeses}.`
      : `Sua reserva cobre <strong class="${folego.meses < 3 ? 'ruim' : ''}">${num(folego.meses, 1)} meses</strong>`
        + ` de gasto, abaixo da meta de ${folego.alvoMeses}.`);
  }
  return partes.join(' ');
}

const SELO = {
  confirmado: { texto: 'já lançado', classe: '' },
  previsto: { texto: 'previsto', classe: 'previsto' },
  atrasado: { texto: 'atrasado', classe: 'aviso' },
};

export function render(host) {
  const mes = A.mesAtual();
  const serie = A.serieMensal();

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

  const pat = A.patrimonio();
  const variacao = A.variacaoPatrimonioMes(mes);
  const f = A.folego();
  const taxa = A.taxaPoupanca();
  const ritmo = A.ritmoDoMes();
  const ens = A.receitaEnsinoMes(mes);
  const mus = A.receitaMusicaMes(mes);
  const g = A.gastoMes(mes);
  const caixa = A.caixaRealMes(mes);
  const destino = A.destinoDoQueEntrou(mes + '-01', A.fimEfetivo(mes));
  const meta = A.metaReserva();
  const alertas = A.alertas();
  const prox = P.proximosLancamentos(30);
  const futuros = A.comprometidoFuturo().filter((x) => x.mes > prox.ate.slice(0, 7));

  const folegoTom = f.meses === null ? '' : f.meses < 3 ? 'ruim' : f.meses < f.alvoMeses ? '' : 'bom';

  host.innerHTML = `
    <p class="resumo-topo">${resumoDoTopo({ mes, caixa, folego: f })}</p>

    <div class="cartoes">
      ${cartao({
        rotulo: 'Patrimônio',
        valor: moeda(pat),
        sub: `<span class="${tom(variacao)}">${moedaSinal(variacao)}</span> em ${mesLongo(mes)}
              <div class="cartao-partes">
                <span>Conta <strong>${moedaRedonda(A.saldoConta())}</strong></span>
                <span>Poupança <strong>${moedaRedonda(A.saldoPoupanca())}</strong></span>
              </div>
              <div id="spark-pat" style="margin-top:8px"></div>`,
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
          : (Math.abs(ritmo.deltaPct) < 0.5
              ? `No mesmo ritmo de sempre até o dia ${ritmo.dia}`
              : `<span class="${ritmo.deltaPct > 0 ? 'ruim' : 'bom'}">${pctSinal(ritmo.deltaPct)}</span>
                 vs. média até o dia ${ritmo.dia}`)
            + `<br><span class="mini">no ritmo atual fecha em ${moedaRedonda(ritmo.projecao)}</span>`,
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
          <div class="alerta-acoes">
            ${a.acao ? `<button type="button" data-alerta="${i}">${esc(a.acao.texto)}</button>` : ''}
            <button type="button" class="alerta-adiar" data-adiar="${i}">Agora não</button>
          </div>
        </div>`).join('')) : ''}

    ${secao('Próximos 30 dias', `
      <div class="painel">
        <div class="tres-colunas">
          <div><span class="col-rotulo">Entra</span>
            <strong class="bom">${moedaRedonda(prox.entra)}</strong></div>
          <div><span class="col-rotulo">Sai</span>
            <strong class="ruim">${moedaRedonda(prox.sai)}</strong></div>
          <div><span class="col-rotulo">Sobra</span>
            <strong class="${tom(prox.liquido)}">${moedaSinal(prox.liquido)}</strong></div>
        </div>
        <p class="nota" style="margin-top:10px">Somando o que já está lançado com o que costuma
        se repetir, o período fecha em <strong class="${tom(prox.liquido)}">${moedaSinal(prox.liquido)}</strong>.
        Compras no cartão só saem da conta quando a fatura vence.</p>
        ${prox.itens.length ? `
          <div class="lista" style="margin-top:8px">
            ${prox.itens.slice(0, 18).map((i) => {
              const s = SELO[i.certeza];
              return `
              <div class="lista-item" style="cursor:default">
                <div class="prox-data">
                  <span class="prox-dia">${i.data.slice(8, 10)}</span>
                  <span class="prox-mes">${mesBR(i.data.slice(0, 7)).split('/')[0]}</span>
                </div>
                <div class="lista-corpo">
                  <div class="lista-titulo">${esc(i.rotulo)}</div>
                  <div class="lista-sub">
                    ${s.texto !== 'já lançado' ? `<span class="etiqueta ${s.classe}">${s.texto}</span> ` : ''}${esc(i.detalhe)}${i.categoria ? ' · ' + esc(nomeCategoria(i.categoria)) : ''}</div>
                </div>
                <div class="lista-valor ${i.valorCent > 0 ? 'bom' : ''}">${moedaSinal(i.valorCent)}</div>
              </div>`;
            }).join('')}
          </div>
          ${prox.itens.length > 18 ? `<p class="nota">Mostrando 18 de ${prox.itens.length}.</p>` : ''}
        ` : '<p class="mini" style="margin-top:8px">Nada previsto para os próximos 30 dias.</p>'}
        ${futuros.length ? `<p class="nota">Mais adiante: ${futuros.map((x) =>
          `${moedaRedonda(x.cent)} em ${mesBR(x.mes)}`).join(' · ')} em parcelas de cartão.</p>` : ''}
        <p class="nota">“Previsto” é inferido do que se repete todo mês — não é cobrança confirmada.</p>
      </div>`, 'O que já está lançado e o que costuma cair')}

    ${secao('Para onde foi o que entrou', `
      <div class="painel">
        <div id="g-destino"></div>
        ${destino.livre < 0 ? `<p class="nota ruim">Gastos e aplicações somaram
          ${moedaRedonda(-destino.livre)} a mais do que entrou — a diferença saiu da reserva.</p>` : ''}
      </div>`, mesLongo(mes))}

    ${meta ? secao('Reserva', `
      <div class="painel">
        <div id="g-meta"></div>
        <p class="nota">${meta.faltamCent > 0
          ? `Faltam <strong>${moedaRedonda(meta.faltamCent)}</strong> para cobrir ${meta.meses} meses de gasto.`
          : `Você já tem mais do que os ${meta.meses} meses de gasto que definiu como meta.`}
          A meta acompanha sua queima: se o gasto sobe, o alvo sobe junto.</p>
      </div>`) : ''}

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
  `;

  const ultimos = serie.slice(-12);
  if (ultimos.length > 1) {
    sparkline($('#spark-pat', host), ultimos.map((s) => s.patrimonio), { largura: 120, altura: 30 });
  }

  proporcao($('#g-destino', host), {
    segmentos: [
      { nome: 'Gastos', valor: destino.gastos, cor: '--serie-2' },
      { nome: 'Guardado', valor: destino.guardado, cor: '--serie-3' },
      { nome: 'Parado na conta', valor: Math.max(0, destino.livre), cor: '--serie-1' },
    ],
    fmt: moedaRedonda,
    rotuloIni: 'R$ 0',
    rotuloFim: moedaRedonda(Math.max(destino.entrada, destino.gastos + destino.guardado)),
  });

  if (meta) {
    medidor($('#g-meta', host), {
      valor: meta.atualCent,
      meta: meta.alvoCent,
      fmt: moedaRedonda,
      rotulo: `Meta: ${meta.meses} meses de gasto`,
      sufixo: 'da meta',
    });
  }

  barrasDivergentes($('#g-sobra', host), {
    rotulos: serie.slice(-12).map((s) => mesBR(s.mes)),
    valores: serie.slice(-12).map((s) => s.caixaLiquido),
    fmt: moeda,
    fmtEixo: eixoMoeda,
  });

  $$('[data-alerta]', host).forEach((b) => {
    b.addEventListener('click', () => {
      const a = alertas[Number(b.dataset.alerta)].acao;
      irPara(a.rota, { aba: a.aba });
    });
  });

  $$('[data-adiar]', host).forEach((b) => {
    b.addEventListener('click', async () => {
      const a = alertas[Number(b.dataset.adiar)];
      const ate = new Date(Date.now() + DIAS_ADIAMENTO * 86400000).toISOString().slice(0, 10);
      await salvarConfig({
        alertasAdiados: { ...(estado.config.alertasAdiados || {}), [a.chave]: ate },
      });
      aviso(`Escondido por ${DIAS_ADIAMENTO} dias.`);
      recarregar();
    });
  });

  ligarDicas(host);
}
