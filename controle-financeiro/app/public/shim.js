/* Bolso em Dia — app próprio.
   Liga o mesmo código do app a serviços próprios: Firebase (login e dados),
   /api/ia (Claude pela sua chave, no Cloudflare), microfone do navegador e downloads.
   O app chama window.claude.use(nome), igual ao artefato do Claude. */
(function () {
  'use strict';
  const cfg = window.BOLSO_CONFIG || {};
  const pronto = !!(cfg.firebase && cfg.firebase.apiKey);
  let resolverLogin; const logado = new Promise(r => { resolverLogin = r; });
  let fs = null, auth = null, casaRef = null, casaDados = null, BASE = '';

  /* ---------- tela de entrada ---------- */
  const css = `#bl-login{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#F2F4F7;font-family:Inter,system-ui,sans-serif;padding:16px}
#bl-login .bx{background:#fff;border-radius:18px;padding:26px 22px;max-width:380px;width:100%;box-shadow:0 10px 30px rgba(16,26,44,.08)}
#bl-login h1{font:600 1.5rem Sora,Inter,sans-serif;margin:0 0 4px;color:#101A2C}#bl-login p{color:#5B6475;margin:0 0 16px;font-size:.92rem}
#bl-login input{width:100%;box-sizing:border-box;border:1px solid #D5DBEA;border-radius:12px;padding:12px;margin-bottom:10px;font:inherit}
#bl-login button{width:100%;border:0;border-radius:12px;padding:12px;font:600 1rem Inter,sans-serif;cursor:pointer;margin-bottom:8px}
#bl-login .pri{background:#1D3FBF;color:#fff}#bl-login .sec{background:#E9EDF3;color:#101A2C}#bl-login .lk{background:none;color:#1D3FBF;font-weight:500;padding:6px}
#bl-login .msg{min-height:20px;font-size:.88rem;color:#C0392B;margin:4px 0 8px}
@media (prefers-color-scheme: dark){#bl-login{background:#0E1420}#bl-login .bx{background:#161E2E}#bl-login h1{color:#EEF2F8}#bl-login input{background:#0E1420;color:#EEF2F8;border-color:#2A3446}#bl-login .sec{background:#222C3E;color:#EEF2F8}}`;
  function telaLogin(aviso) {
    if (document.getElementById('bl-login')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'bl-login';
    d.innerHTML = `<div class="bx"><h1>Bolso em Dia</h1><p>${aviso || 'Entre com seu e-mail para ver e lançar suas finanças.'}</p>
      <input id="bl-e" type="email" placeholder="E-mail" autocomplete="email"><input id="bl-s" type="password" placeholder="Senha (mínimo 6 letras ou números)" autocomplete="current-password">
      <div class="msg" id="bl-m"></div>
      <button class="pri" id="bl-in">Entrar</button><button class="sec" id="bl-novo">Criar minha conta</button>
      <button class="sec" id="bl-g">Entrar com Google</button><button class="lk" id="bl-esq">Esqueci a senha</button></div>`;
    document.body.appendChild(d);
    const $ = id => document.getElementById(id), msg = t => { $('bl-m').textContent = t || ''; };
    const erro = e => ({'auth/invalid-credential':'E-mail ou senha errados.','auth/wrong-password':'Senha errada.','auth/user-not-found':'Conta não encontrada. Toque em Criar minha conta.','auth/email-already-in-use':'Este e-mail já tem conta. Toque em Entrar.','auth/weak-password':'A senha precisa de pelo menos 6 caracteres.','auth/invalid-email':'E-mail inválido.','auth/popup-closed-by-user':'Entrada cancelada.'}[e && e.code] || 'Não deu certo agora. Confira a internet e tente de novo.');
    $('bl-in').onclick = () => { msg(); auth.signInWithEmailAndPassword($('bl-e').value.trim(), $('bl-s').value).catch(e => msg(erro(e))); };
    $('bl-novo').onclick = () => { msg(); auth.createUserWithEmailAndPassword($('bl-e').value.trim(), $('bl-s').value).catch(e => msg(erro(e))); };
    $('bl-g').onclick = () => { msg(); auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => msg(erro(e))); };
    $('bl-esq').onclick = () => { const e = $('bl-e').value.trim(); if (!e) return msg('Escreva seu e-mail primeiro.'); auth.sendPasswordResetEmail(e).then(() => { $('bl-m').style.color = '#14804a'; msg('Enviamos um e-mail para criar uma nova senha.'); }).catch(x => msg(erro(x))); };
  }
  const tirarLogin = () => { const d = document.getElementById('bl-login'); if (d) d.remove(); };

  /* ---------- casa (dados compartilhados entre as pessoas da casa) ---------- */
  async function abrirCasa(u) {
    const email = (u.email || '').toLowerCase();
    const q = await fs.collection('casas').where('membros', 'array-contains', email).limit(1).get();
    if (!q.empty) casaRef = q.docs[0].ref;
    else { casaRef = fs.collection('casas').doc(u.uid); await casaRef.set({dono:u.uid, membros:[email], nomes:{[u.uid]:u.displayName || email.split('@')[0]}, criado:new Date().toISOString()}); }
    await casaRef.set({nomes:{[u.uid]:u.displayName || email.split('@')[0]}}, {merge:true}).catch(() => {});
    casaRef.onSnapshot(s => { casaDados = s.data() || {}; });
    casaDados = (await casaRef.get()).data() || {};
    BASE = `casas/${casaRef.id}/`;
    window.__casa = {
      email: () => email,
      membros: () => (casaDados.membros || []).slice(),
      add: async e => { e = String(e || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('E-mail inválido.'); await casaRef.update({membros:firebase.firestore.FieldValue.arrayUnion(e)}); },
      remove: async e => { await casaRef.update({membros:firebase.firestore.FieldValue.arrayRemove(e)}); },
      sair: () => auth.signOut().then(() => location.reload()),
      ia: () => casaDados.ia !== false,
      setIA: async v => { await casaRef.set({ia:!!v}, {merge:true}); location.reload(); },
      usoIA: () => { const m = new Date().toISOString().slice(0, 7), u = (casaDados.iaUso || {})[m] || {}; return {usd:+u.usd || 0, n:+u.n || 0}; },
    };
  }

  if (pronto) {
    firebase.initializeApp(cfg.firebase);
    auth = firebase.auth(); fs = firebase.firestore();
    fs.enablePersistence({synchronizeTabs:true}).catch(() => {});
    auth.onAuthStateChanged(async u => {
      if (!u) { telaLogin(); return; }
      try { await abrirCasa(u); tirarLogin(); resolverLogin(u); }
      catch (e) { console.error(e); telaLogin('Não consegui abrir seus dados. Confira a internet e entre de novo.'); }
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => telaLogin('Falta configurar o Firebase (arquivo config.js). Veja o passo a passo do SETUP.'));
  }

  /* ---------- capacidades no mesmo formato do artefato ---------- */
  const db = {
    doc: p => fs.doc(BASE + p),
    collection: p => fs.collection(BASE + p),
  };
  const user = {
    id: async () => auth.currentUser && auth.currentUser.uid,
    me: async () => ({id:auth.currentUser.uid, name:auth.currentUser.displayName || auth.currentUser.email}),
    isOwner: async () => true, canEdit: async () => true, can: async () => true,
    profiles: async ids => Object.fromEntries(ids.map(i => [i, {name:(casaDados && casaDados.nomes && casaDados.nomes[i]) || ''}])),
  };
  const blobB64 = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(b); });
  async function ia(input, opts, json) {
    const token = await auth.currentUser.getIdToken();
    const images = opts && opts.images ? await Promise.all(opts.images.map(async b => ({media_type:b.type || 'image/jpeg', data:await blobB64(b)}))) : [];
    const r = await fetch('/api/ia', {method:'POST', headers:{'content-type':'application/json', authorization:'Bearer ' + token}, body:JSON.stringify({input, json, images, rapido:opts && opts.modelTier === 'quick'}), signal:opts && opts.signal});
    const out = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(out.erro || 'Falha na IA'); e.code = r.status === 429 ? 'rate_limited' : r.status === 401 || r.status === 403 ? 'not_granted' : 'upstream_error'; throw e; }
    if (out.custo_usd > 0) { const m = new Date().toISOString().slice(0, 7), inc = firebase.firestore.FieldValue.increment; casaRef.set({iaUso:{[m]:{usd:inc(out.custo_usd), n:inc(1)}}}, {merge:true}).catch(() => {}); }
    return out;
  }
  const sample = async (input, opts) => { const o = await ia(input, opts, false); if (opts && opts.onText) opts.onText({text:o.text, delta:o.text}); return {text:o.text, truncated:false}; };
  sample.json = async (input, opts) => (await ia(input, opts, true)).value;
  sample.limits = async () => ({images:true});
  const downloads = {save: async ({filename, data}) => { const blob = data instanceof Blob ? data : new Blob([data], {type:/\.json$/.test(filename) ? 'application/json' : 'text/plain;charset=utf-8'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }};

  /* microfone do navegador (Chrome no celular e no computador) */
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
        rec.onresult = ev => { let parcial = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) emite('f', {text:(inicio ? '' : ' ') + r[0].transcript.trim()}), inicio = false; else parcial += r[0].transcript; } emite('p', {text:parcial}); };
        rec.onerror = e => { razao = e.error === 'not-allowed' ? 'not_granted' : e.error === 'no-speech' ? 'stopped' : 'upstream_error'; if (estado === 'starting') { const x = new Error(razao); x.code = razao; no(x); } };
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
    if (!pronto) return null;
    await logado;
    if (nome === 'sample' && casaDados && casaDados.ia === false) return null;
    return {db, user, sample}[nome] || null;
  }};

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
