// Carga do cadastro que você já mapeou: alunos, clientes, contatos fixos e regras.
//
// Idempotente: rodar de novo não duplica. A identidade é o CPF mascarado; quando
// não há CPF, casa pelo nome. Depois de carregar, o app reavalia os lançamentos
// para que os vínculos valham retroativamente.

import { estado, salvar, salvarConfig, novoId, indice } from './store.js';
import { reclassificar, normalizar } from './classify.js';

function acharPessoa(nome, cpf) {
  if (cpf && indice.pessoaPorCpf.has(cpf)) return indice.pessoaPorCpf.get(cpf);
  const alvo = normalizar(nome);
  return estado.pessoas.find((p) => normalizar(p.nome) === alvo) || null;
}

function acharAluno(nome) {
  const alvo = normalizar(nome);
  return estado.alunos.find((a) => normalizar(a.nome) === alvo) || null;
}

/**
 * Aplica o arquivo de cadastro. Devolve o que foi criado/atualizado.
 * Nunca sobrescreve a turma nem a cota que você já ajustou no app.
 */
export async function aplicarCadastro(dados) {
  if (!dados || dados.formato !== 'mydin-cadastro') {
    throw new Error('Arquivo não é um cadastro do Mydin.');
  }
  const conta = { alunosNovos: 0, alunosAtualizados: 0, pessoasNovas: 0, pessoasAtualizadas: 0 };

  const alunos = [];
  const mapaAlunos = new Map();
  for (const a of dados.alunos || []) {
    const ex = acharAluno(a.nome);
    if (ex) {
      mapaAlunos.set(normalizar(a.nome), ex.id);
      alunos.push({ ...ex, ativo: a.ativo });   // turma e cota permanecem suas
      conta.alunosAtualizados++;
    } else {
      const novo = {
        id: novoId(), nome: a.nome, turma: a.turma || null,
        ativo: a.ativo !== false, cotaCent: a.cotaCent || 23250,
      };
      mapaAlunos.set(normalizar(a.nome), novo.id);
      alunos.push(novo);
      conta.alunosNovos++;
    }
  }
  if (alunos.length) await salvar('alunos', alunos);

  const pessoas = [];
  for (const p of dados.pessoas || []) {
    const alunoId = p.alunoNome ? mapaAlunos.get(normalizar(p.alunoNome)) || null : null;
    const ex = acharPessoa(p.nome, p.cpf);
    if (ex) {
      pessoas.push({
        ...ex,
        nome: p.nome,
        cpf: ex.cpf || p.cpf || null,
        tipo: p.tipo,
        alunoId: alunoId || ex.alunoId || null,
        regraCategoria: p.regraCategoria || ex.regraCategoria || null,
        med: !!p.med || !!ex.med,
        sempreRevisar: !!p.sempreRevisar || !!ex.sempreRevisar,
      });
      conta.pessoasAtualizadas++;
    } else {
      pessoas.push({
        id: novoId(), nome: p.nome, cpf: p.cpf || null, tipo: p.tipo,
        alunoId, regraCategoria: p.regraCategoria || null,
        med: !!p.med, sempreRevisar: !!p.sempreRevisar,
      });
      conta.pessoasNovas++;
    }
  }
  if (pessoas.length) await salvar('pessoas', pessoas);

  if (dados.titular) await salvarConfig({ nomeTitular: dados.titular });

  const r = reclassificar();
  if (r.alterados.length) await salvar('transacoes', r.alterados);
  conta.reclassificados = r.alterados.length;
  return conta;
}

/** Busca o arquivo que veio junto com o app, se ainda estiver publicado. */
export async function buscarCadastroPublicado() {
  const resp = await fetch('dados-iniciais.json', { cache: 'no-store' });
  if (!resp.ok) throw new Error('não encontrado');
  return resp.json();
}
