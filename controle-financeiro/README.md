# Bolso em Dia

Controle financeiro pessoal/da casa em uma única página (`bolso-em-dia.html`), publicada como artefato no claude.ai.
Os dados ficam no banco do próprio artefato (não neste repositório).

## O que tem
- Lançamento por mensagem: "almoço 32 e uber 18", "mercado 230 no vale", "geladeira 3200 nubank 10x", "+2518 salário".
  O Claude interpreta mensagens com vários itens e escolhe a categoria; o app também aprende com as correções.
- Perguntas no chat: "quanto gastei com mercado esse mês?"
- Início: quanto ainda dá para gastar no mês (separando o vale-alimentação), gastos por categoria vs média e orçamento,
  fixo × variável × parcelado, regra 50/30/20, ritmo de gastos, análise automática e dicas do Claude.
- Contas fixas (receitas e despesas) com "Paguei/Recebi", cartões com fatura por mês e parcelamentos,
  empréstimos/financiamentos, investimentos e reserva de emergência, objetivos (ex.: viagem) com previsão por categoria,
  visão anual com extras (PLR, 13º, férias), mapa de calor por categoria e compromissos dos próximos 12 meses.
- Backup em JSON/CSV e importação de planilha (CSV).

## Acesso
Funciona no notebook e no celular (adicione o link à tela inicial). Para dividir com outra pessoa,
use Compartilhar no artefato e convide pelo e-mail com permissão de edição.

## Versão em branco para outras pessoas

`bolso-em-dia-modelo.html` é o mesmo app com `PRIV = true`: cada pessoa que abre guarda os próprios dados numa área privada (`data/users/<id>/app/...`), que nem o dono do link vê. Para atualizar, gere de novo a partir do app principal:

```
sed 's/^const PRIV = false;/const PRIV = true;/' bolso-em-dia.html > bolso-em-dia-modelo.html
```

Objetivos aceitam, em cada item, `quando` e `onde` (como pagar), além de `passos` (agenda com data, que vira alerta no Início e lembrete diário) e `guia` (texto com `##` títulos e `-` listas). Em Planejar, a tabela "Mês a mês" mostra entra, sai, sobra do mês, livre no fim e vale no fim até dezembro do ano seguinte.
