// Tela "Dados" — importar, revisar, pessoas e ajustes. Tudo que alimenta as análises.

import * as A from '../analytics.js';
import { estado, salvar, remover, novoId, salvarConfig, exportarTudo, importarTudo,
  apagarTudo, pessoa as buscarPessoa } from '../store.js';
import { CATEGORIAS, CAT_POR_ID, TIPOS_PESSOA, nomeCategoria } from '../dominio.js';
import { importarArquivos } from '../importar.js';
import { reclassificar, normalizar, chaveEstabelecimento } from '../classify.js';
import { aplicarCadastro } from '../cadastro.js';
import { moeda, moedaRedonda, dataBR, dataBRLonga, parseMoeda, plural, mesBR } from '../format.js';
import { secao, folha, confirmar, aviso, recarregar, irPara, $, $$, esc, html, ligarDicas } from '../ui.js';

const ABAS = [
  { id: 'importar', nome: 'Importar' },
  { id: 'revisao', nome: 'Revisar' },
  { id: 'pessoas', nome: 'Pessoas' },
  { id: 'ajustes', nome: 'Ajustes' },
];

let abaAtual = 'importar';
let filtroPessoas = '';

export function render(host, opcoes = {}) {
  if (opcoes.aba && ABAS.some((a) => a.id === opcoes.aba)) abaAtual = opcoes.aba;
  const nRevisar = estado.transacoes.filter((t) => t.status === 'revisar').length;

  host.innerHTML = `
    <div class="abas" role="tablist">
      ${ABAS.map((a) => `
        <button type="button" role="tab" data-aba="${a.id}"
                aria-selected="${a.id === abaAtual}">${a.nome}${a.id === 'revisao' && nRevisar ? ` (${nRevisar})` : ''}</button>`).join('')}
    </div>
    <div id="aba-corpo"></div>`;

  $$('[data-aba]', host).forEach((b) => {
    b.addEventListener('click', () => { abaAtual = b.dataset.aba; render(host); });
  });

  const corpo = $('#aba-corpo', host);
  if (abaAtual === 'importar') abaImportar(corpo);
  else if (abaAtual === 'revisao') abaRevisao(corpo);
  else if (abaAtual === 'pessoas') abaPessoas(corpo);
  else abaAjustes(corpo);
}

// ───────────────────────── Importar ─────────────────────────

function abaImportar(host) {
  const ultimo = estado.config.saldoContaData;
  host.innerHTML = `
    ${secao('Importar extratos', `
      <label class="arquivo">
        <input type="file" id="f-ofx" accept=".ofx,.OFX,application/x-ofx" multiple>
        <strong>Escolher arquivos OFX</strong>
        <span>Extrato da conta e faturas do cartão do Nubank.<br>
        Pode mandar vários de uma vez.</span>
      </label>
      <div id="resultado-import"></div>
      <p class="nota">O tipo (conta × cartão) é detectado sozinho. Reimportar um período que já
      entrou nunca duplica. Os arquivos são lidos <strong>dentro do próprio celular</strong> —
      nada é enviado para lugar nenhum.</p>
      ${ultimo ? `<p class="nota">Último saldo do banco: <strong>${moeda(Number(estado.config.saldoContaCent))}</strong> em ${dataBRLonga(ultimo)}.</p>` : ''}
    `)}

    ${secao('Lançamento manual', `
      <div class="painel">
        <p class="folha-texto">Dinheiro vivo, Pix de outro banco, qualquer coisa que não está no extrato.</p>
        <button class="botao neutro" type="button" id="novo-lanc">+ Novo lançamento</button>
      </div>`)}

    ${secao('Últimos lançamentos', `
      <div class="painel">
        <div class="lista">
          ${estado.transacoes.slice(0, 25).map((t) => itemTransacao(t)).join('')
            || '<p class="mini">Nada importado ainda.</p>'}
        </div>
      </div>`)}
  `;

  $('#f-ofx', host).addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    const alvo = $('#resultado-import', host);
    alvo.innerHTML = '<p class="nota">Lendo…</p>';
    try {
      const r = await importarArquivos(files);
      A.limparCache();
      alvo.innerHTML = `
        <div class="painel" style="margin-top:12px">
          <table class="tabela">
            <tr><th>Arquivo</th><th>Novos</th><th>Repetidos</th></tr>
            ${r.relatorio.map((x) => x.erro
              ? `<tr><td>${esc(x.arquivo)}</td><td colspan="2" class="ruim">${esc(x.erro)}</td></tr>`
              : `<tr><td>${esc(x.arquivo)}<br><span class="mini">${x.tipo === 'cartao' ? 'fatura' : 'conta'}</span></td>
                 <td><strong>${x.novas}</strong></td><td class="fraco">${x.duplicadas}</td></tr>`).join('')}
          </table>
          <p class="nota">${r.auto} ${plural(r.auto, 'classificado automaticamente', 'classificados automaticamente')}
          · ${r.revisar} ${plural(r.revisar, 'esperando você', 'esperando você')}
          ${r.pessoasCriadas ? ` · ${r.pessoasCriadas} ${plural(r.pessoasCriadas, 'pessoa nova', 'pessoas novas')}` : ''}</p>
          ${r.revisar ? '<button class="botao" type="button" id="ir-rev">Revisar agora</button>' : ''}
        </div>`;
      const b = $('#ir-rev', alvo);
      if (b) b.addEventListener('click', () => { abaAtual = 'revisao'; recarregar(); });
      aviso(r.novas + ' ' + plural(r.novas, 'lançamento importado', 'lançamentos importados'));
      e.target.value = '';
    } catch (err) {
      alvo.innerHTML = `<p class="nota ruim">${esc(err.message)}</p>`;
      aviso('Falha ao importar.', 'erro');
    }
  });

  $('#novo-lanc', host).addEventListener('click', () => editarTransacao(null));
  $$('[data-tx]', host).forEach((b) =>
    b.addEventListener('click', () => editarTransacao(b.dataset.tx)));
}

function itemTransacao(t) {
  const p = buscarPessoa(t.pessoaId);
  const rotulo = p ? p.nome : (t.descricao || 'Lançamento');
  return `
    <button type="button" class="lista-item" data-tx="${esc(t.id)}">
      <div class="lista-corpo">
        <div class="lista-titulo">${esc(rotulo)}</div>
        <div class="lista-sub">${dataBR(t.data)} · ${t.categoria ? esc(nomeCategoria(t.categoria)) : (t.especial ? 'ignorado' : '<em>sem categoria</em>')}</div>
      </div>
      <div class="lista-valor ${t.valorCent > 0 ? 'bom' : ''}">${moeda(t.valorCent)}</div>
    </button>`;
}

// ───────────────────────── Revisão ─────────────────────────

function abaRevisao(host) {
  const fila = estado.transacoes.filter((t) => t.status === 'revisar');

  if (!fila.length) {
    host.innerHTML = '<div class="vazio"><p>Nada para revisar. Tudo classificado ✓</p></div>';
    return;
  }

  host.innerHTML = `
    ${secao('Fila de revisão', `
      <p class="nota" style="margin-bottom:12px">O que o app não classificou com confiança.
      Marque vários do mesmo tipo e resolva em lote — dez segundos seus valem mais que
      um relatório errado.</p>
      <div class="painel">
        <label style="display:flex;gap:10px;align-items:center;font-size:.88rem;font-weight:650">
          <input type="checkbox" class="rev-check" id="sel-todos"> Selecionar todos (${fila.length})
        </label>
        <div class="lista" style="margin-top:6px">
          ${fila.slice(0, 200).map((t) => {
            const p = buscarPessoa(t.pessoaId);
            return `
            <label class="rev-item">
              <input type="checkbox" class="rev-check sel" value="${esc(t.id)}">
              <div class="rev-corpo">
                <div class="rev-nome">${esc(p ? p.nome : (t.descricao || 'Lançamento'))}
                  ${p && (p.sempreRevisar || p.tipo === 'amigo_multi') ? '<span class="etiqueta aviso">multi-relação</span>' : ''}
                  ${t.categoria ? `<span class="etiqueta">sugestão: ${esc(t.categoria)}</span>` : ''}</div>
                <div class="rev-desc">${dataBR(t.data)} · ${esc(t.descricao || '')}</div>
              </div>
              <div class="rev-valor ${t.valorCent > 0 ? 'bom' : ''}">${moeda(t.valorCent)}</div>
            </label>`;
          }).join('')}
        </div>
        ${fila.length > 200 ? '<p class="nota">Mostrando 200 de ' + fila.length + '.</p>' : ''}
      </div>

      <div class="barra-lote">
        <div class="chips" id="chips-cat" style="margin:0 0 10px"></div>
        <label style="display:flex;gap:9px;align-items:center;font-size:.82rem;margin-bottom:10px">
          <input type="checkbox" id="criar-regra" checked style="width:20px;height:20px;accent-color:var(--marca)">
          Criar regra permanente (o app aprende)
        </label>
        <button class="botao" type="button" id="aplicar" disabled>Classificar selecionados</button>
      </div>`)}
  `;

  let catSel = null;
  const chips = $('#chips-cat', host);
  for (const c of CATEGORIAS) {
    const b = html(`<button type="button" class="chip" data-cat="${c.id}">${esc(c.id)} · ${esc(c.nome)}</button>`);
    b.addEventListener('click', () => {
      catSel = catSel === c.id ? null : c.id;
      $$('[data-cat]', chips).forEach((x) => x.classList.toggle('ativo', x.dataset.cat === catSel));
      atualizar();
    });
    chips.appendChild(b);
  }

  const btn = $('#aplicar', host);
  function selecionados() { return $$('.sel:checked', host).map((c) => c.value); }
  function atualizar() {
    const n = selecionados().length;
    btn.disabled = !n || !catSel;
    btn.textContent = n ? `Classificar ${n} como ${catSel || '…'}` : 'Classificar selecionados';
  }

  $('#sel-todos', host).addEventListener('change', (e) => {
    $$('.sel', host).forEach((c) => { c.checked = e.target.checked; });
    atualizar();
  });
  $$('.sel', host).forEach((c) => c.addEventListener('change', atualizar));

  btn.addEventListener('click', async () => {
    const ids = new Set(selecionados());
    if (!ids.size || !catSel) return;
    const alvos = estado.transacoes.filter((t) => ids.has(t.id));
    const atualizadas = alvos.map((t) => ({ ...t, categoria: catSel, status: 'confirmado' }));
    await salvar('transacoes', atualizadas);

    if ($('#criar-regra', host).checked) {
      await criarRegras(alvos, catSel);
    }
    A.limparCache();
    aviso(`${ids.size} ${plural(ids.size, 'lançamento classificado', 'lançamentos classificados')}.`);
    recarregar();
  });
}

/**
 * Aprende com a sua classificação: pessoa vira regra de contato;
 * compra de cartão vira regra de estabelecimento.
 */
async function criarRegras(txs, categoria) {
  const pessoasNovas = new Map();
  const padroes = new Map();
  for (const t of txs) {
    if (t.pessoaId) {
      const p = buscarPessoa(t.pessoaId);
      if (p && !p.sempreRevisar && p.tipo !== 'amigo_multi' && p.regraCategoria !== categoria) {
        pessoasNovas.set(p.id, { ...p, regraCategoria: categoria });
      }
    } else if (t.conta === 'cartao' && t.descricao) {
      const chave = chaveEstabelecimento(t.descricao);
      if (chave && chave.length >= 4) padroes.set(chave, categoria);
    }
  }
  if (pessoasNovas.size) await salvar('pessoas', [...pessoasNovas.values()]);
  const novas = [];
  for (const [padrao, cat] of padroes) {
    if (estado.regras.some((r) => r.padrao === padrao)) continue;
    novas.push({ id: novoId(), padrao, categoria: cat });
  }
  if (novas.length) await salvar('regras', novas);
}

// ───────────────────────── Pessoas ─────────────────────────

function abaPessoas(host) {
  const termo = normalizar(filtroPessoas);
  const lista = estado.pessoas
    .filter((p) => !termo || normalizar(p.nome).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const porTipo = {};
  for (const p of estado.pessoas) porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1;

  host.innerHTML = `
    ${secao('Pessoas', `
      <p class="nota" style="margin-bottom:12px">Quem é quem define a classificação automática.
      A identidade é o CPF mascarado do Pix — estável mesmo se a pessoa trocar de banco.</p>
      <label class="campo"><input type="search" id="busca" placeholder="Buscar pessoa"
        value="${esc(filtroPessoas)}"></label>
      <div class="painel">
        <div class="lista">
          ${lista.slice(0, 200).map((p) => {
            const al = p.alunoId ? estado.alunos.find((a) => a.id === p.alunoId) : null;
            const tipo = TIPOS_PESSOA.find((t) => t.id === p.tipo);
            const marcas = [tipo ? tipo.nome : p.tipo];
            if (al) marcas.push('paga por ' + al.nome);
            if (p.regraCategoria) marcas.push('→ ' + p.regraCategoria);
            if (p.med) marcas.push('medicinas');
            return `
            <button type="button" class="lista-item" data-pessoa="${esc(p.id)}">
              <div class="lista-corpo">
                <div class="lista-titulo">${esc(p.nome)}</div>
                <div class="lista-sub">${esc(marcas.join(' · '))}</div>
              </div>
              ${p.sempreRevisar ? '<span class="etiqueta aviso">revisar</span>' : ''}
            </button>`;
          }).join('') || '<p class="mini">Nenhuma pessoa encontrada.</p>'}
        </div>
        ${lista.length > 200 ? `<p class="nota">Mostrando 200 de ${lista.length}.</p>` : ''}
      </div>
      <p class="nota">${estado.pessoas.length} ${plural(estado.pessoas.length, 'pessoa', 'pessoas')} no total.</p>`)}
  `;

  const busca = $('#busca', host);
  busca.addEventListener('input', () => {
    filtroPessoas = busca.value;
    const pos = busca.selectionStart;
    abaPessoas(host);
    const nova = $('#busca', host);
    nova.focus();
    nova.setSelectionRange(pos, pos);
  });
  $$('[data-pessoa]', host).forEach((b) =>
    b.addEventListener('click', () => editarPessoa(b.dataset.pessoa)));
}

function editarPessoa(id) {
  const p = estado.pessoas.find((x) => x.id === id);
  if (!p) return;
  const nTx = estado.transacoes.filter((t) => t.pessoaId === id).length;

  const corpo = html(`
    <div>
      <label class="campo"><span>Nome</span>
        <input type="text" id="p-nome" value="${esc(p.nome)}"></label>
      <label class="campo"><span>CPF mascarado</span>
        <input type="text" id="p-cpf" value="${esc(p.cpf || '')}" placeholder="•••.000.000-••">
        <span class="ajuda">É a impressão digital da pessoa. Preencher aqui faz os Pix dela
        serem reconhecidos automaticamente.</span></label>
      <label class="campo"><span>Tipo</span>
        <select id="p-tipo">
          ${TIPOS_PESSOA.map((t) => `<option value="${t.id}"${p.tipo === t.id ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}
        </select></label>
      <label class="campo"><span>Paga pelo aluno</span>
        <select id="p-aluno">
          <option value="">— não é pagamento de aluno —</option>
          ${[...estado.alunos].sort((a, b) => a.nome.localeCompare(b.nome))
            .map((a) => `<option value="${a.id}"${p.alunoId === a.id ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}
        </select>
        <span class="ajuda">Use quando outra pessoa paga a mensalidade (mãe, cônjuge).</span></label>
      <label class="campo"><span>Regra permanente de categoria</span>
        <select id="p-regra">
          <option value="">— sem regra —</option>
          ${CATEGORIAS.map((c) => `<option value="${c.id}"${p.regraCategoria === c.id ? ' selected' : ''}>${esc(c.id)} · ${esc(c.nome)}</option>`).join('')}
        </select>
        <span class="ajuda">Todo lançamento desta pessoa cai nesta categoria.</span></label>
      <label class="campo" style="display:flex;gap:10px;align-items:flex-start">
        <input type="checkbox" id="p-med" ${p.med ? 'checked' : ''} style="width:22px;height:22px;flex:none;accent-color:var(--marca)">
        <span style="margin:0">Vendedor de medicinas <span class="ajuda">saídas viram MED automaticamente</span></span></label>
      <label class="campo" style="display:flex;gap:10px;align-items:flex-start">
        <input type="checkbox" id="p-rev" ${p.sempreRevisar ? 'checked' : ''} style="width:22px;height:22px;flex:none;accent-color:var(--marca)">
        <span style="margin:0">Sempre revisar <span class="ajuda">multi-relação: nunca adivinhar</span></span></label>
      <p class="mini">${nTx} ${plural(nTx, 'lançamento ligado', 'lançamentos ligados')} a esta pessoa.</p>
      <div class="folha-acoes">
        <button type="button" class="botao neutro" id="p-cancelar">Cancelar</button>
        <button type="button" class="botao" id="p-salvar">Salvar</button>
      </div>
    </div>`);

  const f = folha('Pessoa', corpo);
  $('#p-cancelar', corpo).addEventListener('click', () => f.fechar());
  $('#p-salvar', corpo).addEventListener('click', async () => {
    await salvar('pessoas', {
      ...p,
      nome: $('#p-nome', corpo).value.trim() || p.nome,
      cpf: $('#p-cpf', corpo).value.trim() || null,
      tipo: $('#p-tipo', corpo).value,
      alunoId: $('#p-aluno', corpo).value || null,
      regraCategoria: $('#p-regra', corpo).value || null,
      med: $('#p-med', corpo).checked,
      sempreRevisar: $('#p-rev', corpo).checked,
    });
    const r = reclassificar();
    if (r.alterados.length) await salvar('transacoes', r.alterados);
    A.limparCache();
    f.fechar();
    aviso('Pessoa salva e lançamentos reavaliados.');
    recarregar();
  });
}

// ───────────────────────── Transação ─────────────────────────

export function editarTransacao(id) {
  const t = id ? estado.transacoes.find((x) => x.id === id) : null;
  const corpo = html(`
    <div>
      <div class="linha-campos">
        <label class="campo"><span>Data</span>
          <input type="date" id="t-data" value="${esc(t ? t.data : A.hoje())}"></label>
        <label class="campo"><span>Valor (R$)</span>
          <input type="text" id="t-valor" inputmode="decimal"
                 value="${t ? (Math.abs(t.valorCent) / 100).toFixed(2).replace('.', ',') : ''}"></label>
      </div>
      <label class="campo"><span>Sentido</span>
        <select id="t-sentido">
          <option value="-1"${!t || t.valorCent < 0 ? ' selected' : ''}>Saída</option>
          <option value="1"${t && t.valorCent > 0 ? ' selected' : ''}>Entrada</option>
        </select></label>
      <label class="campo"><span>Categoria</span>
        <select id="t-cat">
          <option value="">— sem categoria —</option>
          ${CATEGORIAS.map((c) => `<option value="${c.id}"${t && t.categoria === c.id ? ' selected' : ''}>${esc(c.id)} · ${esc(c.nome)}</option>`).join('')}
        </select></label>
      <label class="campo"><span>Descrição</span>
        <input type="text" id="t-desc" value="${esc(t ? t.descricao : '')}"></label>
      <label class="campo"><span>Pessoa</span>
        <select id="t-pessoa">
          <option value="">—</option>
          ${[...estado.pessoas].sort((a, b) => a.nome.localeCompare(b.nome))
            .map((x) => `<option value="${x.id}"${t && t.pessoaId === x.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}
        </select></label>
      ${t && t.categoria === 'ENS' ? `
        <label class="campo" style="display:flex;gap:10px;align-items:center">
          <input type="checkbox" id="t-meia" ${t.meia ? 'checked' : ''} style="width:22px;height:22px;flex:none;accent-color:var(--marca)">
          <span style="margin:0">Meia mensalidade</span></label>` : ''}
      <div class="folha-acoes">
        ${id ? '<button type="button" class="botao perigo" id="t-excluir">Excluir</button>'
             : '<button type="button" class="botao neutro" id="t-cancelar">Cancelar</button>'}
        <button type="button" class="botao" id="t-salvar">Salvar</button>
      </div>
      ${t && t.origem === 'importada' ? '<p class="nota">Veio do extrato. Editar a categoria aqui marca como confirmado e o app não mexe mais nele.</p>' : ''}
    </div>`);

  const f = folha(t ? 'Lançamento' : 'Novo lançamento', corpo);

  $('#t-salvar', corpo).addEventListener('click', async () => {
    const valor = parseMoeda($('#t-valor', corpo).value);
    if (!valor) { aviso('Informe o valor.', 'erro'); return; }
    const sentido = Number($('#t-sentido', corpo).value);
    const meiaEl = $('#t-meia', corpo);
    await salvar('transacoes', {
      id: id || novoId(),
      data: $('#t-data', corpo).value || A.hoje(),
      valorCent: Math.abs(valor) * sentido,
      descricao: $('#t-desc', corpo).value.trim(),
      conta: t ? t.conta : 'manual',
      origem: t ? t.origem : 'manual',
      idExterno: t ? t.idExterno : null,
      categoria: $('#t-cat', corpo).value || null,
      pessoaId: $('#t-pessoa', corpo).value || null,
      status: 'confirmado',
      especial: t ? t.especial : null,
      meia: meiaEl ? meiaEl.checked : (t ? t.meia : false),
      nota: t ? t.nota : '',
    });
    A.limparCache();
    f.fechar();
    aviso('Lançamento salvo.');
    recarregar();
  });

  const bx = $('#t-excluir', corpo);
  if (bx) {
    bx.addEventListener('click', async () => {
      const ok = await confirmar('Excluir lançamento',
        'Se ele veio do extrato, some até você reimportar o OFX.', 'Excluir');
      if (!ok) return;
      await remover('transacoes', id);
      A.limparCache();
      f.fechar();
      aviso('Lançamento excluído.');
      recarregar();
    });
  }
  const bc = $('#t-cancelar', corpo);
  if (bc) bc.addEventListener('click', () => f.fechar());
}

// ───────────────────────── Ajustes ─────────────────────────

function abaAjustes(host) {
  const c = estado.config;
  const r$ = (cent) => (Number(cent || 0) / 100).toFixed(2).replace('.', ',');

  host.innerHTML = `
    ${secao('Saldos — a âncora do patrimônio', `
      <div class="painel">
        <label class="campo"><span>Saldo da conta (R$)</span>
          <input type="text" id="c-conta" inputmode="decimal" value="${r$(c.saldoContaCent)}">
          <span class="ajuda">Preenchido sozinho ao importar o OFX da conta${c.saldoContaData ? ` — banco em ${dataBRLonga(c.saldoContaData)}` : ''}.</span></label>
        <label class="campo"><span>Data desse saldo</span>
          <input type="date" id="c-conta-data" value="${esc(c.saldoContaData || '')}"></label>
        <label class="campo"><span>Poupança + investimentos (R$)</span>
          <input type="text" id="c-poup" inputmode="decimal" value="${r$(c.saldoPoupancaCent)}">
          <span class="ajuda">O app não importa carteira digital — este número é você quem sabe.</span></label>
        <label class="campo"><span>Data do saldo da poupança</span>
          <input type="date" id="c-poup-data" value="${esc(c.saldoPoupancaData || A.hoje())}"></label>
        <button class="botao" type="button" id="salvar-saldos">Salvar saldos</button>
      </div>`, 'Patrimônio = conta + poupança. É o único número imune a erro de classificação.')}

    ${secao('Regras do negócio', `
      <div class="painel">
        <label class="campo"><span>Seu nome completo, como aparece no banco</span>
          <input type="text" id="c-titular" value="${esc(c.nomeTitular || '')}">
          <span class="ajuda">Detecta transferências para você mesmo e as tira do fluxo.</span></label>
        <div class="linha-campos">
          <label class="campo"><span>Cota por aluno (R$)</span>
            <input type="text" id="c-cota" inputmode="decimal" value="${r$(c.cotaCent)}"></label>
          <label class="campo"><span>Vagas por turma</span>
            <input type="number" id="c-cap" min="1" max="15" value="${esc(c.capacidadeTurma)}"></label>
        </div>
        <div class="linha-campos">
          <label class="campo"><span>Meta de fôlego (meses)</span>
            <input type="number" id="c-reserva" min="1" max="36" value="${esc(c.reservaAlvoMeses)}"></label>
          <label class="campo"><span>Dia limite de mensalidade</span>
            <input type="number" id="c-dia" min="1" max="28" value="${esc(c.diaLimiteMensalidade)}"></label>
        </div>
        <button class="botao" type="button" id="salvar-regras">Salvar regras</button>
      </div>`)}

    ${secao('Classificação', `
      <div class="painel">
        <p class="folha-texto">${estado.regras.length}
        ${plural(estado.regras.length, 'regra de estabelecimento aprendida', 'regras de estabelecimento aprendidas')}
        · ${estado.pessoas.filter((p) => p.regraCategoria).length} pessoas com regra fixa.</p>
        ${estado.regras.length ? `<div class="lista">${estado.regras.map((x) => `
          <div class="lista-item" style="cursor:default">
            <div class="lista-corpo"><div class="lista-titulo">${esc(x.padrao)}</div>
            <div class="lista-sub">→ ${esc(nomeCategoria(x.categoria))}</div></div>
            <button class="botao neutro compacto" type="button" data-regra="${esc(x.id)}">remover</button>
          </div>`).join('')}</div>` : ''}
        <button class="botao neutro" type="button" id="reclassificar" style="margin-top:14px">
          Reaplicar classificação em tudo</button>
        <p class="nota">Roda o motor de novo sobre o que ainda não foi confirmado à mão.
        Use depois de cadastrar pessoas ou mudar regras.</p>
      </div>`)}

    ${secao('Cadastro inicial', `
      <div class="painel">
        <p class="folha-texto">Traz de uma vez os alunos, clientes de música, contatos fixos
        (moradia, estúdio, terapia, ateliê), vendedores de medicinas e as pessoas multi-relação
        que você já mapeou. Casa por CPF mascarado e <strong>não duplica</strong> se você fizer
        de novo — turma e cota que você já ajustou ficam como estão.</p>
        <label class="arquivo">
          <input type="file" id="f-cadastro" accept=".json,application/json">
          <strong>Escolher o arquivo do cadastro</strong>
          <span>meu-cadastro-mydin.json</span>
        </label>
        <p class="nota">O arquivo tem nome e CPF de outras pessoas, então ele <strong>não vem
        junto com o app</strong> — fica com você. Depois de carregar uma vez, o cadastro passa a
        viver neste aparelho e o arquivo não é mais necessário.</p>
      </div>`)}

    ${secao('Backup', `
      <div class="painel">
        <p class="folha-texto">Seus dados vivem só neste aparelho. Se você perder o celular ou
        limpar os dados do navegador, eles vão junto. <strong>Exporte de vez em quando.</strong></p>
        <button class="botao" type="button" id="exportar">Exportar backup (.json)</button>
        <label class="arquivo" style="margin-top:12px">
          <input type="file" id="f-backup" accept=".json,application/json">
          <strong>Restaurar backup</strong>
          <span>Substitui tudo que está aqui.</span>
        </label>
      </div>`)}

    ${secao('Instalar na tela de início', `
      <div class="painel">
        <p class="folha-texto"><strong>Android / Chrome:</strong> menu ⋮ → “Adicionar à tela inicial”
        (ou “Instalar app”).<br>
        <strong>iPhone / Safari:</strong> botão compartilhar → “Adicionar à Tela de Início”.</p>
        <p class="nota">Depois disso o Mydin abre em tela cheia, sem barra de navegador, e
        funciona mesmo sem internet.</p>
        <button class="botao neutro" type="button" id="instalar" hidden>Instalar agora</button>
      </div>`)}

    ${secao('Zona de risco', `
      <div class="painel">
        <button class="botao perigo" type="button" id="apagar">Apagar todos os dados</button>
        <p class="nota">Some tudo deste aparelho, sem volta. Exporte antes.</p>
      </div>`)}
  `;

  $('#salvar-saldos', host).addEventListener('click', async () => {
    await salvarConfig({
      saldoContaCent: parseMoeda($('#c-conta', host).value),
      saldoContaData: $('#c-conta-data', host).value || A.hoje(),
      saldoPoupancaCent: parseMoeda($('#c-poup', host).value),
      saldoPoupancaData: $('#c-poup-data', host).value || A.hoje(),
    });
    A.limparCache();
    aviso('Saldos salvos.');
    recarregar();
  });

  $('#salvar-regras', host).addEventListener('click', async () => {
    await salvarConfig({
      nomeTitular: $('#c-titular', host).value.trim(),
      cotaCent: parseMoeda($('#c-cota', host).value) || 23250,
      capacidadeTurma: Number($('#c-cap', host).value) || 7,
      reservaAlvoMeses: Number($('#c-reserva', host).value) || 6,
      diaLimiteMensalidade: Number($('#c-dia', host).value) || 12,
    });
    const r = reclassificar();
    if (r.alterados.length) await salvar('transacoes', r.alterados);
    A.limparCache();
    aviso('Regras salvas.');
    recarregar();
  });

  $$('[data-regra]', host).forEach((b) => b.addEventListener('click', async () => {
    await remover('regras', b.dataset.regra);
    aviso('Regra removida.');
    recarregar();
  }));

  $('#reclassificar', host).addEventListener('click', async () => {
    const r = reclassificar();
    if (r.alterados.length) await salvar('transacoes', r.alterados);
    A.limparCache();
    aviso(`${r.auto} automáticos · ${r.revisar} para revisar.`);
    recarregar();
  });

  async function aplicar(dados) {
    const c = await aplicarCadastro(dados);
    A.limparCache();
    aviso(`${c.alunosNovos} alunos e ${c.pessoasNovas} pessoas criados · `
      + `${c.reclassificados} lançamentos reavaliados.`);
    recarregar();
  }

  $('#f-cadastro', host).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await aplicar(JSON.parse(await file.text()));
    } catch (err) {
      aviso('Arquivo inválido: ' + err.message, 'erro');
    }
    e.target.value = '';
  });

  $('#exportar', host).addEventListener('click', () => {
    const dados = JSON.stringify(exportarTudo(), null, 1);
    const blob = new Blob([dados], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mydin-backup-${A.hoje()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    aviso('Backup gerado.');
  });

  $('#f-backup', host).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ok = await confirmar('Restaurar backup',
      'Isto substitui todos os dados que estão neste aparelho. Continuar?', 'Restaurar');
    if (!ok) { e.target.value = ''; return; }
    try {
      await importarTudo(JSON.parse(await file.text()));
      A.limparCache();
      aviso('Backup restaurado.');
      recarregar();
    } catch (err) {
      aviso('Arquivo inválido: ' + err.message, 'erro');
    }
    e.target.value = '';
  });

  $('#apagar', host).addEventListener('click', async () => {
    const ok = await confirmar('Apagar tudo',
      'Todos os lançamentos, pessoas, alunos e ajustes somem deste aparelho. Não dá para desfazer.',
      'Apagar tudo');
    if (!ok) return;
    await apagarTudo();
    A.limparCache();
    aviso('Dados apagados.');
    recarregar();
  });

  // botão de instalar, quando o Chrome oferece
  const bi = $('#instalar', host);
  if (window.__mydinInstalar) {
    bi.hidden = false;
    bi.addEventListener('click', async () => {
      window.__mydinInstalar.prompt();
      window.__mydinInstalar = null;
      bi.hidden = true;
    });
  }
  ligarDicas(host);
}
