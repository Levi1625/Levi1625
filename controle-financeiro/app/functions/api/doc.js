// PUT /api/doc {path, data} grava um documento; PUT /api/doc {path, patch} grava só os campos que mudaram
// (junta com o que já está lá, numa operação só: dois aparelhos mexendo ao mesmo tempo não apagam a mudança um do outro);
// PUT /api/doc {path, ops:[{p:["orc","Compras"], v:300}, {p:["orc","Lazer"], del:true}]} muda só aqueles caminhos (até 4 níveis):
// duas pessoas mexendo em categorias diferentes do mesmo ajuste ao mesmo tempo não se atropelam.
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
  if (col && b && Array.isArray(b.ops)) return gravarOps(env, s, b.path, col, b.ops);
  if (!col || !b.data || typeof b.data !== "object") return json({ erro: "Documento inválido.", code: "invalid_argument" }, 400);
  const txt = JSON.stringify(b.data); if (txt.length > 400000) return json({ erro: "Documento grande demais.", code: "invalid_argument" }, 413);
  await (await banco(env)).prepare("INSERT INTO docs (casa, path, col, data, upd, del) VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(casa, path) DO UPDATE SET data = excluded.data, upd = MAX(excluded.upd, docs.upd + 1), del = 0")
    .bind(s.casa, b.path, col, txt, Date.now()).run();
  return json({ ok: true });
}
const PROIBIDO = new Set(["__proto__", "constructor", "prototype"]);
const opOk = (o) => o && Array.isArray(o.p) && o.p.length >= 1 && o.p.length <= 4 && o.p.every((k) => typeof k === "string" && k.length >= 1 && k.length <= 100 && !/[\u0000-\u001f]/.test(k) && !PROIBIDO.has(k)) && (o.del === true || "v" in o);
export function aplicarOps(doc, ops) {
  const d = doc && typeof doc === "object" && !Array.isArray(doc) ? JSON.parse(JSON.stringify(doc)) : {};
  for (const op of ops) { let o = d; for (let i = 0; i < op.p.length - 1; i++) { const k = op.p[i]; if (!o[k] || typeof o[k] !== "object" || Array.isArray(o[k])) o[k] = {}; o = o[k]; }
    const k = op.p[op.p.length - 1]; if (op.del) delete o[k]; else o[k] = op.v === undefined ? null : op.v; }
  return d;
}
async function gravarOps(env, s, path, col, ops) {
  if (!ops.length || ops.length > 200 || !ops.every(opOk)) return json({ erro: "Mudança inválida.", code: "invalid_argument" }, 400);
  if (JSON.stringify(ops).length > 400000) return json({ erro: "Documento grande demais.", code: "invalid_argument" }, 413);
  const db = await banco(env);
  // lê, aplica e grava só se ninguém gravou no meio (senão lê de novo): nenhuma mudança se perde
  for (let i = 0; i < 12; i++) {
    const r = await db.prepare("SELECT data, upd, del FROM docs WHERE casa = ? AND path = ?").bind(s.casa, path).first();
    const txt = JSON.stringify(aplicarOps(r && !r.del && r.data ? JSON.parse(r.data) : {}, ops)); if (txt.length > 400000) return json({ erro: "Documento grande demais.", code: "invalid_argument" }, 413);
    const agora = Math.max(Date.now(), r ? (+r.upd || 0) + 1 : 0);
    const x = r ? await db.prepare("UPDATE docs SET data = ?, upd = ?, del = 0 WHERE casa = ? AND path = ? AND upd = ?").bind(txt, agora, s.casa, path, r.upd).run()
      : await db.prepare("INSERT INTO docs (casa, path, col, data, upd, del) VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(casa, path) DO NOTHING").bind(s.casa, path, col, txt, agora).run();
    if (x.meta && x.meta.changes) return json({ ok: true });
    await new Promise((ok) => setTimeout(ok, 10 + Math.random() * 40));
  }
  return json({ erro: "Muitas mudanças ao mesmo tempo. Tente de novo.", code: "aborted" }, 409);
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
