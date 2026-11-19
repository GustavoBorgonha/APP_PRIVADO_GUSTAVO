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
/* ---------- rotinas ----------
   Tarefa com "repete" (diaria | semanal | mensal) é uma rotina: começa em "data", vai até "ate"
   (vazio = sem fim) e cada dia tem a sua marcação em "feitos" { 'AAAA-MM-DD': { em, por } }.
   Tarefa de uma vez usa "feito". Hora é obrigatória; "horaFim" (opcional) faz um período. */
const REPETE_T = { nao: 'Uma vez', diaria: 'Todo dia', semanal: 'Dias da semana', mensal: 'Todo mês' };
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const ehRotina = t => !!t.repete && t.repete !== 'nao';
const diaSemana = iso => new Date(iso + 'T12:00:00').getDay();
function ocorreEm(t, iso) {
  if (!t.data || iso < t.data) return false;
  if (!ehRotina(t)) return iso === t.data;
  if (t.ate && iso > t.ate) return false;
  if (t.repete === 'diaria') return true;
  if (t.repete === 'semanal') return (t.dias || []).includes(diaSemana(iso));
  if (t.repete === 'mensal') {
    const dia = +t.data.slice(8), [a, m, d] = iso.split('-').map(Number), ultimo = new Date(a, m, 0).getDate();
    return d === Math.min(dia, ultimo);
  }
  return false;
}
const feitoNo = (t, iso) => ehRotina(t) ? !!(t.feitos || {})[iso] : !!t.feito;
const rotinaAtiva = t => ehRotina(t) && (!t.ate || t.ate >= hoje());
// Próxima data (a partir de "de") em que a tarefa acontece, procurando até ~1 ano.
function proximaData(t, de = hoje()) {
  if (!ehRotina(t)) return t.data;
  let d = de < t.data ? t.data : de;
  for (let i = 0; i < 400; i++, d = somaDias(d, 1)) { if (t.ate && d > t.ate) return ''; if (ocorreEm(t, d)) return d; }
  return '';
}
// Todos os horários do dia: o principal (hora/horaFim) e os extras (mais: [{ hora, horaFim }]).
const horariosDe = t => [{ hora: t.hora || '', horaFim: t.horaFim || '' }, ...(t.mais || [])].filter(h => h.hora);
function horarioTxt(t) {
  const hs = horariosDe(t); if (!hs.length) return '';
  const um = h => h.horaFim ? (hs.length > 1 ? h.hora + '–' + h.horaFim : 'das ' + h.hora + ' às ' + h.horaFim) : (hs.length > 1 ? h.hora : 'às ' + h.hora);
  return hs.map(um).join(' e ');
}
const soLembrete = t => !!t.soLembrete;
function resumoRotina(t) {
  const q = t.repete === 'diaria' ? 'Todo dia' : t.repete === 'semanal' ? 'Toda ' + (t.dias || []).slice().sort().map(d => SEMANA[d]).join(', ')
    : `Todo dia ${+t.data.slice(8)} do mês`;
  return `🔁 ${q}${horarioTxt(t) ? ', ' + horarioTxt(t) : ''}${t.ate ? ' · até ' + fmtData(t.ate) : ' · sem data final'}${soLembrete(t) ? ' · 🔔 só lembrete' : ''}`;
}

// Situação de "vista": vale para a tarefa (ou a rotina) inteira, não para cada dia.
const naoViu = (t, pid) => (ehRotina(t) ? rotinaAtiva(t) : !t.feito) && (t.para || []).includes(pid) && !(t.vistos || {})[pid];
const paraMim = t => { const e = eu(); return !!e && (t.para || []).includes(e.id); };
const ordemTarefa = (a, b) => (a.data || '9999').localeCompare(b.data || '9999') || (a.hora || '99').localeCompare(b.hora || '99') || a.titulo.localeCompare(b.titulo);
const ordemOc = (a, b) => a.data.localeCompare(b.data) || (a.t.hora || '99').localeCompare(b.t.hora || '99') || a.t.titulo.localeCompare(b.t.titulo);

// Ocorrências (tarefa + dia) entre duas datas.
function ocorrenciasCal(de, ate) {
  const out = [];
  (db.tarefas || []).forEach(t => {
    if (!ehRotina(t)) { if (t.data && t.data >= de && t.data <= ate) out.push({ t, data: t.data }); return; }
    for (let d = de < t.data ? t.data : de; d <= ate; d = somaDias(d, 1)) { if (t.ate && d > t.ate) break; if (ocorreEm(t, d)) out.push({ t, data: d }); }
  });
  return out.sort(ordemOc);
}

// O que pede atenção de quem usa o aparelho (aviso no Início): rotinas/tarefas não vistas,
// o que é para hoje e o que ficou para trás (rotinas: só os últimos 7 dias).
function minhasPendencias() {
  const e = eu(); if (!e) return [];
  const minha = t => (t.para || []).includes(e.id);
  const vistas = new Set();
  const out = [];
  ocorrenciasCal(somaDias(hoje(), -7), hoje()).forEach(o => {
    if (!minha(o.t) || feitoNo(o.t, o.data) || (soLembrete(o.t) && o.data !== hoje())) return;
    out.push(o); vistas.add(o.t.id);
  });
  (db.tarefas || []).filter(t => minha(t) && !vistas.has(t.id) && (naoViu(t, e.id) || (!ehRotina(t) && !t.feito && t.data && t.data < somaDias(hoje(), -7))))
    .forEach(t => out.push({ t, data: proximaData(t) || t.data }));
  return out.sort(ordemOc);
}

function quandoTarefa(t, data) {
  if (!data) return 'Sem data';
  const d = diasEntre(hoje(), data);
  const dia = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : d === -1 ? 'Ontem' : fmtData(data);
  return dia + (horarioTxt(t) ? ', ' + horarioTxt(t) : '');
}

// Uma linha = uma tarefa num dia (rotina: o dia daquela vez).
function linhaTarefa(t, data = t.data) {
  const e = eu(), lembrete = soLembrete(t), feito = !lembrete && feitoNo(t, data), atrasada = !lembrete && !feito && data && data < hoje();
  const quem = (t.para || []).map(id => {
    const p = pessoa(id); if (!p) return '';
    const viu = (t.vistos || {})[id];
    return `<span class="cal-quem ${viu ? 'viu' : ''}" title="${viu ? 'Viu' : 'Ainda não viu'}">${viu ? '✓' : '👀'} ${esc(p.nome.split(' ')[0])}</span>`;
  }).join('');
  return `<div class="cal-tarefa ${feito ? 'feita' : ''} ${atrasada ? 'atrasada' : ''}">
    ${lembrete ? '<span class="cal-sino" title="Só lembrete">🔔</span>' : `<input type="checkbox" ${feito ? 'checked' : ''} data-c="calFeito" data-i="${esc(t.id)}" data-d="${esc(data || '')}" aria-label="Feito">`}
    <span class="cal-txt" data-a="calEditar" data-v="${esc(t.id)}" role="button" tabindex="0"><strong>${ehRotina(t) ? '🔁 ' : ''}${esc(t.titulo)}</strong>
      <small>${atrasada ? '⚠️ ' : ''}${quandoTarefa(t, data)}${t.obs ? ' · ' + esc(t.obs.slice(0, 60)) : ''}</small>
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
    ${v.slice(0, 5).map(o => linhaTarefa(o.t, o.data)).join('')}
    ${v.length > 5 ? `<p class="muted small" style="margin:8px 0 0">E mais ${v.length - 5} no calendário.</p>` : ''}
  </div>`;
}

function gradeMes(m) {
  const [a, mm] = m.split('-').map(Number);
  const primeiro = new Date(a, mm - 1, 1).getDay(), dias = new Date(a, mm, 0).getDate();
  const porDia = {};
  ocorrenciasCal(m + '-01', isoData(a, mm, dias)).forEach(o => (porDia[o.data] = porDia[o.data] || []).push(o));
  const cel = [];
  for (let i = 0; i < primeiro; i++) cel.push('<span class="cal-dia vazio"></span>');
  for (let d = 1; d <= dias; d++) {
    const iso = isoData(a, mm, d), os = porDia[iso] || [];
    const abertas = os.filter(o => !soLembrete(o.t) && !feitoNo(o.t, o.data)).length, tarefas = os.filter(o => !soLembrete(o.t)).length;
    cel.push(`<button class="cal-dia ${iso === hoje() ? 'hoje' : ''} ${iso === ui.calDia ? 'sel' : ''} ${os.length ? 'tem' : ''}" data-a="calDia" data-v="${iso}">
      <span>${d}</span>${os.length ? `<i class="${abertas ? '' : 'ok'}">${abertas || (tarefas ? '✓' : '•')}</i>` : ''}</button>`);
  }
  return `<div class="cal-semana">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal-grade">${cel.join('')}</div>`;
}

function vCalendario() {
  ui.calMes = ui.calMes || mesAtual();
  ui.calDia = ui.calDia || hoje();
  const e = eu(), ts = (db.tarefas || []);
  const doDia = ocorrenciasCal(ui.calDia, ui.calDia);
  const paraVer = e ? ts.filter(t => naoViu(t, e.id)).sort(ordemTarefa) : [];
  const atrasadas = ocorrenciasCal(somaDias(hoje(), -7), somaDias(hoje(), -1)).filter(o => !soLembrete(o.t) && !feitoNo(o.t, o.data))
    .concat(ts.filter(t => !ehRotina(t) && !t.feito && t.data && t.data < somaDias(hoje(), -7)).map(t => ({ t, data: t.data }))).sort(ordemOc);
  const proximas = ts.filter(t => !ehRotina(t) && !t.feito && (!t.data || t.data >= hoje())).sort(ordemTarefa).slice(0, 15);
  const rotinas = ts.filter(ehRotina).sort((a, b) => (a.hora || '').localeCompare(b.hora || '') || a.titulo.localeCompare(b.titulo));
  const semPessoas = !(db.pessoas || []).length;
  const aviso = App.modo === 'nuvem' && (App.semNuvem.tarefas || App.semNuvem.pessoas)
    ? `<p class="tri-aviso forte" style="margin:0 0 16px">⚠️ O calendário está salvo só neste aparelho: ${(App.semNuvem.tarefas || App.semNuvem.pessoas) === 'regras' ? 'falta atualizar as regras do Firebase (veja o CONFIGURAR.md).' : 'não foi possível falar com a nuvem.'}</p>` : '';
  return `
    <div class="topo">
      <div><h1>Calendário</h1><p class="sub" style="margin:0">Tarefas do casal, com aviso no Telegram até marcar como vista.</p></div>
      <div class="acoes"><button class="btn" data-a="calNova" data-v="rotina">🔁 Nova rotina</button><button class="btn pri" data-a="calNova" data-v="${ui.calDia}">+ Nova tarefa</button></div>
    </div>
    ${aviso}${statusAvisos()}
    ${semPessoas ? `<div class="card"><h2>Primeiro passo: quem usa o calendário</h2>
      <p class="muted">Cadastre você e a Sara (nome e e-mail do login). Assim dá para escolher para quem é cada tarefa.</p>
      <button class="btn pri" data-a="calPessoa">+ Cadastrar pessoa</button></div>` : ''}
    ${!semPessoas && !e ? `<div class="card"><h2>Quem é você neste aparelho?</h2>
      <div class="acoes">${pessoas().map(p => `<button class="btn" data-a="calSouEu" data-v="${esc(p.id)}">${esc(p.nome)}</button>`).join('')}</div></div>` : ''}
    ${paraVer.length ? `<div class="card cal-aviso"><h2>👀 Para você ver</h2>${paraVer.map(t => linhaTarefa(t, proximaData(t) || t.data)).join('')}
      ${paraVer.length > 1 ? `<button class="btn mini" data-a="calViTodas" style="margin-top:8px">Marcar todas como vistas</button>` : ''}</div>` : ''}
    <div class="cols-2">
      <div class="card">
        <div class="cal-topo"><button class="btn mini" data-a="calMes" data-v="-1" aria-label="Mês anterior">‹</button>
          <strong>${nomeMes(ui.calMes).replace(/^./, c => c.toUpperCase())}</strong>
          <button class="btn mini" data-a="calMes" data-v="1" aria-label="Próximo mês">›</button></div>
        ${gradeMes(ui.calMes)}
        <div class="topo secao" style="margin-top:14px"><h2>${ui.calDia === hoje() ? 'Hoje' : fmtData(ui.calDia)}</h2>
          <button class="link" data-a="calNova" data-v="${ui.calDia}">+ Tarefa neste dia</button></div>
        ${doDia.length ? doDia.map(o => linhaTarefa(o.t, o.data)).join('') : '<p class="muted small" style="margin:0">Nada marcado neste dia.</p>'}
      </div>
      <div class="card">
        ${atrasadas.length ? `<h2>⚠️ Ficou para trás</h2>${atrasadas.map(o => linhaTarefa(o.t, o.data)).join('')}<div style="height:14px"></div>` : ''}
        <h2>Próximas</h2>
        ${proximas.length ? proximas.map(t => linhaTarefa(t)).join('') : `<div class="vazio">${panda('preguica')}Nenhuma tarefa por fazer.</div>`}
        ${rotinas.length ? `<div class="topo secao" style="margin-top:16px"><h2>🔁 Rotinas</h2><button class="link" data-a="calNova" data-v="rotina">+ Rotina</button></div>
          ${rotinas.map(t => `<div class="cal-pessoa ${rotinaAtiva(t) ? '' : 'ag-fim'}"><span class="cal-txt" data-a="calEditar" data-v="${esc(t.id)}" role="button" tabindex="0">
            <strong>${esc(t.titulo)}</strong><small>${resumoRotina(t)}${rotinaAtiva(t) ? '' : ' · encerrada'}</small></span></div>`).join('')}` : ''}
      </div>
    </div>
    ${semPessoas ? '' : `<p class="muted small" style="margin:4px 0 0">Pessoas e avisos do Telegram ficam em <button class="link" data-a="aba" data-v="dados">Configurações</button>.</p>`}`;
}

// Pessoas e a ligação de cada uma com o robô do Telegram.
function cartaoPessoas(e) {
  if (App.modo === 'nuvem' && !estadoTg.carregado && !estadoTg.carregando) carregarTg();
  const tg = estadoTg, link = p => tg.bot ? `https://t.me/${tg.bot}?start=${encodeURIComponent(p.id)}` : '';
  return `<div class="card"><div class="topo secao"><h2>Pessoas e Telegram (calendário)</h2>
      <span class="acoes">${App.modo === 'nuvem' ? `<button class="link" data-a="calTg">🔄 Atualizar</button>` : ''}<button class="link" data-a="calPessoa">+ Pessoa</button></span></div>
    ${tg.semToken ? `<p class="tri-aviso" style="margin:0 0 10px">Falta criar o robô do Telegram e colocar o código dele na ponte do Google (veja o CONFIGURAR.md).</p>` : ''}
    ${tg.erro ? `<p class="tri-aviso forte" style="margin:0 0 10px">⚠️ ${esc(tg.erro)}</p>` : ''}
    ${tg.bot ? `<div class="cal-pessoa cal-grupo"><span class="cal-txt"><strong>👥 Grupo do casal</strong>
        <small>${tg.grupo ? '✈️ Conectado: todos os avisos vão para o grupo' : 'Crie um grupo no Telegram com vocês dois e coloque o robô nele'}</small></span>
        <span class="acoes">${tg.grupo ? `<button class="btn mini" data-a="calTeste" data-v="_grupo">Enviar teste</button>`
          : `<a class="btn mini pri" href="https://t.me/${tg.bot}?startgroup=grupo" target="_blank" rel="noopener">Conectar grupo</a>`}</span></div>` : ''}
    ${!(db.pessoas || []).length ? `<p class="muted small" style="margin:0 0 6px">Cadastre você e a Sara para usar o calendário.</p>` : ''}
    ${pessoas().map(p => {
      const ligado = tg.ligados.includes(p.id);
      return `<div class="cal-pessoa"><span class="cal-txt" data-a="calPessoa" data-v="${esc(p.id)}" role="button" tabindex="0">
        <strong>${esc(p.nome)}${e && e.id === p.id ? ' <small class="muted">(você)</small>' : ''}</strong>
        <small>${App.modo !== 'nuvem' ? '' : tg.carregando && !tg.carregado ? 'Conferindo o Telegram…' : ligado ? '✈️ Telegram conectado' : tg.grupo ? '✈️ Recebe pelo grupo' : '🔕 Telegram não conectado'}${p.email ? ' · ' + esc(p.email) : ''}</small></span>
        <span class="acoes">${ligado ? `<button class="btn mini" data-a="calTeste" data-v="${esc(p.id)}">Enviar teste</button>`
          : link(p) && !tg.grupo ? `<a class="btn mini pri" href="${link(p)}" target="_blank" rel="noopener">Conectar</a><button class="btn mini" data-a="calCopiarTg" data-v="${esc(p.id)}">Copiar link</button>` : ''}</span></div>`;
    }).join('')}
    ${tg.bot && !tg.grupo ? `<details class="cal-ajuda" style="margin-top:10px"><summary>Como conectar o grupo</summary>
      <ol><li>No Telegram, crie um grupo com vocês dois (ex.: "Nós dois 🐼").</li>
        <li>Aqui no app, toque em <b>Conectar grupo</b>. O Telegram abre e pergunta em qual grupo pôr o robô <b>@${esc(tg.bot)}</b>: escolha o grupo de vocês.</li>
        <li>O robô dá "Oi, casal!" no grupo. Volte aqui e toque em <b>🔄 Atualizar</b>.</li></ol>
      <p class="muted small">Prefere cada um no privado? Toque em <b>Conectar</b> ao lado do nome, no celular de cada um.</p></details>` : ''}
    ${!App.usuario?.email && e ? `<p class="muted small" style="margin:10px 0 0">Neste aparelho você é <b>${esc(e.nome)}</b>. <button class="link" data-a="calSouEu" data-v="">Trocar</button></p>` : ''}
  </div>`;
}


/* ---------- janelas ---------- */
const linhaHorario = h => `<div class="cal-hrow"><input type="time" class="mh-ini" value="${esc(h.hora || '')}" aria-label="Início"><span>até</span>
  <input type="time" class="mh-fim" value="${esc(h.horaFim || '')}" aria-label="Fim"><button type="button" class="x" data-delh title="Remover">✕</button></div>`;

function modalTarefa(t, dataInicial) {
  const nova = !t, e = eu();
  const rotinaNova = dataInicial === 'rotina';
  t = t || { titulo: '', data: rotinaNova ? hoje() : (dataInicial || hoje()), hora: '', horaFim: '', repete: rotinaNova ? 'diaria' : 'nao', dias: [], ate: '',
    para: (db.pessoas || []).map(p => p.id), obs: '' };
  const rep = t.repete || 'nao';
  const op = (v, rot) => `<label class="escolha"><input type="radio" name="repete" value="${v}" ${rep === v ? 'checked' : ''}><span><b>${rot}</b></span></label>`;
  abrirModal(`
    <h2>${nova ? (rotinaNova ? 'Nova rotina' : 'Nova tarefa') : ehRotina(t) ? 'Editar rotina' : 'Editar tarefa'}</h2>
    <form class="form" data-f="modal" id="cal-form">
      ${nova ? `<div class="full cal-exemplos"><span class="rotulo">Exemplos prontos</span>
        <button type="button" class="btn mini" data-ex="remedio">💊 Remédio todo dia às 10:30, por 10 anos</button>
        <button type="button" class="btn mini" data-ex="plantas">🪴 Regar as plantas seg e qui, das 18h às 19h</button>
        <button type="button" class="btn mini" data-ex="trabalho">💼 Trabalho seg a sex, 08:00–12:00 e 13:30–18:00</button></div>` : ''}
      <label class="full">O que fazer<input name="titulo" required value="${esc(t.titulo)}" placeholder="Ex.: Tomar o remédio, Ligar para o fotógrafo"></label>
      <div class="full"><span class="rotulo">Repete</span><div class="escolhas quatro">${Object.entries(REPETE_T).map(([v, r]) => op(v, r)).join('')}</div></div>
      <div class="full cal-dias" ${rep === 'semanal' ? '' : 'hidden'}><span class="rotulo">Em quais dias</span>
        <span class="cal-atalhos"><button type="button" class="link" data-dias="1,2,3,4,5">Seg a sex</button><button type="button" class="link" data-dias="0,6">Fim de semana</button><button type="button" class="link" data-dias="0,1,2,3,4,5,6">Todos</button></span>
        <div class="cal-para">${SEMANA.map((n, i) => `<label class="escolha"><input type="checkbox" name="dias" value="${i}" ${(t.dias || []).includes(i) ? 'checked' : ''}><span><b>${n}</b></span></label>`).join('')}</div></div>
      <label><span class="cal-rot-data">${rep === 'nao' ? 'Dia' : 'Começa em'}</span><input name="data" type="date" required value="${t.data || ''}"></label>
      <label class="cal-ate" ${rep === 'nao' ? 'hidden' : ''}>Até (vazio = sem fim)<input name="ate" type="date" value="${t.ate || ''}">
        <span class="cal-atalhos"><button type="button" class="link" data-mais="1">+1 ano</button><button type="button" class="link" data-mais="5">+5 anos</button><button type="button" class="link" data-mais="10">+10 anos</button></span></label>
      <label>Hora (início)<input name="hora" type="time" required value="${t.hora || ''}"></label>
      <label>Até às (opcional, faz um período)<input name="horaFim" type="time" value="${t.horaFim || ''}"></label>
      <div class="full cal-mais">${(t.mais || []).map(linhaHorario).join('')}</div>
      <div class="full" style="margin-top:-4px"><button type="button" class="link" data-addh>+ Outro horário no mesmo dia</button></div>
      <label class="full cal-check"><input type="checkbox" name="soLembrete" ${t.soLembrete ? 'checked' : ''}><span>🔔 <b>Só lembrete</b>: não precisa marcar como feito (ex.: horário de trabalho)</span></label>
      <div class="full"><span class="rotulo">Para quem</span>
        ${(db.pessoas || []).length ? `<div class="cal-para">${pessoas().map(p => `<label class="escolha"><input type="checkbox" name="para" value="${esc(p.id)}" ${(t.para || []).includes(p.id) ? 'checked' : ''}><span><b>${esc(p.nome)}</b></span></label>`).join('')}</div>`
          : '<p class="muted small" style="margin:4px 0 0">Cadastre as pessoas no calendário para escolher para quem é.</p>'}</div>
      <label class="full">Detalhes<textarea name="obs" rows="3" placeholder="Endereço, telefone, o que levar…">${esc(t.obs || '')}</textarea></label>
      ${!nova && (t.para || []).length ? `<p class="muted small full" style="margin:0">${(t.para || []).map(id => { const p = pessoa(id), v = (t.vistos || {})[id]; return p ? `${esc(p.nome.split(' ')[0])}: ${v ? 'viu em ' + fmtData(v.slice(0, 10)) : 'ainda não viu'}` : ''; }).filter(Boolean).join(' · ')}</p>` : ''}
      <p class="muted small full" style="margin:0">No Telegram: aviso quando a tarefa é criada, lembrete na hora e outro no fim do período (ou 1 hora depois) se ninguém marcar como feito.</p>
      <div class="modal-acoes full">
        ${nova ? '' : `<button type="button" class="btn perigo" data-a="calExcluir" data-v="${esc(t.id)}" style="margin-right:auto">Excluir</button>`}
        <button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => {
    const f = $('#cal-form');
    const marcados = n => [...f.querySelectorAll(`input[name=${n}]:checked`)].map(x => x.value);
    const repete = REPETE_T[d.repete] ? d.repete : 'nao';
    // Horários: o principal + os extras, em ordem; o primeiro vira hora/horaFim.
    const hs = [{ hora: d.hora || '', horaFim: d.horaFim || '' },
      ...[...f.querySelectorAll('.cal-hrow')].map(r => ({ hora: r.querySelector('.mh-ini').value, horaFim: r.querySelector('.mh-fim').value }))]
      .filter(h => h.hora).sort((x, y) => x.hora.localeCompare(y.hora));
    if (hs.some(h => h.horaFim && h.horaFim <= h.hora)) { alert('O fim de cada período precisa ser depois do início.'); return false; }
    const dados = { titulo: String(d.titulo || '').trim(), data: d.data || '', hora: hs[0]?.hora || '', horaFim: hs[0]?.horaFim || '', mais: hs.slice(1), repete,
      dias: repete === 'semanal' ? marcados('dias').map(Number).sort() : [], ate: repete === 'nao' ? '' : (d.ate || ''),
      soLembrete: !!d.soLembrete, para: marcados('para'), obs: String(d.obs || '').trim() };
    if (!dados.titulo) { alert('Escreva o que precisa ser feito.'); return false; }
    if (!dados.data || !dados.hora) { alert('Coloque o dia e a hora.'); return false; }
    if (repete === 'semanal' && !dados.dias.length) { alert('Escolha pelo menos um dia da semana.'); return false; }
    if (dados.ate && dados.ate < dados.data) { alert('A data final precisa ser depois do começo.'); return false; }
    db.tarefas = db.tarefas || [];
    if (nova) {
      // Quem cria já viu: só os outros recebem o aviso.
      const vistos = {}; if (e && dados.para.includes(e.id)) vistos[e.id] = new Date().toISOString();
      db.tarefas.push({ id: 'tf-' + uid(), ...dados, vistos, feito: false, feitos: {}, criadoPor: e ? e.id : '', criadoEm: new Date().toISOString() });
      reagir('feliz', repete === 'nao' ? 'Tarefa marcada! 📅' : 'Rotina criada! 🔁');
    } else {
      // Mudou o que fazer, o dia, a hora ou a repetição: os outros precisam ver de novo.
      const chave = x => JSON.stringify([x.titulo, x.data, x.hora, x.horaFim || '', x.mais || [], x.repete || 'nao', x.dias || [], x.ate || '']);
      const mudou = chave(t) !== chave(dados);
      Object.assign(t, dados);
      if (mudou) { t.vistos = e && dados.para.includes(e.id) ? { [e.id]: new Date().toISOString() } : {}; t.alterada = new Date().toISOString(); }
    }
    ui.calDia = dados.data; ui.calMes = dados.data.slice(0, 7);
  });
  // Repetição mostra/esconde os campos; exemplos e "+N anos" preenchem o formulário.
  const f = $('#cal-form');
  const ajustar = () => {
    const r = f.querySelector('input[name=repete]:checked')?.value || 'nao';
    f.querySelector('.cal-dias').hidden = r !== 'semanal';
    f.querySelector('.cal-ate').hidden = r === 'nao';
    f.querySelector('.cal-rot-data').textContent = r === 'nao' ? 'Dia' : 'Começa em';
  };
  f.addEventListener('change', e2 => { if (e2.target.name === 'repete') ajustar(); });
  f.addEventListener('click', e2 => {
    const mais = e2.target.closest('[data-mais]'), ex = e2.target.closest('[data-ex]'), dias = e2.target.closest('[data-dias]');
    if (e2.target.closest('[data-addh]')) { f.querySelector('.cal-mais').insertAdjacentHTML('beforeend', linhaHorario({ hora: '', horaFim: '' })); f.querySelector('.cal-hrow:last-child .mh-ini').focus(); }
    if (e2.target.closest('[data-delh]')) e2.target.closest('.cal-hrow').remove();
    if (dias) { const v = dias.dataset.dias.split(','); f.querySelectorAll('input[name=dias]').forEach(x => { x.checked = v.includes(x.value); }); }
    if (mais) { const base = f.data.value || hoje(); f.ate.value = (+base.slice(0, 4) + +mais.dataset.mais) + base.slice(4); }
    if (!ex) return;
    const marcar = (n, vals) => f.querySelectorAll(`input[name=${n}]`).forEach(x => { x.checked = vals.includes(x.value); });
    const exemplo = {
      remedio: { titulo: 'Tomar o remédio 💊', repete: 'diaria', dias: [], hora: '10:30', horaFim: '', mais: [], ate: (+hoje().slice(0, 4) + 10) + hoje().slice(4), para: e ? [e.id] : null, lembrete: false },
      plantas: { titulo: 'Regar as plantas 🪴', repete: 'semanal', dias: ['1', '4'], hora: '18:00', horaFim: '19:00', mais: [], ate: '', para: null, lembrete: false },
      trabalho: { titulo: 'Trabalho 💼', repete: 'semanal', dias: ['1', '2', '3', '4', '5'], hora: '08:00', horaFim: '12:00', mais: [{ hora: '13:30', horaFim: '18:00' }], ate: '', para: e ? [e.id] : null, lembrete: true },
    }[ex.dataset.ex];
    f.titulo.value = exemplo.titulo; f.data.value = hoje(); f.hora.value = exemplo.hora; f.horaFim.value = exemplo.horaFim; f.ate.value = exemplo.ate;
    f.querySelector('.cal-mais').innerHTML = exemplo.mais.map(linhaHorario).join(''); f.soLembrete.checked = exemplo.lembrete;
    marcar('repete', [exemplo.repete]); marcar('dias', exemplo.dias);
    if (exemplo.para) marcar('para', exemplo.para);
    ajustar();
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
const estadoTg = { bot: '', ligados: [], grupo: false, semToken: false, carregado: false, carregando: false, erro: '' };

// Pergunta à ponte qual é o robô e quem já tocou em "Iniciar" nele.
async function carregarTg() {
  estadoTg.carregando = true;
  try {
    const j = await chamarPonte({ acao: 'telegram' });
    Object.assign(estadoTg, { bot: j.bot || '', ligados: j.ligados || [], grupo: !!j.grupo, semToken: !!j.semToken, erro: j.erroTelegram || '' });
  } catch (e) {
    estadoTg.erro = /fetch|network|load failed|abort/i.test(e.message) ? 'Sem conexão com a ponte do Google.' : e.message;
  }
  estadoTg.carregando = false; estadoTg.carregado = true;
  if (ui.aba === 'calendario' || ui.aba === 'dados') renderSeguro();
}

function pacoteAvisos() {
  // Rotinas vão enquanto estão valendo, com o que foi feito nos últimos dias (para a ponte não lembrar à toa).
  const recente = somaDias(hoje(), -2);
  const tarefas = (db.tarefas || []).filter(t => (ehRotina(t) ? rotinaAtiva(t) : !t.feito) && (t.para || []).length)
    .map(t => ({ id: t.id, titulo: t.titulo, data: t.data || '', hora: t.hora || '', horaFim: t.horaFim || '', mais: t.mais || [],
      repete: t.repete || 'nao', dias: t.dias || [], ate: t.ate || '', soLembrete: !!t.soLembrete,
      feitos: Object.keys(t.feitos || {}).filter(d => d >= recente).sort(),
      para: t.para, vistos: Object.keys(t.vistos || {}), por: t.criadoPor || '', alterada: t.alterada || '' }));
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
  if (ui.aba === 'calendario' || ui.aba === 'dados') renderSeguro();
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
    const p = v === '_grupo' ? { id: '_grupo', nome: 'o grupo' } : pessoa(v); if (!p) return;
    if (App.modo !== 'nuvem') return alert('O teste precisa de login (modo nuvem).');
    try {
      const j = await chamarPonte({ acao: 'teste', pessoa: { id: p.id, nome: p.nome } });
      alert(j.enviado ? `Mensagem de teste enviada para ${p.nome} no Telegram.` : 'Não saiu: ' + (j.resposta || 'sem detalhes'));
    } catch (e) { alert('Não consegui enviar: ' + e.message); }
  },
};
