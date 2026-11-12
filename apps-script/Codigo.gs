/**
 * Meu Controle — ponte entre o app e a planilha "Cidades_SC_visitadas".
 *
 * Como instalar (passo a passo no CONFIGURAR.md):
 *   1. Na planilha: Extensões → Apps Script. Apague o que houver e cole este código.
 *   2. Preencha EMAILS_PERMITIDOS com os e-mails que podem usar o app.
 *   3. Implantar → Nova implantação → App da Web
 *        Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
 *   4. Autorize e copie o endereço que termina em /exec.
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
// Colunas da aba Cidades: A Município · B Microrregião · C Mesorregião · D Visitei? · E Data da visita · F Observações · G Latitude · H Longitude

function doGet() {
  return resposta({ ok: true, info: 'Ponte do Meu Controle funcionando. O app usa este endereço.' });
}

function doPost(e) {
  try {
    const pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!conferirLogin(pedido.token)) return resposta({ ok: false, erro: 'nao-autorizado' });
    const aba = SpreadsheetApp.getActive().getSheetByName(ABA);
    if (!aba) return resposta({ ok: false, erro: 'aba-nao-encontrada' });
    if (pedido.acao === 'salvar' && Array.isArray(pedido.mudancas) && pedido.mudancas.length) {
      const trava = LockService.getDocumentLock();
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
function conferirLogin(token) {
  if (!token) return false;
  const cache = CacheService.getScriptCache();
  const chave = 'login_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  if (cache.get(chave)) return true;
  const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) return false;
  const usuarios = JSON.parse(r.getContentText()).users || [];
  const u = usuarios[0];
  if (!u || !u.emailVerified) return false;
  const email = String(u.email || '').toLowerCase();
  const permitidos = EMAILS_PERMITIDOS.map(function (x) { return String(x).toLowerCase().trim(); });
  if (permitidos.indexOf(email) < 0) return false;
  cache.put(chave, email, 300);
  return true;
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
