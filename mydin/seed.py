"""Dados mapeados (jan/2024–jun/2026) para pré-popular o app.

Idempotente: rodar de novo não duplica — casa contatos por CPF mascarado (ou nome
quando não há CPF) e alunos por nome. Ao final reaplica a classificação nas
transações importadas ainda não confirmadas, para que os vínculos e regras aqui
valham retroativamente.

A identidade de cada pessoa é o CPF mascarado. Onde o CPF ainda não é conhecido
(marcado "buscar" no mapeamento), o contato é criado como ponto de partida e o
vínculo automático passa a valer assim que você preencher o CPF na tela do contato.
"""
from .classify import aplicar_classificacao
from .db import cfg_int, novo_id, set_cfg

TITULAR = ("Pedro Maciel Botafogo Muniz", "•••.323.227-••")

# (nome, cpf|None, ativo)
ALUNOS = [
    ("Verônica da Matta", "•••.728.247-••", 1),
    ("Gabrielle Quelhas Mussauer", "•••.177.177-••", 1),
    ("Cristina Parente Martins", "•••.348.527-••", 1),
    ("Pedro Cabral Meirelles", "•••.469.767-••", 1),
    ("Julia Miranda Gomes", "•••.509.967-••", 1),
    ("Giovanna Zambon Diniz", "•••.268.997-••", 1),
    ("Beatriz Pimentel de Sá Louven", "•••.416.317-••", 1),
    ("Nina Tomsic Villas", "•••.730.887-••", 1),
    ("Juliana Martinez Ronchesel", "•••.324.228-••", 1),
    ("Gabriele Melo Rodrigues Nunes", "•••.882.847-••", 1),
    ("Beatriz Perez da Silva", "•••.905.627-••", 1),
    ("Carla Rainho Borges Barbosa", "•••.080.857-••", 1),
    ("Victoria Cortes Bastos", "•••.957.647-••", 1),
    ("Mariana Brugger Ferreira Alves", "•••.107.337-••", 1),
    ("Vitoria Fontoura de Oliveira", "•••.924.227-••", 1),
    ("Edyanne Moura da Frota Cordeiro", "•••.792.437-••", 1),
    ("Nina Neder de Lima", "•••.292.127-••", 0),
    ("Lorena Lamego Campos Pereira", "•••.255.537-••", 1),
    ("Isabella Giliberti Souto", "•••.347.368-••", 1),
    ("Elaine de Souza Franca", "•••.665.517-••", 1),
    ("Thais Cristine Barauna", "•••.980.477-••", 0),
    ("Adriana Ferraz de Oliveira", "•••.095.907-••", 1),
    ("Vania Soares Alves", "•••.852.147-••", 0),
    ("Silvia Victor Rodrigues", "•••.189.207-••", 0),
    ("Luisa de Mattos Freitas", "•••.732.377-••", 1),
    ("Leila Carmo Sampaio Rodrigues", "•••.970.397-••", 0),
    ("Angela de Freitas Mizarela", "•••.864.337-••", 0),
    ("Wallace Rezende Nascimento", "•••.203.315-••", 1),
    ("Manuela Pinto Vahia de Abreu", "•••.195.617-••", 0),
    ("Karla Engelbart", "•••.520.697-••", 0),
    ("Joana Motta Barreto", "•••.720.317-••", 1),
    ("Rayne do Nascimento Davila", "•••.091.797-••", 1),
    ("Laila de Mesquita Maddalena", "•••.518.227-••", 0),
    ("Juliana Almeida de Deus", "•••.881.858-••", 1),
    ("Niara Jost", "•••.093.567-••", 0),
    ("Claudia Pecanha Trindade", None, 1),  # CPF a confirmar
]

# pagadores por terceiro: (nome, cpf|None, nome_do_aluno)
PAGADORES = [
    ("Camilla Quelhas", None, "Gabrielle Quelhas Mussauer"),
    ("Maria Lins Diniz", None, "Giovanna Zambon Diniz"),
    ("Marcela Cordeiro", None, "Edyanne Moura da Frota Cordeiro"),
    # Carlos Eduardo Libonati também paga pela namorada (aluna), mas é multi-relação
    # → fica em "sempre revisar" para você decidir a cada Pix.
]

# (nome, cpf|None)
CLIENTES_MUSICA = [
    ("Eduardo Bonadiman M C Moura", "•••.151.797-••"),
    ("Mariana Ferreira Jascalevich", "•••.707.047-••"),
    ("Eduardo Hall Gentil", "•••.051.427-••"),
    ("Barbara Ferreira Mendes", "•••.117.787-••"),
    ("Dea Maria de Sá L. Backheuser", "•••.521.637-••"),
    ("Eduardo Rezende Feijó de Almeida", "•••.229.037-••"),
    ("Mauricio Muller da Costa Moura", "•••.077.367-••"),
    ("Lucas Oliveira Miranda", "•••.053.496-••"),
    ("Marco Zamberlan", "•••.907.557-••"),
    ("Isabella Dall Agnese", "•••.396.895-••"),
    ("Antonio Surani Lima", "•••.511.967-••"),
    ("Rose France de Farias Panet", "•••.830.374-••"),
    ("Paloma Ronai Kopelowicz", "•••.810.757-••"),
    ("Jaffar Bambirra dos Santos", "•••.816.467-••"),
    ("Edson Ricardo Dias de Oliveira", "•••.814.697-••"),
    ("Bruno Fernandes do Carmo", "•••.679.007-••"),
    ("Mateus Rodrigues Miranda", "•••.792.741-••"),  # pacote 4×R$500 (1ª jun/2026)
]

# contatos com regra permanente de categoria: (nome, cpf|None, categoria, tipo)
FIXOS = [
    ("Eduardo Moura J Teixeira Sena", "•••.755.427-••", "MOR", "fixo"),   # roommate atual
    ("Carlos Trilha Muller", "•••.988.829-••", "EST", "fixo"),           # estúdio
    ("Bruno Bueno Brandão Siniscalchi", "•••.004.187-••", "TER", "fixo"),  # terapeuta
    ("Carolina Maiolino de Queiroz", "•••.412.647-••", "REP", "fixo"),   # repasse ateliê (pass-through)
    ("Eduardo Varella", None, "MOR", "fixo"),                            # divisão de contas
    ("Gabriel Prieto", None, "MOR", "fixo"),                             # divisão de contas
    ("Camila da Costa Aguiar Agustini", "•••.499.958-••", "MOR", "fixo"),  # vaga de garagem
    ("Vera Lucia de Sousa Moura", "•••.031.347-••", "MOR", "fixo"),      # faxina/casa (revisar categoria)
    ("Leyla Valeria Pereira Maciel Botafogo", "•••.259.327-••", "TER", "familia"),  # mãe: ajuda p/ terapia líquida
]

# vendedores de medicina (MED automático): (nome, cpf|None)
MED = [
    ("Raphael Silva de Freitas", "•••.066.987-••"),
    ("Luiz Antonio dos Santos Teixeira", "•••.391.997-••"),
    ("Carlos Eduardo Ferreira de Sousa", "•••.157.467-••"),
    ("Rodrigo Pimentel Nitzsche Cysne", "•••.253.957-••"),  # foi compra compartilhada
    ("Anaissara Louback Goncalves Romero", "•••.653.435-••"),
    ("Joyce Garcia de Melo", "•••.857.017-••"),
    ("Divino Doce", None),
    ("Trade Trust Investimentos", None),
    ("Carlos Eduardo de Sousa", None),
]

# multi-relação — sempre revisar, qualquer valor/sentido: (nome, cpf|None)
MULTI = [
    ("Bernardo Ibeas Moreira de Souza", "•••.413.537-••"),
    ("Gabriel Hack Fernandes", "•••.066.457-••"),
    ("Laura Jost Lins e Silva Chaves", "•••.334.357-••"),
    ("Carlos Eduardo Libonati", "•••.681.167-••"),
]

# família / pessoais sem regra automática: (nome, cpf|None, tipo)
PESSOAIS = [
    ("Luiz Fernando Muniz", None, "familia"),           # pai — às vezes contrata serviços (pode ser receita)
    ("Laura Cardoso Gonzaga", None, "familia"),         # namorada — transferências pessoais
]

# Não é cliente: designer que trabalhou PARA mim (custo de música). Fica sem regra,
# para você decidir a categoria na revisão (não vira receita de música por engano).
NAO_CLIENTE = [
    ("Guilherme A C Vasconcellos", "•••.460.247-••"),
]


def _get_or_create_contato(db, nome, cpf=None, tipo="desconhecido", aluno_id=None, sempre_revisar=0):
    row = None
    if cpf:
        row = db.execute("SELECT id FROM contatos WHERE cpf_mascarado=?", (cpf,)).fetchone()
    if row is None:
        row = db.execute(
            "SELECT id FROM contatos WHERE nome=? AND cpf_mascarado IS NULL", (nome,)).fetchone()
    if row:
        db.execute(
            """UPDATE contatos SET nome=?, cpf_mascarado=COALESCE(?, cpf_mascarado),
               tipo=?, aluno_id=COALESCE(?, aluno_id), sempre_revisar=? WHERE id=?""",
            (nome, cpf, tipo, aluno_id, sempre_revisar, row["id"]))
        return row["id"], False
    cid = novo_id()
    db.execute(
        "INSERT INTO contatos (id, nome, cpf_mascarado, tipo, aluno_id, sempre_revisar) VALUES (?,?,?,?,?,?)",
        (cid, nome, cpf, tipo, aluno_id, sempre_revisar))
    return cid, True


def _get_or_create_aluno(db, nome, ativo=1):
    row = db.execute("SELECT id FROM alunos WHERE nome=?", (nome,)).fetchone()
    if row:
        db.execute("UPDATE alunos SET ativo=? WHERE id=?", (ativo, row["id"]))
        return row["id"]
    aid = novo_id()
    db.execute("INSERT INTO alunos (id, nome, ativo, valor_cota_cent) VALUES (?,?,?,?)",
               (aid, nome, ativo, cfg_int(db, "valor_cota_cent", 23250)))
    return aid


def _regra_contato(db, contato_id, categoria):
    ex = db.execute(
        "SELECT 1 FROM regras WHERE tipo='contato' AND contato_id=? AND categoria_id=?",
        (contato_id, categoria)).fetchone()
    if not ex:
        db.execute("INSERT INTO regras (id, tipo, contato_id, categoria_id) VALUES (?,?,?,?)",
                   (novo_id(), "contato", contato_id, categoria))


def popular(db):
    contagem = {"alunos": 0, "contatos": 0, "regras": 0, "vendedores": 0}

    # Titular (própria poupança) — habilita detecção de transferências internas
    set_cfg(db, "nome_titular", TITULAR[0])
    _get_or_create_contato(db, TITULAR[0], TITULAR[1], tipo="interno")
    contagem["contatos"] += 1

    alunos_por_nome = {}
    for nome, cpf, ativo in ALUNOS:
        aid = _get_or_create_aluno(db, nome, ativo)
        alunos_por_nome[nome] = aid
        contagem["alunos"] += 1
        if cpf:  # o próprio aluno como pagador
            _get_or_create_contato(db, nome, cpf, tipo="aluno", aluno_id=aid)
            contagem["contatos"] += 1

    for nome, cpf, aluno_nome in PAGADORES:
        aid = alunos_por_nome.get(aluno_nome)
        _get_or_create_contato(db, nome, cpf, tipo="desconhecido", aluno_id=aid)
        contagem["contatos"] += 1

    for nome, cpf in CLIENTES_MUSICA:
        _get_or_create_contato(db, nome, cpf, tipo="cliente_musica")
        contagem["contatos"] += 1

    for nome, cpf, categoria, tipo in FIXOS:
        cid, _ = _get_or_create_contato(db, nome, cpf, tipo=tipo)
        _regra_contato(db, cid, categoria)
        contagem["contatos"] += 1
        contagem["regras"] += 1

    for nome, cpf in MED:
        cid, _ = _get_or_create_contato(db, nome, cpf, tipo="fixo")
        db.execute("INSERT OR IGNORE INTO vendedores_med (id, contato_id) VALUES (?,?)",
                   (novo_id(), cid))
        contagem["contatos"] += 1
        contagem["vendedores"] += 1

    for nome, cpf in MULTI:
        _get_or_create_contato(db, nome, cpf, tipo="amigo_multi", sempre_revisar=1)
        contagem["contatos"] += 1

    for nome, cpf, tipo in PESSOAIS:
        _get_or_create_contato(db, nome, cpf, tipo=tipo)
        contagem["contatos"] += 1

    for nome, cpf in NAO_CLIENTE:
        _get_or_create_contato(db, nome, cpf, tipo="desconhecido")
        contagem["contatos"] += 1

    # Reaplica classificação nos lançamentos importados ainda não confirmados
    aplicar_classificacao(db)
    return contagem
