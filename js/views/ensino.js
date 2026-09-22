// Tela "Ensino" — o motor estável do negócio: ocupação, inadimplência e retenção.

import * as A from '../analytics.js';
import { estado, salvar, remover, novoId } from '../store.js';
import { TURMAS, nomeTurma } from '../dominio.js';
import { moeda, moedaRedonda, mesBR, mesLongo, pct, num, plural } from '../format.js';
import { cartao, secao, ligarDicas, folha, confirmar, aviso, seletorPeriodo,
  recarregar, $, $$, esc, html } from '../ui.js';
import { medidor, barrasAgrupadas, ranking, legenda } from '../charts.js';

let mesSel = null;

export function render(host) {
  const meses = A.mesesComDados();
  if (!meses.length && !estado.alunos.length) {
    host.innerHTML = '<div class="vazio"><p>Cadastre alunos ou importe extratos para ver o painel de ensino.</p></div>';
    const b = html('<button class="botao" type="button">Cadastrar aluno</button>');
    b.addEventListener('click', () => editarAluno(null));
    $('.vazio', host).appendChild(b);
    return;
  }

  const mes = mesSel && meses.includes(mesSel) ? mesSel : A.mesAtual();
  const p = A.painelEnsino(mes);
  const ret = A.retencaoAlunos();
  const fluxo = ret.fluxo.slice(-12);
  const ociosas = p.turmas.reduce((a, t) => a + t.vagas, 0);
  const cota = Number(estado.config.cotaCent) || 23250;

  const opcoesMes = meses.slice(-12).reverse().map((m) => ({ id: m, nome: mesBR(m) }));

  host.innerHTML = `
    <div id="sel-mes"></div>

    ${secao('Ocupação de ' + mesLongo(mes), `
      <div class="painel">
        <div id="g-medidor"></div>
        <p class="nota">Potencial = ${p.capacidade} vagas × ${moeda(cota)}.
        ${ociosas ? `<strong>${ociosas} ${plural(ociosas, 'vaga ociosa', 'vagas ociosas')}</strong> = ${moedaRedonda(ociosas * cota)}/mês deixados na mesa.` : 'Todas as vagas ocupadas.'}</p>
      </div>`)}

    <div class="cartoes">
      ${cartao({ rotulo: 'Pagantes', valor: String(p.pagantes),
        sub: `de ${estado.alunos.filter((a) => a.ativo).length} alunos ativos` })}
      ${cartao({ rotulo: 'Receita', valor: moedaRedonda(p.receitaCent),
        sub: `Caixa recebido: ${moedaRedonda(p.caixaCent)}`,
        dica: 'Receita é pagantes × cota (a regra do negócio). Caixa é a soma do que realmente '
          + 'caiu na conta. A diferença aparece quando alguém paga a mais, a menos ou adiantado.' })}
      ${cartao({ rotulo: 'Permanência média',
        valor: ret.duracaoMediaMeses === null ? '—' : num(ret.duracaoMediaMeses, 1) + ' <span class="fraco" style="font-size:.6em">meses</span>',
        sub: ret.ltvMedioCent === null ? 'Ninguém saiu ainda' : `Cada aluno rende ${moedaRedonda(ret.ltvMedioCent)} na vida toda`,
        dica: 'Média de meses que um aluno fica, contando só quem já saiu. Diz se o seu problema '
          + 'é atrair aluno novo ou segurar o que já tem.' })}
      ${cartao({ rotulo: 'Vagas ociosas', valor: String(ociosas),
        tom: ociosas > 6 ? 'ruim' : ociosas === 0 ? 'bom' : '',
        sub: moedaRedonda(ociosas * cota) + '/mês não faturados' })}
    </div>

    ${p.naoPagaram.length ? secao('Ainda não pagaram', `
      <div class="painel">
        <div class="lista">
          ${p.naoPagaram.map((a) => `
            <div class="lista-item" style="cursor:default">
              <div class="lista-corpo">
                <div class="lista-titulo">${esc(a.nome)}</div>
                <div class="lista-sub">${esc(nomeTurma(a.turma))}</div>
              </div>
              <div class="lista-valor">${moeda(a.cotaCent || cota)}</div>
            </div>`).join('')}
        </div>
        <p class="nota">Só aparece quem <strong>costuma pagar</strong> (pagou em algum dos 3 meses
        anteriores) e ainda não pagou. Ex-aluno não vira cobrança.</p>
      </div>`) : ''}

    ${p.semAluno.length ? secao('Pagamentos sem aluno vinculado', `
      <div class="painel">
        <p class="folha-texto">${p.semAluno.length} ${plural(p.semAluno.length, 'entrada', 'entradas')}
        de ensino ${plural(p.semAluno.length, 'veio', 'vieram')} de alguém que não está ligado a um aluno —
        ${plural(p.semAluno.length, 'ela não conta', 'elas não contam')} como pagante e ${plural(p.semAluno.length, 'some', 'somem')} do painel.</p>
        <div class="lista">
          ${p.semAluno.map((t) => `
            <div class="lista-item" style="cursor:default">
              <div class="lista-corpo">
                <div class="lista-titulo">${esc((estado.pessoas.find((x) => x.id === t.pessoaId) || {}).nome || t.descricao)}</div>
                <div class="lista-sub">${esc(t.data)}</div>
              </div>
              <div class="lista-valor">${moeda(t.valorCent)}</div>
            </div>`).join('')}
        </div>
        <p class="nota">Vincule a pessoa a um aluno em <strong>Dados → Pessoas</strong>.</p>
      </div>`) : ''}

    ${secao('Turmas', `
      <div class="painel">
        <table class="tabela">
          <tr><th>Turma</th><th>Ativos</th><th>Pagaram</th><th>Vagas</th></tr>
          ${p.turmas.map((t) => `
            <tr>
              <td>${esc(t.nome)}</td>
              <td>${t.ativos}</td>
              <td><strong>${t.pagantes}</strong></td>
              <td class="${t.vagas > 2 ? 'ruim' : ''}">${t.vagas}</td>
            </tr>`).join('')}
        </table>
        ${p.semTurma ? `<p class="nota"><strong>${p.semTurma}</strong>
          ${plural(p.semTurma, 'aluno ativo está', 'alunos ativos estão')} sem turma —
          ${plural(p.semTurma, 'ele não entra', 'eles não entram')} na conta de vagas.</p>` : ''}
      </div>`)}

    ${fluxo.length > 1 ? secao('Entram e saem', `
      <div class="painel">
        ${legenda([{ nome: 'Entraram', cor: '--serie-1' }, { nome: 'Saíram', cor: '--serie-2' }])}
        <div class="grafico" id="g-fluxo"></div>
        <p class="nota">Aluno "saiu" quando parou de pagar no mês seguinte. Meses com mais saídas
        que entradas encolhem a base — é o sinal mais antecipado de queda de receita.</p>
      </div>`, 'Renovação da base de alunos') : ''}

    ${secao('Alunos por permanência', `
      <div class="painel">
        <div id="g-ret"></div>
      </div>`, 'Quem fica mais tempo e quanto já rendeu')}

    ${secao('Cadastro', `
      <div class="painel">
        <div class="lista" id="lista-alunos">
          ${[...estado.alunos].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome))
            .map((a) => `
            <button type="button" class="lista-item" data-aluno="${esc(a.id)}">
              <div class="lista-corpo">
                <div class="lista-titulo">${esc(a.nome)}</div>
                <div class="lista-sub">${esc(nomeTurma(a.turma))}${a.ativo ? '' : ' · inativo'}</div>
              </div>
              <span class="etiqueta">${moeda(a.cotaCent || cota)}</span>
            </button>`).join('') || '<p class="mini">Nenhum aluno cadastrado.</p>'}
        </div>
        <button class="botao neutro compacto" type="button" id="novo-aluno" style="margin-top:14px">+ Novo aluno</button>
      </div>`)}
  `;

  const sel = seletorPeriodo(opcoesMes, mes, (id) => { mesSel = id; render(host); });
  $('#sel-mes', host).replaceWith(sel);

  medidor($('#g-medidor', host), {
    valor: p.receitaCent, meta: p.potencialCent, fmt: moedaRedonda,
    rotulo: `${p.pagantes} de ${p.capacidade} vagas`,
    sufixo: 'do potencial',
  });

  if (fluxo.length > 1) {
    barrasAgrupadas($('#g-fluxo', host), {
      rotulos: fluxo.map((f) => mesBR(f.mes)),
      series: [
        { nome: 'Entraram', cor: '--serie-1', valores: fluxo.map((f) => f.entraram) },
        { nome: 'Saíram', cor: '--serie-2', valores: fluxo.map((f) => f.sairam) },
      ],
      fmt: (v) => v + ' ' + plural(v, 'aluno', 'alunos'),
      fmtEixo: (v) => String(v),
      altura: 170,
    });
  }

  ranking($('#g-ret', host), {
    itens: ret.linhas.slice(0, 12).map((l) => ({
      rotulo: esc(l.aluno.nome),
      valor: l.receitaCent,
      detalhe: `${l.nMeses} ${plural(l.nMeses, 'mês', 'meses')} · ${mesBR(l.primeiro)} → ${mesBR(l.ultimo)}`
        + (l.ativoAgora ? ' · <strong>ativo</strong>' : ''),
      destaque: !l.ativoAgora,
    })),
    fmt: moedaRedonda,
  });

  $$('[data-aluno]', host).forEach((b) => {
    b.addEventListener('click', () => editarAluno(b.dataset.aluno));
  });
  $('#novo-aluno', host).addEventListener('click', () => editarAluno(null));
  ligarDicas(host);
}

/** Folha de cadastro/edição de aluno, incluindo quem paga por ele. */
function editarAluno(id) {
  const a = id ? estado.alunos.find((x) => x.id === id) : null;
  const cotaPadrao = Number(estado.config.cotaCent) || 23250;
  const pagadores = estado.pessoas.filter((p) => p.alunoId === id);

  const corpo = html(`
    <div>
      <label class="campo"><span>Nome</span>
        <input type="text" id="f-nome" value="${esc(a ? a.nome : '')}" placeholder="Nome do aluno"></label>
      <label class="campo"><span>Turma</span>
        <select id="f-turma">
          <option value="">— sem turma —</option>
          ${TURMAS.map((t) => `<option value="${t.id}"${a && a.turma === t.id ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}
        </select></label>
      <div class="linha-campos">
        <label class="campo"><span>Cota (R$)</span>
          <input type="text" id="f-cota" inputmode="decimal"
                 value="${((a ? a.cotaCent : cotaPadrao) / 100).toFixed(2).replace('.', ',')}"></label>
        <label class="campo"><span>Situação</span>
          <select id="f-ativo">
            <option value="1"${!a || a.ativo ? ' selected' : ''}>Ativo</option>
            <option value="0"${a && !a.ativo ? ' selected' : ''}>Inativo</option>
          </select></label>
      </div>
      ${id ? `<div class="campo"><span>Quem paga por este aluno</span>
        ${pagadores.length
          ? `<div class="lista">${pagadores.map((p) => `
              <div class="lista-item" style="cursor:default">
                <div class="lista-corpo"><div class="lista-titulo">${esc(p.nome)}</div>
                <div class="lista-sub">${esc(p.cpf || 'sem CPF')}</div></div>
              </div>`).join('')}</div>`
          : '<p class="mini">Ninguém vinculado ainda — vincule em Dados → Pessoas.</p>'}
      </div>` : ''}
      <div class="folha-acoes">
        ${id ? '<button type="button" class="botao perigo" id="f-excluir">Excluir</button>'
             : '<button type="button" class="botao neutro" id="f-cancelar">Cancelar</button>'}
        <button type="button" class="botao" id="f-salvar">Salvar</button>
      </div>
    </div>`);

  const f = folha(a ? 'Editar aluno' : 'Novo aluno', corpo);

  $('#f-salvar', corpo).addEventListener('click', async () => {
    const nome = $('#f-nome', corpo).value.trim();
    if (!nome) { aviso('Informe o nome.', 'erro'); return; }
    const cotaTxt = $('#f-cota', corpo).value;
    const cotaCent = Math.round(Number(String(cotaTxt).replace(/\./g, '').replace(',', '.')) * 100) || cotaPadrao;
    await salvar('alunos', {
      id: id || novoId(),
      nome,
      turma: $('#f-turma', corpo).value || null,
      ativo: $('#f-ativo', corpo).value === '1',
      cotaCent,
    });
    A.limparCache();
    f.fechar();
    aviso('Aluno salvo.');
    recarregar();
  });

  const bx = $('#f-excluir', corpo);
  if (bx) {
    bx.addEventListener('click', async () => {
      const ok = await confirmar('Excluir aluno',
        'Os pagamentos continuam no extrato, mas deixam de contar como ensino. Tem certeza?', 'Excluir');
      if (!ok) return;
      for (const p of estado.pessoas.filter((x) => x.alunoId === id)) {
        await salvar('pessoas', { ...p, alunoId: null });
      }
      await remover('alunos', id);
      A.limparCache();
      f.fechar();
      aviso('Aluno excluído.');
      recarregar();
    });
  }
  const bc = $('#f-cancelar', corpo);
  if (bc) bc.addEventListener('click', () => f.fechar());
}
