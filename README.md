# Mydin

Ferramenta de análise financeira pessoal que roda **inteira dentro do seu celular**.
Sem servidor, sem nuvem, sem computador ligado: você abre no Chrome, instala na tela
de início e usa como aplicativo. Os dados ficam no armazenamento do próprio aparelho
e nunca saem dele.

Feito para quem vive de renda variável — ensino de cerâmica + produção musical — e
precisa responder três perguntas o tempo todo: **estou bem?**, **o que mudou?** e
**para onde isso aponta?**

---

## Instalar no celular

1. Publique a pasta (veja [Publicar](#publicar)) e abra o endereço no **Chrome** do celular.
2. Menu **⋮ → Adicionar à tela inicial** (ou *Instalar app*).
   No iPhone: **Compartilhar → Adicionar à Tela de Início**.
3. Pronto: abre em tela cheia, sem barra de navegador, com ícone próprio, e
   **funciona offline** depois da primeira visita.

Na primeira vez, faça isto dentro do app, em **Dados**:

| Aba | O que fazer |
|---|---|
| **Ajustes** | Informe o saldo da poupança/investimentos e seu nome completo como aparece no banco. |
| **Cadastro inicial** | Toque em *Carregar meu cadastro* — traz alunos, clientes, contatos fixos e regras de uma vez. |
| **Importar** | Escolha os arquivos **OFX** do Nubank (conta e faturas). Pode mandar vários juntos. |
| **Revisar** | O que sobrar sem classificação, resolva em lote. O app aprende com cada escolha. |
| **Ensino** | Atribua a **turma** de cada aluno (o cadastro vem sem turma). |

---

## As cinco telas

### Hoje — estou bem?
- Abre com **a conclusão em uma frase**: quanto entrou, quanto saiu, quanto sobrou
  e quantos meses a sua reserva cobre. Os números vêm depois.
- **Patrimônio** (conta + poupança) e a variação do mês.
- **Fôlego**: quantos meses a reserva sustenta o seu ritmo de gasto se a receita parar.
- **Taxa de poupança**: quanto de cada R$ 100 que entram realmente sobra.
- **Ritmo do mês**: o gasto até hoje comparado ao mesmo dia dos meses anteriores,
  com a projeção de fechamento — dá para corrigir a rota antes do mês acabar.
- **Próximos 30 dias**: agenda do que já está lançado (parcelas de cartão) e do que
  costuma cair (mensalidade, aluguel, terapia, assinatura), com o que está atrasado.
  Tudo inferido do extrato, sem cadastrar nada.
- **Para onde foi o que entrou**: uma barra só dividindo cada real que chegou entre
  gasto, guardado e parado na conta.
- **Reserva**: progresso contra a meta em reais, derivada do fôlego — se a sua queima
  sobe, o alvo sobe junto. Sem cadastro de objetivo.
- **Alertas acionáveis**, com *Agora não* para adiar por 14 dias o que você já decidiu ignorar.

### Fluxo — de onde vem, para onde vai
- Entrou × saiu mês a mês, em caixa real, com **média diária** de gasto.
- **Composição** em uma barra: as seis maiores categorias e o resto em "Outros"
  (acima disso as cores deixam de se distinguir).
- Gasto por categoria **com a variação contra o período anterior** — responde
  *o que mudou*, que é o que um total sozinho nunca responde. A janela anterior é
  deslocada em meses, não em dias, para que despesa fixa não "salte 50%" sozinha.
- **Compromissos que se repetem**: o piso do seu mês, detectado pela repetição do
  extrato, separando o que é agenda do que é hábito — e quanto das miudezas
  (cobranças até R$ 120) some sem você ver.
- **Ponto de equilíbrio**: quantos alunos pagantes cobrem o custo fixo e o custo total.
- **Concentração da receita**: quanto do seu dinheiro depende de uma pessoa só.
  Concentração alta é risco.
- Períodos prontos (mês, 3, 6, 12 meses, tudo) ou **intervalo personalizado**.
- Toque numa categoria para ver os lançamentos por trás dela.

### Tendências — para onde isso aponta
- Patrimônio com **projeção de 6 meses** e o r² dizendo o quanto confiar nela.
- Entradas e saídas em **média móvel de 3 meses** (tira o ruído do mês atípico).
- **Sazonalidade**: a média por mês do calendário, para reservar caixa antes do vale.
- **Anomalias**: lançamentos muito acima da mediana da própria categoria.
- **O histórico em números**: sequência de meses no azul, melhor e pior mês com o
  contexto de cada um, e quanto sobrou no total.
- **Ano contra ano** e a **reconciliação** (abaixo).

### Ensino — a base do negócio
- Ocupação contra o potencial, vagas ociosas e o que elas custam por mês.
- Quem costuma pagar e ainda não pagou (ex-aluno nunca vira cobrança).
- **Retenção**: permanência média, quanto cada aluno rende na vida toda, e o gráfico
  de entradas × saídas — o sinal mais antecipado de queda de receita.

### Dados — importar, revisar, pessoas, ajustes
Fila de revisão em lote, cadastro de pessoas, regras, backup e configuração.

---

## Como o app decide se você está bem

**Patrimônio é o termômetro.** Ele vem do saldo que o próprio banco informa no OFX,
então continua certo mesmo que toda a categorização esteja errada.

**Os indicadores de saúde usam caixa real, não categoria.** Fôlego, taxa de poupança
e ritmo do mês contam todo dinheiro que entrou e saiu da conta e do cartão. Se
metade dos lançamentos estivesse parada na fila de revisão, um "gasto por categoria"
diria que está tudo ótimo — e estaria mentindo. Ficam de fora só o que não é fluxo:
transferência para você mesmo e as duas pernas do pagamento de fatura.

**A categorização serve para entender a composição**, não para medir saúde. Por isso
o app mostra as duas coisas lado a lado e, de propósito, mostra também a diferença:
a tela de Tendências tem uma **reconciliação** entre a sobra contábil e a variação
real de patrimônio. Diferença grande quer dizer *falta classificar*, não *você
empobreceu*.

## Como o app adivinha o que vem

Nada de cadastrar conta a pagar. O app agrupa os lançamentos por origem (a pessoa,
pelo CPF mascarado; ou o estabelecimento do cartão) e chama de **compromisso** o que
cumpre três condições: aparece em pelo menos 3 meses da janela, cai **uma vez por
mês** e sempre **por volta do mesmo dia**.

Essa última parte é o que separa agenda de hábito. Mercado e aplicativo de transporte
se repetem todo mês, mas caem oito vezes em dias espalhados — são gasto habitual, não
compromisso, e ficam fora da agenda (continuam no gasto por categoria). Aluguel,
terapia, mensalidade e assinatura caem uma vez, sempre na mesma data, e entram.

O que já está lançado com data futura tem prioridade sobre a previsão, para a mesma
cobrança não aparecer duas vezes. Cada item mostra se é *já lançado*, *previsto* ou
*atrasado*.

## Regras do negócio embutidas

- **Ensino**: receita = pagantes × cota (R$ 232,50; meia = metade). Não é a soma do
  que cada um pagou. O repasse ao ateliê é pass-through, nunca despesa.
- **Identificação de pessoa**: a chave é o **CPF mascarado** do Pix — estável mesmo
  se a pessoa trocar de banco. O cadastro é a fonte da verdade; a heurística de
  mensalidade (recorrência ≥ 3 meses, R$ 180–700, dia 1–12) apenas *sugere* e cai na
  revisão. Teto rígido de R$ 700: acima disso nunca é mensalidade.
- **Música**: cliente cadastrado → toda entrada é receita, qualquer valor.
- **Cartão sem contagem dupla**: só as compras da fatura contam; "Pagamento de
  fatura" e "Pagamento recebido" são ignorados dos dois lados. Parcelas com data
  futura não são gasto realizado — aparecem em *já comprometido*.
- **Multi-relação**: pessoa marcada como tal vai **sempre** para revisão manual,
  qualquer valor, qualquer sentido. É feature, não limitação.
- **Pix pequenos**: < R$ 10 para pessoa física → caridade; avulso ou amigo ≤ R$ 100 → geral.
- **O app aprende**: classificou um estabelecimento ou uma pessoa uma vez, vale sempre.
- **Deduplicação**: reimportar um período que já entrou nunca duplica (chave conta+FITID).

---

## Publicar

O app é um site estático — não tem backend, não tem build, não tem dependências.
Qualquer hospedagem de arquivos serve. Os caminhos são todos relativos, então
funciona na raiz ou em subpasta.

**GitHub Pages:** *Settings → Pages → Deploy from a branch → `main` / `/ (root)`*.
O endereço fica `https://<usuário>.github.io/<repo>/`.

> ⚠️ **Antes de tornar o repositório público**, apague o `dados-iniciais.json` — ele
> contém nomes e CPFs mascarados de alunos e clientes. Você só precisa dele uma vez:
> depois de tocar em *Carregar meu cadastro*, tudo já está salvo no aparelho.
> ```bash
> git rm dados-iniciais.json && git commit -m "Remove cadastro do repositório público"
> ```
> Se preferir manter o repositório privado, use **Cloudflare Pages** ou **Netlify** —
> ambos publicam de repositório privado no plano gratuito.

Os seus lançamentos **nunca** vão para a hospedagem em nenhum dos casos: eles só
existem no IndexedDB do seu celular.

## Onde os dados moram (e como não perdê-los)

Tudo fica no **IndexedDB do navegador**, no aparelho. Nada é enviado para lugar
nenhum — nem os arquivos OFX, que são lidos dentro da própria página.

Isso significa que **limpar os dados do site, desinstalar o navegador ou perder o
celular apaga tudo**. Em *Dados → Ajustes → Backup*, exporte um `.json` de vez em
quando e guarde onde você confia. O mesmo arquivo restaura em qualquer aparelho.

## Estrutura

```
index.html            página única
manifest.webmanifest  instalação como app
sw.js                 cache offline
css/app.css           interface
icons/                ícone do app
js/
  app.js              navegação e início
  store.js            IndexedDB + estado em memória
  dominio.js          categorias, turmas, configuração
  ofx.js              leitor de OFX
  classify.js         motor de categorização
  importar.js         importação e ancoragem do saldo
  cadastro.js         carga do cadastro inicial
  previsao.js         recorrências detectadas e agenda do que vem
  analytics.js        todo o cálculo analítico
  charts.js           gráficos em SVG (sem biblioteca)
  ui.js               peças de interface
  format.js           formatação pt-BR
  views/              as cinco telas
```

Tudo em JavaScript puro, sem framework e sem etapa de build: o que está no
repositório é exatamente o que roda no celular.
