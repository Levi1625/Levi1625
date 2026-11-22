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

## Privacidade
- Nunca commitar dados reais (lançamentos, saldos, nomes, planilhas, prints). Só código e a família fictícia.
- Nunca commitar `.dev.vars` nem chaves. Segredos ficam só no Cloudflare. O telefone serve só para os lembretes de WhatsApp.

## Regras de dinheiro combinadas com o dono (não mudar sem ele pedir)
- **Projetado do dia a dia** (fora comida), em todos os meses: em cada categoria vale **a média** dos últimos 6 meses (sem viagem e sem mês fora do normal), que se ajusta sozinha todo mês. O dono pode mudar o valor (todos os meses ou só um mês, ex.: férias zeradas em dezembro); a média fica ao lado mostrando se dá para ser menos ou mais.
- **Pode gastar** (tela Hoje) = o que falta do projetado do mês atual. Todo gasto dessas categorias desconta 1:1 na hora. Passou numa categoria? O excesso sai das outras **proporcionalmente**, até zerar. Não tem trava de caixa: se não couber, aparece negativo no "tirando tudo".
- Embaixo do pode gastar, seguindo o projetado: **quanto fica no fim do mês** (conta + caixinha) e **sobra/falta tirando tudo** (o menor "no fim" daqui até o fim da projeção: contas, faturas, planos, caixinhas, o que os próximos meses precisam e o projetado de todos os meses). Positivo = dá para gastar a mais ou guardar; negativo = diminuir o projetado. "Como calculei" detalha tudo. Contas mostra o mesmo para cada mês.
- Mudar o projetado de um mês muda o pode gastar daquele mês e o "tirando tudo"; mudar o de outro mês não mexe no pode gastar de hoje.
- **Saúde = só farmácia**. O resto de saúde vem descontado no contracheque: sai da sobra do mês, não do pode gastar.
- Cartão sem categoria entra pela média dele (também nos meses à frente), tirando as assinaturas fixas do cartão. Itens do histórico que hoje são contas fixas não entram na média.
- A tela Hoje mostra **o que falta gastar** em cada categoria e item (não o que já gastou).
- Dívidas, impostos e assinaturas não entram no pode gastar: saem da sobra do mês.
- Toda confirmação de lançamento mostra o efeito: "Pode gastar: antes → depois" ou o motivo de não mudar (comida, conta fixa, plano, parcelado, agendado, saúde fora da farmácia, fora do dia a dia).
- Valor de entrada ou conta de outro mês: Contas › mês › **Mudar** (só aquele mês ou daqui pra frente).
- **Comida** (mercado, restaurante, delivery) tem limite próprio e sai do vale. Vale (VA/VR) só paga comida, nunca contas. Comida paga na conta diminui a sobra do mês, não o pode gastar.
- **Data no futuro = agendado**: não sai da conta até a data. A data escrita na frase manda (a IA não pode trocar por "hoje").
- **A conta nunca fica negativa**: se for faltar, tira da caixinha Sobras; se não der, crédito (fatura seguinte); por último, cheque especial.
- **Sobra do mês vai para a caixinha Sobras**; nos meses apertados sai dela só o necessário.
- **Não existe folga fixa (os R$ 1.000 acabaram)**: no fim de cada mês fica na conta só o que o mês seguinte precisa para não ficar negativo até o dinheiro entrar (contas, faturas, planos e o dia a dia pago na conta até o ponto mais baixo). O resto vai para a caixinha Sobras. Em Ajustes dá para pôr uma folga extra opcional (padrão 0).
- Financiamento do carro e academia são pagos no **dia 1**. A partir de fev/27 o financiamento sai da caixinha Reserva do carro (em jan/27 sai da conta, porque a reserva só é formada com a PLR no dia 13).
