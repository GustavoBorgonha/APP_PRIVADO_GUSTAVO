// Login com Google + sincronização em tempo real (Firebase).
// Só é ativado quando firebase-config.js está preenchido.
const cfg = window.FIREBASE_CONFIG;
const App = window.App;
const COLECOES = ['lancamentos', 'planos'];

// JSON com chaves ordenadas, para comparar objetos de forma estável.
const estavel = v => JSON.stringify(v, (k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(c => [c, x[c]])) : x);

if (cfg && cfg.apiKey) {
  iniciar().catch(e => {
    console.error(e);
    App.mostrarLogin('Não foi possível conectar. Verifique sua internet e recarregue a página. (' + (e.message || e) + ')');
  });
}

async function iniciar() {
  const url = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [{ initializeApp }, A, F] = await Promise.all([
    import(url + 'firebase-app.js'), import(url + 'firebase-auth.js'), import(url + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  // Cache local: o app continua funcionando sem internet e sincroniza depois.
  const fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });

  const EXTRAS = ['categorias', 'agendados'];   // coleções que podem ainda não estar nas regras do Firebase
  const enviado = { lancamentos: new Map(), planos: new Map(), categorias: new Map(), agendados: new Map() }; // id -> JSON já sincronizado
  let escutas = [];

  App.entrar = () => A.signInWithPopup(auth, new A.GoogleAuthProvider()).catch(e => {
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') App.mostrarLogin('Erro ao entrar: ' + e.message);
  });
  App.sair = () => A.signOut(auth);

  // Envia só o que mudou desde a última sincronização.
  // As categorias vão num lote separado: se as regras ainda não aceitarem, os lançamentos não são afetados.
  App.sincronizar = db => {
    gravar(COLECOES, db, e => { console.error(e); alert('Não foi possível salvar na nuvem: ' + e.message); });
    EXTRAS.forEach(c => { if (!App.semNuvem[c]) gravar([c], db, e => App.semExtraNaNuvem(c, e)); });
  };
  function gravar(colecoes, db, erro) {
    const ops = [];
    for (const c of colecoes) {
      if (!Array.isArray(db[c])) continue;
      const atuais = new Map(db[c].map(x => [x.id, estavel(x)]));
      for (const [id, j] of atuais) if (enviado[c].get(id) !== j) ops.push(b => b.set(F.doc(fs, c, id), JSON.parse(j)));
      for (const id of enviado[c].keys()) if (!atuais.has(id)) ops.push(b => b.delete(F.doc(fs, c, id)));
      enviado[c] = atuais;
    }
    for (let i = 0; i < ops.length; i += 400) {
      const lote = F.writeBatch(fs);
      ops.slice(i, i + 400).forEach(op => op(lote));
      lote.commit().catch(erro);
    }
  }

  // Triagem de extrato em andamento: um documento só (triagens/atual), compartilhado entre os aparelhos.
  const refTriagem = F.doc(fs, 'triagens', 'atual');
  App.salvarTriagem = t => {
    const op = t
      ? F.setDoc(refTriagem, { dados: JSON.parse(JSON.stringify(t)), em: Date.now(), por: App.usuario?.email || '' })
      : F.deleteDoc(refTriagem);
    op.catch(e => App.semTriagemNaNuvem(e));
  };

  A.onAuthStateChanged(auth, u => {
    escutas.forEach(parar => parar()); escutas = [];
    if (!u) { App.usuario = null; App.idToken = null; App.mostrarLogin(); return; }
    App.usuario = { nome: u.displayName || '', email: u.email };
    // Prova de login para a ponte da planilha de cidades (Apps Script confere com o Firebase).
    App.idToken = () => u.getIdToken();
    App.carregando();
    const recebido = {};
    let negado = false;
    App.triagemSemNuvem = null; App.semNuvem = {};
    EXTRAS.forEach(c => {
      let recebeu = false;
      escutas.push(F.onSnapshot(F.collection(fs, c), snap => {
        const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        const novo = new Map(docs.map(x => [x.id, estavel(x)]));
        const eco = recebeu && novo.size === enviado[c].size && [...novo].every(([id, j]) => enviado[c].get(id) === j);
        enviado[c] = novo; recebeu = true;
        if (!eco) App.receberExtra(c, docs);
      }, e => App.semExtraNaNuvem(c, e)));
    });
    escutas.push(F.onSnapshot(refTriagem, snap => App.receberTriagem(snap.exists() ? snap.data().dados : null),
      e => App.semTriagemNaNuvem(e)));
    COLECOES.forEach(c => escutas.push(F.onSnapshot(F.collection(fs, c), snap => {
      const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      const novo = new Map(docs.map(x => [x.id, estavel(x)]));
      // Eco do que este aparelho acabou de gravar: a tela já está certa, não precisa redesenhar.
      const eco = recebido[c] && novo.size === enviado[c].size && [...novo].every(([id, j]) => enviado[c].get(id) === j);
      enviado[c] = novo;
      recebido[c] = true;
      if (eco) return;
      App.receber(c, docs, COLECOES.every(k => recebido[k]));
    }, e => {
      console.error(e);
      if (negado) return; negado = true;
      App.msgLogin = e.code === 'permission-denied'
        ? `O e-mail ${u.email} não está autorizado a acessar este app.`
        : 'Erro ao carregar os dados: ' + e.message;
      A.signOut(auth);
    })));
  });
}
