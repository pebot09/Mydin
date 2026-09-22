// Constantes do domínio: categorias, turmas e configuração padrão.

export const CATEGORIAS = [
  // receitas
  { id: 'ENS', nome: 'Ensino (cerâmica)', grupo: 'receita' },
  { id: 'MUS', nome: 'Música', grupo: 'receita' },
  { id: 'SUB', nome: 'Substituição / troca', grupo: 'receita' },
  // despesas
  { id: 'MOR', nome: 'Moradia', grupo: 'despesa', fixa: true },
  { id: 'EST', nome: 'Estúdio (aluguel)', grupo: 'despesa', fixa: true },
  { id: 'TER', nome: 'Terapia', grupo: 'despesa', fixa: true },
  { id: 'MED', nome: 'Medicinas', grupo: 'despesa', fixa: true },
  { id: 'ALI', nome: 'Alimentação', grupo: 'despesa' },
  { id: 'TRA', nome: 'Transporte', grupo: 'despesa' },
  { id: 'SAU', nome: 'Saúde / farmácia', grupo: 'despesa' },
  { id: 'ASS', nome: 'Assinaturas', grupo: 'despesa' },
  { id: 'CARIDADE', nome: 'Caridade', grupo: 'despesa' },
  { id: 'GERAL', nome: 'Geral (avulso/amigo)', grupo: 'despesa' },
  { id: 'CONS', nome: 'Consumo diverso', grupo: 'despesa' },
  // especiais — não são receita nem despesa
  { id: 'INT', nome: 'Interno / poupança', grupo: 'especial' },
  { id: 'REP', nome: 'Repasse ao ateliê', grupo: 'especial' },
  { id: 'REEMB', nome: 'Reembolso recebido', grupo: 'especial' },
  { id: 'ESTORNO', nome: 'Estorno / devolução', grupo: 'especial' },
];

export const CAT_POR_ID = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));

export const CATEGORIAS_FIXAS = CATEGORIAS.filter((c) => c.fixa).map((c) => c.id);

export function nomeCategoria(id) {
  return CAT_POR_ID[id] ? CAT_POR_ID[id].nome : (id || 'Sem categoria');
}

export function grupoCategoria(id) {
  return CAT_POR_ID[id] ? CAT_POR_ID[id].grupo : null;
}

export const TURMAS = [
  { id: 'seg17h', nome: 'Segunda 17h' },
  { id: 'seg19h', nome: 'Segunda 19h' },
  { id: 'qui09h', nome: 'Quinta 9h' },
  { id: 'qui11h', nome: 'Quinta 11h' },
];

export function nomeTurma(id) {
  const t = TURMAS.find((x) => x.id === id);
  return t ? t.nome : 'Sem turma';
}

export const TIPOS_PESSOA = [
  { id: 'aluno', nome: 'Aluno(a)' },
  { id: 'cliente_musica', nome: 'Cliente de música' },
  { id: 'fixo', nome: 'Despesa fixa' },
  { id: 'amigo_multi', nome: 'Multi-relação (sempre revisar)' },
  { id: 'familia', nome: 'Família / pessoal' },
  { id: 'interno', nome: 'Eu mesmo (transferência interna)' },
  { id: 'desconhecido', nome: 'Não classificado' },
];

export const CONFIG_PADRAO = {
  nomeTitular: '',
  cotaCent: 23250,          // R$ 232,50 por aluno/mês
  capacidadeTurma: 7,
  pisoFixoCent: 430000,     // referência de custo fixo ≈ R$ 4.300/mês
  saldoContaCent: 0,        // vem do próprio OFX (LEDGERBAL) — âncora real
  saldoContaData: '',
  saldoPoupancaCent: 0,     // você informa: poupança + investimentos
  saldoPoupancaData: '',
  diaLimiteMensalidade: 12,
  reservaAlvoMeses: 6,      // meta de fôlego
  alertasAdiados: {},       // { chave: 'AAAA-MM-DD' } — alerta some até essa data
};
