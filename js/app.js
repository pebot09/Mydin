// Ponto de entrada: abre o banco local, monta a navegação e desenha a tela.

import { iniciar, estado } from './store.js';
import { limparCache } from './analytics.js';
import { registrarNavegacao, registrarRecarga, aviso, $, $$ } from './ui.js';
import * as painel from './views/painel.js';
import * as fluxo from './views/fluxo.js';
import * as tendencias from './views/tendencias.js';
import * as ensino from './views/ensino.js';
import * as dados from './views/dados.js';

const ROTAS = {
  painel:     { nome: 'Hoje',       titulo: 'Hoje',       modulo: painel,     icone: icoCasa },
  fluxo:      { nome: 'Fluxo',      titulo: 'Fluxo',      modulo: fluxo,      icone: icoFluxo },
  tendencias: { nome: 'Tendência',  titulo: 'Tendências', modulo: tendencias, icone: icoTend },
  ensino:     { nome: 'Ensino',     titulo: 'Ensino',     modulo: ensino,     icone: icoEnsino },
  dados:      { nome: 'Dados',      titulo: 'Dados',      modulo: dados,      icone: icoDados },
};

const SUBTITULO = {
  painel: 'Como você está agora',
  fluxo: 'De onde vem, para onde vai',
  tendencias: 'Para onde isso aponta',
  ensino: 'A base do negócio',
  dados: 'Importar, revisar e ajustar',
};

let rotaAtual = 'painel';
let opcoesAtuais = {};

// ───────────────────────── Ícones (traço, 22px) ─────────────────────────

function svg(d) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
function icoCasa() { return svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>'); }
function icoFluxo() { return svg('<path d="M3 20h18"/><rect x="5" y="11" width="3.5" height="9" rx="1"/><rect x="10.25" y="6" width="3.5" height="14" rx="1"/><rect x="15.5" y="14" width="3.5" height="6" rx="1"/>'); }
function icoTend() { return svg('<path d="M3 17.5 9 11l4 4 8-8"/><path d="M15 7h6v6"/>'); }
function icoEnsino() { return svg('<path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4Z"/><path d="M6 10.6V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.4"/>'); }
function icoDados() { return svg('<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>'); }

// ───────────────────────── Navegação ─────────────────────────

function montarNav() {
  const nav = $('#nav');
  nav.innerHTML = Object.entries(ROTAS).map(([id, r]) => `
    <button type="button" data-rota="${id}" aria-label="${r.titulo}">
      ${r.icone()}
      <span>${r.nome}</span>
      ${id === 'dados' ? '<span class="pip" id="pip-revisar" hidden></span>' : ''}
    </button>`).join('');
  $$('[data-rota]', nav).forEach((b) => {
    b.addEventListener('click', () => irPara(b.dataset.rota));
  });
}

function atualizarPip() {
  const pip = $('#pip-revisar');
  if (!pip) return;
  const n = estado.transacoes.filter((t) => t.status === 'revisar').length;
  pip.hidden = !n;
  pip.textContent = n > 99 ? '99+' : String(n);
}

function irPara(rota, opcoes = {}) {
  if (!ROTAS[rota]) rota = 'painel';
  rotaAtual = rota;
  opcoesAtuais = opcoes;
  const alvo = '#' + rota;
  if (location.hash !== alvo) {
    history.pushState({ rota }, '', alvo);
  }
  desenhar();
  window.scrollTo({ top: 0 });
}

function desenhar() {
  const r = ROTAS[rotaAtual];
  $('#titulo').textContent = r.titulo;
  $('#subtitulo').textContent = SUBTITULO[rotaAtual] || '';
  $$('#nav button').forEach((b) => {
    if (b.dataset.rota === rotaAtual) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const host = $('#conteudo');
  try {
    r.modulo.render(host, opcoesAtuais);
  } catch (e) {
    console.error(e);
    host.innerHTML = `<div class="vazio"><p>Algo quebrou ao desenhar esta tela.</p>
      <p class="mini">${e.message}</p></div>`;
  }
  opcoesAtuais = {};
  atualizarPip();
}

function recarregar() {
  limparCache();
  desenhar();
}

// ───────────────────────── Início ─────────────────────────

async function comecar() {
  try {
    await iniciar();
  } catch (e) {
    $('#conteudo').innerHTML = `<div class="vazio">
      <p>Não consegui abrir o armazenamento do aparelho.</p>
      <p class="mini">${e.message}. Em aba anônima o navegador costuma bloquear —
      abra o Mydin numa aba normal.</p></div>`;
    return;
  }
  montarNav();
  registrarNavegacao(irPara);
  registrarRecarga(recarregar);

  const inicial = location.hash.replace('#', '');
  rotaAtual = ROTAS[inicial] ? inicial : 'painel';
  desenhar();

  window.addEventListener('popstate', () => {
    const r = location.hash.replace('#', '') || 'painel';
    rotaAtual = ROTAS[r] ? r : 'painel';
    desenhar();
  });

  // Service worker: faz o app abrir offline depois da primeira visita.
  // Caminho relativo ao documento, então funciona em qualquer subpasta.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      console.warn('Service worker não registrado:', e);
    }
  }
}

// Guarda o convite de instalação do Chrome para o botão em Ajustes.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__mydinInstalar = e;
});

window.addEventListener('appinstalled', () => {
  window.__mydinInstalar = null;
  aviso('Mydin instalado ✓');
});

comecar();
