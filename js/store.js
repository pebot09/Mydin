// Armazenamento 100% local no aparelho (IndexedDB). Nada sai do telefone.
//
// Estratégia: IndexedDB é a fonte durável; ao abrir, tudo é carregado para
// memória e todo cálculo roda sobre arrays JS. Com alguns milhares de
// lançamentos isso é instantâneo e evita reimplementar SQL no navegador.

import { CONFIG_PADRAO } from './dominio.js';

const DB_NOME = 'mydin';
const DB_VERSAO = 1;
const LOJAS = ['config', 'pessoas', 'alunos', 'transacoes', 'regras'];

let db = null;

/** Estado em memória — leia daqui, escreva pelas funções abaixo. */
export const estado = {
  config: { ...CONFIG_PADRAO },
  pessoas: [],
  alunos: [],
  transacoes: [],
  regras: [],          // regras de estabelecimento aprendidas
};

export function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function abrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('config')) d.createObjectStore('config', { keyPath: 'chave' });
      if (!d.objectStoreNames.contains('pessoas')) d.createObjectStore('pessoas', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('alunos')) d.createObjectStore('alunos', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('transacoes')) {
        const s = d.createObjectStore('transacoes', { keyPath: 'id' });
        s.createIndex('idExterno', 'idExterno', { unique: false });
      }
      if (!d.objectStoreNames.contains('regras')) d.createObjectStore('regras', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(lojas, modo) {
  return db.transaction(lojas, modo);
}

function promessa(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tudo(loja) {
  return promessa(tx([loja], 'readonly').objectStore(loja).getAll());
}

/** Abre o banco e carrega tudo para a memória. */
export async function iniciar() {
  db = await abrir();
  const [config, pessoas, alunos, transacoes, regras] = await Promise.all(LOJAS.map(tudo));
  estado.config = { ...CONFIG_PADRAO };
  for (const linha of config) estado.config[linha.chave] = linha.valor;
  estado.pessoas = pessoas;
  estado.alunos = alunos;
  estado.transacoes = transacoes;
  estado.regras = regras;
  reindexar();
  return estado;
}

// ───────────────────────── Índices em memória ─────────────────────────

export const indice = {
  pessoaPorId: new Map(),
  pessoaPorCpf: new Map(),
  alunoPorId: new Map(),
  transacaoPorIdExterno: new Map(),
};

export function reindexar() {
  indice.pessoaPorId = new Map(estado.pessoas.map((p) => [p.id, p]));
  indice.pessoaPorCpf = new Map(estado.pessoas.filter((p) => p.cpf).map((p) => [p.cpf, p]));
  indice.alunoPorId = new Map(estado.alunos.map((a) => [a.id, a]));
  indice.transacaoPorIdExterno = new Map(
    estado.transacoes.filter((t) => t.idExterno).map((t) => [t.idExterno, t]));
  estado.transacoes.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}

export function pessoa(id) {
  return id ? indice.pessoaPorId.get(id) || null : null;
}

export function aluno(id) {
  return id ? indice.alunoPorId.get(id) || null : null;
}

// ───────────────────────── Escrita ─────────────────────────

async function gravar(loja, itens) {
  const t = tx([loja], 'readwrite');
  const s = t.objectStore(loja);
  for (const it of itens) s.put(it);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function apagar(loja, ids) {
  const t = tx([loja], 'readwrite');
  const s = t.objectStore(loja);
  for (const id of ids) s.delete(id);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** Salva uma ou várias entidades numa loja e atualiza a memória. */
export async function salvar(loja, itens) {
  const lista = Array.isArray(itens) ? itens : [itens];
  if (!lista.length) return;
  const arr = estado[loja];
  for (const item of lista) {
    const i = arr.findIndex((x) => x.id === item.id);
    if (i >= 0) arr[i] = item; else arr.push(item);
  }
  await gravar(loja, lista);
  reindexar();
}

export async function remover(loja, ids) {
  const lista = Array.isArray(ids) ? ids : [ids];
  if (!lista.length) return;
  const conjunto = new Set(lista);
  estado[loja] = estado[loja].filter((x) => !conjunto.has(x.id));
  await apagar(loja, lista);
  reindexar();
}

/** Atualiza chaves de configuração (merge parcial). */
export async function salvarConfig(parcial) {
  Object.assign(estado.config, parcial);
  const linhas = Object.entries(parcial).map(([chave, valor]) => ({ chave, valor }));
  await gravar('config', linhas);
}

export function cfg(chave) {
  const v = estado.config[chave];
  return v === undefined ? CONFIG_PADRAO[chave] : v;
}

export function cfgNum(chave) {
  const v = Number(cfg(chave));
  return isFinite(v) ? v : 0;
}

// ───────────────────────── Backup ─────────────────────────

/** Tudo o que existe, em um objeto serializável. */
export function exportarTudo() {
  return {
    formato: 'mydin-backup',
    versao: 2,
    gerado_em: new Date().toISOString(),
    config: estado.config,
    pessoas: estado.pessoas,
    alunos: estado.alunos,
    transacoes: estado.transacoes,
    regras: estado.regras,
  };
}

/** Substitui todo o conteúdo pelo backup. Destrutivo e proposital. */
export async function importarTudo(dados) {
  if (!dados || dados.formato !== 'mydin-backup') {
    throw new Error('Arquivo não é um backup do Mydin.');
  }
  const t = tx(LOJAS, 'readwrite');
  for (const loja of LOJAS) t.objectStore(loja).clear();
  for (const loja of ['pessoas', 'alunos', 'transacoes', 'regras']) {
    for (const item of dados[loja] || []) t.objectStore(loja).put(item);
  }
  for (const [chave, valor] of Object.entries(dados.config || {})) {
    t.objectStore('config').put({ chave, valor });
  }
  await new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  await iniciar();
}

/** Apaga todos os dados do aparelho. */
export async function apagarTudo() {
  const t = tx(LOJAS, 'readwrite');
  for (const loja of LOJAS) t.objectStore(loja).clear();
  await new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  await iniciar();
}
