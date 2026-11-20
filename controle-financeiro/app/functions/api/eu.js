// GET /api/eu: quem está logado e os dados da casa.
import { json, banco, sessao, lerCasa } from "../../lib/server.js";
export async function onRequestGet({ request, env }) {
  let s;
  try { s = await sessao(request, env); } catch (e) { return json({ erro: e.message === "sem-banco" ? "Falta ligar o banco D1 (nome DB) no Cloudflare." : "Erro no servidor." }, 503); }
  if (!s) return json({ erro: "Entre no app." }, 401);
  return json({ email: s.email, nome: s.nome, casa: await lerCasa(await banco(env), s.casa) });
}
