/**
 * Meu Controle — ponte entre o app e o Google:
 *   - planilha "Cidades_SC_visitadas" (aba Cidades);
 *   - avisos no Telegram das tarefas do calendário (robô próprio, criado no @BotFather).
 *
 * Como instalar (passo a passo no CONFIGURAR.md):
 *   1. Na planilha: Extensões → Apps Script (ou crie um projeto novo em https://script.google.com).
 *      Apague o que houver e cole este código.
 *   2. Preencha EMAILS_PERMITIDOS com os e-mails que podem usar o app.
 *   3. Implantar → Nova implantação → App da Web
 *        Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
 *   4. Autorize e copie o endereço que termina em /exec.
 *   5. Telegram: crie o robô no @BotFather e cole o código (token) dele em TELEGRAM_TOKEN, aqui embaixo.
 *   6. Avisos do calendário: no editor, escolha a função "instalarAvisos" e clique em Executar (1 vez só).
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
// Código (token) do robô do Telegram, que o @BotFather manda ao criar o robô. É senha: não mostre a ninguém.
const TELEGRAM_TOKEN = 'COLE_AQUI_O_TOKEN_DO_BOTFATHER';
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
    if (pedido.acao === 'telegram') return resposta(estadoTelegram());
    if (pedido.acao === 'teste') return resposta(testeAviso(pedido.pessoa || {}));
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
   Avisos no Telegram das tarefas do calendário
   O app manda as tarefas abertas (e as pessoas) sempre que algo muda. A ponte guarda isso e:
     - na hora: avisa cada pessoa de uma tarefa que ela ainda não viu (uma vez por tarefa);
     - todo dia às 8h (relógio criado por instalarAvisos): manda um resumo por pessoa com o que
       ela ainda não viu e o que é para hoje;
     - na hora de cada tarefa/rotina: lembrete no começo de cada período e, se não marcar como feito,
       outro no fim (rotina com "só lembrete" não cobra).
   Grupo (recomendado): no app, "Conectar grupo" abre o Telegram para pôr o robô num grupo do casal
   (o Telegram manda /start grupo lá). Com grupo ligado, tudo vai para o grupo, uma vez só.
   Sem grupo: cada pessoa toca em "Conectar" no app (abre o robô com /start <id da pessoa>).
   A ponte lê essas mensagens (getUpdates) e guarda os chats nas Propriedades do script.
   Nada disso grava no Firebase.
   ========================================================= */
const FUSO = 'America/Sao_Paulo';
const HORA_RESUMO = 8;

function temToken() { return TELEGRAM_TOKEN && TELEGRAM_TOKEN.indexOf('COLE_AQUI') < 0; }

function telegram(metodo, dados) {
  const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/' + metodo, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(dados || {}), muteHttpExceptions: true,
  });
  let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) { j = { ok: false, description: r.getContentText().slice(0, 140) }; }
  return j;
}

// Lê quem tocou em "Iniciar" no robô e guarda o chat de cada pessoa.
function lerTelegram() {
  if (!temToken()) return {};
  const props = PropertiesService.getScriptProperties();
  const chats = JSON.parse(props.getProperty('tgChats') || '{}');
  const offset = Number(props.getProperty('tgOffset') || 0);
  const j = telegram('getUpdates', { offset: offset, timeout: 0, allowed_updates: ['message'] });
  if (!j.ok) throw new Error('Telegram: ' + (j.description || 'erro'));
  let ultimo = offset - 1;
  (j.result || []).forEach(function (u) {
    ultimo = Math.max(ultimo, u.update_id);
    const m = u.message; if (!m || !m.chat) return;
    if (m.migrate_to_chat_id && chats._grupo === m.chat.id) chats._grupo = m.migrate_to_chat_id;   // grupo virou supergrupo
    if (!m.text) return;
    const id = (m.text.match(/^\/start(?:@\S+)?\s+(\S+)/) || [])[1];
    if (id === 'grupo') {
      chats._grupo = m.chat.id;
      telegram('sendMessage', { chat_id: m.chat.id, text: '🐼 Oi, casal! A partir de agora os avisos do calendário do Meu Controle chegam neste grupo. Voltem ao app e toquem em 🔄 Atualizar.' });
    } else if (id) {
      chats[id] = m.chat.id;
      telegram('sendMessage', { chat_id: m.chat.id, text: '🐼 Pronto! Os avisos do calendário do Meu Controle vão chegar aqui. Pode voltar para o app e tocar em 🔄 Atualizar.' });
    } else if (/^\/start/.test(m.text)) {
      telegram('sendMessage', { chat_id: m.chat.id, text: 'Para ligar os avisos, abra o app → Configurações → Pessoas e Telegram → Conectar.' });
    }
  });
  props.setProperty('tgChats', JSON.stringify(chats));
  if (ultimo >= offset) props.setProperty('tgOffset', String(ultimo + 1));
  return chats;
}

function estadoTelegram() {
  if (!temToken()) return { ok: true, semToken: true, ligados: [] };
  try {
    const props = PropertiesService.getScriptProperties();
    let bot = props.getProperty('tgBot');
    if (!bot) {
      const me = telegram('getMe');
      if (!me.ok) return { ok: true, ligados: [], erroTelegram: 'O Telegram recusou o token do robô (' + (me.description || 'erro') + '). Confira TELEGRAM_TOKEN.' };
      bot = me.result.username; props.setProperty('tgBot', bot);
    }
    const chats = lerTelegram();
    return { ok: true, bot: bot, ligados: Object.keys(chats).filter(function (k) { return k !== '_grupo'; }), grupo: !!chats._grupo };
  } catch (e) {
    return { ok: true, ligados: [], erroTelegram: String((e && e.message) || e) };
  }
}

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

const html = function (s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

// Avisa cada pessoa das tarefas que ela ainda não viu e que ainda não foram avisadas.
// Tarefa alterada (dia/hora/texto) conta como nova.
function avisarNovas(dados) {
  let chats = {};
  try { chats = lerTelegram(); } catch (e) { return { enviados: 0, falhas: [String(e.message || e)] }; }
  const props = PropertiesService.getScriptProperties();
  const avisados = JSON.parse(props.getProperty('avisados') || '{}');
  const pessoas = {}; dados.pessoas.forEach(function (p) { pessoas[p.id] = p; });
  const novo = {}, falhas = []; let enviados = 0;
  const primeiro = function (id) { return pessoas[id] ? html(pessoas[id].nome.split(' ')[0]) : ''; };
  if (chats._grupo) {
    // Grupo: uma mensagem por tarefa, dizendo para quem é e quem ainda não viu.
    dados.tarefas.forEach(function (t) {
      const falta = (t.para || []).filter(function (pid) { return (t.vistos || []).indexOf(pid) < 0; });
      if (!falta.length) return;
      const chave = t.id + '|grupo|' + (t.alterada || '');
      if (avisados[chave]) { novo[chave] = avisados[chave]; return; }
      const texto = '🐼 <b>' + (ehRotina(t) ? 'Nova rotina' : 'Nova tarefa') + (primeiro(t.por) ? ' de ' + primeiro(t.por) : '') + '</b>\n' + html(t.titulo) + '\n📅 ' + quando(t) +
        '\n👤 Para: ' + (t.para || []).map(primeiro).filter(Boolean).join(' e ') +
        '\n\nAbram o app e toquem em "👀 Vi" para parar os avisos.' + (dados.site ? '\n' + html(dados.site) : '');
      const r = mandar(chats._grupo, texto);
      if (r.enviado) { novo[chave] = new Date().toISOString(); enviados++; } else falhas.push('Grupo: ' + r.resposta);
    });
    props.setProperty('avisados', JSON.stringify(novo));
    return { enviados: enviados, falhas: falhas };
  }
  dados.tarefas.forEach(function (t) {
    (t.para || []).forEach(function (pid) {
      const chave = t.id + '|' + pid + '|' + (t.alterada || '');
      if ((t.vistos || []).indexOf(pid) >= 0) return;
      if (avisados[chave]) { novo[chave] = avisados[chave]; return; }
      if (!chats[pid]) return;
      const autor = pessoas[t.por] ? pessoas[t.por].nome.split(' ')[0] : '';
      const texto = '🐼 <b>' + (ehRotina(t) ? 'Nova rotina' : 'Nova tarefa') + (autor ? ' de ' + html(autor) : '') + '</b>\n' + html(t.titulo) + '\n📅 ' + quando(t) +
        '\n\nAbra o app e toque em "👀 Vi" para parar os avisos.' + (dados.site ? '\n' + html(dados.site) : '');
      const r = mandar(chats[pid], texto);
      if (r.enviado) { novo[chave] = new Date().toISOString(); enviados++; }
      else falhas.push((pessoas[pid] ? pessoas[pid].nome : pid) + ': ' + r.resposta);
    });
  });
  props.setProperty('avisados', JSON.stringify(novo));   // só guarda o que ainda existe
  return { enviados: enviados, falhas: falhas };
}

// Relógio a cada 5 minutos (criado por instalarAvisos): reenvia o que falhou, lembra na hora e manda o resumo das 8h.
function avisosDeHora() {
  const dados = lerGrande('tarefas');
  if (!dados || !temToken()) return;
  const trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    avisarNovas(dados);
    const chats = JSON.parse(PropertiesService.getScriptProperties().getProperty('tgChats') || '{}');
    lembrarNaHora(dados, chats);
    const props = PropertiesService.getScriptProperties();
    const hojeTxt = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
    const hora = Number(Utilities.formatDate(new Date(), FUSO, 'H'));
    // Resumo só na hora certa (8h): se o relógio for ligado à tarde, não manda "Bom dia" fora de hora.
    if (hora !== HORA_RESUMO || props.getProperty('resumoEm') === hojeTxt) return;
    const partes = [];
    dados.pessoas.forEach(function (p) {
      if (!chats[p.id] && !chats._grupo) return;
      const minhas = dados.tarefas.filter(function (t) { return (t.para || []).indexOf(p.id) >= 0; });
      const naoViu = minhas.filter(function (t) { return (t.vistos || []).indexOf(p.id) < 0; });
      const hoje = minhas.filter(function (t) {
        if (naoViu.indexOf(t) >= 0) return false;
        if (ehRotina(t)) return ocorreEm(t, hojeTxt) && !feitoNo(t, hojeTxt);
        return t.data && (t.soLembrete ? t.data === hojeTxt : t.data <= hojeTxt);
      });
      if (!naoViu.length && !hoje.length) return;
      const item = function (t) { return '• ' + html(t.titulo) + ' (' + (ehRotina(t) && ocorreEm(t, hojeTxt) ? 'hoje' + (horarioTxt(t) ? ', ' + horarioTxt(t) : '') : quando(t)) + ')'; };
      if (chats._grupo) {
        let parte = '<b>' + html(p.nome.split(' ')[0]) + '</b>';
        if (naoViu.length) parte += '\n👀 Ainda não viu:\n' + naoViu.map(item).join('\n');
        if (hoje.length) parte += '\n📌 Para hoje / atrasadas:\n' + hoje.map(item).join('\n');
        partes.push(parte);
        return;
      }
      let texto = '🐼 <b>Bom dia, ' + html(p.nome.split(' ')[0]) + '!</b>';
      if (naoViu.length) texto += '\n\n👀 <b>Ainda não vistas:</b>\n' + naoViu.map(item).join('\n');
      if (hoje.length) texto += '\n\n📌 <b>Para hoje / atrasadas:</b>\n' + hoje.map(item).join('\n');
      if (naoViu.length) texto += '\n\nToque em "👀 Vi" no app para parar os avisos.';
      if (dados.site) texto += '\n' + html(dados.site);
      mandar(chats[p.id], texto);
    });
    if (chats._grupo && partes.length) {
      mandar(chats._grupo, '🐼 <b>Bom dia, casal!</b>\n\n' + partes.join('\n\n') + '\n\nToquem em "👀 Vi" no app para parar os avisos.' + (dados.site ? '\n' + html(dados.site) : ''));
    }
    props.setProperty('resumoEm', hojeTxt);
  } finally { trava.releaseLock(); }
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function dataBr(iso) { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function horariosDe(t) { return [{ hora: t.hora || '', horaFim: t.horaFim || '' }].concat(t.mais || []).filter(function (h) { return h.hora; }); }
function horarioTxt(t) {
  const hs = horariosDe(t); if (!hs.length) return '';
  return hs.map(function (h) { return h.horaFim ? (hs.length > 1 ? h.hora + '–' + h.horaFim : 'das ' + h.hora + ' às ' + h.horaFim) : (hs.length > 1 ? h.hora : 'às ' + h.hora); }).join(' e ');
}
function ehRotina(t) { return t.repete && t.repete !== 'nao'; }
// Quando é a tarefa: dia e horário, ou a regra da rotina.
function quando(t) {
  if (!t.data) return 'sem data';
  const h = horarioTxt(t);
  if (!ehRotina(t)) return dataBr(t.data) + (h ? ', ' + h : '');
  const q = t.repete === 'diaria' ? 'todo dia' : t.repete === 'semanal' ? 'toda ' + (t.dias || []).map(function (d) { return SEMANA[d]; }).join(', ')
    : 'todo dia ' + Number(t.data.slice(8)) + ' do mês';
  return q + (h ? ', ' + h : '') + (t.ate ? ' (até ' + dataBr(t.ate) + ')' : '');
}
function ocorreEm(t, iso) {
  if (!t.data || iso < t.data) return false;
  if (!ehRotina(t)) return iso === t.data;
  if (t.ate && iso > t.ate) return false;
  if (t.repete === 'diaria') return true;
  if (t.repete === 'semanal') return (t.dias || []).indexOf(new Date(iso + 'T12:00:00Z').getUTCDay()) >= 0;
  if (t.repete === 'mensal') {
    const p = iso.split('-').map(Number), ultimo = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
    return p[2] === Math.min(Number(t.data.slice(8)), ultimo);
  }
  return false;
}
function feitoNo(t, iso) { return ehRotina(t) && (t.feitos || []).indexOf(iso) >= 0; }
function maisMinutos(hora, min) {
  const p = hora.split(':').map(Number), tot = Math.min(23 * 60 + 59, p[0] * 60 + p[1] + min);
  return ('0' + Math.floor(tot / 60)).slice(-2) + ':' + ('0' + (tot % 60)).slice(-2);
}
function minutos(hora) { const p = hora.split(':').map(Number); return p[0] * 60 + p[1]; }

// Lembretes na hora: no começo de cada período e, se ninguém marcar como feito, no fim do último
// período (ou 1 hora depois da hora, quando não há fim). "Só lembrete" não cobra o feito.
// Só lembra do que é recente (até 1 hora de atraso), para não mandar um monte de uma vez.
function lembrarNaHora(dados, chats) {
  const props = PropertiesService.getScriptProperties();
  const agora = new Date(), hojeTxt = Utilities.formatDate(agora, FUSO, 'yyyy-MM-dd'), hm = Utilities.formatDate(agora, FUSO, 'HH:mm');
  const ja = JSON.parse(props.getProperty('lembretes') || '{}'), novo = {};
  Object.keys(ja).forEach(function (k) { if (k.indexOf('|' + hojeTxt + '|') >= 0) novo[k] = ja[k]; });
  const pessoas = {}; dados.pessoas.forEach(function (p) { pessoas[p.id] = p; });
  const destinos = function (t) {
    if (chats._grupo) return [chats._grupo];
    return (t.para || []).map(function (pid) { return chats[pid]; }).filter(Boolean);
  };
  const para = function (t) { return (t.para || []).map(function (pid) { return pessoas[pid] ? html(pessoas[pid].nome.split(' ')[0]) : ''; }).filter(Boolean).join(' e '); };
  const enviar = function (t, chave, texto) {
    if (novo[chave]) return;
    destinos(t).forEach(function (c) { mandar(c, texto); });
    novo[chave] = agora.toISOString();
  };
  dados.tarefas.forEach(function (t) {
    if (!ocorreEm(t, hojeTxt) || feitoNo(t, hojeTxt)) return;
    const hs = horariosDe(t); if (!hs.length) return;
    const quem = chats._grupo && para(t) ? '\n👤 ' + para(t) : '';
    hs.forEach(function (h) {
      const atraso = minutos(hm) - minutos(h.hora);
      if (atraso >= 0 && atraso <= 60) {
        enviar(t, t.id + '|' + hojeTxt + '|' + h.hora, '⏰ <b>Agora:</b> ' + html(t.titulo) + '\n🕒 ' + (h.horaFim ? h.hora + ' às ' + h.horaFim : h.hora) + quem +
          (t.soLembrete ? '' : '\n\nQuando fizer, marque no app ✅'));
      }
    });
    if (t.soLembrete) return;
    const ult = hs[hs.length - 1], fim = ult.horaFim || maisMinutos(ult.hora, 60);
    const atrasoFim = minutos(hm) - minutos(fim);
    if (atrasoFim >= 0 && atrasoFim <= 120) {
      enviar(t, t.id + '|' + hojeTxt + '|fim', '⚠️ <b>Ainda não marcado como feito:</b> ' + html(t.titulo) + ' (' + horarioTxt(t) + ')' + quem +
        (dados.site ? '\n' + html(dados.site) : ''));
    }
  });
  props.setProperty('lembretes', JSON.stringify(novo));
}

function mandar(chat, texto) {
  try {
    let j = telegram('sendMessage', { chat_id: chat, text: texto, parse_mode: 'HTML', disable_web_page_preview: true });
    const novoId = j.parameters && j.parameters.migrate_to_chat_id;
    if (!j.ok && novoId) {
      // O grupo virou supergrupo e ganhou outro número: atualiza e tenta de novo.
      const props = PropertiesService.getScriptProperties();
      const chats = JSON.parse(props.getProperty('tgChats') || '{}');
      Object.keys(chats).forEach(function (k) { if (chats[k] === chat) chats[k] = novoId; });
      props.setProperty('tgChats', JSON.stringify(chats));
      j = telegram('sendMessage', { chat_id: novoId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true });
    }
    return { enviado: !!j.ok, resposta: j.ok ? '' : (j.description || 'erro') };
  } catch (e) {
    return { enviado: false, resposta: String((e && e.message) || e) };
  }
}

function testeAviso(p) {
  if (!temToken()) return { ok: true, enviado: false, resposta: 'Falta colocar o token do robô em TELEGRAM_TOKEN.' };
  let chats = {};
  try { chats = lerTelegram(); } catch (e) { return { ok: true, enviado: false, resposta: String(e.message || e) }; }
  if (p.id === '_grupo') {
    if (!chats._grupo) return { ok: true, enviado: false, resposta: 'O robô ainda não foi colocado no grupo.' };
    const rg = mandar(chats._grupo, '🐼 Oi, casal! Os avisos do calendário do Meu Controle estão funcionando neste grupo. ✅');
    return { ok: true, enviado: rg.enviado, resposta: rg.resposta };
  }
  if (!chats[p.id]) return { ok: true, enviado: false, resposta: 'Essa pessoa ainda não tocou em "Iniciar" no robô.' };
  const r = mandar(chats[p.id], '🐼 Oi, ' + html(String(p.nome || '').split(' ')[0]) + '! Os avisos do calendário do Meu Controle estão funcionando. ✅');
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

// Rode no editor (escolha "instalarAvisos" e clique em Executar): cria o relógio que roda a cada 5 minutos.
function instalarAvisos() {
  ScriptApp.getProjectTriggers().forEach(function (g) { if (g.getHandlerFunction() === 'avisosDeHora') ScriptApp.deleteTrigger(g); });
  ScriptApp.newTrigger('avisosDeHora').timeBased().everyMinutes(5).create();
  Logger.log('Pronto: o relógio dos avisos foi criado (roda a cada 5 minutos: lembretes na hora e resumo às ' + HORA_RESUMO + 'h).');
}

// Diagnóstico do Telegram: escolha "testarTelegram" e clique em Executar; o resultado aparece no registro.
function testarTelegram() {
  if (!temToken()) { Logger.log('Falta colar o token do @BotFather em TELEGRAM_TOKEN.'); return; }
  PropertiesService.getScriptProperties().deleteProperty('tgBot');
  Logger.log(JSON.stringify(estadoTelegram()));
}
