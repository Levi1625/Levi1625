// PUT /api/doc {path, data} grava um documento; PUT /api/doc {path, patch} grava só os campos que mudaram
// (junta com o que já está lá, numa operação só: dois aparelhos mexendo ao mesmo tempo não apagam a mudança um do outro);
// DELETE /api/doc?path= apaga.
import { json, banco, sessao, COLECOES, mesmaOrigem } from "../../lib/server.js";
const valido = (p) => { const [c, id, x] = String(p || "").split("/"); return !x && COLECOES.includes(c) && /^[\w.:@+~-]{1,120}$/.test(id || "") ? c : null; };
export async function onRequestPut({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const s = await sessao(request, env); if (!s) return json({ erro: "Entre no app." }, 401); if (s.pausado) return json({ erro: "Acesso pausado." }, 403);
  if (s.papel === "ve") return json({ erro: "Seu acesso é só para ver.", code: "permission_denied" }, 403);
  const b = await request.json().catch(() => null); const col = b && valido(b.path);
  const patch = b && b.patch && typeof b.patch === "object" && !Array.isArray(b.patch) ? b.patch : null;
  if (col && patch) return gravarCampos(env, s, b.path, col, patch);
  if (!col || !b.data || typeof b.data !== "object") return json({ erro: "Documento inválido.", code: "invalid_argument" }, 400);
  const txt = JSON.stringify(b.data); if (txt.length > 400000) return json({ erro: "Documento grande demais.", code: "invalid_argument" }, 413);
  await (await banco(env)).prepare("INSERT INTO docs (casa, path, col, data, upd, del) VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(casa, path) DO UPDATE SET data = excluded.data, upd = excluded.upd, del = 0")
    .bind(s.casa, b.path, col, txt, Date.now()).run();
  return json({ ok: true });
}
async function gravarCampos(env, s, path, col, patch) {
  const ks = Object.keys(patch);
  if (!ks.length || ks.some((k) => !/^[\w.:@+~-]{1,80}$/.test(k))) return json({ erro: "Campo inválido.", code: "invalid_argument" }, 400);
  if (JSON.stringify(patch).length > 400000) return json({ erro: "Documento grande demais.", code: "invalid_argument" }, 413);
  const db = await banco(env);
  for (let i = 0; i < ks.length; i += 40) {   // até 40 campos por vez (limite de parâmetros do banco)
    const parte = ks.slice(i, i + 40), sets = parte.map((_, j) => `'$."${parte[j]}"', json(?${6 + j})`).join(", ");
    await db.prepare(`INSERT INTO docs (casa, path, col, data, upd, del) VALUES (?1, ?2, ?3, ?4, ?5, 0)
      ON CONFLICT(casa, path) DO UPDATE SET data = json_set(CASE WHEN docs.del = 0 AND docs.data IS NOT NULL THEN docs.data ELSE '{}' END, ${sets}), upd = MAX(excluded.upd, docs.upd + 1), del = 0`)
      .bind(s.casa, path, col, JSON.stringify(Object.fromEntries(parte.map((k) => [k, patch[k]]))), Date.now(), ...parte.map((k) => JSON.stringify(patch[k] === undefined ? null : patch[k]))).run();
  }
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const s = await sessao(request, env); if (!s) return json({ erro: "Entre no app." }, 401); if (s.pausado) return json({ erro: "Acesso pausado." }, 403);
  if (s.papel === "ve") return json({ erro: "Seu acesso é só para ver.", code: "permission_denied" }, 403);
  const path = new URL(request.url).searchParams.get("path"); if (!valido(path)) return json({ erro: "Documento inválido." }, 400);
  await (await banco(env)).prepare("UPDATE docs SET del = 1, data = NULL, upd = ? WHERE casa = ? AND path = ?").bind(Date.now(), s.casa, path).run();
  return json({ ok: true });
}
