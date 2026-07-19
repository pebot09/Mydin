# Mydin

App pessoal, **local-first**, de gestão financeira e de trabalho para quem vive de
ensino de cerâmica + produção musical. Importa OFX do Nubank (conta e faturas de
cartão), classifica pelas regras do negócio e mede a saúde financeira pelo
**patrimônio real** — não pela soma de categorias.

> **Princípio central:** patrimônio (conta + poupança) é o termômetro, imune a erro
> de classificação. Categorização serve para *entender* o fluxo, não para medir se
> você está bem. O app mostra as duas coisas, deixando claro qual é qual.

## Rodando

```bash
pip install -r requirements.txt
python run.py            # abre em http://127.0.0.1:5000
python run.py --host 0.0.0.0 --port 8080   # para acessar do celular na rede local
```

O banco SQLite fica em `data/mydin.db` (fora do git — o `.gitignore` cobre
`*.db`, `*.ofx`, `*.xlsx` e a pasta `data/`). Nada vai para a nuvem.

## Primeiros passos

1. **Configurações (⚙):** informe seu nome completo (detecta transferências para a
   própria poupança → INT) e os saldos iniciais de conta e poupança.
2. **Importar:** faça upload dos OFX — aceita vários arquivos de uma vez (carga
   histórica) ou um por mês. Conta × fatura de cartão é detectado automaticamente;
   reimportar período sobreposto nunca duplica (deduplicação por FITID).
3. **Contatos:** o app cria contatos automaticamente pelo CPF mascarado dos Pix.
   Marque os tipos (aluno, cliente de música, `amigo_multi`…), vincule pagadores a
   alunos e crie regras permanentes (roommate → MOR, terapeuta → TER, Carolina →
   REP, Carlos Trilha → EST, mãe → TER para deixar a terapia líquida).
4. **Ensino:** cadastre os alunos por turma e vincule os contatos pagadores.
5. **Fila de revisão:** classifique em lote o que sobrou; marque "criar regra
   permanente" para o app aprender.

## Regras implementadas

- **Patrimônio** = saldo conta + poupança; variação mensal é a métrica principal.
- **Ensino:** receita = pagantes × cota (R$ 232,50; meia = metade — flag na
  transação). Repasse à Carolina é pass-through (REP), nunca despesa. Painel com
  % do potencial (R$ 6.510 = 232,50 × 7 × 4), vagas ociosas e quem não pagou.
- **Identificação de aluno:** cadastro é a fonte da verdade. Heurística
  (recorrência ≥ 3 meses, R$ 180–700, dia 1–12) apenas **sugere** e cai na
  revisão. Teto rígido de R$ 700: acima disso nunca é mensalidade.
- **Música:** cliente cadastrado → toda entrada é MUS. Aluguel do estúdio pago
  abaixo de R$ 1.500 → botão de **abatimento** registra EST cheia + SUB pela
  diferença (trabalho trocado por aluguel; patrimônio inalterado).
- **Cartão sem contagem dupla:** só as compras da fatura contam; "Pagamento de
  fatura" (conta) e "Pagamento recebido" (fatura) são ignorados. Parcelas com
  data futura ficam fora dos gastos realizados e aparecem em **compromissos
  futuros**.
- **Transferências internas (INT)** nunca são gasto nem receita; se um envio à
  carteira digital foi na verdade um gasto, basta trocar a categoria — a poupança
  se ajusta sozinha.
- **Multi-relação (`amigo_multi` / sempre revisar):** vai direto para revisão
  manual, qualquer valor, qualquer sentido. Feature, não limitação.
- **Pix pequenos:** < R$ 10 p/ pessoa física → CARIDADE; pessoa única vez ≤
  R$ 100 → GERAL; amigo ≤ R$ 100 → GERAL sem perguntar.
- **Compras compartilhadas:** saída marcada como compartilhada; reembolsos entram
  como REEMB (não-receita) e podem ser vinculados para calcular seu custo real.
- **Cartão aprende:** classificou "Padaria X" uma vez → toda compra futura lá cai
  igual (regras de estabelecimento, editáveis em ⚙).

## Funcionalidades

Painel principal (patrimônio, receita ensino × música, fixo × variável, alertas) ·
Painel de ensino · Projetos de música (orçamento → PDF, cronômetro **e**
lançamento manual de horas, sinal/saldo 50/50, parcelas, valor/hora real e
comparativo por modalidade) · Contas a receber (mensalidades inferidas, parcelas,
reembolsos) · Estatísticas (séries mensais, melhor/pior mês, proporção
música × cerâmica, sazonalidade) · Backup/restauração completa em .xlsx.

## Segurança dos dados

- Repositório deve permanecer **privado**; só código é versionado.
- Sem chaves ou credenciais no código.
- Backups .xlsx contêm seus dados — guarde fora do repositório.
