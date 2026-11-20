# Bolso em Dia: app próprio (passo a passo)

O app próprio é o mesmo Bolso em Dia, funcionando fora do Claude e **sem precisar do Google/Firebase**:

- **Cloudflare** (grátis): o endereço do app, o banco de dados (D1), o login (e-mail e senha) e a ponte segura para a IA.
- **Anthropic** (pago por uso, centavos por mês): a IA do Claude, que você pode desligar no app.

---

## 1. Anthropic (IA do Claude)
1. Em **Billing**, ponha créditos (US$ 5 dura muitos meses com o modelo mais barato) e um **limite mensal**.
2. Em **API Keys**, crie a chave `bolso-em-dia`. Ela **nunca** vai para o chat: vai direto no Cloudflare (passo 2.4). Se ela aparecer em alguma conversa, apague (**⋯ → Delete**) e crie outra.

---

## 2. Cloudflare

### 2.1 Ligar o repositório
1. Em https://dash.cloudflare.com: **Compute → Workers & Pages → Create application**.
2. Lá embaixo, toque em **"Continue to Pages"** ("Need to use the legacy Pages workflow?").
3. Escolha **Import an existing Git repository → Get started → Connect GitHub**. Autorize o Cloudflare no GitHub (pode marcar só o repositório `Levi1625`).
4. Escolha **Levi1625 → Begin setup** e preencha:

| Campo | Valor |
|---|---|
| Project name | `bolso-em-dia` |
| Production branch | `claude/controle-financeiro-completo-m9kj4d` |
| Framework preset | `None` |
| Build command | `npm install` |
| Build output directory | `public` |
| Root directory (abra "Root directory (advanced)") | `controle-financeiro/app` |

5. **Save and Deploy**. Espere aparecer **Success** e o endereço (ex.: `https://bolso-em-dia.pages.dev`). Ainda não abra o app: faltam os passos abaixo.

### 2.2 Criar o banco de dados
1. No menu da esquerda: **Storage & databases → D1 SQL database → Create database** (ou "Create").
2. Nome: `bolso-em-dia`. Local: pode deixar automático. Toque em **Create**. As tabelas são criadas sozinhas pelo app.

### 2.3 Ligar o banco ao app
1. **Compute → Workers & Pages →** projeto `bolso-em-dia` **→ Settings → Bindings → Add**.
2. Escolha **D1 database**. Em **Variable name** escreva exatamente `DB`. Em **D1 database** escolha `bolso-em-dia`. **Save**.

### 2.4 Colocar a chave e os e-mails
No mesmo projeto: **Settings → Variables and Secrets → Add**:

| Tipo | Nome | Valor |
|---|---|---|
| **Secret** | `ANTHROPIC_API_KEY` | a chave da Anthropic |
| Text | `EMAILS_PERMITIDOS` | o seu e-mail (o primeiro a criar senha). A Sabrina você libera depois, dentro do app |
| Text (opcional) | `MODELO` | deixe sem para usar o mais barato (`claude-haiku-5-5`) |

### 2.5 Publicar de novo
**Deployments →** no último deploy, toque em **⋯ → Retry deployment**. Assim o app pega o banco e as variáveis.

---

## 3. Primeiro acesso
1. Abra o endereço do app (ex.: `https://bolso-em-dia.pages.dev`).
2. Toque em **Primeiro acesso: criar minha senha**, preencha nome, e-mail (o mesmo de `EMAILS_PERMITIDOS`) e uma senha, e toque em **Criar senha e entrar**.
3. **Ajustes → Quem usa este controle →** coloque o e-mail da Sabrina e toque em **Dar acesso**. No celular dela, ela abre o mesmo endereço e toca em **Primeiro acesso**.

## 4. Instalar no celular
No **Chrome** do celular, abra o endereço e toque em **⋮ → Instalar app** (ou "Adicionar à tela inicial"). O ícone **R$** aparece como um app. Funciona até sem internet: o que você lançar offline é enviado quando a conexão voltar.

## 5. Levar os dados do Claude para o app próprio
1. No app do Claude: **Ajustes → Baixar backup (.json)**.
2. No app próprio: **Ajustes → Restaurar backup (.json)**.

## Esqueci a senha
Outra pessoa da casa tira e coloca seu e-mail de novo em **Ajustes**. Depois você toca em **Primeiro acesso** e cria uma senha nova. Se você for o único da casa, crie a variável `RESET_SENHA` com o seu e-mail no Cloudflare, faça **Retry deployment**, crie a senha nova e depois apague a variável.

## Atualizar o app
O app usa o mesmo código do `../bolso-em-dia.html`. Depois de mudar o app principal, rode `npm run build` nesta pasta e envie para o GitHub. O Cloudflare publica sozinho. Para testar no computador: `npm run dev`.
