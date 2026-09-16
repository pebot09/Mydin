// Peças de interface reutilizáveis. Tudo pensado para o polegar.

/** Cria elemento a partir de HTML. */
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

/** Escapa texto vindo dos dados (descrições de banco, nomes). */
export function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function $(sel, raiz = document) { return raiz.querySelector(sel); }
export function $$(sel, raiz = document) { return [...raiz.querySelectorAll(sel)]; }

// ───────────────────────── Aviso rápido ─────────────────────────

let avisoTimer = null;
export function aviso(texto, tipo = 'ok') {
  let el = document.getElementById('aviso');
  if (!el) {
    el = html('<div id="aviso" class="aviso" role="status" aria-live="polite"></div>');
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.className = 'aviso visivel ' + tipo;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.className = 'aviso ' + tipo; }, 3200);
}

// ───────────────────────── Folha inferior (bottom sheet) ─────────────────────────

/**
 * Abre uma folha que sobe de baixo — o padrão que funciona com uma mão.
 * conteudo: elemento ou HTML. Devolve { fechar }.
 */
export function folha(titulo, conteudo, opcoes = {}) {
  const fundo = html(`
    <div class="folha-fundo" role="dialog" aria-modal="true">
      <div class="folha">
        <div class="folha-topo">
          <div class="folha-alca" aria-hidden="true"></div>
          <h2>${esc(titulo)}</h2>
          <button class="folha-x" type="button" aria-label="Fechar">✕</button>
        </div>
        <div class="folha-corpo"></div>
      </div>
    </div>`);
  const corpo = $('.folha-corpo', fundo);
  if (typeof conteudo === 'string') corpo.innerHTML = conteudo;
  else corpo.appendChild(conteudo);

  function fechar() {
    fundo.classList.remove('aberta');
    setTimeout(() => fundo.remove(), 180);
    document.body.classList.remove('travado');
    if (opcoes.aoFechar) opcoes.aoFechar();
  }
  $('.folha-x', fundo).addEventListener('click', fechar);
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
  document.addEventListener('keydown', function esc2(e) {
    if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc2); }
  });

  document.body.appendChild(fundo);
  document.body.classList.add('travado');
  requestAnimationFrame(() => fundo.classList.add('aberta'));
  return { fundo, corpo, fechar };
}

/** Confirmação com foco na ação destrutiva. */
export function confirmar(titulo, texto, rotuloOk = 'Confirmar') {
  return new Promise((resolve) => {
    const c = html(`
      <div>
        <p class="folha-texto">${esc(texto)}</p>
        <div class="folha-acoes">
          <button type="button" class="botao neutro" data-nao>Cancelar</button>
          <button type="button" class="botao perigo" data-sim>${esc(rotuloOk)}</button>
        </div>
      </div>`);
    const f = folha(titulo, c, { aoFechar: () => resolve(false) });
    $('[data-nao]', c).addEventListener('click', () => { f.fechar(); });
    $('[data-sim]', c).addEventListener('click', () => {
      f.fechar();
      resolve(true);
    });
  });
}

// ───────────────────────── Blocos de conteúdo ─────────────────────────

/** Cartão de indicador. valor grande, contexto pequeno, sem enfeite. */
export function cartao({ rotulo, valor, sub, tom, dica }) {
  return `
    <div class="cartao${tom ? ' tom-' + tom : ''}">
      <div class="cartao-rotulo">${esc(rotulo)}${dica ? `<button class="dica" type="button" data-dica="${esc(dica)}" aria-label="O que é isto?">?</button>` : ''}</div>
      <div class="cartao-valor">${valor}</div>
      ${sub ? `<div class="cartao-sub">${sub}</div>` : ''}
    </div>`;
}

export function secao(titulo, corpoHtml, sub) {
  return `
    <section class="secao">
      <div class="secao-topo">
        <h2>${esc(titulo)}</h2>
        ${sub ? `<p class="secao-sub">${sub}</p>` : ''}
      </div>
      ${corpoHtml}
    </section>`;
}

export function vazio(texto, acaoHtml = '') {
  return `<div class="vazio"><p>${esc(texto)}</p>${acaoHtml}</div>`;
}

/** Classe de cor para números com sinal (sempre acompanhados do número). */
export function tom(v) {
  return v > 0 ? 'bom' : v < 0 ? 'ruim' : '';
}

/** Liga os botões "?" de explicação. */
export function ligarDicas(raiz) {
  $$('[data-dica]', raiz).forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      folha('Como ler este número', `<p class="folha-texto">${esc(b.dataset.dica)}</p>`);
    });
  });
}

/** Seletor de período em uma linha só, acima dos gráficos. */
export function seletorPeriodo(opcoes, atual, aoMudar) {
  const el = html(`<div class="chips" role="tablist"></div>`);
  for (const o of opcoes) {
    const b = html(`<button type="button" class="chip${o.id === atual ? ' ativo' : ''}" role="tab">${esc(o.nome)}</button>`);
    b.addEventListener('click', () => aoMudar(o.id));
    el.appendChild(b);
  }
  return el;
}

// ───────────────────────── Navegação ─────────────────────────
// Registrada pelo app.js; usada pelas telas sem import circular.

let manipuladorNav = null;
export function registrarNavegacao(fn) { manipuladorNav = fn; }
export function irPara(rota, opcoes = {}) {
  if (manipuladorNav) manipuladorNav(rota, opcoes);
}

let manipuladorRecarga = null;
export function registrarRecarga(fn) { manipuladorRecarga = fn; }
/** Redesenha a tela atual depois de uma alteração de dados. */
export function recarregar() { if (manipuladorRecarga) manipuladorRecarga(); }
