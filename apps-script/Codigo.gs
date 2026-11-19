/**
 * Meu Controle — ponte entre o app e o Google:
 *   - planilha "Cidades_SC_visitadas" (aba Cidades);
 *   - avisos de WhatsApp das tarefas do calendário (pelo CallMeBot).
 *
 * Como instalar (passo a passo no CONFIGURAR.md):
 *   1. Na planilha: Extensões → Apps Script (ou crie um projeto novo em https://script.google.com).
 *      Apague o que houver e cole este código.
 *   2. Preencha EMAILS_PERMITIDOS com os e-mails que podem usar o app.
 *   3. Implantar → Nova implantação → App da Web
 *        Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
 *   4. Autorize e copie o endereço que termina em /exec.
 *   5. Avisos do calendário: no editor, escolha a função "instalarAvisos" e clique em Executar (1 vez só).
 *      Ela cria o relógio que manda o resumo diário às 8h e reenvia avisos que falharam.
 *   Ao trocar o código: Implantar → Gerenciar implantações → lápis → Versão: "Nova versão" → Implantar
 *   (assim o endereço /exec continua o mesmo).
 *
 * Segurança: o endereço é público, mas a ponte só responde se o app mandar um login
 * válido do Firebase de um e-mail desta lista. Ela só mexe nas colunas
 * "Visitei?", "Data da visita" e "Observações" da aba "Cidades".
 */

// Chave pública do Firebase do app (a mesma do firebase-config.js; não é senha).
const FIREBASE_API_KEY = 'AIzaSyCxPbRVCEDeH0dod1imsw5QLFJfKVw7Nis';
// Quem pode ler e gravar (em minúsculas).
const EMAILS_PERMITIDOS = ['seu-email@gmail.com'];
const ABA = 'Cidades';
// A planilha é aberta pelo ID: funciona tanto colado dentro da planilha quanto num projeto novo em script.google.com.
const PLANILHA_ID = '1pkkeJRWrSxaPUr93GzzqH0mPm-cBv3GuuGqb31PE5Y8';
// Colunas da aba Cidades: A Município · B Microrregião · C Mesorregião · D Visitei? · E Data da visita · F Observações · G Latitude · H Longitude

function doGet() {
  return resposta({ ok: true, info: 'Ponte do Meu Controle funcionando. O app usa este endereço.' });
}

function doPost(e) {
  try {
    const pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const login = conferirLogin(pedido.token);
    if (!login.ok) return resposta({ ok: false, erro: 'nao-autorizado', motivo: login.motivo });
    if (pedido.acao === 'tarefas') return resposta(receberTarefas(pedido));
    if (pedido.acao === 'testeWhats') return resposta(testeWhats(pedido.pessoa || {}));
    if (pedido.acao && ['ler', 'salvar'].indexOf(pedido.acao) < 0) return resposta({ ok: false, erro: 'acao-desconhecida' });
    const aba = SpreadsheetApp.openById(PLANILHA_ID).getSheetByName(ABA);
    if (!aba) return resposta({ ok: false, erro: 'aba-nao-encontrada' });
    if (pedido.acao === 'salvar' && Array.isArray(pedido.mudancas) && pedido.mudancas.length) {
      const trava = LockService.getScriptLock();
      trava.waitLock(20000);
      try { salvar(aba, pedido.mudancas); } finally { trava.releaseLock(); }
    }
    return resposta({ ok: true, cidades: ler(aba), em: new Date().toISOString() });
  } catch (err) {
    return resposta({ ok: false, erro: String((err && err.message) || err) });
  }
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Confere o login com o Firebase e se o e-mail está na lista. Guarda o resultado por 5 minutos.
// Devolve { ok, motivo } — o motivo aparece no aviso do app quando algo dá errado.
function conferirLogin(token) {
  if (!token) return { ok: false, motivo: 'O app não mandou o login.' };
  const cache = CacheService.getScriptCache();
  const chave = 'login_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  if (cache.get(chave)) return { ok: true };
  const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) {
    let detalhe = '';
    try { detalhe = JSON.parse(r.getContentText()).error.message; } catch (e) { detalhe = r.getContentText().slice(0, 120); }
    return { ok: false, motivo: 'O Firebase não confirmou o login (' + r.getResponseCode() + ' ' + detalhe + ').' };
  }
  const u = (JSON.parse(r.getContentText()).users || [])[0];
  if (!u) return { ok: false, motivo: 'O Firebase não encontrou o usuário deste login.' };
  if (!u.emailVerified) return { ok: false, motivo: 'O e-mail da conta não está verificado.' };
  const email = String(u.email || '').toLowerCase();
  const permitidos = EMAILS_PERMITIDOS.map(function (x) { return String(x).toLowerCase().trim(); });
  if (permitidos.indexOf(email) < 0) return { ok: false, motivo: 'O e-mail ' + email + ' não está em EMAILS_PERMITIDOS no Apps Script.' };
  cache.put(chave, email, 300);
  return { ok: true };
}

// Devolve todas as cidades como texto, do jeito que aparecem na planilha.
function ler(aba) {
  const ultima = aba.getLastRow();
  if (ultima < 2) return [];
  return aba.getRange(2, 1, ultima - 1, 8).getDisplayValues().filter(function (r) { return r[0]; });
}

// Grava "Visitei?", "Data da visita" e "Observações" das cidades alteradas no app.
function salvar(aba, mudancas) {
  const ultima = aba.getLastRow();
  if (ultima < 2) return;
  const nomes = aba.getRange(2, 1, ultima - 1, 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); });
  mudancas.forEach(function (m) {
    const i = nomes.indexOf(String(m.municipio || '').trim());
    if (i < 0) return;
    aba.getRange(i + 2, 4, 1, 3).setValues([[m.visitei ? 'Sim' : 'Não', m.data || '', m.obs || '']]);
  });
  SpreadsheetApp.flush();
}

// Diagnóstico: no editor, escolha "testarChave" e clique em Executar; o resultado aparece no "Registro de execução".
// Chave certa  → 400 ... INVALID_ID_TOKEN  (normal: o teste manda um login falso de propósito)
// Chave errada → 400 ... API key not valid
function testarChave() {
  const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: 'teste' }), muteHttpExceptions: true,
  });
  Logger.log('Chave usada: ' + FIREBASE_API_KEY + ' (' + FIREBASE_API_KEY.length + ' caracteres)');
  Logger.log(r.getResponseCode() + ' ' + r.getContentText());
}


/* =========================================================
   Avisos de WhatsApp das tarefas do calendário
   O app manda as tarefas abertas (e as pessoas, com WhatsApp e chave do CallMeBot) sempre que
   algo muda. A ponte guarda isso e:
     - na hora: avisa cada pessoa de uma tarefa que ela ainda não viu (uma vez por tarefa);
     - todo dia às 8h (relógio criado por instalarAvisos): manda um resumo por pessoa com o que
       ela ainda não viu e o que é para hoje.
   Nada disso grava no Firebase: o que já foi avisado fica nas Propriedades do script.
   ========================================================= */
const FUSO = 'America/Sao_Paulo';
const HORA_RESUMO = 8;

function receberTarefas(pedido) {
  const trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    const dados = {
      tarefas: Array.isArray(pedido.tarefas) ? pedido.tarefas.slice(0, 500) : [],
      pessoas: Array.isArray(pedido.pessoas) ? pedido.pessoas.slice(0, 20) : [],
      site: String(pedido.site || ''), em: new Date().toISOString(),
    };
    guardarGrande('tarefas', dados);
    const r = avisarNovas(dados);
    return { ok: true, enviados: r.enviados, falhas: r.falhas };
  } finally { trava.releaseLock(); }
}

// Avisa cada pessoa das tarefas que ela ainda não viu e que ainda não foram avisadas.
// Tarefa alterada (dia/hora/texto) conta como nova.
function avisarNovas(dados) {
  const props = PropertiesService.getScriptProperties();
  const avisados = JSON.parse(props.getProperty('avisados') || '{}');
  const pessoas = {}; dados.pessoas.forEach(function (p) { pessoas[p.id] = p; });
  const novo = {}, falhas = []; let enviados = 0;
  dados.tarefas.forEach(function (t) {
    (t.para || []).forEach(function (pid) {
      const chave = t.id + '|' + pid + '|' + (t.alterada || '');
      if ((t.vistos || []).indexOf(pid) >= 0) return;
      if (avisados[chave]) { novo[chave] = avisados[chave]; return; }
      const p = pessoas[pid];
      if (!p || !p.whats || !p.chave) return;
      const autor = pessoas[t.por] ? pessoas[t.por].nome.split(' ')[0] : '';
      const texto = '🐼 *Nova tarefa' + (autor ? ' de ' + autor : '') + '*\n' + t.titulo + '\n📅 ' + quando(t) +
        '\n\nAbra o app e toque em "👀 Vi" para parar os avisos.' + (dados.site ? '\n' + dados.site : '');
      const r = mandarWhats(p, texto);
      if (r.enviado) { novo[chave] = new Date().toISOString(); enviados++; }
      else falhas.push(p.nome + ': ' + r.resposta);
    });
  });
  props.setProperty('avisados', JSON.stringify(novo));   // só guarda o que ainda existe
  return { enviados: enviados, falhas: falhas };
}

// Relógio de hora em hora (criado por instalarAvisos): reenvia o que falhou e manda o resumo das 8h.
function avisosDeHora() {
  const dados = lerGrande('tarefas');
  if (!dados) return;
  const trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    avisarNovas(dados);
    const props = PropertiesService.getScriptProperties();
    const hojeTxt = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
    const hora = Number(Utilities.formatDate(new Date(), FUSO, 'H'));
    if (hora < HORA_RESUMO || hora >= 22 || props.getProperty('resumoEm') === hojeTxt) return;
    dados.pessoas.forEach(function (p) {
      if (!p.whats || !p.chave) return;
      const minhas = dados.tarefas.filter(function (t) { return (t.para || []).indexOf(p.id) >= 0; });
      const naoViu = minhas.filter(function (t) { return (t.vistos || []).indexOf(p.id) < 0; });
      const hoje = minhas.filter(function (t) { return t.data && t.data <= hojeTxt && naoViu.indexOf(t) < 0; });
      if (!naoViu.length && !hoje.length) return;
      let texto = '🐼 *Bom dia, ' + p.nome.split(' ')[0] + '!*';
      if (naoViu.length) texto += '\n\n👀 *Ainda não vistas:*\n' + naoViu.map(function (t) { return '• ' + t.titulo + ' (' + quando(t) + ')'; }).join('\n');
      if (hoje.length) texto += '\n\n📌 *Para hoje / atrasadas:*\n' + hoje.map(function (t) { return '• ' + t.titulo + ' (' + quando(t) + ')'; }).join('\n');
      if (naoViu.length) texto += '\n\nToque em "👀 Vi" no app para parar os avisos.';
      if (dados.site) texto += '\n' + dados.site;
      mandarWhats(p, texto);
    });
    props.setProperty('resumoEm', hojeTxt);
  } finally { trava.releaseLock(); }
}

function quando(t) {
  if (!t.data) return 'sem data';
  const p = t.data.split('-');
  return p[2] + '/' + p[1] + '/' + p[0] + (t.hora ? ' às ' + t.hora : '');
}

function mandarWhats(p, texto) {
  try {
    const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(String(p.whats).replace(/\D/g, '')) +
      '&text=' + encodeURIComponent(texto) + '&apikey=' + encodeURIComponent(p.chave);
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const corpo = r.getContentText().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const ok = r.getResponseCode() === 200 && !/error|invalid|not allowed|paused/i.test(corpo);
    return { enviado: ok, resposta: ok ? '' : (r.getResponseCode() + ' ' + corpo.slice(0, 140)) };
  } catch (e) {
    return { enviado: false, resposta: String((e && e.message) || e) };
  }
}

function testeWhats(p) {
  if (!p.whats || !p.chave) return { ok: true, enviado: false, resposta: 'Falta o WhatsApp ou a chave.' };
  const r = mandarWhats(p, '🐼 Oi, ' + String(p.nome || '').split(' ')[0] + '! Os avisos do calendário do Meu Controle estão funcionando. ✅');
  return { ok: true, enviado: r.enviado, resposta: r.resposta };
}

// Guarda um objeto grande nas Propriedades do script (cada propriedade aceita ~9 mil caracteres).
function guardarGrande(nome, obj) {
  const props = PropertiesService.getScriptProperties();
  const txt = JSON.stringify(obj), partes = [];
  for (let i = 0; i < txt.length; i += 8000) partes.push(txt.slice(i, i + 8000));
  const antes = Number(props.getProperty(nome + '_n') || 0);
  const novo = {}; partes.forEach(function (p, i) { novo[nome + '_' + i] = p; });
  novo[nome + '_n'] = String(partes.length);
  props.setProperties(novo);
  for (let i = partes.length; i < antes; i++) props.deleteProperty(nome + '_' + i);
}
function lerGrande(nome) {
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty(nome + '_n') || 0);
  if (!n) return null;
  let txt = '';
  for (let i = 0; i < n; i++) txt += props.getProperty(nome + '_' + i) || '';
  try { return JSON.parse(txt); } catch (e) { return null; }
}

// Rode 1 vez no editor (escolha "instalarAvisos" e clique em Executar): cria o relógio de hora em hora.
function instalarAvisos() {
  ScriptApp.getProjectTriggers().forEach(function (g) { if (g.getHandlerFunction() === 'avisosDeHora') ScriptApp.deleteTrigger(g); });
  ScriptApp.newTrigger('avisosDeHora').timeBased().everyHours(1).create();
  Logger.log('Pronto: o relógio dos avisos foi criado (roda de hora em hora; resumo às ' + HORA_RESUMO + 'h).');
}
