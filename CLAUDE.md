# Bolso em Dia — regras do projeto

Controle financeiro da casa. Respostas ao dono sempre em português, curtas e simples.

## Onde está cada coisa
- App: `controle-financeiro/bolso-em-dia.html` (um arquivo só, JavaScript puro).
- App publicado: `controle-financeiro/app/` (Cloudflare Pages + D1). **Publica sozinho a cada push** neste branch.
- Depois de mudar o app, gere as cópias publicadas:
  `cd controle-financeiro && sed 's/^const PRIV = false;/const PRIV = true;/' bolso-em-dia.html > bolso-em-dia-modelo.html && (cd app && node build.mjs)`

## Antes de qualquer commit ou push
1. `node controle-financeiro/testes/rodar.cjs` tem que terminar com **✅ tudo certo**.
2. Corrigiu um erro? Coloque em `testes/rodar.cjs` um teste que reproduz o erro, para ele não voltar.
3. Os testes usam só a família fictícia `testes/familia-teste.json`.

## Acesso e controles
- Um e-mail pode participar de **mais de um controle** (ex.: ver o da família e ser dona do controle da casa da mãe, liberado em Ajustes › Clientes). Troca no menu ☰ › Controles; cada aparelho fica no controle que abriu; a cópia no aparelho é separada por controle; um controle nunca vê os dados do outro. Tirar a pessoa de um controle não apaga a conta dela se ela tem outro.
- As correções únicas combinadas para a casa do dono (as funções `ajuste…2611`: limites dele, dia 1, Nubank…) **só rodam na casa do dono** (`casaDoDono`). Controle de cliente começa do zero e nada é trocado sozinho.
- Mexeu no servidor (`app/functions`, `app/lib`) ou no `app/public/shim.js`? Rode também `testes/servidor-controles.mjs` e depois `testes/servidor-aparelhos.cjs` com o servidor local num banco novo (instruções no arquivo).
- **Ajustes gravados por caminho**: `saveCfg` manda só o que mudou, no caminho exato (`campos([{p:['orc','Compras'], v:300}])`, até 3 níveis); o servidor aplica sem perder o que outro aparelho gravou no meio. Duas pessoas mudando categorias diferentes ao mesmo tempo não se atropelam. Não volte a gravar o `config/geral` inteiro.
- Quem administra (Ajustes › Clientes) libera, pausa, limita a IA, dá **Nova senha** (para quem esqueceu: os dados continuam e a pessoa cria outra em Primeiro acesso) e remove. Quem **só vê** não exporta backup nem lançamentos.

## Privacidade
- Nunca commitar dados reais (lançamentos, saldos, nomes, planilhas, prints). Só código e a família fictícia.
- Nunca commitar `.dev.vars` nem chaves. Segredos ficam só no Cloudflare. O telefone serve só para os lembretes de WhatsApp.
- Lembretes: o endereço com a chave (o agendador) **nunca devolve o texto**; ler o lembrete só dentro do app (Ajustes › Lembretes no WhatsApp › Ver o lembrete de hoje).
- **Lembrete do WhatsApp** (toda manhã, para cada controle com número e chave do CallMeBot em Ajustes): começa pelo **resumo do dia** que o app calcula e guarda em `config.resumoWhats` (pode gastar e vale, por dia, o que passou do previsto, o próximo aperto, o ano faltando, vale acabou); depois contas que vencem, dinheiro que cai, guardar para os planos, agenda dos planos e o resumo de domingo. Ninguém cria aviso na mão.
- Senha nova com **8 ou mais**; login trava 15 min depois de 8 erros. PBKDF2 fica em 20 mil voltas (limite de CPU do Workers): só suba guardando o número de voltas junto do hash.
- **Sair** precisa de internet e apaga a cópia dos dados do aparelho (pergunta antes se há mudança sem enviar). **Sair dos outros aparelhos** fica em Ajustes.
- Senha de 4 números do aparelho: oferecida uma vez no app instalado; depois de 5 erros, espera crescente (30 s, 1 min…); "Esqueci a senha" só funciona com internet.

## Regras de dinheiro combinadas com o dono (não mudar sem ele pedir)
- **Projetado do dia a dia** (fora comida), em todos os meses: em cada categoria vale **a média** dos últimos 6 meses (sem viagem e sem mês fora do normal), que se ajusta sozinha todo mês. O dono pode mudar o valor (todos os meses ou só um mês, ex.: férias zeradas em dezembro); a média fica ao lado mostrando se dá para ser menos ou mais.
- **Pode gastar** (tela Hoje) = o que falta do projetado do mês atual. Todo gasto dessas categorias desconta 1:1 na hora. Passou numa categoria? O excesso sai das outras **proporcionalmente** (ao que faltava em cada uma), até zerar. **Uma regra só**: a mesma conta vale para comida (entre as de comida), para os itens de um plano e para "Terminei este gasto" (o que sobrou vai para as outras, proporcional; o total não muda). Não tem trava de caixa: se não couber, aparece negativo no "tirando tudo".
- **Por dia** = pode gastar ÷ dias que faltam **contando hoje**. Se até o dinheiro cair a conta não aguenta esse ritmo, vira frase ("a conta aguenta R$ X por dia"); o número não muda. Conta que não fecha até o salário também vira frase: o pode gastar continua sendo o número grande.
- Seguindo o projetado: **quanto fica no fim do mês** (conta + caixinha, na tela **Mês**) e **sobra/falta tirando tudo** (o menor "no fim" daqui até o fim da projeção), com o nome do mês: **"O que segura out/27"** na tela **Ano**. Positivo = dá para gastar a mais ou guardar; negativo = diminuir o projetado. "Como calculei" detalha tudo.
- Mudar o projetado de um mês muda o pode gastar daquele mês e o "tirando tudo"; mudar o de outro mês não mexe no pode gastar de hoje.
- **Saúde = só farmácia**. O resto de saúde vem descontado no contracheque: sai da sobra do mês, não do pode gastar.
- Cartão sem categoria ("Cartão (sem detalhe)", mostrado como **Cartão sem categoria**) entra pela média dele (também nos meses à frente), tirando as assinaturas fixas do cartão. Itens do histórico que hoje são contas fixas não entram na média.
- **Mudar escrevendo** (chat e caixa do +), sem precisar de IA: "lazer 300 por mês", "compras 400 só em dezembro", "volta lazer para a média", "zera o cartão sem categoria", "salário de dezembro 3500" (só a previsão de dezembro, não lança nada), "internet 110 a partir de janeiro", "não tem academia em janeiro", "cancelei a netflix", "academia agora é 120", "corrige o último para 50", "apaga o último". Pedido de mudança **nunca vira gasto**; "lazer 50" sozinho continua gasto. Toda mudança mostra o efeito e tem **Desfazer**. O que a regra não entender vai para a IA, que só traduz para uma dessas ações (não inventa valor).
- **Todo projetado se muda na mão, na hora**: tocar no item (Hoje, Como calculei, Mês › Dá para cortar, fatura) abre a ficha com o valor (todos os meses ou só aquele mês), "Usar a média" e "Zerar", e a mensagem mostra o efeito ("Pode gastar: antes → depois", "Tirando tudo"). **Zerar tira só o que falta**: no mês atual o projetado fica no que já foi gasto (não vira "passou do projetado"); os outros meses vão a zero.
- **Cartão principal = o Nubank do dono.** Todo gasto previsto no crédito vai para ele, e "no cartão" sem dizer qual também. **Nunca projetar no cartão de outra pessoa** (mãe, sogra…), a não ser que o dono escolha o "Sai de" daquela categoria. Trocar o principal: Mês › Cartões › Tornar principal.
- **Três telas** (combinado com o dono; barra de baixo **Hoje · Lançar · Mês · Ano**; Ajuda e ajustes no menu ☰):
  - **Hoje, a decisão de agora**: **Pode gastar** (o que ainda sai do salário no dia a dia, fora comida) e **Vale** (o que ainda sai para comida), do mesmo tamanho. Vale vazio: "comida agora sai da conta e come o salário". Embaixo, **uma frase só**, a mais urgente: a conta não fechar até o salário; o **próximo aperto** (o que sai antes, ex.: a viagem no dia 1º e o cartão no dia 10, e quanto falta até o dinheiro entrar: vai no cartão); o ano faltando. A lista mostra **o que falta gastar**: dia a dia e comida juntos, com a etiqueta de onde sai ("do salário", "sai do vale", "sai da conta"); quem passou vem primeiro ("era R$ X; R$ Y cobriram Lazer") com o botão **"Manter R$ X só neste mês"**; os valores inteiros **somam o pode gastar**. No máximo um aviso (o estouro já está na lista). Próximos dias = só a próxima entrada e a próxima conta.
  - **Mês, o salário**: **Não dá para cortar** mostra o que **falta pagar** (o já pago fica recolhido) e o atalho "Em dez o salário já deve R$ X"; **Dá para cortar** (dia a dia e comida: já foi × **previsto**; a média só aparece quando existe; o número grande é o que **passou do previsto**); **Entrou a mais** (férias, 13º, PLR) com destino. Depois o resumo (falta pagar, falta receber na conta, fim do mês) e o calendário com Paguei/Recebi.
  - **Destino do dinheiro a mais** (`destinoExtras`): na ordem, os planos e caixinhas do próprio mês, depois o que o mês seguinte precisa até o dinheiro entrar (já inclui as contas e os planos dele) e o resto para a caixinha. **Cada destino leva só o que cabe no que entrou; a soma é sempre o valor que entrou.** Nada conta duas vezes. **Mês e Ano contam a mesma história**: a mesma lista (`extrasMes`: o que já entrou no mês, ex.: o 13º, e o que ainda vai entrar) e o mesmo destino (`destinoMes`). O dinheiro só vai para o que sai **depois** de ele entrar: o que sai antes (ex.: a viagem do dia 1º, quando o 13º cai no dia 19) já está no que o mês anterior deixou.
  - **Ano, um mês ajuda o outro**: o fim de cada mês, o mais justo marcado (▼) e "O que segura {mês}"; a frase não aponta outros meses como quem segura (a sobra deles já tem destino). Dinheiro a mais com destino, por mês. Os objetivos com barra (já pago, guardado, falta) e o dia em que o dinheiro sai. **Guardar só vira botão quando o dinheiro está na conta**; antes é plano. A tela velha "Análise do mês" não fica no menu (só em Relatórios do ano).
- **Começar do zero** (controle novo): botão **Começar** na tela Hoje, 7 passos, cada um já salva:
  1. quanto tem na conta e no vale;
  2. salário e dia;
  3. vale e dia, e **quanto gasta de comida por mês, contando o vale**. Vira o previsto de comida: Mercado 70%, Restaurantes e lanches 20%, Delivery 10%, ou pela média se já existe;
  4. **contas fixas** ali mesmo: sugestões (Aluguel, Luz, Internet…), valor e dia, ✕ tira. "Continuar" grava a que ficou escrita;
  5. **o que já tem guardado ou investido**. "Pode cobrir um mês apertado" vai para a caixinha Sobras: movimento `inicial`, que não sai da conta e não conta como guardado no mês (`movConta`). "Não mexer" vira uma Reserva, fora das contas do mês;
  6. **como quer guardar** (`guardar`): um valor todo mês, que sai do teto, ou o que sobrar no fim do mês, que vai para a caixinha (o jeito do dono);
  7. **quanto dá para gastar** (`calcTeto`) = o que entra na conta (sem 13º, férias e PLR) − contas fixas − parcelas e dívidas − comida que o vale não cobre − o que falta para os planos ÷ 12 − guardar. Vem **dividido por categoria**: Transporte 30%, Lazer 20%, Compras 20%, Farmácia 10%, Cuidados pessoais 10%, Outros 10%. A pessoa muda cada uma; o **teto do mês** (`tetoDia`) vira a soma, e a divisão fica em `tetoPct` (pesos = o valor de cada categoria).
  - Rodar de novo atualiza o mesmo salário e vale; não duplica.
  - Enquanto não há média, o teto é dividido por `tetoPct`; quando a média aparece, pela média (nunca soma por cima). "Usar a média" tira o teto.
  - **Calcular quanto posso gastar** (tela Hoje) refaz a conta. Com média, mostra a divisão pela média.
- **Menu que cresce**: Guardado, Cartões, Dívidas e Reservas só aparecem no menu (e a aba Cartões em Mês) quando a casa usa; o resto fica em **Mais**.
- **Lançar mostra o efeito antes de gravar** (comida no vale ou na conta, "Pode gastar: antes → depois"). Passou do pode gastar: a confirmação diz **"o mês mais justo cai de X para Y"**.
- Dívidas, impostos e assinaturas não entram no pode gastar: saem da sobra do mês.
- Toda confirmação de lançamento mostra o efeito: "Pode gastar: antes → depois" ou o motivo de não mudar (comida, conta fixa, plano, parcelado, agendado, saúde fora da farmácia, fora do dia a dia).
- Valor de entrada ou conta de outro mês: Mês › (o mês) › **Mudar** (só aquele mês ou daqui pra frente).
- **Comida** (mercado, restaurante, delivery) tem limite próprio e sai do vale. Vale (VA/VR) só paga comida, nunca contas. Comida paga na conta diminui a sobra do mês, não o pode gastar.
- **Data no futuro = agendado**: não sai da conta até a data. A data escrita na frase manda (a IA não pode trocar por "hoje").
- **A conta nunca fica negativa**: se for faltar, tira da caixinha Sobras; se não der, crédito (fatura seguinte); por último, cheque especial.
- **Sobra do mês vai para a caixinha Sobras**; nos meses apertados sai dela só o necessário.
- **Não existe folga fixa (os R$ 1.000 acabaram)**: no fim de cada mês fica na conta só o que o mês seguinte precisa para não ficar negativo até o dinheiro entrar (contas, faturas, planos e o dia a dia pago na conta até o ponto mais baixo). O resto vai para a caixinha Sobras. Em Ajustes dá para pôr uma folga extra opcional (padrão 0).
- Financiamento do carro e academia são pagos no **dia 1**. A partir de fev/27 o financiamento sai da caixinha Reserva do carro (em jan/27 sai da conta, porque a reserva só é formada com a PLR no dia 13).
