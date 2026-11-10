// Teste rápido do app num navegador de verdade (Playwright).
// Uso: node tests/smoke.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const servidor = http.createServer((req, res) => {
  let arq = path.normalize(decodeURIComponent(req.url.split('?')[0]));
  if (arq.endsWith(path.sep) || arq === '/') arq = '/index.html';
  const caminho = path.join(RAIZ, arq);
  if (!caminho.startsWith(RAIZ) || !fs.existsSync(caminho)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(caminho)] || 'application/octet-stream' });
  fs.createReadStream(caminho).pipe(res);
});

// Firebase simulado em memória, para testar login e sincronização sem internet.
const FIREBASE_FALSO = {
  'firebase-app.js': `export const initializeApp = c => ({ c });`,
  'firebase-auth.js': `
    let cb, user = null; export const getAuth = () => ({});
    export class GoogleAuthProvider {}
    export const onAuthStateChanged = (a, f) => { cb = f; setTimeout(() => f(user), 0); };
    export const signInWithPopup = async () => { user = { displayName: 'Maria Teste', email: window.__email }; cb(user); };
    export const signOut = async () => { user = null; cb(null); };`,
  'firebase-firestore.js': `
    const store = { lancamentos: new Map(), planos: new Map() }, subs = { lancamentos: [], planos: [] }; window.__store = store;
    export const initializeFirestore = () => ({}); export const persistentLocalCache = () => ({}); export const persistentMultipleTabManager = () => ({});
    export const collection = (f, c) => c; export const doc = (f, c, id) => ({ c, id });
    const emit = c => subs[c].forEach(s => s({ docs: [...store[c]].map(([id, d]) => ({ id, data: () => structuredClone(d) })) }));
    export const onSnapshot = (c, ok, err) => {
      if (window.__email !== 'ok@gmail.com') { setTimeout(() => err({ code: 'permission-denied', message: 'negado' }), 0); return () => {}; }
      subs[c].push(ok); setTimeout(() => emit(c), 0); return () => { subs[c] = subs[c].filter(s => s !== ok); };
    };
    export const writeBatch = () => { const ops = []; return {
      set: (r, d) => ops.push(() => store[r.c].set(r.id, d)), delete: r => ops.push(() => store[r.c].delete(r.id)),
      commit: async () => { ops.forEach(o => o()); setTimeout(() => { emit('lancamentos'); emit('planos'); }, 0); } }; };`,
};

function confere(cond, msg) {
  if (!cond) throw new Error('FALHOU: ' + msg);
  console.log('  ok —', msg);
}

async function modoLocal(navegador, url, erros) {
  console.log('Modo local');
  const ctx = await navegador.newContext();
  await ctx.route('**/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.FIREBASE_CONFIG = null;' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push('local: ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(url);
  confere(await p.isVisible('.nav'), 'abre direto, sem login');

  await p.click('text=+ Lançamento');
  await p.selectOption('#lanc-tipo', 'receita');
  await p.fill('[name=valor]', '8000'); await p.fill('[name=desc]', 'Salário');
  await p.click('dialog >> text=Salvar');
  await p.click('text=+ Lançamento');
  await p.fill('[name=valor]', '2500'); await p.fill('[name=desc]', 'Aluguel'); await p.fill('[name=categoria]', 'Moradia');
  await p.click('dialog >> text=Salvar');
  await p.click('.nav >> text=Início');
  const saldo = await p.textContent('.grid .card:nth-child(3) .val');
  confere(saldo.replace(/\s/g, ' ').includes('5.500,00'), 'saldo do mês = 8000 − 2500');

  await p.click('text=+ Novo plano');
  await p.selectOption('[name=tipo]', 'casamento');
  await p.fill('[name=nome]', 'Nosso casamento'); await p.fill('[name=meta]', '60000');
  await p.click('dialog >> text=Salvar');
  await p.fill('form[data-f=addAporte] [name=valor]', '1500'); await p.click('form[data-f=addAporte] button');
  confere((await p.textContent('.grid .card:nth-child(2) .val')).includes('1.500,00'), 'plano registra dinheiro guardado');
  confere(await p.locator('.tarefa').count() > 3, 'plano de casamento vem com tarefas sugeridas');

  await p.reload();
  await p.click('.nav >> text=Planos');
  confere(await p.isVisible('text=Nosso casamento'), 'dados continuam após recarregar a página');

  await p.click('.nav >> text=Simulador');
  await p.fill('#sim [name=valor]', '100000'); await p.fill('#sim [name=entrada]', '0');
  await p.fill('#sim [name=prazo]', '10'); await p.fill('#sim [name=juros]', '0');
  confere((await p.textContent('#sim-res .card:nth-child(2) .val')).includes('10.000,00'), 'simulador: 100 mil em 10x sem juros = 10 mil');
  await ctx.close();
}

async function modoNuvem(navegador, url, erros) {
  console.log('Modo nuvem (Firebase simulado)');
  const ctx = await navegador.newContext();
  await ctx.route('**/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.FIREBASE_CONFIG = { apiKey: "teste" };' }));
  await ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({
    contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FIREBASE_FALSO[r.request().url().split('/').pop()] }));
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push('nuvem: ' + e.message));
  p.on('dialog', d => d.accept());
  await p.addInitScript(() => { window.__email = 'intruso@gmail.com'; });
  await p.goto(url);
  await p.waitForSelector('text=Entrar com Google');
  confere(!(await p.isVisible('.nav')), 'sem login só aparece a tela de entrada');

  await p.click('text=Entrar com Google');
  await p.waitForSelector('.aviso');
  confere((await p.textContent('.aviso')).includes('não está autorizado'), 'e-mail fora da lista é barrado');

  await p.evaluate(() => { window.__email = 'ok@gmail.com'; });
  await p.click('text=Entrar com Google');
  await p.waitForSelector('text=Olá, Maria');
  confere(true, 'e-mail autorizado entra');

  await p.click('text=+ Lançamento');
  await p.fill('[name=valor]', '120'); await p.fill('[name=desc]', 'Mercado');
  await p.click('dialog >> text=Salvar');
  await p.waitForFunction(() => window.__store.lancamentos.size === 1);
  confere(true, 'lançamento é enviado para a nuvem');

  await p.click('.nav >> text=Finanças');
  await p.click('[data-a=apagarLanc]');
  await p.waitForFunction(() => window.__store.lancamentos.size === 0);
  confere(true, 'lançamento apagado some da nuvem');

  await p.click('.nav >> text=Dados');
  await p.click('text=Sair');
  await p.waitForSelector('text=Entrar com Google');
  confere(true, 'sair volta para a tela de entrada');
  await ctx.close();
}

(async () => {
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${servidor.address().port}/`;
  const navegador = await chromium.launch();
  const erros = [];
  let codigo = 0;
  try {
    await modoLocal(navegador, url, erros);
    await modoNuvem(navegador, url, erros);
    if (erros.length) throw new Error('Erros de JavaScript na página:\n' + erros.join('\n'));
    console.log('\nTudo certo ✅');
  } catch (e) {
    console.error('\n' + e.message);
    codigo = 1;
  }
  await navegador.close();
  servidor.close();
  process.exit(codigo);
})();
