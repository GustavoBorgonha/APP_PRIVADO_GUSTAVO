'use strict';
/* =========================================================
   Calendário de tarefas do casal.
   - db.tarefas (coleção "tarefas"): { id, titulo, data, hora, para: [pessoaId], obs,
     vistos: { pessoaId: quando }, feito, feitoEm, feitoPor, criadoPor, criadoEm }
   - db.pessoas (coleção "pessoas"): { id, nome, email } — quem recebe tarefas.
   Avisos: o app manda as tarefas abertas para a ponte do Apps Script (a mesma das Cidades),
   que manda mensagem no Telegram (robô próprio, criado no @BotFather) na hora para quem ainda não viu e um resumo por dia às 8h enquanto
   não for marcada como vista. A ponte é idempotente: qualquer aparelho pode reenviar.
   Carregado antes do app.js: só usa coisas dele quando as funções são chamadas.
   ========================================================= */

const pessoas = () => (db.pessoas || []).slice().sort((a, b) => a.nome.localeCompare(b.nome));
const pessoa = id => (db.pessoas || []).find(p => p.id === id);
const tarefa = id => (db.tarefas || []).find(t => t.id === id);

// Quem está usando este aparelho: pelo e-mail do login ou, sem login, pela escolha guardada aqui.
function eu() {
  const email = (App.usuario?.email || '').toLowerCase();
  const porEmail = email && (db.pessoas || []).find(p => (p.email || '').toLowerCase() === email);
  if (porEmail) return porEmail;
  let id = ''; try { id = localStorage.getItem('apg-eu') || ''; } catch (e) { /* sem armazenamento */ }
  return pessoa(id) || null;
}
const naoViu = (t, pid) => !t.feito && (t.para || []).includes(pid) && !(t.vistos || {})[pid];
const paraMim = t => { const e = eu(); return !!e && (t.para || []).includes(e.id); };
const ordemTarefa = (a, b) => (a.data || '9999').localeCompare(b.data || '9999') || (a.hora || '99').localeCompare(b.hora || '99') || a.titulo.localeCompare(b.titulo);

// Tarefas que pedem atenção de quem usa o aparelho (aviso no Início).
function minhasPendencias() {
  const e = eu(); if (!e) return [];
  return (db.tarefas || []).filter(t => !t.feito && (t.para || []).includes(e.id) && (naoViu(t, e.id) || (t.data && t.data <= hoje())))
    .sort(ordemTarefa);
}

function quandoTarefa(t) {
  if (!t.data) return 'Sem data';
  const d = diasEntre(hoje(), t.data);
  const dia = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : d === -1 ? 'Ontem' : fmtData(t.data);
  return dia + (t.hora ? ' às ' + t.hora : '');
}

function linhaTarefa(t) {
  const e = eu(), atrasada = !t.feito && t.data && t.data < hoje();
  const quem = (t.para || []).map(id => {
    const p = pessoa(id); if (!p) return '';
    const viu = (t.vistos || {})[id];
    return `<span class="cal-quem ${viu ? 'viu' : ''}" title="${viu ? 'Viu' : 'Ainda não viu'}">${viu ? '✓' : '👀'} ${esc(p.nome.split(' ')[0])}</span>`;
  }).join('');
  return `<div class="cal-tarefa ${t.feito ? 'feita' : ''} ${atrasada ? 'atrasada' : ''}">
    <input type="checkbox" ${t.feito ? 'checked' : ''} data-c="calFeito" data-i="${esc(t.id)}" aria-label="Concluída">
    <span class="cal-txt" data-a="calEditar" data-v="${esc(t.id)}" role="button" tabindex="0"><strong>${esc(t.titulo)}</strong>
      <small>${atrasada ? '⚠️ ' : ''}${quandoTarefa(t)}${t.obs ? ' · ' + esc(t.obs.slice(0, 60)) : ''}</small>
      <span class="cal-quems">${quem}</span></span>
    ${e && naoViu(t, e.id) ? `<button class="btn mini pri" data-a="calVi" data-v="${esc(t.id)}">👀 Vi</button>` : ''}
  </div>`;
}

// Aviso no Início: tarefas novas para mim e as de hoje/atrasadas.
function avisoTarefas() {
  const v = minhasPendencias(); if (!v.length) return '';
  return `<div class="card cal-aviso">
    <div class="topo secao"><h2>📅 ${v.length === 1 ? '1 tarefa para você' : `${v.length} tarefas para você`}</h2>
      <button class="link" data-a="aba" data-v="calendario">Ver calendário ${IC.seta}</button></div>
    ${v.slice(0, 5).map(linhaTarefa).join('')}
    ${v.length > 5 ? `<p class="muted small" style="margin:8px 0 0">E mais ${v.length - 5} no calendário.</p>` : ''}
  </div>`;
}

function gradeMes(m) {
  const [a, mm] = m.split('-').map(Number);
  const primeiro = new Date(a, mm - 1, 1).getDay(), dias = new Date(a, mm, 0).getDate();
  const porDia = {};
  (db.tarefas || []).forEach(t => { if (t.data && t.data.startsWith(m)) (porDia[t.data] = porDia[t.data] || []).push(t); });
  const cel = [];
  for (let i = 0; i < primeiro; i++) cel.push('<span class="cal-dia vazio"></span>');
  for (let d = 1; d <= dias; d++) {
    const iso = isoData(a, mm, d), ts = porDia[iso] || [];
    const abertas = ts.filter(t => !t.feito).length;
    cel.push(`<button class="cal-dia ${iso === hoje() ? 'hoje' : ''} ${iso === ui.calDia ? 'sel' : ''} ${ts.length ? 'tem' : ''}" data-a="calDia" data-v="${iso}">
      <span>${d}</span>${ts.length ? `<i class="${abertas ? '' : 'ok'}">${abertas || '✓'}</i>` : ''}</button>`);
  }
  return `<div class="cal-semana">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal-grade">${cel.join('')}</div>`;
}

function vCalendario() {
  ui.calMes = ui.calMes || mesAtual();
  ui.calDia = ui.calDia || hoje();
  const e = eu(), ts = (db.tarefas || []);
  const doDia = ts.filter(t => t.data === ui.calDia).sort(ordemTarefa);
  const paraVer = e ? ts.filter(t => naoViu(t, e.id)).sort(ordemTarefa) : [];
  const atrasadas = ts.filter(t => !t.feito && t.data && t.data < hoje()).sort(ordemTarefa);
  const proximas = ts.filter(t => !t.feito && (!t.data || t.data >= hoje())).sort(ordemTarefa).slice(0, 15);
  const semPessoas = !(db.pessoas || []).length;
  const aviso = App.modo === 'nuvem' && (App.semNuvem.tarefas || App.semNuvem.pessoas)
    ? `<p class="tri-aviso forte" style="margin:0 0 16px">⚠️ O calendário está salvo só neste aparelho: ${(App.semNuvem.tarefas || App.semNuvem.pessoas) === 'regras' ? 'falta atualizar as regras do Firebase (veja o CONFIGURAR.md).' : 'não foi possível falar com a nuvem.'}</p>` : '';
  return `
    <div class="topo">
      <div><h1>Calendário</h1><p class="sub" style="margin:0">Tarefas do casal, com aviso no Telegram até marcar como vista.</p></div>
      <button class="btn pri" data-a="calNova" data-v="${ui.calDia}">+ Nova tarefa</button>
    </div>
    ${aviso}${statusAvisos()}
    ${semPessoas ? `<div class="card"><h2>Primeiro passo: quem usa o calendário</h2>
      <p class="muted">Cadastre você e a Sara (nome e e-mail do login). Assim dá para escolher para quem é cada tarefa.</p>
      <button class="btn pri" data-a="calPessoa">+ Cadastrar pessoa</button></div>` : ''}
    ${!semPessoas && !e ? `<div class="card"><h2>Quem é você neste aparelho?</h2>
      <div class="acoes">${pessoas().map(p => `<button class="btn" data-a="calSouEu" data-v="${esc(p.id)}">${esc(p.nome)}</button>`).join('')}</div></div>` : ''}
    ${paraVer.length ? `<div class="card cal-aviso"><h2>👀 Para você ver</h2>${paraVer.map(linhaTarefa).join('')}
      ${paraVer.length > 1 ? `<button class="btn mini" data-a="calViTodas" style="margin-top:8px">Marcar todas como vistas</button>` : ''}</div>` : ''}
    <div class="cols-2">
      <div class="card">
        <div class="cal-topo"><button class="btn mini" data-a="calMes" data-v="-1" aria-label="Mês anterior">‹</button>
          <strong>${nomeMes(ui.calMes).replace(/^./, c => c.toUpperCase())}</strong>
          <button class="btn mini" data-a="calMes" data-v="1" aria-label="Próximo mês">›</button></div>
        ${gradeMes(ui.calMes)}
        <div class="topo secao" style="margin-top:14px"><h2>${ui.calDia === hoje() ? 'Hoje' : fmtData(ui.calDia)}</h2>
          <button class="link" data-a="calNova" data-v="${ui.calDia}">+ Tarefa neste dia</button></div>
        ${doDia.length ? doDia.map(linhaTarefa).join('') : '<p class="muted small" style="margin:0">Nada marcado neste dia.</p>'}
      </div>
      <div class="card">
        ${atrasadas.length ? `<h2>⚠️ Atrasadas</h2>${atrasadas.map(linhaTarefa).join('')}<div style="height:14px"></div>` : ''}
        <h2>Próximas</h2>
        ${proximas.length ? proximas.map(linhaTarefa).join('') : `<div class="vazio">${panda('preguica')}Nenhuma tarefa por fazer.</div>`}
      </div>
    </div>
    ${semPessoas ? '' : cartaoPessoas(e)}`;
}

// Pessoas e a ligação de cada uma com o robô do Telegram.
function cartaoPessoas(e) {
  if (App.modo === 'nuvem' && !estadoTg.carregado && !estadoTg.carregando) carregarTg();
  const tg = estadoTg, link = p => tg.bot ? `https://t.me/${tg.bot}?start=${encodeURIComponent(p.id)}` : '';
  return `<div class="card"><div class="topo secao"><h2>Pessoas e Telegram</h2>
      <span class="acoes">${App.modo === 'nuvem' ? `<button class="link" data-a="calTg">🔄 Atualizar</button>` : ''}<button class="link" data-a="calPessoa">+ Pessoa</button></span></div>
    ${tg.semToken ? `<p class="tri-aviso" style="margin:0 0 10px">Falta criar o robô do Telegram e colocar o código dele na ponte do Google (veja o CONFIGURAR.md).</p>` : ''}
    ${tg.erro ? `<p class="tri-aviso forte" style="margin:0 0 10px">⚠️ ${esc(tg.erro)}</p>` : ''}
    ${pessoas().map(p => {
      const ligado = tg.ligados.includes(p.id);
      return `<div class="cal-pessoa"><span class="cal-txt" data-a="calPessoa" data-v="${esc(p.id)}" role="button" tabindex="0">
        <strong>${esc(p.nome)}${e && e.id === p.id ? ' <small class="muted">(você)</small>' : ''}</strong>
        <small>${App.modo !== 'nuvem' ? '' : tg.carregando && !tg.carregado ? 'Conferindo o Telegram…' : ligado ? '✈️ Telegram conectado' : '🔕 Telegram não conectado'}${p.email ? ' · ' + esc(p.email) : ''}</small></span>
        <span class="acoes">${ligado ? `<button class="btn mini" data-a="calTeste" data-v="${esc(p.id)}">Enviar teste</button>`
          : link(p) ? `<a class="btn mini pri" href="${link(p)}" target="_blank" rel="noopener">Conectar</a><button class="btn mini" data-a="calCopiarTg" data-v="${esc(p.id)}">Copiar link</button>` : ''}</span></div>`;
    }).join('')}
    ${tg.bot ? `<details class="cal-ajuda" style="margin-top:10px"><summary>Como conectar o Telegram (1 vez por pessoa)</summary>
      <ol><li>No celular <b>da pessoa</b>, toque em <b>Conectar</b> (ou mande para ela o link do <b>Copiar link</b>).</li>
        <li>O Telegram abre o robô <b>@${esc(tg.bot)}</b>: toque em <b>Iniciar</b>.</li>
        <li>O robô responde "Avisos ligados". Volte aqui e toque em <b>🔄 Atualizar</b>.</li></ol></details>` : ''}
    ${!App.usuario?.email && e ? `<p class="muted small" style="margin:10px 0 0">Neste aparelho você é <b>${esc(e.nome)}</b>. <button class="link" data-a="calSouEu" data-v="">Trocar</button></p>` : ''}
  </div>`;
}


/* ---------- janelas ---------- */
function modalTarefa(t, dataInicial) {
  const nova = !t, e = eu();
  t = t || { titulo: '', data: dataInicial || hoje(), hora: '', para: (db.pessoas || []).map(p => p.id), obs: '' };
  abrirModal(`
    <h2>${nova ? 'Nova tarefa' : 'Editar tarefa'}</h2>
    <form class="form" data-f="modal">
      <label class="full">O que fazer<input name="titulo" required value="${esc(t.titulo)}" placeholder="Ex.: Ligar para o fotógrafo, Provar o terno"></label>
      <label>Dia<input name="data" type="date" value="${t.data || ''}"></label>
      <label>Hora (opcional)<input name="hora" type="time" value="${t.hora || ''}"></label>
      <div class="full"><span class="rotulo">Para quem</span>
        ${(db.pessoas || []).length ? `<div class="cal-para">${pessoas().map(p => `<label class="escolha"><input type="checkbox" name="para" value="${esc(p.id)}" ${(t.para || []).includes(p.id) ? 'checked' : ''}><span><b>${esc(p.nome)}</b></span></label>`).join('')}</div>`
          : '<p class="muted small" style="margin:4px 0 0">Cadastre as pessoas no calendário para escolher para quem é.</p>'}</div>
      <label class="full">Detalhes<textarea name="obs" rows="3" placeholder="Endereço, telefone, o que levar…">${esc(t.obs || '')}</textarea></label>
      ${!nova && (t.para || []).length ? `<p class="muted small full" style="margin:0">${(t.para || []).map(id => { const p = pessoa(id), v = (t.vistos || {})[id]; return p ? `${esc(p.nome.split(' ')[0])}: ${v ? 'viu em ' + fmtData(v.slice(0, 10)) : 'ainda não viu'}` : ''; }).filter(Boolean).join(' · ')}</p>` : ''}
      <div class="modal-acoes full">
        ${nova ? '' : `<button type="button" class="btn perigo" data-a="calExcluir" data-v="${esc(t.id)}" style="margin-right:auto">Excluir</button>`}
        <button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => {
    const para = [...document.querySelectorAll('#modal input[name=para]:checked')].map(x => x.value);
    const dados = { titulo: String(d.titulo || '').trim(), data: d.data || '', hora: d.data ? (d.hora || '') : '', para, obs: String(d.obs || '').trim() };
    if (!dados.titulo) { alert('Escreva o que precisa ser feito.'); return false; }
    db.tarefas = db.tarefas || [];
    if (nova) {
      // Quem cria já viu: só os outros recebem o aviso.
      const vistos = {}; if (e && para.includes(e.id)) vistos[e.id] = new Date().toISOString();
      db.tarefas.push({ id: 'tf-' + uid(), ...dados, vistos, feito: false, criadoPor: e ? e.id : '', criadoEm: new Date().toISOString() });
      reagir('feliz', 'Tarefa marcada! 📅');
    } else {
      // Mudou o que fazer ou o dia: os outros precisam ver de novo.
      const mudou = t.titulo !== dados.titulo || t.data !== dados.data || t.hora !== dados.hora;
      Object.assign(t, dados);
      if (mudou) { t.vistos = e && para.includes(e.id) ? { [e.id]: new Date().toISOString() } : {}; t.alterada = new Date().toISOString(); }
    }
    ui.calDia = dados.data || ui.calDia; if (dados.data) ui.calMes = dados.data.slice(0, 7);
  });
}

function modalPessoa(p) {
  const nova = !p;
  p = p || { nome: '', email: nova && !(db.pessoas || []).length ? (App.usuario?.email || '') : '' };
  abrirModal(`
    <h2>${nova ? 'Nova pessoa' : 'Editar pessoa'}</h2>
    <form class="form" data-f="modal">
      <label class="full">Nome<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Gustavo, Sara"></label>
      <label class="full">E-mail do login (Google)<input name="email" type="email" value="${esc(p.email || '')}" placeholder="para o app saber quem está usando"></label>
      <div class="modal-acoes full">
        ${nova ? '' : `<button type="button" class="btn perigo" data-a="calExcluirPessoa" data-v="${esc(p.id)}" style="margin-right:auto">Excluir</button>`}
        <button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => {
    const dados = { nome: String(d.nome || '').trim(), email: String(d.email || '').trim().toLowerCase() };
    if (!dados.nome) { alert('Coloque o nome.'); return false; }
    db.pessoas = db.pessoas || [];
    if (nova) db.pessoas.push({ id: 'ps-' + uid(), ...dados });
    else Object.assign(p, dados);
  });
}

/* ---------- avisos: conversa com a ponte do Apps Script ---------- */
let envioAvisos = null, ultimoEnvio = '';
try { ultimoEnvio = localStorage.getItem('apg-avisos-env') || ''; } catch (e) { /* sem armazenamento */ }
const estadoAvisos = { msg: '', erro: false };
const estadoTg = { bot: '', ligados: [], semToken: false, carregado: false, carregando: false, erro: '' };

// Pergunta à ponte qual é o robô e quem já tocou em "Iniciar" nele.
async function carregarTg() {
  estadoTg.carregando = true;
  try {
    const j = await chamarPonte({ acao: 'telegram' });
    Object.assign(estadoTg, { bot: j.bot || '', ligados: j.ligados || [], semToken: !!j.semToken, erro: j.erroTelegram || '' });
  } catch (e) {
    estadoTg.erro = /fetch|network|load failed|abort/i.test(e.message) ? 'Sem conexão com a ponte do Google.' : e.message;
  }
  estadoTg.carregando = false; estadoTg.carregado = true;
  if (ui.aba === 'calendario') renderSeguro();
}

function pacoteAvisos() {
  const tarefas = (db.tarefas || []).filter(t => !t.feito && (t.para || []).length)
    .map(t => ({ id: t.id, titulo: t.titulo, data: t.data || '', hora: t.hora || '', para: t.para, vistos: Object.keys(t.vistos || {}), por: t.criadoPor || '', alterada: t.alterada || '' }));
  const ps = (db.pessoas || []).map(p => ({ id: p.id, nome: p.nome }));
  return { tarefas, pessoas: ps };
}
// Chamado depois de cada salvar(): manda para a ponte se algo dos avisos mudou.
function avisarTarefas(forcar) {
  if (App.modo !== 'nuvem' || !App.idToken || !cfgCidades().url) return;
  const pac = pacoteAvisos(), assin = JSON.stringify(pac);
  if (!forcar && assin === ultimoEnvio) return;
  if (!forcar && !ultimoEnvio && !pac.tarefas.length && !pac.pessoas.length) return;   // calendário nunca usado
  clearTimeout(envioAvisos);
  envioAvisos = setTimeout(() => enviarAvisos(pac, assin), 1500);
}
async function chamarPonte(corpo) {
  const token = await App.idToken();
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(cfgCidades().url, { method: 'POST', body: JSON.stringify({ token, ...corpo }), signal: ctrl.signal });
    const j = await r.json();
    if (!j.ok) throw new Error(j.erro === 'acao-desconhecida' ? 'A ponte do Apps Script está desatualizada: cole o código novo e publique uma nova versão (CONFIGURAR.md).' : (j.motivo || j.erro || 'erro na ponte'));
    return j;
  } finally { clearTimeout(t); }
}
async function enviarAvisos(pac, assin) {
  try {
    const j = await chamarPonte({ acao: 'tarefas', ...pac, site: location.origin + location.pathname });
    ultimoEnvio = assin; try { localStorage.setItem('apg-avisos-env', assin); } catch (e) { /* sem armazenamento */ }
    estadoAvisos.erro = false;
    estadoAvisos.msg = j.falhas && j.falhas.length ? 'Alguns avisos não saíram: ' + j.falhas.join('; ') : '';
  } catch (e) {
    estadoAvisos.erro = true;
    estadoAvisos.msg = /fetch|network|load failed|abort/i.test(e.message) ? 'Sem conexão com a ponte do Google: os avisos do Telegram saem quando voltar.' : e.message;
    setTimeout(() => avisarTarefas(), 5 * 60 * 1000);   // tenta de novo daqui a pouco
  }
  if (ui.aba === 'calendario') renderSeguro();
}
function statusAvisos() {
  if (App.modo !== 'nuvem') return `<p class="tri-aviso" style="margin:0 0 16px">Os avisos do Telegram só funcionam com login (modo nuvem).</p>`;
  return estadoAvisos.msg ? `<p class="tri-aviso ${estadoAvisos.erro ? 'forte' : ''}" style="margin:0 0 16px">⚠️ ${esc(estadoAvisos.msg)}</p>` : '';
}

const acoesCalendario = {
  calNova: v => modalTarefa(null, v),
  calEditar: v => { const t = tarefa(v); if (t) modalTarefa(t); },
  calDia: v => { ui.calDia = v; },
  calMes: v => { ui.calMes = mesDesloc(ui.calMes || mesAtual(), +v); },
  calVi: v => { const t = tarefa(v), e = eu(); if (!t || !e) return; t.vistos = { ...(t.vistos || {}), [e.id]: new Date().toISOString() }; reagir('feliz', 'Visto! 👀'); },
  calViTodas: () => { const e = eu(); if (!e) return; (db.tarefas || []).filter(t => naoViu(t, e.id)).forEach(t => { t.vistos = { ...(t.vistos || {}), [e.id]: new Date().toISOString() }; }); },
  calExcluir: v => {
    const t = tarefa(v); if (!t || !confirm(`Excluir a tarefa "${t.titulo}"?`)) return;
    db.tarefas = db.tarefas.filter(x => x.id !== v); fecharModal();
  },
  calPessoa: v => modalPessoa(v ? pessoa(v) : null),
  calExcluirPessoa: v => {
    const p = pessoa(v); if (!p || !confirm(`Excluir ${p.nome} do calendário? As tarefas dela continuam, só sem essa pessoa.`)) return;
    db.pessoas = db.pessoas.filter(x => x.id !== v);
    (db.tarefas || []).forEach(t => { t.para = (t.para || []).filter(id => id !== v); });
    fecharModal();
  },
  calSouEu: v => { try { if (v) localStorage.setItem('apg-eu', v); else localStorage.removeItem('apg-eu'); } catch (e) { /* sem armazenamento */ } },
  calTg: () => { estadoTg.carregado = false; carregarTg(); },
  calCopiarTg: async v => {
    const p = pessoa(v); if (!p || !estadoTg.bot) return;
    const link = `https://t.me/${estadoTg.bot}?start=${encodeURIComponent(p.id)}`;
    try { await navigator.clipboard.writeText(link); alert(`Link copiado! Mande para ${p.nome} abrir no celular e tocar em "Iniciar".`); }
    catch (e) { prompt('Copie o link:', link); }
  },
  calTeste: async v => {
    const p = pessoa(v); if (!p) return;
    if (App.modo !== 'nuvem') return alert('O teste precisa de login (modo nuvem).');
    try {
      const j = await chamarPonte({ acao: 'teste', pessoa: { id: p.id, nome: p.nome } });
      alert(j.enviado ? `Mensagem de teste enviada para ${p.nome} no Telegram.` : 'Não saiu: ' + (j.resposta || 'sem detalhes'));
    } catch (e) { alert('Não consegui enviar: ' + e.message); }
  },
};
