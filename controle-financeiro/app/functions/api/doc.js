// PUT /api/doc {path, data} grava um documento; DELETE /api/doc?path= apaga.
import { json, banco, sessao, COLECOES, mesmaOrigem } from "../../lib/server.js";
const valido = (p) => { const [c, id, x] = String(p || "").split("/"); return !x && COLECOES.includes(c) && /^[\w.:@+~-]{1,120}$/.test(id || "") ? c : null; };
export async function onRequestPut({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const s = await sessao(request, env); if (!s) return json({ erro: "Entre no app." }, 401); if (s.pausado) return json({ erro: "Acesso pausado." }, 403);
  const b = await request.json().catch(() => null); const col = b && valido(b.path);
  if (!col || !b.data || typeof b.data !== "object") return json({ erro: "Documento inválido.", code: "invalid_argument" }, 400);
  const txt = JSON.stringify(b.data); if (txt.length > 400000) return json({ erro: "Documento grande demais.", code: "invalid_argument" }, 413);
  await (await banco(env)).prepare("INSERT INTO docs (casa, path, col, data, upd, del) VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(casa, path) DO UPDATE SET data = excluded.data, upd = excluded.upd, del = 0")
    .bind(s.casa, b.path, col, txt, Date.now()).run();
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const s = await sessao(request, env); if (!s) return json({ erro: "Entre no app." }, 401); if (s.pausado) return json({ erro: "Acesso pausado." }, 403);
  const path = new URL(request.url).searchParams.get("path"); if (!valido(path)) return json({ erro: "Documento inválido." }, 400);
  await (await banco(env)).prepare("UPDATE docs SET del = 1, data = NULL, upd = ? WHERE casa = ? AND path = ?").bind(Date.now(), s.casa, path).run();
  return json({ ok: true });
}
