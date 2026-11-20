// GET /api/sync?since=<ms>: tudo o que mudou desde a última vez (inclui apagados).
import { json, banco, sessao, lerCasa } from "../../lib/server.js";
export async function onRequestGet({ request, env }) {
  const s = await sessao(request, env); if (!s) return json({ erro: "Entre no app." }, 401); if (s.pausado) return json({ erro: "Acesso pausado." }, 403);
  const db = await banco(env), since = Math.max(0, +new URL(request.url).searchParams.get("since") || 0), agora = Date.now();
  const r = await db.prepare("SELECT path, data, upd, del FROM docs WHERE casa = ? AND upd >= ? ORDER BY upd").bind(s.casa, since).all();
  const docs = (r.results || []).map((d) => ({ path: d.path, del: !!d.del, data: d.del ? null : JSON.parse(d.data) }));
  return json({ agora, docs, casa: await lerCasa(db, s.casa) });
}
