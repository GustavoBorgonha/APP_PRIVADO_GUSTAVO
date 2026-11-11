// Teste rápido do app num navegador de verdade (Playwright).
// Uso: node tests/smoke.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2','.webmanifest': 'application/manifest+json' };

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

  await p.click('.atalho >> text=Despesa');
  await p.selectOption('#lanc-tipo', 'receita');
  await p.fill('[name=valor]', '8000'); await p.fill('[name=desc]', 'Salário');
  await p.click('dialog >> text=Salvar');
  confere(await p.isVisible('.hero .balao.on') && await p.isVisible('.hero .panda-svg.h-feliz'), 'panda fica feliz com a receita');
  await p.click('.atalho >> text=Despesa');
  await p.fill('[name=valor]', '2500'); await p.fill('[name=desc]', 'Aluguel'); await p.fill('[name=categoria]', 'Moradia');
  await p.click('dialog >> text=Salvar');
  await p.click('.nav >> text=Início');
  const saldo = await p.textContent('.hero .saldo-val');
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

  await ctx.close();
}

// Extratos de mentira, só para o teste (mesmo formato dos bancos: OFX e CSV com Crédito/Débito).
const OFX_TESTE = `OFXHEADER:100
<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>PAYMENT</TRNTYPE><DTPOSTED>20260310</DTPOSTED><TRNAMT>-120.50</TRNAMT><FITID>A1</FITID>
<MEMO>Pagamento de Titulo: "CONDOMINIO EDIFICIO TESTE"</MEMO><NAME>CONDOMINIO EDIFICIO TESTE</NAME></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260305</DTPOSTED><TRNAMT>900.00</TRNAMT><FITID>A2</FITID>
<MEMO>Pix recebido: "Cp :123-FULANA DE TAL"</MEMO><NAME>Fulana de Tal</NAME></STMTTRN>
<STMTTRN><TRNTYPE>PAYMENT</TRNTYPE><DTPOSTED>20260304</DTPOSTED><TRNAMT>-30.00</TRNAMT><FITID>A3</FITID>
<MEMO>Compra no debito: "No estabelecimento LANCHONETE TESTE"</MEMO><NAME>Lanchonete Teste</NAME></STMTTRN>
</BANKTRANLIST></OFX>`;
const CSV_TESTE = `Extrato de: Ag: 1 | Conta: 2;;;;;
Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)
05/03/2026;TRANSF SALDO C/SAL P/CC;111;2.500,00; ;2.500,00
06/03/2026;PACOTE DE SERVICOS;222; ;16,65;2.483,35
;;;;;
Os dados acima tem como base 10/03/2026;;;;;`;

async function importacaoExtrato(navegador, url, erros) {
  console.log('Importação de extrato com triagem');
  const ctx = await navegador.newContext();
  await ctx.route('**/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.FIREBASE_CONFIG = null;' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push('extrato: ' + e.message));
  const avisos = [];
  p.on('dialog', d => { avisos.push(d.message()); d.accept(); });
  await p.goto(url);
  const salvos = () => p.evaluate(() => (JSON.parse(localStorage.getItem('apg-dados-v1')) || { lancamentos: [] }).lancamentos);
  // Escolhe o arquivo e responde "de onde é este extrato" (banco + conta/cartão).
  const importar = async (nome, conteudo, banco, meio = 'debito') => {
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-a=importarExtrato]')]);
    await fc.setFiles({ name: nome, mimeType: 'text/plain', buffer: Buffer.from(conteudo, 'latin1') });
    await p.waitForSelector('dialog [name=banco]');
    if (banco) await p.fill('dialog [name=banco]', banco);
    await p.check(`dialog [name=meio][value=${meio}]`, { force: true });
    await p.click('dialog >> text=Continuar');
    await p.waitForSelector('.tri-progresso');
  };
  const cartao = texto => p.locator('.tri', { hasText: texto });

  await importar('extrato.ofx', OFX_TESTE, 'Inter');
  confere(await p.locator('.tri').count() === 3, 'OFX: encontra os 3 movimentos');
  confere((await p.textContent('.selo')).includes('Inter') && (await p.textContent('.selo')).includes('débito'), 'triagem mostra o banco e o tipo escolhidos');
  confere((await salvos()).length === 0, 'nada entra nas finanças antes de confirmar');
  confere(await cartao('CONDOMINIO').locator('[data-f=desc]').inputValue() === 'Condomínio Edificio Teste', 'pré-preenche a descrição');
  confere(await cartao('CONDOMINIO').locator('[data-f=categoria]').inputValue() === 'Moradia', 'sugere a categoria');

  await cartao('LANCHONETE').locator('[data-f=desc]').fill('Lanche da tarde');
  await cartao('LANCHONETE').locator('[data-a=triConfirmar]').click();
  let l = await salvos();
  confere(l.length === 1 && l[0].desc === 'Lanche da tarde' && l[0].valor === 30 && l[0].tipo === 'despesa' && l[0].data === '2026-03-04', 'confirmar grava só aquele lançamento, com a edição feita');
  confere(l[0].banco === 'Inter' && l[0].meio === 'debito', 'lançamento guarda o banco e se é débito ou crédito');
  await cartao('FULANA').locator('[data-a=triIgnorar]').click();
  confere((await salvos()).length === 1 && await p.locator('.tri').count() === 1, 'ignorar descarta sem gravar');
  await p.click('.tri-revisados summary');
  await p.locator('.tri-feito', { hasText: 'Lanche da tarde' }).locator('[data-a=triDesfazer]').click();
  confere((await salvos()).length === 0 && await p.locator('.tri').count() === 2, 'desfazer tira o lançamento e devolve para a triagem');
  await cartao('LANCHONETE').locator('[data-a=triConfirmar]').click();
  await p.click('[data-a=sairTriagem]');   // sai com pendentes (confirma o aviso)
  confere((await salvos()).length === 1 && await p.isVisible('text=Extrato'), 'sair da triagem mantém só o que foi confirmado');

  await importar('extrato.ofx', OFX_TESTE, 'Inter');
  confere(await p.locator('.tri').count() === 2 && await p.locator('.tri-dups .tri-feito', { hasText: 'Lanche da tarde' }).count() === 1,
    'reimportar: o que já foi importado fica de fora da triagem');
  confere((await salvos()).length === 1, 'reimportar não duplica nada sozinho');
  await p.click('[data-a=sairTriagem]');

  // Mesmo valor, mesma data, vindo de outro arquivo: precisa avisar e pedir confirmação.
  await importar('outro.csv', 'Data;Histórico;Valor\n04/03/2026;LANCHE REPETIDO;-30,00', 'Bradesco');
  confere(await cartao('LANCHE REPETIDO').locator('.tri-aviso.forte').count() === 1, 'valor já lançado aparece com aviso na triagem');
  avisos.length = 0;
  await cartao('LANCHE REPETIDO').locator('[data-a=triConfirmar]').click();
  confere(avisos.some(a => a.includes('já estar lançado')), 'confirmar um valor repetido pede confirmação extra');
  await p.locator('.tri-revisados .tri-feito', { hasText: 'Lanche repetido' }).locator('[data-a=triDesfazer]').click();
  await cartao('LANCHE REPETIDO').locator('[data-a=triIgnorar]').click();
  await p.click('[data-a=sairTriagem]');

  // Fatura do cartão: compra vem com valor positivo e deve virar despesa no crédito.
  await importar('fatura.csv', 'Data,Lançamento,Categoria,Tipo,Valor\n02/03/2026,FARMACIA TESTE,SAUDE,Compra à vista,"R$ 45,90"', 'Inter', 'credito');
  confere(await cartao('FARMACIA').locator('[data-f=tipo]').inputValue() === 'despesa' && await cartao('FARMACIA').locator('[data-f=categoria]').inputValue() === 'Saúde', 'fatura do cartão: compra vira despesa');
  await cartao('FARMACIA').locator('[data-a=triConfirmar]').click();
  await p.click('[data-a=sairTriagem]');
  l = await salvos();
  confere(l.length === 2 && l.some(x => x.valor === 45.9 && x.meio === 'credito' && x.banco === 'Inter'), 'compra do cartão fica marcada como crédito');

  await importar('extrato.csv', CSV_TESTE, 'Bradesco');
  confere(await p.locator('.tri').count() === 2, 'CSV do banco: lê crédito e débito e ignora o resto');
  confere(await cartao('C/SAL').locator('[data-f=categoria]').inputValue() === 'Salário' && await cartao('C/SAL').locator('[data-f=tipo]').inputValue() === 'receita', 'CSV: crédito vira receita (salário)');
  confere(await cartao('PACOTE').locator('[data-f=desc]').inputValue() === 'Pacote de serviços', 'CSV: acerta acentos (arquivo em Latin-1)');
  await cartao('C/SAL').locator('[data-a=triConfirmar]').click();
  await cartao('PACOTE').locator('[data-a=triConfirmar]').click();
  await p.waitForSelector('text=Tudo revisado!');
  l = await salvos();
  confere(l.length === 4 && l.some(x => x.valor === 2500 && x.tipo === 'receita') && l.some(x => x.valor === 16.65 && x.tipo === 'despesa'), 'tudo revisado: lançamentos gravados com os valores certos');
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

  await p.click('.atalho >> text=Despesa');
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
    await importacaoExtrato(navegador, url, erros);
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
