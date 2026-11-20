// Cloudflare Pages Function: POST /api/ia
// Recebe o pedido do app (pessoa logada), chama o Claude com a chave guardada
// no Cloudflare (ANTHROPIC_API_KEY), devolve o texto ou o JSON e soma o custo do mês na casa.
import Anthropic from "@anthropic-ai/sdk";
import { banco, sessao, lerCasa, mesmaOrigem, limiteIA, usoDoMes } from "../../lib/server.js";

// Preço por milhão de tokens (US$), para mostrar no app quanto a IA custou no mês.
const PRECO = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
};

const resposta = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function extrairJSON(txt) {
  const t = String(txt || "").replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(t); } catch (_) {}
  const i = Math.min(...["{", "["].map((c) => { const k = t.indexOf(c); return k < 0 ? Infinity : k; }));
  const j = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (i !== Infinity && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (_) {} }
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return resposta({ erro: "A IA ainda não foi configurada (falta a chave da Anthropic no Cloudflare)." }, 503);

  // 1. Só quem está logado no app usa a IA (protege sua chave), e só se a IA estiver ligada na casa.
  if (!mesmaOrigem(request)) return resposta({ erro: "Origem inválida." }, 403);
  const s = await sessao(request, env);
  if (!s) return resposta({ erro: "Entre no app de novo." }, 401);
  if (s.pausado) return resposta({ erro: "Acesso pausado." }, 403);
  const db = await banco(env), casa = await lerCasa(db, s.casa);
  if (!casa.ia) return resposta({ erro: "A IA está desligada em Ajustes." }, 403);
  if (usoDoMes(casa) >= limiteIA(casa, env)) return resposta({ erro: "O limite de IA deste mês acabou. Os lançamentos continuam funcionando pelas regras grátis." }, 429);

  // 2. Monta o pedido.
  let body;
  try { body = await request.json(); } catch (_) { return resposta({ erro: "Pedido inválido." }, 400); }
  const texto = Array.isArray(body.input) ? body.input.map((m) => m.content).join("\n\n") : String(body.input || "");
  if (!texto.trim() || texto.length > 60000) return resposta({ erro: "Pedido vazio ou grande demais." }, 400);
  const imagens = (Array.isArray(body.images) ? body.images : []).slice(0, 4)
    .filter((im) => /^image\/(png|jpeg|gif|webp)$/.test(im.media_type) && typeof im.data === "string");
  const content = [
    ...imagens.map((im) => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })),
    { type: "text", text: body.json ? `${texto}\n\nResponda somente com o JSON pedido, sem texto antes ou depois.` : texto },
  ];

  // Padrão: o modelo mais barato (Haiku 5.5). Para trocar, crie a variável MODELO no Cloudflare.
  const modelo = env.MODELO || "claude-haiku-5-5";
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const params = {
    model: modelo,
    max_tokens: 16000,
    output_config: { effort: body.rapido ? "low" : "medium" },
    messages: [{ role: "user", content }],
  };

  // 3. Chama o Claude. Se o modelo principal recusar, o próprio servidor da Anthropic tenta outro modelo (fallback).
  let msg;
  try {
    msg = modelo.startsWith("claude-haiku")
      ? await client.messages.create(params)
      : await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return resposta({ erro: "A chave da Anthropic está errada ou foi apagada." }, 502);
    if (error instanceof Anthropic.RateLimitError) return resposta({ erro: "Muitos pedidos seguidos. Espere um pouco." }, 429);
    if (error instanceof Anthropic.BadRequestError) return resposta({ erro: "A IA não aceitou este pedido." }, 400);
    if (error instanceof Anthropic.APIError) return resposta({ erro: `A IA falhou agora (${error.status}). Tente de novo.` }, 502);
    return resposta({ erro: "Sem conexão com a IA agora." }, 502);
  }
  if (msg.stop_reason === "refusal") return resposta({ erro: "A IA não respondeu este pedido." }, 422);

  const out = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const p = PRECO[msg.model] || PRECO[modelo] || PRECO["claude-haiku-5-5"];
  const u = msg.usage || {};
  const custo = ((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) * p.in / 1e6 + (u.output_tokens || 0) * p.out / 1e6;

  // 4. Soma o custo do mês na casa, para o app mostrar quanto a IA gastou.
  const mes = new Date().toISOString().slice(0, 7), uso = casa.uso || {};
  uso[mes] = { usd: Number(((uso[mes]?.usd || 0) + custo).toFixed(6)), n: (uso[mes]?.n || 0) + 1 };
  await db.prepare("UPDATE casas SET uso = ? WHERE id = ?").bind(JSON.stringify(uso), s.casa).run();

  if (body.json) {
    const value = extrairJSON(out);
    if (value == null) return resposta({ erro: "A IA não devolveu um resultado legível." }, 502);
    return resposta({ value, custo_usd: Number(custo.toFixed(6)) });
  }
  return resposta({ text: out, custo_usd: Number(custo.toFixed(6)) });
}
