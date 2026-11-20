/* Bolso em Dia — app próprio (Cloudflare, sem Google).
   Liga o mesmo código do app ao servidor próprio (/api/...): login com e-mail e senha,
   dados da casa sincronizados, IA do Claude, microfone do navegador e downloads.
   O app chama window.claude.use(nome), igual ao artefato do Claude. */
(function () {
  'use strict';
  // Endereço de uma versão antiga (ex.: 3ef6f369.bolso-em-dia.pages.dev) nunca recebe atualização: manda para o endereço principal.
  const antigo = location.hostname.match(/^[0-9a-f]{8}\.(.+\.pages\.dev)$/);
  if (antigo) { location.replace('https://' + antigo[1] + location.pathname + location.hash); return; }
  let resolverLogin; const logado = new Promise(r => { resolverLogin = r; });
  let eu = null, casa = null;

  /* ---------- chamadas ao servidor ---------- */
  async function api(metodo, url, corpo) {
    const r = await fetch(url, {method:metodo, credentials:'same-origin', headers:corpo ? {'content-type':'application/json'} : {}, body:corpo ? JSON.stringify(corpo) : undefined});
    const out = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(out.erro || 'Falha no servidor'); e.status = r.status; e.code = out.code || (r.status === 429 ? 'rate_limited' : r.status === 401 || r.status === 403 ? 'not_granted' : 'upstream_error'); throw e; }
    return out;
  }

  /* ---------- tela de entrada ---------- */
  const css = `#bl-login{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#F2F4F7;font-family:Inter,system-ui,sans-serif;padding:16px}
#bl-login .bx{background:#fff;border-radius:18px;padding:26px 22px;max-width:380px;width:100%;box-shadow:0 10px 30px rgba(16,26,44,.08)}
#bl-login h1{font:600 1.5rem Sora,Inter,sans-serif;margin:0 0 4px;color:#101A2C}#bl-login p{color:#5B6475;margin:0 0 16px;font-size:.92rem}
#bl-login input{width:100%;box-sizing:border-box;border:1px solid #D5DBEA;border-radius:12px;padding:12px;margin-bottom:10px;font:inherit}
#bl-login button{width:100%;border:0;border-radius:12px;padding:12px;font:600 1rem Inter,sans-serif;cursor:pointer;margin-bottom:8px}
#bl-login .pri{background:#1D3FBF;color:#fff}#bl-login .sec{background:#E9EDF3;color:#101A2C}#bl-login .lk{background:none;color:#1D3FBF;font-weight:500;padding:6px}
#bl-login .msg{min-height:20px;font-size:.88rem;color:#C0392B;margin:4px 0 8px}#bl-login .dica{font-size:.8rem;color:#5B6475;margin-top:6px}
@media (prefers-color-scheme: dark){#bl-login{background:#0E1420}#bl-login .bx{background:#161E2E}#bl-login h1{color:#EEF2F8}#bl-login input{background:#0E1420;color:#EEF2F8;border-color:#2A3446}#bl-login .sec{background:#222C3E;color:#EEF2F8}}`;
  function telaLogin(aviso) {
    if (document.getElementById('bl-login')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'bl-login';
    d.innerHTML = `<div class="bx"><h1>Bolso em Dia</h1><p id="bl-p">${aviso || 'Entre com seu e-mail e senha.'}</p>
      <input id="bl-n" placeholder="Seu nome (ex.: Levi)" autocomplete="name" style="display:none">
      <input id="bl-e" type="email" placeholder="E-mail" autocomplete="email"><input id="bl-s" type="password" placeholder="Senha (mínimo 6 letras ou números)" autocomplete="current-password">
      <div class="msg" id="bl-m"></div>
      <button class="pri" id="bl-ok">Entrar</button><button class="sec" id="bl-troca">Primeiro acesso: criar minha senha</button>
      <div class="dica">Esqueceu a senha? Peça para outra pessoa da casa, em Ajustes, tirar e colocar seu e-mail de novo. Depois toque em "Primeiro acesso".</div></div>`;
    document.body.appendChild(d);
    const $ = id => document.getElementById(id); let criar = false;
    const msg = (t, ok) => { $('bl-m').style.color = ok ? '#14804a' : '#C0392B'; $('bl-m').textContent = t || ''; };
    $('bl-troca').onclick = () => { criar = !criar; $('bl-n').style.display = criar ? '' : 'none'; $('bl-ok').textContent = criar ? 'Criar senha e entrar' : 'Entrar'; $('bl-troca').textContent = criar ? 'Já tenho senha: entrar' : 'Primeiro acesso: criar minha senha'; $('bl-s').autocomplete = criar ? 'new-password' : 'current-password'; msg(); };
    const ir = async () => { msg(); $('bl-ok').disabled = true;
      try { await api('POST', criar ? '/api/criar' : '/api/entrar', {email:$('bl-e').value, senha:$('bl-s').value, nome:$('bl-n').value}); await iniciar(); }
      catch (e) { msg(e.status ? e.message : 'Sem internet agora. Tente de novo.'); }
      if ($('bl-ok')) $('bl-ok').disabled = false; };
    $('bl-ok').onclick = ir; $('bl-s').onkeydown = e => { if (e.key === 'Enter') ir(); };
  }
  const tirarLogin = () => { const d = document.getElementById('bl-login'); if (d) d.remove(); };

  /* ---------- dados: cópia local + sincronização + fila sem internet ---------- */
  const LS = k => 'bolso:' + (eu ? eu.email : '') + ':' + k;
  const ler = (k, padrao) => { try { const v = localStorage.getItem(LS(k)); return v ? JSON.parse(v) : padrao; } catch (_) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch (_) {} };
  let store = {}, since = 0, fila = {}, sincronizado = false, subs = [];
  const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
  const colDe = p => p.split('/')[0];
  const snapCol = col => ({docs:Object.keys(store).filter(p => colDe(p) === col).map(p => ({id:p.split('/')[1], data:() => clone(store[p])})), metadata:{fromCache:!sincronizado, hasPendingWrites:Object.keys(fila).length > 0}});
  const snapDoc = p => ({id:p.split('/')[1], exists:p in store, data:() => clone(store[p]), metadata:{fromCache:!sincronizado, hasPendingWrites:p in fila}});
  let emitirT = null; const emitir = () => { clearTimeout(emitirT); emitirT = setTimeout(() => subs.forEach(s => { try { s.cb(s.col ? snapCol(s.col) : snapDoc(s.path)); } catch (e) { console.error(e); } }), 0); };
  const salvarLocal = () => { gravar('store', store); gravar('since', since); gravar('fila', fila); };

  let enviando = null, deNovo = false;
  function enviarFila() { if (enviando) { deNovo = true; return enviando; } enviando = (async () => { do { deNovo = false; await enviarFilaAgora(); } while (deNovo); enviando = null; })(); return enviando; }
  async function enviarFilaAgora() {
    for (const [p, op] of Object.entries(fila)) {
      try { if (op.del) await api('DELETE', '/api/doc?path=' + encodeURIComponent(p)); else await api('PUT', '/api/doc', {path:p, data:op.data}); if (fila[p] === op) delete fila[p]; }
      catch (e) { if (e.status === 400 || e.status === 413 || (e.status === 403 && /só para ver|pausado/.test(e.message || ''))) { delete fila[p]; console.error('descartado', p, e.message); } else if (e.status === 401) { telaLogin('Sua sessão expirou. Entre de novo.'); break; } else break; }
    }
    salvarLocal();
  }
  let sincronizando = false;
  async function sincronizar() {
    if (sincronizando || !eu) return; sincronizando = true;
    try {
      await enviarFila();
      const r = await api('GET', '/api/sync?since=' + Math.max(0, since - 2000));
      let mudou = !sincronizado;
      for (const d of r.docs) { if (d.path in fila) continue; if (d.del) { if (d.path in store) { delete store[d.path]; mudou = true; } } else if (JSON.stringify(store[d.path]) !== JSON.stringify(d.data)) { store[d.path] = d.data; mudou = true; } }
      since = r.agora; casa = r.casa || casa; sincronizado = true; salvarLocal();
      if (r.papel && eu && r.papel !== eu.papel) { try { localStorage.removeItem('bolso:ultimo'); } catch (_) {} location.reload(); return; }
      if (mudou) emitir();
    } catch (e) { if (e.status === 401) telaLogin('Sua sessão expirou. Entre de novo.'); }
    sincronizando = false;
  }
  let salvarT = null;
  function escrever(p, op) { if (eu && eu.papel === 've') { const e = new Error('Seu acesso é só para ver.'); e.code = 'permission_denied'; return Promise.reject(e); } if (op.del) delete store[p]; else store[p] = clone(op.data); fila[p] = op; clearTimeout(salvarT); salvarT = setTimeout(salvarLocal, 300); emitir(); enviarFila().catch(() => {}); return Promise.resolve(); }
  const novoId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
  const docRef = p => ({id:p.split('/')[1], path:p,
    set: d => escrever(p, {data:d}), delete: () => escrever(p, {del:true}), get: async () => snapDoc(p),
    onSnapshot: (cb, err) => { const s = {path:p, cb}; subs.push(s); setTimeout(() => cb(snapDoc(p)), 0); return () => { subs = subs.filter(x => x !== s); }; }});
  const db = {
    doc: p => docRef(p),
    collection: col => ({doc: id => docRef(col + '/' + (id || novoId())),
      onSnapshot: (cb, err) => { const s = {col, cb}; subs.push(s); setTimeout(() => cb(snapCol(col)), 0); return () => { subs = subs.filter(x => x !== s); }; }}),
  };

  /* ---------- casa e pessoa ---------- */
  function publicarCasa() {
    window.__casa = {
      email: () => eu.email,
      membros: () => (casa && casa.membros || []).slice(),
      add: async (e, papel) => { const r = await api('POST', '/api/casa', {acao:'add', email:e, papel}); casa = r.casa; },
      papel: () => eu && eu.papel || 'dono',
      papelDe: e => (casa && casa.papeis || {})[e] || 've',
      dono: () => casa && casa.dono || '',
      setPapel: async (e, valor) => { const r = await api('POST', '/api/casa', {acao:'papel', email:e, valor}); casa = r.casa; },
      remove: async e => { const r = await api('POST', '/api/casa', {acao:'remove', email:e}); casa = r.casa; },
      sair: async () => { await api('POST', '/api/sair').catch(() => {}); location.reload(); },
      ia: () => !casa || casa.ia !== false,
      setIA: async v => { await api('POST', '/api/casa', {acao:'ia', valor:!!v}); location.reload(); },
      usoIA: () => { const m = new Date().toISOString().slice(0, 7), u = (casa && casa.uso || {})[m] || {}; return {usd:+u.usd || 0, n:+u.n || 0, limite:casa && casa.iaLimite}; },
      whats: () => ({numero:casa && casa.whatsapp || '', temChave:!!(casa && casa.temChaveWhats), ligado:!casa || casa.lembretes !== false}),
      setWhats: async (numero, chave, ligado) => { const r = await api('POST', '/api/casa', {acao:'whats', numero, chave, lembretes:ligado}); casa = r.casa; },
      testarWhats: () => api('POST', '/api/casa', {acao:'testarWhats'}),
      iaDetalhe: () => api('GET', '/api/iauso'),
      iaCredito: usd => api('POST', '/api/iauso', {usd}),
      iaSaldo: saldo => api('POST', '/api/iauso', {saldo}),
    };
    if (eu.admin) window.__admin = {
      listar: () => api('GET', '/api/admin'),
      add: (email, nome) => api('POST', '/api/admin', {acao:'add', email, nome}),
      pausar: (id, valor) => api('POST', '/api/admin', {acao:'pausar', id, valor}),
      limite: (id, valor) => api('POST', '/api/admin', {acao:'limite', id, valor}),
      remover: id => api('POST', '/api/admin', {acao:'remover', id}),
    };
  }
  async function iniciar() {
    let r;
    try { r = await api('GET', '/api/eu'); }
    catch (e) {
      if (e.status === 401) { telaLogin(); return; }
      if (e.status === 503 || e.status === 403) { telaLogin(e.message); return; }
      const ultimo = (() => { try { return JSON.parse(localStorage.getItem('bolso:ultimo') || 'null'); } catch (_) { return null; } })();
      if (!ultimo) { telaLogin('Sem internet agora. Conecte e tente de novo.'); return; }
      r = ultimo; // sem internet: abre com a cópia guardada no celular
    }
    eu = {email:r.email, nome:r.nome, admin:!!r.admin, papel:r.papel || 'dono'}; casa = r.casa;
    try { localStorage.setItem('bolso:ultimo', JSON.stringify({email:r.email, nome:r.nome, admin:!!r.admin, papel:eu.papel, casa:r.casa})); } catch (_) {}
    store = ler('store', {}); since = ler('since', 0); fila = eu.papel === 've' ? {} : ler('fila', {});
    publicarCasa(); tirarLogin(); resolverLogin();
    sincronizar();
    setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });
    window.addEventListener('online', sincronizar);
  }

  const user = {
    id: async () => eu && eu.email,
    me: async () => ({id:eu.email, name:eu.nome || eu.email}),
    isOwner: async () => true, canEdit: async () => true, can: async () => true,
    profiles: async ids => Object.fromEntries(ids.map(i => [i, {name:(casa && casa.nomes && casa.nomes[i]) || ''}])),
  };

  /* ---------- IA do Claude (pelo servidor, com a sua chave) ---------- */
  const blobB64 = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(b); });
  async function ia(input, opts, json) {
    const images = opts && opts.images ? await Promise.all(opts.images.map(async b => ({media_type:b.type || 'image/jpeg', data:await blobB64(b)}))) : [];
    const txt = Array.isArray(input) ? input.map(m => m.content).join(' ') : String(input || '');
    const tipo = /converte mensagens/.test(txt) ? 'lançamento' : /corrigir lançamentos/.test(txt) ? 'correção' : /contracheque|holerite/i.test(txt) ? 'leitura de contracheque' : /extrato|fatura/i.test(txt) && images.length ? 'leitura de extrato' : /categoriza/.test(txt) ? 'categoria' : json ? 'outro' : 'pergunta';
    const out = await api('POST', '/api/ia', {input, json, images, tipo, rapido:opts && opts.modelTier === 'quick'});
    if (out.custo_usd > 0 && casa) { const m = new Date().toISOString().slice(0, 7); casa.uso = casa.uso || {}; const u = casa.uso[m] || {usd:0, n:0}; casa.uso[m] = {usd:u.usd + out.custo_usd, n:u.n + 1}; }
    return out;
  }
  const sample = async (input, opts) => { const o = await ia(input, opts, false); if (opts && opts.onText) opts.onText({text:o.text, delta:o.text}); return {text:o.text, truncated:false}; };
  sample.json = async (input, opts) => (await ia(input, opts, true)).value;
  sample.limits = async () => ({images:true});

  const downloads = {save: async ({filename, data}) => { const blob = data instanceof Blob ? data : new Blob([data], {type:/\.json$/.test(filename) ? 'application/json' : 'text/plain;charset=utf-8'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }};

  /* ---------- microfone do navegador (Chrome no celular e no computador) ---------- */
  function ditado() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return null;
    const H = {p:[], f:[], s:[]}; let rec = null, estado = 'idle', fim = null;
    const emite = (k, v) => H[k].forEach(h => { try { h(v); } catch (_) {} });
    const muda = (st, reason) => { estado = st; emite('s', reason ? {state:st, reason} : {state:st}); };
    return {
      start(o) { if (rec) return Promise.resolve(); return new Promise((ok, no) => {
        rec = new SR(); rec.lang = (o && o.language) || 'pt-BR'; rec.interimResults = true; rec.continuous = true;
        let razao = 'stopped', inicio = true;
        rec.onstart = () => { muda('listening'); ok(); };
        rec.onresult = ev => { let parcial = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) { emite('f', {text:(inicio ? '' : ' ') + r[0].transcript.trim()}); inicio = false; } else parcial += r[0].transcript; } emite('p', {text:parcial}); };
        rec.onerror = e => { razao = e.error === 'not-allowed' ? 'not_granted' : e.error === 'no-speech' ? 'stopped' : 'upstream_error'; if (estado === 'starting') no(Object.assign(new Error(razao), {code:razao})); };
        rec.onend = () => { rec = null; muda('idle', razao); if (fim) { fim(); fim = null; } };
        muda('starting'); try { rec.start(); } catch (e) { rec = null; muda('idle', 'upstream_error'); no(Object.assign(new Error('upstream_error'), {code:'upstream_error'})); }
      }); },
      stop() { if (!rec) return Promise.resolve(); return new Promise(ok => { fim = ok; muda('finishing'); rec.stop(); }); },
      active: () => estado !== 'idle',
      onPartial: h => (H.p.push(h), () => { H.p = H.p.filter(x => x !== h); }),
      onFinal: h => (H.f.push(h), () => { H.f = H.f.filter(x => x !== h); }),
      onState: h => (H.s.push(h), () => { H.s = H.s.filter(x => x !== h); }),
    };
  }
  const dict = ditado();

  window.claude = {use: async nome => {
    if (nome === 'downloads') return downloads;
    if (nome === 'dictation') return dict;
    await logado;
    if (nome === 'sample' && casa && casa.ia === false) return null;
    return {db, user, sample}[nome] || null;
  }};

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  /* ---------- instalar como app e atualizar sozinho ---------- */
  let pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; window.dispatchEvent(new Event('bolso-instalar')); });
  window.__instalar = {
    instalado: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    ios: () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    safari: () => !/crios|fxios|edgios|opios/i.test(navigator.userAgent),
    celular: () => /android|iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    pode: () => !!pedidoInstalar,
    abrir: async () => { if (!pedidoInstalar) return false; pedidoInstalar.prompt(); const r = await pedidoInstalar.userChoice.catch(() => ({})); pedidoInstalar = null; return r.outcome === 'accepted'; },
  };
  if ('serviceWorker' in navigator) window.addEventListener('load', async () => {
    try {
      const tinha = !!navigator.serviceWorker.controller; let recarregou = false;
      const reg = await navigator.serviceWorker.register('sw.js', {updateViaCache:'none'});
      // Quando sai uma versão nova, o app troca sozinho (sem precisar apagar e instalar de novo).
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!tinha || recarregou) return; recarregou = true; try { sessionStorage.setItem('bolso:atualizou', '1'); } catch (_) {} location.reload(); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 20 * 60e3);
    } catch (_) {}
  });
})();
