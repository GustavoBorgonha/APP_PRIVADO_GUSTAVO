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
    export const signInWithPopup = async () => { user = { displayName: 'Maria Teste', email: window.__email, getIdToken: async () => 'token-teste' }; cb(user); };
    export const signOut = async () => { user = null; cb(null); };`,
  'firebase-firestore.js': `
    // Banco em memória. window.__seed permite começar com dados de "outro aparelho".
    const seed = window.__seed || {};
    const store = { lancamentos: new Map(seed.lancamentos || []), planos: new Map(seed.planos || []), triagens: new Map(seed.triagens || []), categorias: new Map(seed.categorias || []), agendados: new Map(seed.agendados || []) };
    const subs = { lancamentos: [], planos: [], triagens: [], categorias: [], agendados: [] }, docSubs = []; window.__store = store;
    window.__exportar = () => JSON.stringify(Object.fromEntries(Object.entries(store).map(([c, m]) => [c, [...m]])));
    export const initializeFirestore = () => ({}); export const persistentLocalCache = () => ({}); export const persistentMultipleTabManager = () => ({});
    export const collection = (f, c) => c; export const doc = (f, c, id) => ({ c, id });
    const emit = c => subs[c].forEach(s => s({ docs: [...store[c]].map(([id, d]) => ({ id, data: () => structuredClone(d) })) }));
    const emitDocs = () => docSubs.forEach(([r, ok]) => ok({ exists: () => store[r.c].has(r.id), data: () => structuredClone(store[r.c].get(r.id)) }));
    const negado = () => window.__email !== 'ok@gmail.com';
    export const onSnapshot = (ref, ok, err) => {
      if (negado() || (typeof ref !== 'string' && window.__semRegraTriagem)) { setTimeout(() => err({ code: 'permission-denied', message: 'negado' }), 0); return () => {}; }
      if (typeof ref !== 'string') { const s = [ref, ok]; docSubs.push(s); setTimeout(emitDocs, 0); return () => docSubs.splice(docSubs.indexOf(s), 1); }
      subs[ref].push(ok); setTimeout(() => emit(ref), 0); return () => { subs[ref] = subs[ref].filter(s => s !== ok); };
    };
    export const setDoc = async (r, d) => { if (window.__semRegraTriagem) throw { code: 'permission-denied', message: 'negado' }; store[r.c].set(r.id, structuredClone(d)); setTimeout(emitDocs, 0); };
    export const deleteDoc = async r => { if (window.__semRegraTriagem) throw { code: 'permission-denied', message: 'negado' }; store[r.c].delete(r.id); setTimeout(emitDocs, 0); };
    export const writeBatch = () => { const ops = []; return {
      set: (r, d) => ops.push(() => store[r.c].set(r.id, d)), delete: r => ops.push(() => store[r.c].delete(r.id)),
      commit: async () => { ops.forEach(o => o()); setTimeout(() => { emit('lancamentos'); emit('planos'); emit('categorias'); emit('agendados'); }, 0); } }; };`,
};

// Escolhe uma categoria no seletor (botão que abre a lista com ícones).
async function escolher(p, alvo, nome) {
  await p.locator(alvo).locator('xpath=..').locator('.seletor-btn').click();
  await p.locator(`.seletor-painel .seletor-op[data-v="${nome}"]`).click();
}

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
  await p.fill('[name=valor]', '2500'); await p.fill('[name=desc]', 'Aluguel'); await escolher(p, '#lanc-cat', 'Moradia');
  await p.click('dialog >> text=Salvar');
  await p.click('.nav >> text=Início');
  const saldo = await p.textContent('.hero .saldo-val');
  confere(saldo.replace(/\s/g, ' ').includes('5.500,00'), 'saldo do mês = 8000 − 2500');

  // Transferência entre contas aparece no extrato, mas não mexe no saldo.
  await p.click('.atalho >> text=Despesa');
  await p.fill('[name=valor]', '1000'); await p.fill('[name=desc]', 'Pix para a outra conta'); await escolher(p, '#lanc-cat', 'Transferência entre contas');
  await p.click('dialog >> text=Salvar');
  await p.click('.nav >> text=Início');
  confere((await p.textContent('.hero .saldo-val')).replace(/\s/g, ' ').includes('5.500,00'), 'transferência entre contas não altera o saldo');
  await p.click('.nav >> text=Finanças');
  confere(await p.isVisible('.mov-val.transf') && (await p.textContent('.hero .chips')).includes('Entre contas'), 'transferência aparece no extrato, separada');
  await p.click('.nav >> text=Início');

  // Categorias: criar com emoji, usar, renomear (atualiza lançamentos), emoji próprio e excluir.
  await p.click('.nav >> text=Finanças');
  await p.click('text=🏷️ Categorias');
  await p.fill('#cat-busca', 'merc');
  confere(await p.locator('.cat-card:visible').count() === 1 && await p.isVisible('.cat-card:has-text("Mercado")'), 'pesquisa de categorias filtra enquanto digita');
  await p.fill('#cat-busca', 'xyzw');
  confere(await p.isVisible('.cat-nada'), 'pesquisa sem resultado oferece criar a categoria');
  await p.fill('#cat-busca', '');
  await p.click('[data-a=novaCat]');
  await p.fill('dialog [name=nome]', 'Pets');
  await p.click('dialog .emo[data-v="🐶"]');
  confere((await p.textContent('#cat-prev')).includes('🐶'), 'categoria: escolher emoji mostra na prévia');
  await p.click('dialog >> text=Salvar');
  confere(await p.isVisible('.cat-card:has-text("Pets")'), 'categoria nova aparece na tela de categorias');
  await p.click('.nav >> text=Finanças');
  await p.click('text=+ Lançamento');
  await p.fill('[name=valor]', '80'); await p.fill('[name=desc]', 'Ração'); await escolher(p, '#lanc-cat', 'Pets');
  await p.click('dialog >> text=Salvar');
  confere((await p.textContent('.mov:has-text("Ração") .mov-ic')).includes('🐶'), 'lançamento usa a categoria nova, com o ícone');
  await p.click('.nav >> text=Finanças'); await p.click('text=🏷️ Categorias');
  await p.click('.cat-card:has-text("Pets")');
  await p.fill('dialog [name=nome]', 'Bichos');
  await p.fill('dialog [name=emojiProprio]', '🦜');
  confere((await p.textContent('#cat-prev')).includes('🦜'), 'categoria: emoji próprio digitado vira o ícone');
  await p.click('dialog >> text=Salvar');
  const dadosCat = await p.evaluate(() => JSON.parse(localStorage.getItem('apg-dados-v1')));
  confere(dadosCat.lancamentos.find(l => l.desc === 'Ração').categoria === 'Bichos' && dadosCat.categorias.some(c => c.nome === 'Bichos' && c.emoji === '🦜'),
    'renomear categoria atualiza os lançamentos e guarda o emoji próprio');
  await p.click('.cat-card:has-text("Bichos")');
  await p.click('dialog [data-a=excluirCat]');
  const depoisCat = await p.evaluate(() => JSON.parse(localStorage.getItem('apg-dados-v1')));
  confere(depoisCat.lancamentos.find(l => l.desc === 'Ração').categoria === 'Outros' && !(await p.isVisible('.cat-card:has-text("Bichos")')),
    'excluir categoria passa os lançamentos para Outros');
  // Mover em massa: categoria digitada antes (sem cadastro) vai inteira para outra.
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('apg-dados-v1'));
    ['a', 'b'].forEach(x => d.lancamentos.push({ id: 'velho' + x, tipo: 'despesa', desc: 'Fatura ' + x, categoria: 'fat', valor: 10, data: '2026-01-1' + (x === 'a' ? 0 : 1), fixo: false }));
    localStorage.setItem('apg-dados-v1', JSON.stringify(d));
  });
  await p.reload();
  await p.click('.nav >> text=Finanças'); await p.click('text=🏷️ Categorias');
  await p.click('.cat-card.solta:has-text("fat")');
  await escolher(p, '#mover-para', 'Cartão de crédito');
  await p.click('dialog [data-a=moverLancs]');
  const movidos = await p.evaluate(() => JSON.parse(localStorage.getItem('apg-dados-v1')).lancamentos.filter(l => l.id.startsWith('velho')).map(l => l.categoria));
  confere(movidos.length === 2 && movidos.every(c => c === 'Cartão de crédito') && !(await p.isVisible('.cat-card.solta:has-text("fat")')),
    'mover em massa leva todos os lançamentos para a outra categoria');
  await p.click('.nav >> text=Início');

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
  const importar = async (nome, conteudo, banco, meio = 'debito', titular = 'Gustavo') => {
    await p.click('.nav >> text=Extratos');
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-a=importarExtrato]')]);
    await fc.setFiles({ name: nome, mimeType: 'text/plain', buffer: Buffer.from(conteudo, 'latin1') });
    await p.waitForSelector('dialog [name=banco]');
    if (banco) await p.fill('dialog [name=banco]', banco);
    if (titular) await p.fill('dialog [name=titular]', titular);
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
  confere(l[0].banco === 'Inter' && l[0].meio === 'debito' && l[0].titular === 'Gustavo', 'lançamento guarda o banco, se é débito ou crédito e de quem é a conta');
  await cartao('FULANA').locator('[data-a=triIgnorar]').click();
  confere((await salvos()).length === 1 && await p.locator('.tri').count() === 1, 'ignorar descarta sem gravar');
  await p.click('.tri-revisados summary');
  await p.locator('.tri-feito', { hasText: 'Lanche da tarde' }).locator('[data-a=triDesfazer]').click();
  confere((await salvos()).length === 0 && await p.locator('.tri').count() === 2, 'desfazer tira o lançamento e devolve para a triagem');
  await cartao('LANCHONETE').locator('[data-a=triConfirmar]').click();
  await p.click('[data-a=sairTriagem]');   // sai com pendentes: a triagem fica pausada
  confere((await salvos()).length === 1 && await p.isVisible('text=Extrato'), 'sair da triagem mantém só o que foi confirmado');
  confere(await p.isVisible('text=Triagem em andamento'), 'sair com pendentes deixa a triagem pausada');
  await p.reload();
  confere(await p.isVisible('text=Triagem em andamento'), 'triagem pausada continua lá depois de fechar e abrir o app');
  await p.click('[data-a=retomarTriagem]');
  confere(await p.locator('.tri').count() === 1 && await cartao('CONDOMINIO').count() === 1, 'continuar triagem volta com os pendentes');
  await p.click('[data-a=sairTriagem]');

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
  await importar('fatura.csv', 'Data,Lançamento,Categoria,Tipo,Valor\n02/03/2026,FARMACIA TESTE,SAUDE,Compra à vista,"R$ 45,90"', 'Inter', 'credito', 'Conjunta');
  confere(await cartao('FARMACIA').locator('[data-f=tipo]').inputValue() === 'despesa' && await cartao('FARMACIA').locator('[data-f=categoria]').inputValue() === 'Saúde', 'fatura do cartão: compra vira despesa');
  await cartao('FARMACIA').locator('[data-a=triConfirmar]').click();
  await p.click('[data-a=sairTriagem]');
  l = await salvos();
  confere(l.length === 2 && l.some(x => x.valor === 45.9 && x.meio === 'credito' && x.banco === 'Inter' && x.titular === 'Conjunta'), 'compra do cartão fica marcada como crédito, com o titular escolhido');

  // Cancelar a importação inteira, no meio da triagem, apaga até o que já foi confirmado.
  const antes = (await salvos()).length;
  await importar('cancelar.csv', 'Data;Histórico;Valor\n07/03/2026;COMPRA A;-11,00\n08/03/2026;COMPRA B;-22,00\n09/03/2026;COMPRA C;-33,00', 'Nubank');
  await cartao('COMPRA A').locator('[data-a=triConfirmar]').click();
  await cartao('COMPRA B').locator('[data-a=triConfirmar]').click();
  confere((await salvos()).length === antes + 2, 'antes de cancelar: 2 confirmados gravados');
  await p.click('[data-a=cancelarImportacao]');
  confere((await salvos()).length === antes && !(await p.isVisible('.tri-progresso')), 'cancelar importação apaga os já confirmados e sai da triagem');

  // Cancelar depois, pela aba Dados.
  await importar('depois.csv', 'Data;Histórico;Valor\n07/03/2026;COMPRA D;-44,00\n08/03/2026;COMPRA E;-55,00', 'Nubank');
  await cartao('COMPRA D').locator('[data-a=triConfirmar]').click();
  await cartao('COMPRA E').locator('[data-a=triConfirmar]').click();
  await p.click('text=Concluir');
  await p.click('.nav >> text=Extratos');
  confere(await p.isVisible('text=depois.csv') && await p.isVisible('text=Histórico de extratos'), 'aba Extratos mostra o histórico');
  await p.locator('.lote', { hasText: 'depois.csv' }).locator('.lote-cab').click();
  confere(await p.locator('.lote.aberto .mov', { hasText: 'Compra d' }).count() === 1, 'abrir um extrato do histórico mostra os lançamentos dele');
  await p.locator('.lote', { hasText: 'depois.csv' }).locator('[data-a=desfazerLote]').click();
  confere((await salvos()).length === antes && !(await p.isVisible('text=depois.csv')), 'cancelar importação pelo histórico apaga todos os lançamentos dela');
  await p.click('.nav >> text=Finanças');

  await importar('extrato.csv', CSV_TESTE, 'Bradesco');
  confere(await p.locator('.tri').count() === 2, 'CSV do banco: lê crédito e débito e ignora o resto');
  confere(await cartao('C/SAL').locator('[data-f=categoria]').inputValue() === 'Salário' && await cartao('C/SAL').locator('[data-f=tipo]').inputValue() === 'receita', 'CSV: crédito vira receita (salário)');
  confere(await cartao('PACOTE').locator('[data-f=desc]').inputValue() === 'Pacote de serviços', 'CSV: acerta acentos (arquivo em Latin-1)');
  await cartao('C/SAL').locator('[data-a=triConfirmar]').click();
  await cartao('PACOTE').locator('[data-a=triConfirmar]').click();
  await p.waitForSelector('text=Tudo revisado!');
  l = await salvos();
  confere(l.length === 4 && l.some(x => x.valor === 2500 && x.tipo === 'receita') && l.some(x => x.valor === 16.65 && x.tipo === 'despesa'), 'tudo revisado: lançamentos gravados com os valores certos');
  await p.click('text=Concluir');

  // Triagem automática: usa o histórico ("Pix: Armazem do ze" já era Mercado), ignora estorno e deixa repetido para revisar.
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('apg-dados-v1'));
    d.lancamentos.push({ id: 'hist1', tipo: 'despesa', desc: 'Pix: Armazem do ze', categoria: 'Mercado', valor: 12, data: '2026-02-01' });
    d.lancamentos.push({ id: 'hist2', tipo: 'despesa', desc: 'Academia', categoria: 'Saúde', valor: 99, data: '2026-04-10' });
    localStorage.setItem('apg-dados-v1', JSON.stringify(d));
  });
  await p.reload();
  await importar('auto.csv', 'Data;Histórico;Valor\n10/04/2026;ARMAZEM DO ZE;-50,00\n11/04/2026;PIX ENVIADO UBER;-20,00\n11/04/2026;PIX ENVIADO DEVOLVIDO UBER;20,00\n10/04/2026;ACADEMIA;-99,00\n12/04/2026;LOJA NOVA;-30,00', 'Inter');
  await p.click('[data-a=triAuto]');
  const resumo = await p.textContent('dialog .auto-resumo');
  confere(/2\s*lançamentos confirmados/.test(resumo) && /2\s*ignorados/.test(resumo) && /1\s*para você revisar/.test(resumo), 'triagem automática mostra o resumo antes de aplicar');
  await p.click('dialog >> text=Fazer triagem automática');
  l = await salvos();
  const armazem = l.find(x => x.valor === 50);
  confere(armazem && armazem.categoria === 'Mercado' && l.some(x => x.valor === 30 && x.categoria === 'Outros'), 'triagem automática redistribui a categoria pelo histórico e confirma');
  confere(!l.some(x => x.valor === 20) && await p.locator('.tri').count() === 1 && await p.isVisible('.tri:has-text("ACADEMIA")'), 'estorno é ignorado e o valor já lançado fica para revisar');

  // Dados gerais e detalhes: Bradesco (agência/conta, saldo por movimento, data do extrato) e Inter (cidade, saldo final).
  await p.click('[data-a=cancelarImportacao]');
  await importar('brad.csv', `Extrato de: Ag: 367 | Conta: 64163-4;;;;;
Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)
05/05/2026;TRANSF SALDO C/SAL P/CC;500367;1.000,00; ;1.100,00
06/05/2026;PACOTE DE SERVICOS;11225; ;18,65;1.081,35
;;;;;
Os dados acima tem como base 10/05/2026 às 23:10 e estão sujeitos a alterações.;;;;;`, '', 'debito', 'Gustavo');
  confere((await p.textContent('.sub')).includes('Ag 367 · Conta 64163-4') && (await p.textContent('.sub')).includes('às 23:10'), 'Bradesco: mostra agência, conta, saldo final e data/hora do extrato');
  confere((await p.textContent('.selo')).includes('Bradesco'), 'Bradesco é reconhecido pelo formato do arquivo');
  confere((await p.textContent('.tri:has-text("PACOTE")')).includes('Tarifa') && await cartao('PACOTE').locator('[data-f=categoria]').inputValue() === 'Tarifas bancárias', 'tipo de operação aparece e puxa a categoria');
  await p.click('[data-a=triAuto]'); await p.click('dialog >> text=Fazer triagem automática');
  await p.click('.nav >> text=Finanças'); await p.click('text=🏦 Conta corrente');
  await p.click('.cc-contas >> text=Bradesco');
  await p.click('[data-a=contaTudo]');
  confere((await p.textContent('.hero .saldo-val')).replace(/\s/g, ' ').includes('1.081,35') && await p.isVisible('text=Conferido com o banco'), 'conta corrente segue o saldo informado pelo banco');
  confere(await p.locator('.cc-saldo:has-text("✓")').count() === 2, 'cada movimento mostra ✓ quando bate com o saldo do banco');
  await p.click('[data-a=contaTudo]');
  await p.click('.nav >> text=Extratos');
  await importar('inter.ofx', `<OFX><BANKACCTFROM><BANKID>077</BANKID><BRANCHID>0001-9</BRANCHID><ACCTID>999</ACCTID></BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>PAYMENT</TRNTYPE><DTPOSTED>20260509</DTPOSTED><TRNAMT>-18.00</TRNAMT><FITID>C1</FITID>
<MEMO>Compra no debito: "No estabelecimento Heitorcezar"</MEMO><NAME>Heitorcezar           Rio Do Sul   Bra</NAME></STMTTRN></BANKTRANLIST>
<LEDGERBAL><BALAMT>2.34</BALAMT><DTASOF>20260510</DTASOF></LEDGERBAL></OFX>`, 'Inter');
  confere((await p.textContent('.tri:has-text("Heitorcezar")')).includes('📍 Rio do Sul') && (await p.textContent('.sub')).includes('saldo final R$'), 'Inter: mostra a cidade da compra e o saldo final do extrato');
  confere(await cartao('Heitorcezar').locator('[data-f=desc]').inputValue() === 'Heitorcezar', 'descrição da compra fica só com o estabelecimento');
  await p.click('[data-a=cancelarImportacao]');

  // Sicredi (CSV, do mais novo para o mais antigo): banco, CPF/CNPJ, horário e banco de origem do Pix, data da compra no cartão.
  await importar('sicredi.csv', `Data;Descricao;CodTransacao;Identificador;Tipo;Valor;Saldo
06/05/2026;PAGAMENTO PIX - 12345678909 FULANO DE TAL;664;E8778153020260506111811abcdefghijk;DEBITO;- R$ 100,00;R$ 50,00
06/05/2026;PAGAMENTO BOLETO -  12345678000195 LOJA TESTE LTDA;128;OC-1;DEBITO;- R$ 50,00;R$ 150,00
05/05/2026;CARTAO DEBITO - PADARIA TESTE - BR;282;TRA-1-20260503-1;DEBITO;- R$ 10,00;R$ 200,00
04/05/2026;RECEBIMENTO PIX - 12345678909 FULANO DE TAL;668;E00416968202605041509abc-CREDIT;CREDITO;+ R$ 210,00;R$ 210,00`, '', 'debito', 'Gustavo');
  confere((await p.textContent('.selo')).includes('Sicredi') && (await p.textContent('.sub')).includes('saldo final R$') && (await p.textContent('.sub')).includes('50,00'), 'Sicredi: reconhece o banco e o saldo final é o do movimento mais novo');
  const pix = await p.textContent('.tri:has-text("PAGAMENTO PIX")');
  confere(pix.includes('08:18') && pix.includes('CPF 123.456.789-09') && await cartao('PAGAMENTO PIX').locator('[data-f=desc]').inputValue() === 'Pix: Fulano de Tal', 'Sicredi: Pix com horário, CPF e nome da pessoa');
  confere((await p.textContent('.tri:has-text("RECEBIMENTO PIX")')).includes('veio do Inter') && (await p.textContent('.tri:has-text("CARTAO DEBITO")')).includes('compra em 03/05/2026'), 'Sicredi: banco de origem do Pix recebido e dia da compra no cartão');
  confere((await p.textContent('.tri:has-text("BOLETO")')).includes('CNPJ 12.345.678/0001-95'), 'Sicredi: CNPJ do boleto');
  await p.click('[data-a=cancelarImportacao]');

  // Detalhes: horário (quando o banco manda) e CPF/CNPJ ou banco do Pix tirados do texto.
  await importar('hora.ofx', `<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>PAYMENT</TRNTYPE><DTPOSTED>20260415143200[-3:BRT]</DTPOSTED><TRNAMT>-13.98</TRNAMT><FITID>H1</FITID>
<MEMO>Compra no debito: "No estabelecimento 51245806Larissa BOMBINHAS BRA"</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>PAYMENT</TRNTYPE><DTPOSTED>20260415</DTPOSTED><TRNAMT>-5.00</TRNAMT><FITID>H2</FITID>
<MEMO>Pix enviado: "Cp :60701190-LANCHONETE TESTE"</MEMO></STMTTRN></BANKTRANLIST></OFX>`, 'Inter');
  const cartaoLarissa = await p.textContent('.tri:has-text("Larissa")');
  confere(cartaoLarissa.includes('14:32') && cartaoLarissa.includes('CNPJ 51.245.806'), 'mostra o horário e a raiz do CNPJ quando o extrato traz');
  confere((await p.textContent('.tri:has-text("LANCHONETE TESTE")')).includes('Itaú'), 'mostra o banco do outro lado do Pix');
  await p.click('[data-a=cancelarImportacao]');
  await ctx.close();
}

// Triagem na nuvem: começa num "aparelho" e continua em outro, de onde parou.
async function triagemEntreAparelhos(navegador, url, erros) {
  console.log('Triagem continua em outro aparelho (nuvem simulada)');
  const aparelho = async (init) => {
    const ctx = await navegador.newContext();
    await ctx.route('**/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.FIREBASE_CONFIG = { apiKey: "teste" };' }));
    await ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({
      contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FIREBASE_FALSO[r.request().url().split('/').pop()] }));
    const p = await ctx.newPage();
    p.on('pageerror', e => erros.push('aparelhos: ' + e.message));
    p.on('dialog', d => d.accept());
    await p.addInitScript(init);
    await p.goto(url);
    await p.click('text=Entrar com Google');
    await p.waitForSelector('text=Olá, Maria');
    return { ctx, p };
  };
  const cartao = (p, texto) => p.locator('.tri', { hasText: texto });

  // Aparelho 1 (ex.: computador): importa, edita e confirma 1, deixa o resto pendente.
  let { ctx, p } = await aparelho(() => { window.__email = 'ok@gmail.com'; });
  await p.click('.nav >> text=Extratos');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-a=importarExtrato]')]);
  await fc.setFiles({ name: 'extrato.ofx', mimeType: 'text/plain', buffer: Buffer.from(OFX_TESTE, 'latin1') });
  await p.fill('dialog [name=banco]', 'Inter');
  await p.click('dialog >> text=Continuar');
  await p.waitForSelector('.tri');
  await cartao(p, 'LANCHONETE').locator('[data-a=triConfirmar]').click();
  await cartao(p, 'CONDOMINIO').locator('[data-f=desc]').fill('Condomínio de março');
  await cartao(p, 'CONDOMINIO').locator('[data-f=desc]').blur();
  await p.waitForFunction(() => window.__store.triagens.has('atual') && JSON.stringify(window.__store.triagens.get('atual')).includes('Condomínio de março'));
  confere(true, 'triagem é salva na nuvem, com as edições');
  const nuvem = await p.evaluate(() => window.__exportar());
  confere(await p.evaluate(() => localStorage.getItem('apg-triagem')) === null, 'com login, a triagem não fica presa no aparelho');
  await ctx.close();

  // Aparelho 2 (ex.: celular): outro navegador, mesma conta.
  ({ ctx, p } = await aparelho(`window.__email = 'ok@gmail.com'; window.__seed = JSON.parse(${JSON.stringify(nuvem)});`));
  confere(await p.isVisible('text=Triagem em andamento'), 'outro aparelho mostra a triagem em andamento');
  await p.click('[data-a=retomarTriagem]');
  confere(await p.locator('.tri').count() === 2 && await cartao(p, 'CONDOMINIO').locator('[data-f=desc]').inputValue() === 'Condomínio de março',
    'outro aparelho continua de onde parou (pendentes e edições)');
  await cartao(p, 'CONDOMINIO').locator('[data-a=triConfirmar]').click();
  await cartao(p, 'FULANA').locator('[data-a=triIgnorar]').click();
  await p.waitForSelector('text=Tudo revisado!');
  await p.click('text=Concluir');
  await p.waitForFunction(() => !window.__store.triagens.has('atual'));
  confere(await p.evaluate(() => window.__store.lancamentos.size) === 2, 'concluir no outro aparelho grava tudo e encerra a triagem na nuvem');
  await ctx.close();

  // Regras do Firebase ainda sem a triagem: continua funcionando no aparelho e avisa.
  ({ ctx, p } = await aparelho(() => { window.__email = 'ok@gmail.com'; window.__semRegraTriagem = true; }));
  await p.click('.nav >> text=Extratos');
  confere(await p.isVisible('text=falta atualizar as regras do Firebase'), 'sem a regra nova, avisa que a triagem fica só no aparelho');
  await ctx.close();

  // Categoria criada antes da regra existir (ficou só no aparelho) sobe para a nuvem quando a regra chega.
  ({ ctx, p } = await aparelho(() => {
    window.__email = 'ok@gmail.com';
    localStorage.setItem('apg-categorias', JSON.stringify([{ id: 'cat-local', nome: 'Internet', tipo: 'despesa', emoji: '🌐', img: '' }]));
  }));
  await p.waitForFunction(() => window.__store.categorias.has('cat-local'));
  confere(await p.evaluate(() => localStorage.getItem('apg-categorias')) === null, 'categorias que estavam só no aparelho vão para a nuvem');
  await ctx.close();
}

// Cidades: tela espelho da planilha, com a "ponte" (Apps Script) simulada.
async function cidadesPlanilha(navegador, url, erros) {
  console.log('Cidades sincronizadas com a planilha (ponte simulada)');
  const PONTE = 'https://script.google.com/macros/s/TESTE/exec';
  const planilha = [
    ['Blumenau', 'Blumenau (Médio Vale do Itajaí)', 'Vale do Itajaí', 'Sim', '', '', '-26,9155', '-49,0709'],
    ['Rio do Sul', 'Rio do Sul (Alto Vale do Itajaí)', 'Vale do Itajaí', 'Sim', '', 'minha cidade', '-27,2156', '-49,6430'],
    ['Lages', 'Campos de Lages (Serra Catarinense)', 'Serrana', 'Não', '', '', '-27,8150', '-50,3259'],
    ['Chapecó', 'Chapecó (Oeste)', 'Oeste Catarinense', 'Não', '', '', '-27,1004', '-52,6152'],
  ];
  let fora = false, pedidos = [];
  const ctx = await navegador.newContext();
  await ctx.route('**/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.FIREBASE_CONFIG = { apiKey: "teste" };' }));
  await ctx.route('**/planilha-config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.PLANILHA_CIDADES = { url: '${PONTE}', id: 'abc' };` }));
  await ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({
    contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FIREBASE_FALSO[r.request().url().split('/').pop()] }));
  await ctx.route(PONTE, r => {
    if (fora) return r.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: 'erro' });
    const pedido = JSON.parse(r.request().postData()); pedidos.push(pedido);
    if (pedido.token !== 'token-teste') return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, erro: 'nao-autorizado' }) });
    (pedido.mudancas || []).forEach(m => { const l = planilha.find(x => x[0] === m.municipio); if (l) { l[3] = m.visitei ? 'Sim' : 'Não'; l[4] = m.data; l[5] = m.obs; } });
    r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, cidades: planilha }) });
  });
  // Mapa: o Leaflet vem da pasta node_modules quando instalado (CI); sem ele, testa o mapa simples.
  let leafletDir = null;
  try { leafletDir = path.dirname(require.resolve('leaflet/dist/leaflet.js')); } catch (e) { /* sem leaflet */ }
  await ctx.route('https://unpkg.com/leaflet@*/dist/*', r => {
    const arq = r.request().url().split('/').pop();
    if (!leafletDir || !fs.existsSync(path.join(leafletDir, arq))) return r.abort();
    r.fulfill({ body: fs.readFileSync(path.join(leafletDir, arq)), contentType: arq.endsWith('.css') ? 'text/css' : 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  await ctx.route(/tile\.openstreetmap\.org/, r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push('cidades: ' + e.message));
  p.on('dialog', d => d.accept());
  await p.addInitScript(() => { window.__email = 'ok@gmail.com'; });
  await p.goto(url);
  await p.click('text=Entrar com Google');
  await p.waitForSelector('text=Olá, Maria');
  await p.click('.nav >> text=Planos');
  await p.click('.cid-entrada');
  await p.waitForSelector('.cid-linha');
  confere(await p.locator('.cid-linha').count() === 4 && (await p.textContent('.hero .saldo-val')).includes('50'), 'lê as cidades da planilha e calcula o % visitado');
  confere(await p.isVisible('.cid-faixa.ok'), 'mostra que está sincronizado com a planilha');
  await p.waitForSelector('.cid-ponto, path.cid-pino');
  const mapaBase = await p.locator('path.cid-pino').count() > 0;
  confere(await p.locator('.cid-ponto, path.cid-pino').count() === 4 && await p.locator('.cid-ponto.on, path.cid-pino.on').count() === 2,
    `mapa mostra as cidades, com as visitadas em destaque (${mapaBase ? 'mapa estilo Maps' : 'mapa simples, sem Leaflet'})`);
  if (mapaBase) {
    await p.locator('path.cid-pino:not(.on)').first().click();
    await p.waitForSelector('.cid-pop');
    confere(await p.isVisible('.cid-pop >> text=Marcar como visitada'), 'tocar numa cidade do mapa abre o balão com o botão de marcar');
    await p.keyboard.press('Escape');
  }

  await p.locator('.cid-linha', { hasText: 'Lages' }).locator('.cid-check').click();
  await p.waitForFunction(() => document.querySelector('.cid-faixa.ok') && !document.querySelector('.cid-linha small')?.textContent.includes('aguardando'));
  await p.waitForTimeout(300);
  confere(planilha[2][3] === 'Sim' && /\d{2}\/\d{2}\/\d{4}/.test(planilha[2][4]), 'marcar no app grava "Sim" e a data na planilha');

  // Editou na planilha (por fora): o app traz na próxima sincronização.
  planilha[3][3] = 'Sim'; planilha[3][5] = 'viagem de trabalho';
  await p.click('[data-a=cidSincronizar]');
  await p.waitForFunction(() => document.querySelectorAll('.cid-linha.on').length === 4);
  confere(await p.isVisible('text=viagem de trabalho'), 'mudança feita na planilha aparece no app');

  // Planilha fora do ar: guarda no aparelho e avisa.
  fora = true;
  await p.locator('.cid-linha', { hasText: 'Blumenau' }).locator('.cid-txt').click();
  await p.check('dialog [name=v][value=s]', { force: true });
  await p.fill('dialog [name=o]', 'Oktoberfest');
  await p.click('dialog >> text=Salvar');
  await p.waitForSelector('.cid-faixa.erro');
  confere((await p.textContent('.cid-faixa.erro')).includes('Não está sincronizando') && (await p.textContent('.cid-faixa.erro')).includes('1 alteração'), 'sem planilha: avisa que não está sincronizando e guarda a alteração');
  await p.click('.nav >> text=Início');
  confere(await p.isVisible('text=Cidades visitadas não estão sincronizando'), 'o aviso aparece também na tela inicial');

  // Voltou: envia o que estava guardado.
  fora = false;
  await p.click('.nav >> text=Planos'); await p.click('.cid-entrada');
  await p.click('[data-a=cidSincronizar]');
  await p.waitForSelector('.cid-faixa.ok');
  confere(planilha[0][5] === 'Oktoberfest' && await p.evaluate(() => localStorage.getItem('apg-cidades-pend')) === '{}', 'quando a planilha volta, envia o que estava guardado');
  await ctx.close();
}

// Revisão por categoria e conta corrente (modo local, com lançamentos prontos).
async function revisaoEContas(navegador, url, erros) {
  console.log('Revisão por categoria e conta corrente');
  const ctx = await navegador.newContext();
  await ctx.route('**/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.FIREBASE_CONFIG = null;' }));
  const conta = { banco: 'Inter', meio: 'debito', titular: 'Gustavo' };
  await ctx.addInitScript(c => {
    if (localStorage.getItem('apg-dados-v1')) return;
    const L = (id, tipo, desc, categoria, valor, data, extra = c) => ({ id, tipo, desc, categoria, valor, data, ...extra });
    localStorage.setItem('apg-dados-v1', JSON.stringify({ versao: 1, planos: [], categorias: [], lancamentos: [
      L('h1', 'despesa', 'Pix: Uber do Brasil', 'Transporte', 25, '2026-01-05'),
      L('a', 'receita', 'Salário', 'Salário', 3000, '2026-03-05'),
      L('b', 'despesa', 'Pix: Uber do Brasil', 'Outros', 30, '2026-03-06'),
      L('c', 'despesa', 'Loja Qualquer', 'Outros', 100, '2026-03-07'),
      L('d', 'despesa', 'Uber do Brasil Tecnologia', 'Outros', 15, '2026-04-02'),
      L('e', 'despesa', 'Antigo', 'Outros', 5, '2025-01-01'),
    ] }));
  }, conta);
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push('revisao: ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(url);
  const salvos = () => p.evaluate(() => JSON.parse(localStorage.getItem('apg-dados-v1')).lancamentos);

  await p.click('.nav >> text=Finanças');
  await p.click('text=🔎 Revisar categoria');
  await p.fill('form[data-f=revisaoInicio] [name=de]', '2026-01-01');
  await p.fill('form[data-f=revisaoInicio] [name=ate]', '2026-12-31');
  await p.locator('#rev-cat').locator('xpath=..').locator('.seletor-btn').click();
  confere((await p.textContent('.seletor-op[data-v="Outros"] .seletor-n')).trim() === '3' && await p.locator('.seletor-op.sem-mov[data-v="Moradia"]').count() === 1,
    'na revisão, a lista mostra quantos lançamentos cada categoria tem no período');
  await p.click('.seletor-painel .seletor-op[data-v="Outros"]');
  await p.click('text=Começar revisão');
  confere(await p.locator('.rev').count() === 3, 'revisão traz só a categoria e o período escolhidos');
  confere(await p.locator('.rev-sug').count() === 2, 'sugere pelo histórico (Uber → Transporte), sem sugerir a própria categoria');
  await p.click('[data-a=revAplicarSug]');
  let l = await salvos();
  confere(l.find(x => x.id === 'b').categoria === 'Transporte' && l.find(x => x.id === 'd').categoria === 'Transporte', 'aplicar sugestões muda as categorias de uma vez');
  await escolher(p, '.rev [data-f=categoria]', 'Compras');
  await p.click('.rev [data-a=revConfirmar]');
  l = await salvos();
  confere(l.find(x => x.id === 'c').categoria === 'Compras' && l.find(x => x.id === 'e').categoria === 'Outros', 'confirmar aplica a categoria escolhida e não mexe fora do período');
  confere(await p.isVisible('text=Revisão concluída!'), 'mostra quando a revisão termina');
  // Trocar filtro volta com o último período e categoria usados.
  await p.click('[data-a=revNova]');
  confere(await p.inputValue('form[data-f=revisaoInicio] [name=de]') === '2026-01-01' && await p.inputValue('#rev-cat') === 'Outros', 'trocar filtro traz a seleção anterior');
  // Pular todos e encerrar.
  await p.fill('form[data-f=revisaoInicio] [name=de]', '');
  await escolher(p, '#rev-cat', 'Transporte');
  await p.click('text=Começar revisão');
  const antesPular = JSON.stringify(await salvos());
  await p.click('[data-a=revPularTodos]');
  confere(await p.isVisible('text=Revisão concluída!') && JSON.stringify(await salvos()) === antesPular, 'pular todos termina a revisão sem mudar nada');
  await p.click('[data-a=revNova]');
  await p.fill('form[data-f=revisaoInicio] [name=de]', '');
  await escolher(p, '#rev-cat', 'Compras');
  await p.click('text=Começar revisão');
  await p.click('[data-a=revEncerrar]');
  confere(await p.isVisible('h1:has-text("Finanças")'), 'encerrar revisão volta para Finanças');

  // Conta corrente: saldo depois de cada movimento.
  await p.click('.nav >> text=Finanças');
  await p.click('text=🏦 Conta corrente');
  await p.click('[data-a=contaTudo]');
  confere((await p.textContent('.hero .saldo-val')).replace(/\s/g, ' ').includes('2.825,00'), 'conta corrente: saldo atual = entradas − saídas da conta');
  confere(await p.locator('.cc-saldo').count() === 6, 'mostra cada movimentação com o saldo depois dela');
  await p.click('[data-a=contaTudo]');
  await p.evaluate(() => { ui.mes = '2026-03'; render(); });
  confere((await p.textContent('.hero .chips')).replace(/\s/g, ' ').includes('Saldo anterior R$ -30,00') || (await p.textContent('.hero .chips')).replace(/\s/g, ' ').includes('-R$ 30,00'), 'por mês: mostra o saldo anterior');
  await ctx.close();
}

// Lançamentos futuros: recorrente até uma data e data única; só entram no saldo ao confirmar.
async function lancamentosFuturos(navegador, url, erros) {
  console.log('Lançamentos futuros');
  const ctx = await navegador.newContext();
  await ctx.route('**/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.FIREBASE_CONFIG = null;' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push('agenda: ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(url);
  const dados = () => p.evaluate(() => JSON.parse(localStorage.getItem('apg-dados-v1')));
  const datas = await p.evaluate(() => ({ hoje: hoje(), doisMesesAtras: somaDias(hoje(), -61), daqui10: somaDias(hoje(), 10), daqui4meses: somaDias(hoje(), 120) }));

  await p.click('.nav >> text=Finanças');
  await p.click('text=📅 Lançamentos futuros');
  // Recorrente: todo mês, começando há ~2 meses, até daqui a 4 meses.
  await p.click('[data-a=agNovo]');
  await p.fill('dialog [name=desc]', 'Aluguel');
  await p.fill('dialog [name=valor]', '1300');
  await escolher(p, 'dialog [name=categoria]', 'Moradia');
  await p.check('dialog [name=repete][value=mensal]', { force: true });
  await p.fill('dialog [name=inicio]', datas.doisMesesAtras);
  await p.fill('dialog [name=ate]', datas.daqui4meses);
  await p.click('dialog >> text=Salvar');
  // Data única no futuro.
  await p.click('[data-a=agNovo]');
  await p.fill('dialog [name=desc]', 'IPVA');
  await p.fill('dialog [name=valor]', '900');
  await p.check('dialog [name=repete][value=nao]', { force: true });
  await p.fill('dialog [name=inicio]', datas.daqui10);
  await p.click('dialog >> text=Salvar');

  let d = await dados();
  confere(d.agendados.length === 2 && d.lancamentos.length === 0, 'agendar não lança nada nas finanças');
  const vencidos = await p.locator('.ag-aviso [data-a=agConfirmar]').count();
  confere(vencidos >= 2 && vencidos <= 3, 'ocorrências que já venceram pedem confirmação');
  confere(await p.isVisible('text=IPVA') && await p.isVisible('text=Em 10 dias'), 'data futura aparece nos próximos, sem pedir confirmação');

  await p.locator('.ag-aviso [data-a=agConfirmar]').first().click();
  await p.fill('dialog [name=valor]', '1350');
  await p.click('dialog >> text=✓ Confirmar');
  d = await dados();
  confere(d.lancamentos.length === 1 && d.lancamentos[0].valor === 1350 && d.lancamentos[0].categoria === 'Moradia', 'confirmar cria o lançamento com o valor pago');
  await p.locator('.ag-aviso [data-a=agPular]').first().click();
  d = await dados();
  confere(d.lancamentos.length === 1 && Object.values(d.agendados.find(a => a.desc === 'Aluguel').feitos).some(f => f.estado === 'pulado'), 'pular marca a ocorrência sem lançar');

  // Já lançado pelo extrato: confirmar só marca como pago.
  const restante = await p.locator('.ag-aviso [data-a=agConfirmar]').count();
  if (restante) {
    await p.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('apg-dados-v1'));
      const o = vencidos()[0];
      d.lancamentos.push({ id: 'do-extrato', tipo: 'despesa', desc: 'Imobiliária', categoria: 'Moradia', valor: 1300, data: o.data, banco: 'Inter', meio: 'debito' });
      localStorage.setItem('apg-dados-v1', JSON.stringify(d));
    });
    await p.reload();
    await p.click('.nav >> text=Início');
    await p.locator('.ag-aviso [data-a=agConfirmar]').first().click();
    confere(await p.isVisible('dialog >> text=Já existe um lançamento parecido'), 'avisa quando o pagamento já veio pelo extrato');
    await p.click('dialog >> text=✓ Confirmar');
    d = await dados();
    confere(d.lancamentos.length === 2, 'marcar como pago não duplica o lançamento');
  }
  confere(!(await p.isVisible('.ag-aviso')), 'sem nada vencido, o aviso some');
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
    await revisaoEContas(navegador, url, erros);
    await lancamentosFuturos(navegador, url, erros);
    await modoNuvem(navegador, url, erros);
    await triagemEntreAparelhos(navegador, url, erros);
    await cidadesPlanilha(navegador, url, erros);
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
