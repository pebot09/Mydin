// Importação de OFX: dedup, criação de pessoas e ancoragem do saldo real.

import { estado, novoId, salvar, salvarConfig, indice, reindexar } from './store.js';
import { lerArquivo } from './ofx.js';
import { reclassificar } from './classify.js';

/** Acha a pessoa pelo CPF mascarado (identidade estável) ou cria uma nova. */
function acharOuCriarPessoa(nome, cpf, novas) {
  const existente = indice.pessoaPorCpf.get(cpf);
  if (existente) return existente.id;
  const ja = novas.find((p) => p.cpf === cpf);
  if (ja) return ja.id;
  const p = {
    id: novoId(),
    nome: nome || '(sem nome)',
    cpf,
    tipo: 'desconhecido',
    alunoId: null,
    sempreRevisar: false,
    regraCategoria: null,
    med: false,
  };
  novas.push(p);
  return p.id;
}

/**
 * Importa uma lista de File (OFX). Aceita vários de uma vez (carga histórica).
 * Reimportar período sobreposto nunca duplica — a chave é conta+FITID.
 */
export async function importarArquivos(files) {
  const relatorio = [];
  const novasPessoas = [];
  const novasTransacoes = [];
  let melhorSaldo = null;

  for (const file of files) {
    let lido;
    try {
      lido = await lerArquivo(file);
    } catch (e) {
      relatorio.push({ arquivo: file.name, erro: e.message });
      continue;
    }
    const conta = lido.tipo === 'cartao' ? 'cartao' : 'conta';
    if (conta === 'conta' && lido.saldo && lido.saldo.data) {
      if (!melhorSaldo || lido.saldo.data >= melhorSaldo.data) melhorSaldo = lido.saldo;
    }

    let novas = 0, duplicadas = 0;
    for (const t of lido.transacoes) {
      const idExterno = conta + ':' + t.fitid;
      if (indice.transacaoPorIdExterno.has(idExterno)
          || novasTransacoes.some((x) => x.idExterno === idExterno)) {
        duplicadas++;
        continue;
      }
      let pessoaId = null;
      if (t.pessoaCpf) pessoaId = acharOuCriarPessoa(t.pessoaNome, t.pessoaCpf, novasPessoas);
      novasTransacoes.push({
        id: novoId(),
        data: t.data,
        valorCent: t.valorCent,
        descricao: t.descricao,
        conta,
        origem: 'importada',
        idExterno,
        categoria: null,
        pessoaId,
        status: 'revisar',
        especial: null,
        meia: false,
        nota: '',
      });
      novas++;
    }
    relatorio.push({ arquivo: file.name, tipo: conta, novas, duplicadas });
  }

  if (novasPessoas.length) await salvar('pessoas', novasPessoas);
  if (novasTransacoes.length) await salvar('transacoes', novasTransacoes);

  const r = reclassificar(novasTransacoes.map((t) => t.id));
  if (r.alterados.length) await salvar('transacoes', r.alterados);

  if (melhorSaldo) await ancorarSaldo(melhorSaldo.valorCent, melhorSaldo.data);

  reindexar();
  return {
    relatorio,
    novas: novasTransacoes.length,
    pessoasCriadas: novasPessoas.length,
    auto: r.auto,
    revisar: r.revisar,
  };
}

/**
 * Ancora o saldo da conta no número que o BANCO informou naquela data.
 * É o que torna o patrimônio imune a erro de classificação: mesmo que toda a
 * categorização esteja errada, o saldo continua certo.
 */
export async function ancorarSaldo(valorCent, data) {
  if (!data) return;
  const anterior = estado.config.saldoContaData;
  if (anterior && data < anterior) return;  // já temos um saldo mais recente
  await salvarConfig({ saldoContaCent: valorCent, saldoContaData: data });
}
