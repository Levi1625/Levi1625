(function(){
  const seed = window.__SEED || {};
  const store = {}; // path -> data
  for (const [col, docs] of Object.entries(seed)) for (const [id, d] of Object.entries(docs)) store[col + '/' + id] = JSON.parse(JSON.stringify(d));
  const subs = [];
  const notify = () => setTimeout(() => subs.forEach(s => s()), 0);
  const snapDoc = (path) => ({id: path.split('/').pop(), exists: path in store, data: () => store[path], metadata: {fromCache: false, hasPendingWrites: false}});
  const docRef = path => ({id: path.split('/').pop(), path,
    set: async d => { store[path] = JSON.parse(JSON.stringify(d)); notify(); },
    update: async d => { store[path] = {...(store[path] || {}), ...JSON.parse(JSON.stringify(d))}; notify(); },
    // mudanças por caminho, como o servidor faz (o teste lê window.__opsLog para ver o que foi mandado)
    campos: async ops => { (window.__opsLog = window.__opsLog || []).push(JSON.parse(JSON.stringify(ops))); const d = JSON.parse(JSON.stringify(store[path] || {}));
      for (const op of ops) { let o = d; for (let i = 0; i < op.p.length - 1; i++) { const k = op.p[i]; if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {}; o = o[k]; } const k = op.p[op.p.length - 1]; if (op.del) delete o[k]; else o[k] = JSON.parse(JSON.stringify(op.v)); }
      store[path] = d; notify(); },
    delete: async () => { delete store[path]; notify(); },
    get: async () => snapDoc(path),
    onSnapshot: (next) => { const f = () => next(snapDoc(path)); subs.push(f); setTimeout(f, 5); return () => {}; },
  });
  let n = 0;
  const colRef = col => ({path: col,
    doc: id => docRef(col + '/' + (id || ('auto' + (++n) + Math.random().toString(36).slice(2, 6)))),
    onSnapshot: (next) => { const f = () => { const docs = Object.keys(store).filter(p => p.startsWith(col + '/') && p.split('/').length === 2).map(snapDoc); next({docs, size: docs.length, empty: !docs.length, metadata: {fromCache: false}}); }; subs.push(f); setTimeout(f, 5); return () => {}; },
  });
  const db = {doc: docRef, collection: colRef, mescla: true};
  const user = {id: async () => 'u_me', isOwner: async () => true, can: async () => true, profiles: async ids => Object.fromEntries(ids.map(i => [i, {name: 'Pessoa Teste'}]))};
  const sample = async (p, o) => { window.__lastPrompt = p; const t = 'Resposta de teste do Claude.'; o?.onText?.({text: t}); return {text: t}; };
  sample.json = async p => window.__AI || {itens: []};
  const caps = {db, user, sample, downloads: {save: async () => {}}};
  window.claude = {use: async name => caps[name] || null};
  window.__store = store;
})();
