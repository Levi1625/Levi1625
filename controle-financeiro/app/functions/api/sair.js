// POST /api/sair
import { json, banco, sessao, cookieSessao } from "../../lib/server.js";
export async function onRequestPost({ request, env }) {
  const s = await sessao(request, env);
  if (s) await (await banco(env)).prepare("DELETE FROM sessoes WHERE token = ?").bind(s.token).run();
  return json({ ok: true }, 200, { "set-cookie": cookieSessao("", request) });
}
