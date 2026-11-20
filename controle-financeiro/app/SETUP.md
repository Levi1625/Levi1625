# Bolso em Dia: app próprio (passo a passo)

O app próprio é o mesmo Bolso em Dia, funcionando fora do Claude. Ele usa:

- **Firebase** (Google, grátis): login e dados.
- **Cloudflare** (grátis): o endereço do app e a ponte segura para a IA.
- **Anthropic** (pago por uso, centavos por mês): a IA do Claude, que você pode desligar no app.

Faça na ordem: **1 → 2 → 3**.

---

## 1. Firebase (dados e login)

### 1.1 Ligar a verificação em duas etapas (o Google exige)
Se aparecer **"Ativar a autenticação multifator (MFA)"**:
1. Toque em **Ative a verificação em duas etapas**. Abre a página da sua Conta Google.
2. Toque em **Ativar a verificação em duas etapas** (ou "Começar").
3. Confirme seu número de celular. Chega um **código por SMS**: digite o código.
4. Toque em **Ativar**. Pronto: de agora em diante, quando entrar no Google num computador novo, ele pede um código no celular.
5. Volte para https://console.firebase.google.com e atualize a página.

### 1.2 Criar o projeto
1. Toque em **Criar um projeto** (ou "Começar com um projeto do Firebase").
2. Nome: `bolso-em-dia`. Aceite os termos e toque em **Continuar**.
3. Se perguntar sobre o **Gemini** ou o **Google Analytics**, pode **desativar**. Toque em **Criar projeto** e espere 1 minuto.

### 1.3 Ligar o login
1. No menu da esquerda: **Criação → Authentication** (ou "Segurança → Authentication"). Toque em **Vamos começar**.
2. Na aba **Método de login**, toque em **E-mail/senha**, ative a primeira chave e **Salvar**.
3. Toque em **Adicionar novo provedor → Google**, ative, escolha seu e-mail de suporte e **Salvar**.

### 1.4 Criar o banco de dados
1. No menu da esquerda: **Criação → Firestore Database**. Toque em **Criar banco de dados**.
2. Edição: **Standard**. Local: `southamerica-east1 (São Paulo)`. **Próximo**.
3. Escolha **Iniciar no modo de produção** e toque em **Criar**.
4. Abra a aba **Regras**. Apague tudo o que estiver lá, cole o conteúdo do arquivo `firestore.rules` (o Claude manda o texto pronto) e toque em **Publicar**.

### 1.5 Pegar a configuração do app
1. Toque na **engrenagem** (no alto, à esquerda) **→ Configurações do projeto**.
2. Desça até **Seus apps** e toque no ícone **`</>`** (Web).
3. Apelido: `Bolso em Dia`. **Não** marque "Firebase Hosting". Toque em **Registrar app**.
4. Aparece um bloco `const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", ... }`. **Copie e mande esse bloco no chat.** Ele **não é segredo**: fica visível em qualquer app web.

---

## 2. Anthropic (IA do Claude)

Já feito. Só confira:
1. Em **Billing**, ponha créditos (US$ 5 dura muitos meses com o modelo mais barato) e um **limite mensal** (ex.: US$ 5).
2. Em **API Keys**, a chave **nunca** vai para o chat. Se ela apareceu em alguma conversa, apague ela (**⋯ → Delete**) e crie outra. A chave nova vai direto no Cloudflare (passo 3.4).

---

## 3. Cloudflare (o endereço do app)

### 3.1 Abrir a área certa
1. Em https://dash.cloudflare.com, no menu da esquerda, toque em **Compute → Workers & Pages** (em português pode aparecer "Computação → Workers e Pages").
2. Toque no botão azul **Create application** (ou "Criar").
3. Na tela que abre, procure a aba ou o link **Pages**. Pode aparecer como "Looking to deploy Pages? **Get started**". Toque nele.
4. Escolha **Import an existing Git repository** (Importar um repositório Git existente) e toque em **Get started**.

### 3.2 Ligar o GitHub
1. Toque em **Connect GitHub**. Abre o GitHub: entre na sua conta e autorize o **Cloudflare Pages**. Pode escolher "Only select repositories" e marcar só `Levi1625`.
2. De volta ao Cloudflare, escolha o repositório **Levi1625** e toque em **Begin setup**.

### 3.3 Configurar o build (preencha exatamente assim)
| Campo | Valor |
|---|---|
| Project name | `bolso-em-dia` |
| Production branch | `claude/controle-financeiro-completo-m9kj4d` |
| Framework preset | `None` |
| Build command | `npm install` |
| Build output directory | `public` |
| Root directory (em "Advanced" / "Root directory (advanced)") | `controle-financeiro/app` |

Toque em **Save and Deploy**. Em 1 a 2 minutos aparece **Success** e o endereço do app, algo como `https://bolso-em-dia.pages.dev`.

### 3.4 Colocar a chave e as configurações
1. Abra o projeto `bolso-em-dia` **→ Settings → Variables and Secrets** (Variáveis e segredos) **→ Add**.
2. Adicione um por vez (em **Production**):

| Tipo | Nome | Valor |
|---|---|---|
| **Secret** | `ANTHROPIC_API_KEY` | a chave nova da Anthropic |
| Text | `FIREBASE_PROJECT_ID` | o `projectId` do passo 1.5 |
| Text | `EMAILS_PERMITIDOS` | seu e-mail e o da Sabrina, separados por vírgula |

3. Toque em **Save**. Depois vá em **Deployments → ⋯ no último → Retry deployment**, para o app pegar as variáveis.
4. Para trocar o modelo da IA, crie a variável `MODELO`. O padrão é `claude-haiku-5-5`, o mais barato. Também dá para usar `claude-sonnet-5-5` ou `claude-opus-5-5`, que são mais caros.

### 3.5 Liberar o "Entrar com Google"
No Firebase: **Authentication → Configurações → Domínios autorizados → Adicionar domínio**. Cole o endereço do app **sem** `https://` (ex.: `bolso-em-dia.pages.dev`).

---

## 4. Celular
Abra o endereço no **Chrome** do celular, toque em **⋮ → Instalar app** (ou "Adicionar à tela inicial"). O ícone **R$** aparece como um app.

## 5. Levar os dados do Claude para o app próprio
1. No app do Claude: **Ajustes → Baixar backup (.json)**.
2. No app próprio: crie sua conta e vá em **Ajustes → Restaurar backup (.json)**.
3. Em **Ajustes → Quem usa este controle**, adicione o e-mail da Sabrina. Ela cria a conta com esse e-mail e já vê tudo.

## Atualizar o app
O app usa o mesmo código do `../bolso-em-dia.html`. Depois de mudar o app principal, rode `npm run build` nesta pasta e envie para o GitHub. O Cloudflare publica sozinho.
