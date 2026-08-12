"""Banco de dados SQLite local — schema e conexão."""
import os
import sqlite3
import uuid

from flask import g

DB_PATH = os.environ.get("MYDIN_DB", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "mydin.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
);

CREATE TABLE IF NOT EXISTS categorias (
    id TEXT PRIMARY KEY,          -- código curto: ENS, MUS, MOR...
    nome TEXT NOT NULL,
    grupo TEXT NOT NULL CHECK (grupo IN ('receita','despesa','especial'))
);

CREATE TABLE IF NOT EXISTS alunos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    turma TEXT CHECK (turma IN ('seg17h','seg19h','qui09h','qui11h')),
    ativo INTEGER NOT NULL DEFAULT 1,
    valor_cota_cent INTEGER NOT NULL DEFAULT 23250
);

CREATE TABLE IF NOT EXISTS contatos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    cpf_mascarado TEXT,           -- ex: •••.085.407-•• — impressão digital estável
    tipo TEXT NOT NULL DEFAULT 'desconhecido'
        CHECK (tipo IN ('aluno','cliente_musica','fixo','amigo_multi','familia','interno','desconhecido')),
    aluno_id TEXT REFERENCES alunos(id),   -- este contato paga por um aluno
    sempre_revisar INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_contatos_cpf ON contatos(cpf_mascarado);

CREATE TABLE IF NOT EXISTS projetos (
    id TEXT PRIMARY KEY,
    cliente_id TEXT REFERENCES contatos(id),
    titulo TEXT NOT NULL,
    descricao TEXT,
    modalidade TEXT NOT NULL DEFAULT 'por_hora'
        CHECK (modalidade IN ('por_hora','gravacao_unica','por_musica','pacote')),
    valor_orcado_cent INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'orcamento'
        CHECK (status IN ('orcamento','aprovado','em_andamento','concluido')),
    valor_sinal_cent INTEGER NOT NULL DEFAULT 0,
    sinal_pago INTEGER NOT NULL DEFAULT 0,
    valor_saldo_cent INTEGER NOT NULL DEFAULT 0,
    saldo_pago INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT DEFAULT (date('now')),
    concluido_em TEXT
);

CREATE TABLE IF NOT EXISTS registros_tempo (
    id TEXT PRIMARY KEY,
    projeto_id TEXT NOT NULL REFERENCES projetos(id),
    data TEXT NOT NULL,
    horas REAL NOT NULL,
    descricao TEXT,
    metodo TEXT NOT NULL DEFAULT 'manual' CHECK (metodo IN ('cronometro','manual'))
);

CREATE TABLE IF NOT EXISTS pendencias (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('mensalidade','parcela_projeto','reembolso')),
    contato_id TEXT REFERENCES contatos(id),
    projeto_id TEXT REFERENCES projetos(id),
    valor_esperado_cent INTEGER NOT NULL,
    data_esperada TEXT,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','cancelada')),
    transacao_id TEXT,
    obs TEXT
);

CREATE TABLE IF NOT EXISTS transacoes (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,                    -- ISO yyyy-mm-dd
    valor_cent INTEGER NOT NULL,           -- positivo = entrada, negativo = saída
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
    categoria_id TEXT REFERENCES categorias(id),
    descricao TEXT,                        -- MEMO original do OFX
    origem TEXT NOT NULL CHECK (origem IN ('import_conta','import_cartao','manual')),
    id_externo TEXT UNIQUE,                -- FITID do OFX — evita duplicidade
    conta TEXT NOT NULL,                   -- nuconta / nucartao / ajuste
    contato_id TEXT REFERENCES contatos(id),
    projeto_id TEXT REFERENCES projetos(id),
    status_revisao TEXT NOT NULL DEFAULT 'revisar'
        CHECK (status_revisao IN ('auto','revisar','confirmado')),
    especial TEXT,                         -- pagamento_fatura / abatimento / null
    compartilhada INTEGER NOT NULL DEFAULT 0,  -- compra adiantada p/ grupo (regra I)
    compra_pai_id TEXT REFERENCES transacoes(id), -- reembolso vinculado à compra
    meia INTEGER NOT NULL DEFAULT 0        -- mensalidade meia (férias) = metade da cota
);
CREATE INDEX IF NOT EXISTS idx_tx_data ON transacoes(data);
CREATE INDEX IF NOT EXISTS idx_tx_contato ON transacoes(contato_id);
CREATE INDEX IF NOT EXISTS idx_tx_categoria ON transacoes(categoria_id);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transacoes(status_revisao);

CREATE TABLE IF NOT EXISTS regras (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('contato','estabelecimento')),
    contato_id TEXT REFERENCES contatos(id),
    padrao TEXT,                           -- substring do estabelecimento (minúsculas)
    categoria_id TEXT NOT NULL REFERENCES categorias(id),
    criado_em TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS vendedores_med (
    id TEXT PRIMARY KEY,
    contato_id TEXT NOT NULL UNIQUE REFERENCES contatos(id)
);
"""

CATEGORIAS_SEED = [
    # receitas
    ("ENS", "Ensino (cerâmica)", "receita"),
    ("MUS", "Música", "receita"),
    ("SUB", "Substituição / abatimento", "receita"),
    # despesas
    ("MOR", "Moradia", "despesa"),
    ("EST", "Estúdio (aluguel)", "despesa"),
    ("TER", "Terapia", "despesa"),
    ("MED", "Medicinas", "despesa"),
    ("ALI", "Alimentação", "despesa"),
    ("TRA", "Transporte", "despesa"),
    ("SAU", "Saúde / farmácia", "despesa"),
    ("ASS", "Assinaturas", "despesa"),
    ("CARIDADE", "Caridade", "despesa"),
    ("GERAL", "Geral (avulso/amigo)", "despesa"),
    ("CONS", "Consumo diverso", "despesa"),
    # especiais — fora de receita e despesa
    ("INT", "Interno / poupança", "especial"),
    ("REP", "Repasse ao ateliê", "especial"),
    ("REEMB", "Reembolso (não é receita)", "especial"),
    ("ESTORNO", "Estorno / devolução", "especial"),
]

CONFIG_SEED = {
    "nome_titular": "",                 # nome completo do dono da conta (p/ detectar transf. próprias)
    "valor_cota_cent": "23250",         # R$ 232,50 por aluno
    "capacidade_turma": "7",            # 7 alunos por turma (8 é exceção)
    "aluguel_estudio_cent": "150000",   # R$ 1.500 — Carlos Trilha
    "piso_fixo_cent": "430000",         # piso de custo fixo ≈ R$ 4.300/mês
    "saldo_inicial_conta_cent": "0",       # calibrado automaticamente pelo saldo do banco (OFX)
    "saldo_conta_banco_cent": "",          # último saldo informado pelo banco
    "saldo_conta_banco_data": "",          # data desse saldo (iso)
    "saldo_poupanca_atual_cent": "0",      # saldo atual da poupança/investimentos (você informa)
    "dia_limite_mensalidade": "12",     # alunos pagam tipicamente dia 1–12
}

TURMAS = ["seg17h", "seg19h", "qui09h", "qui11h"]


def novo_id():
    return str(uuid.uuid4())


def get_db():
    if "db" not in g:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(db=None):
    own = db is None
    if own:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        db = sqlite3.connect(DB_PATH)
    db.executescript(SCHEMA)
    for cid, nome, grupo in CATEGORIAS_SEED:
        db.execute("INSERT OR IGNORE INTO categorias (id, nome, grupo) VALUES (?,?,?)", (cid, nome, grupo))
    for chave, valor in CONFIG_SEED.items():
        db.execute("INSERT OR IGNORE INTO config (chave, valor) VALUES (?,?)", (chave, valor))
    db.commit()
    if own:
        db.close()


def cfg(db, chave, default=None):
    row = db.execute("SELECT valor FROM config WHERE chave=?", (chave,)).fetchone()
    return row["valor"] if row else default


def cfg_int(db, chave, default=0):
    try:
        return int(cfg(db, chave) or default)
    except (TypeError, ValueError):
        return default


def set_cfg(db, chave, valor):
    db.execute(
        "INSERT INTO config (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor",
        (chave, str(valor)),
    )
