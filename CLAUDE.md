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
- **Pode gastar** = o que falta do dia a dia **fora comida** no mês, na conta ou no cartão. Todo gasto dessas categorias desconta na hora. Dívidas, impostos e assinaturas não entram: saem da sobra do mês.
- O **pode gastar só muda com gastos e limites do mês atual**. Mês à frente que fica negativo vira aviso (Hoje, Contas, Planos); nunca desconta sozinho do pode gastar.
- **Comida** (mercado, restaurante, delivery) tem limite próprio e sai do vale. Vale (VA/VR) só paga comida, nunca contas. Comida paga na conta diminui a sobra do mês, não o pode gastar.
- **Data no futuro = agendado**: não sai da conta até a data. A data escrita na frase manda (a IA não pode trocar por "hoje").
- **A conta nunca fica negativa**: se for faltar, tira da caixinha Sobras; se não der, crédito (fatura seguinte); por último, cheque especial.
- **Sobra do mês vai para a caixinha Sobras**; nos meses apertados sai dela só o necessário.
- Financiamento do carro e academia são pagos no **dia 1**. A partir de fev/27 o financiamento sai da caixinha Reserva do carro (em jan/27 sai da conta, porque a reserva só é formada com a PLR no dia 13).
