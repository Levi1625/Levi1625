# Bolso em Dia: app próprio (passo a passo)

O app próprio é o mesmo Bolso em Dia, mas funcionando fora do Claude:

- **Firebase** (Google, grátis): login e dados.
- **Cloudflare Pages** (grátis): o site e a ponte segura para a IA.
- **Anthropic** (pago por uso, só se a IA estiver ligada): a IA do Claude.

São 3 contas, feitas uma única vez (uns 30 minutos).

## 1. Firebase (dados e login)
1. Entre em https://console.firebase.google.com com sua conta Google e toque em **Criar projeto**. Nome: `bolso-em-dia`. Pode desligar o Google Analytics.
2. **Authentication → Começar → Método de login**: ative **E-mail/senha** e **Google**.
3. **Firestore Database → Criar banco de dados**: escolha **modo de produção** e o local `southamerica-east1 (São Paulo)`.
4. Em Firestore, abra a aba **Regras**, apague o que estiver lá, cole o conteúdo do arquivo `firestore.rules` desta pasta e toque em **Publicar**.
5. **Configurações do projeto (engrenagem) → Seus apps → ícone `</>` (Web)**. Nome: `Bolso em Dia`. Copie o bloco `firebaseConfig` que aparece e mande para o Claude, ou cole em `public/config.js`. Esses valores **não são segredo**.

## 2. Anthropic (IA do Claude, opcional)
1. Entre em https://console.anthropic.com e crie a conta.
2. Em **Billing**, cadastre o cartão e coloque créditos (ex.: US$ 5). Defina um **limite de gasto mensal** para nunca passar do que você quer.
3. Em **API Keys → Create Key**, crie a chave `bolso-em-dia`. **Não mande a chave para ninguém, nem no chat.** Ela vai direto no Cloudflare (passo 3).

## 3. Cloudflare Pages (o site)
1. Entre em https://dash.cloudflare.com e crie a conta.
2. **Workers e Pages → Criar → Pages → Conectar ao Git**. Autorize o GitHub e escolha o repositório `Levi1625`.
3. Configuração do build:
   - Branch: `claude/controle-financeiro-completo-m9kj4d` (ou `main`, depois do merge)
   - Framework: **Nenhum**
   - Comando de build: `npm install`
   - Diretório de saída: `public`
   - Diretório raiz: `controle-financeiro/app`
4. **Variáveis de ambiente** (Configurações → Variáveis e segredos):
   - `ANTHROPIC_API_KEY`: a chave do passo 2, marcada como **Secreto (Encrypt)**
   - `FIREBASE_PROJECT_ID`: o `projectId` do passo 1.5
   - `EMAILS_PERMITIDOS`: seu e-mail e o da Sabrina, separados por vírgula (só eles usam a IA)
   - `MODELO` (opcional): `claude-opus-5-5` (padrão), `claude-sonnet-5-5` (metade do preço) ou `claude-haiku-5-5` (o mais barato)
5. Toque em **Salvar e implantar**. O endereço fica parecido com `bolso-em-dia.pages.dev`.
6. Volte no Firebase: **Authentication → Configurações → Domínios autorizados → Adicionar domínio** e cole esse endereço (sem `https://`). Isso libera o "Entrar com Google".

## 4. Celular
Abra o endereço no **Chrome** do celular. Toque no menu **⋮ → Instalar app** (ou "Adicionar à tela inicial"). O ícone **R$** aparece como um app.

## 5. Levar os dados do Claude para o app próprio
1. No app do Claude: **Ajustes → Baixar backup (.json)**.
2. No app próprio: crie sua conta e depois vá em **Ajustes → Restaurar backup (.json)** e escolha o arquivo.
3. **Ajustes → Quem usa este controle**: adicione o e-mail da Sabrina. Ela cria a conta dela com esse e-mail e já vê tudo.

## Atualizar o app
O app usa o mesmo código do `../bolso-em-dia.html`. Depois de mudar o app principal, rode `npm run build` nesta pasta e envie para o GitHub. O Cloudflare publica sozinho.
