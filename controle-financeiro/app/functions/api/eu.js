// GET /api/eu: quem está logado e os dados da casa.
import { json, banco, sessao, lerCasa, adminEmail, limiteIA } from "../../lib/server.js";
export async function onRequestGet({ request, env }) {
  let s;
  try { s = await sessao(request, env); } catch (e) { return json({ erro: e.message === "sem-banco" ? "Falta ligar o banco D1 (nome DB) no Cloudflare." : "Erro no servidor." }, 503); }
  if (!s) return json({ erro: "Entre no app." }, 401);
  if (s.pausado) return json({ erro: "Seu acesso está pausado. Fale com quem te passou o app.", pausado: true }, 403);
  const casa = await lerCasa(await banco(env), s.casa), lim = limiteIA(casa, env);
  return json({ email: s.email, nome: s.nome, admin: s.email === adminEmail(env), casa: { ...casa, iaLimite: lim === Infinity ? null : lim } });
}
