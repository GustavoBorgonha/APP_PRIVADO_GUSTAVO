'use strict';
/* =========================================================
   Cidades de SC visitadas — espelho da planilha do Google.

   A planilha continua sendo a fonte dos dados. O app conversa com ela por
   uma "ponte" (Apps Script publicado como App da Web, código em
   apps-script/Codigo.gs), usando o login do Firebase para provar quem é:
   - ler: o app busca a lista ao abrir a tela e a cada minuto;
   - gravar: o que você marca no app vai para a fila (Cid.pend) e é enviado
     na hora; se falhar, fica na fila (salva no aparelho) e o app avisa.

   Este arquivo é carregado antes do app.js: as funções daqui só usam
   coisas do app.js (ui, App, esc, render…) quando são chamadas.
   ========================================================= */

const CHAVE_CID = 'apg-cidades', CHAVE_CID_PEND = 'apg-cidades-pend';
const Cid = {
  lista: [],          // [{ m, micro, meso, v, d, o, lat, lng }] como veio da planilha
  em: 0,              // quando a lista chegou da planilha (ms)
  pend: {},           // município -> { v, d, o } ainda não confirmado pela planilha
  status: { estado: 'nunca', msg: '', em: 0 },   // nunca | sincronizando | ok | erro | semConfig | semLogin
  sincronizando: false, denovo: false, timer: null, espera: null,
};
try {
  const c = JSON.parse(localStorage.getItem(CHAVE_CID));
  if (c && Array.isArray(c.lista)) { Cid.lista = c.lista; Cid.em = c.em || 0; }
  Cid.pend = JSON.parse(localStorage.getItem(CHAVE_CID_PEND)) || {};
} catch (e) { /* sem armazenamento */ }

function guardarCidades() {
  try {
    localStorage.setItem(CHAVE_CID, JSON.stringify({ lista: Cid.lista, em: Cid.em }));
    localStorage.setItem(CHAVE_CID_PEND, JSON.stringify(Cid.pend));
  } catch (e) { /* sem armazenamento */ }
}
const cfgCidades = () => window.PLANILHA_CIDADES || {};
const qtdPendCid = () => Object.keys(Cid.pend).length;

// Lista com as alterações ainda não confirmadas aplicadas por cima (é o que a pessoa vê).
function cidadesAtuais() {
  return Cid.lista.map(c => Cid.pend[c.m] ? { ...c, ...Cid.pend[c.m], pendente: true } : c);
}
const numCoord = s => parseFloat(String(s ?? '').replace(',', '.'));
// Linha vinda da planilha: [Município, Microrregião, Mesorregião, Visitei?, Data, Observações, Lat, Lng]
const linhaParaCidade = r => ({
  m: String(r[0] || '').trim(), micro: r[1] || '', meso: r[2] || '', v: /^s/i.test(String(r[3] || '').trim()),
  d: String(r[4] || '').trim(), o: String(r[5] || ''), lat: numCoord(r[6]), lng: numCoord(r[7]),
});
const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '';
const dataISO = br => { const m = String(br || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };

function statusCidades(estado, msg = '') {
  Cid.status = { estado, msg, em: Date.now() };
}
const ERROS_PONTE = {
  'nao-autorizado': 'A planilha recusou o seu login. Confira se o seu e-mail está na lista do Apps Script.',
  'aba-nao-encontrada': 'Não encontrei a aba "Cidades" na planilha.',
};

/* Conversa com a planilha: envia a fila (se houver) e traz a lista atualizada. */
async function sincronizarCidades() {
  if (Cid.sincronizando) { Cid.denovo = true; return; }
  if (!cfgCidades().url) { statusCidades('semConfig'); return; }
  if (App.modo !== 'nuvem' || !App.idToken) { statusCidades('semLogin'); return; }
  Cid.sincronizando = true;
  statusCidades('sincronizando');
  atualizarTelaCidades();
  const mud = Object.entries(Cid.pend).map(([m, x]) => ({ municipio: m, visitei: !!x.v, data: x.d || '', obs: x.o || '' }));
  try {
    const token = await App.idToken();
    const ctrl = new AbortController(), tempo = setTimeout(() => ctrl.abort(), 25000);
    let r;
    try {
      // Corpo em texto puro: o navegador não precisa de "pré-consulta" para falar com o Apps Script.
      r = await fetch(cfgCidades().url, { method: 'POST', body: JSON.stringify({ token, acao: mud.length ? 'salvar' : 'ler', mudancas: mud }), signal: ctrl.signal });
    } finally { clearTimeout(tempo); }
    if (!r.ok) throw new Error(`A planilha respondeu com erro (${r.status}).`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.motivo ? 'A planilha recusou: ' + j.motivo : ERROS_PONTE[j.erro] || ('A planilha respondeu: ' + (j.erro || 'erro desconhecido')));
    // Tira da fila só o que foi enviado e não mudou de novo enquanto isso.
    mud.forEach(x => {
      const p = Cid.pend[x.municipio];
      if (p && !!p.v === x.visitei && (p.d || '') === x.data && (p.o || '') === x.obs) delete Cid.pend[x.municipio];
    });
    Cid.lista = (j.cidades || []).map(linhaParaCidade).filter(c => c.m);
    Cid.em = Date.now();
    guardarCidades();
    statusCidades('ok');
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'A planilha demorou demais para responder.'
      : navigator.onLine === false ? 'Você está sem internet.'
      : /fetch|network|load failed/i.test(e.message) ? 'Não consegui falar com a planilha (internet ou endereço do Apps Script).'
      : e.message;
    statusCidades('erro', msg);
  } finally {
    Cid.sincronizando = false;
    if (Cid.denovo) { Cid.denovo = false; setTimeout(sincronizarCidades, 0); }
    atualizarTelaCidades();
  }
}
// Redesenha só quando o que mudou aparece na tela (sem atrapalhar quem está digitando).
function atualizarTelaCidades() {
  if (typeof renderSeguro !== 'function' || App.modo !== 'nuvem' && App.modo !== 'local') return;
  if (ui.aba === 'cidades' || ui.aba === 'inicio' || ui.aba === 'planos') renderSeguro();
}
// Depois de uma alteração, espera um instante (junta cliques seguidos) e envia.
function agendarEnvioCidades() {
  clearTimeout(Cid.espera);
  Cid.espera = setTimeout(sincronizarCidades, 700);
}
// Chamado a cada render: na tela de cidades, busca novidades (no máximo a cada 15 s) e mantém o relógio de 1 min.
function aoMostrarCidades() {
  if (ui.aba !== 'cidades') return;
  if (!Cid.sincronizando && Date.now() - (Cid.status.em || 0) > 15000) setTimeout(sincronizarCidades, 0);
}
setInterval(() => {
  if (document.hidden) return;
  if (ui.aba === 'cidades' || qtdPendCid()) sincronizarCidades();
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (ui.aba === 'cidades' || qtdPendCid())) sincronizarCidades();
});
addEventListener('online', () => { if (qtdPendCid()) sincronizarCidades(); });

/* ---------- telas ---------- */
const haQuanto = ms => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'agora há pouco';
  const m = Math.round(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dia(s)`;
};

// Faixa de situação da sincronização (topo da tela de cidades).
function faixaSincronizacao() {
  const st = Cid.status, pend = qtdPendCid();
  const tentar = '<button class="btn mini" data-a="cidSincronizar">Tentar de novo</button>';
  if (st.estado === 'semConfig') return `<div class="cid-faixa erro">⚠️ <span>A ligação com a planilha ainda não foi configurada. As cidades não sincronizam até isso ser feito.</span></div>`;
  if (st.estado === 'semLogin') return `<div class="cid-faixa erro">⚠️ <span>Entre com a sua conta Google para sincronizar com a planilha.</span></div>`;
  if (st.estado === 'erro') return `<div class="cid-faixa erro">⚠️ <span><b>Não está sincronizando com a planilha.</b> ${esc(st.msg)}
      ${pend ? `<br>${pend === 1 ? '1 alteração está guardada' : `${pend} alterações estão guardadas`} neste aparelho e ${pend === 1 ? 'vai' : 'vão'} assim que voltar.` : ''}</span>${tentar}</div>`;
  if (st.estado === 'sincronizando' || Cid.sincronizando) return `<div class="cid-faixa">⟳ <span>Sincronizando com a planilha…</span></div>`;
  if (pend) return `<div class="cid-faixa">⏳ <span>${pend === 1 ? '1 alteração aguardando' : `${pend} alterações aguardando`} envio para a planilha…</span></div>`;
  if (st.estado === 'ok') return `<div class="cid-faixa ok">✓ <span>Sincronizado com a planilha · ${haQuanto(st.em)}</span><button class="btn mini" data-a="cidSincronizar">Atualizar</button></div>`;
  return `<div class="cid-faixa">⟳ <span>Buscando a planilha…</span></div>`;
}

// Aviso para as outras telas (Início e Planos) quando há alteração que não chegou na planilha.
function avisoCidadesGlobal() {
  const pend = qtdPendCid();
  if (!pend || Cid.status.estado !== 'erro' && Cid.status.estado !== 'semLogin' && Cid.status.estado !== 'semConfig') return '';
  return `<div class="cid-faixa erro" style="margin-bottom:16px">⚠️ <span><b>Cidades visitadas não estão sincronizando com a planilha.</b>
    ${pend === 1 ? '1 alteração está guardada' : `${pend} alterações estão guardadas`} só neste aparelho.</span>
    <button class="btn mini" data-a="aba" data-v="cidades">Ver</button></div>`;
}

// Cartão de entrada (aba Planos).
function cartaoCidades() {
  const l = cidadesAtuais(), vis = l.filter(c => c.v).length;
  const pct = l.length ? vis / l.length * 100 : 0;
  return `<div class="card plano cid-entrada" data-a="aba" data-v="cidades" role="button" tabindex="0">
    <div class="cab"><span class="emoji">🗺️</span><div><div class="nome">Cidades de SC visitadas</div>
      <div class="muted small">${l.length ? `${vis} de ${l.length} cidades · ${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : 'Sincronizada com a sua planilha do Google'}</div></div></div>
    <div class="barra"><i style="width:${pct}%"></i></div>
  </div>`;
}

/* ---------- mapa estilo "Maps" (Leaflet + mapa base do OpenStreetMap) ----------
   A biblioteca só é baixada quando a tela de cidades abre. O mapa é criado uma vez e
   reaproveitado entre um redesenho e outro (não perde o zoom nem pisca). Sem internet
   para baixar o mapa, cai no mapa simples de pontos (mapaCidades). */
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
let promessaLeaflet = null;
function carregarLeaflet() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (promessaLeaflet) return promessaLeaflet;
  promessaLeaflet = new Promise((ok, falha) => {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: LEAFLET + 'leaflet.css',
      integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=', crossOrigin: '' });
    const js = Object.assign(document.createElement('script'), { src: LEAFLET + 'leaflet.js',
      integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=', crossOrigin: '' });
    js.onload = () => ok(window.L);
    js.onerror = () => { promessaLeaflet = null; falha(new Error('Não foi possível carregar o mapa.')); };
    document.head.append(css, js);
  });
  return promessaLeaflet;
}
const temaEscuro = matchMedia('(prefers-color-scheme: dark)');
// Mapa base do OpenStreetMap (grátis, sem chave). No tema escuro, as imagens são escurecidas por CSS.
function fundoDoMapa() {
  if (!Cid.mapa) return;
  Cid.mapaEl.classList.toggle('escuro', temaEscuro.matches);
  if (Cid.fundo) return;
  Cid.fundo = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(Cid.mapa);
}
temaEscuro.addEventListener?.('change', fundoDoMapa);

function balaoCidade(c) {
  return `<div class="cid-pop">
    <strong>${esc(c.m)}</strong><small>${esc(c.micro)}</small>
    <span class="cid-pop-st ${c.v ? 'on' : ''}">${c.v ? `✓ Visitada${c.d ? ' em ' + esc(c.d) : ''}` : 'Ainda não visitada'}</span>
    ${c.o ? `<p>${esc(c.o)}</p>` : ''}${c.pendente ? '<small>⏳ aguardando planilha</small>' : ''}
    <div class="cid-pop-acoes">
      <button class="btn mini ${c.v ? '' : 'pri'}" data-a="cidAlternar" data-v="${esc(c.m)}">${c.v ? 'Desmarcar' : '✓ Marcar como visitada'}</button>
      <button class="btn mini" data-a="cidAbrir" data-v="${esc(c.m)}">Editar</button>
    </div></div>`;
}
function marcadoresCidades(l) {
  l.forEach(c => {
    if (!isFinite(c.lat) || !isFinite(c.lng)) return;
    const estilo = c.v
      ? { radius: 7, weight: 2, color: '#ffffff', fillColor: '#f2711c', fillOpacity: 1 }
      : { radius: 4.5, weight: 1, color: '#ffffff', fillColor: '#7d8590', fillOpacity: .8 };
    let mk = Cid.marcas.get(c.m);
    if (!mk) {
      mk = L.circleMarker([c.lat, c.lng], { ...estilo, className: 'cid-pino' }).addTo(Cid.mapa);
      mk.bindTooltip(c.m, { direction: 'top', offset: [0, -6] });
      mk.bindPopup('', { maxWidth: 260 });
      Cid.marcas.set(c.m, mk);
    } else { mk.setStyle(estilo); mk.setRadius(estilo.radius); }
    mk.getElement()?.classList.toggle('on', c.v);
    if (c.v) mk.bringToFront();
    mk.setPopupContent(balaoCidade(c));
  });
}
// Chamado depois de cada redesenho da tela de cidades: coloca o mapa no lugar reservado.
function montarMapaCidades() {
  const lugar = document.getElementById('cid-mapa-lugar'); if (!lugar) return;
  const l = cidadesAtuais();
  if (Cid.semMapaBase) { lugar.outerHTML = mapaCidades(l); return; }
  if (Cid.mapaEl) {
    lugar.replaceWith(Cid.mapaEl);
    Cid.mapa.invalidateSize();
    marcadoresCidades(l);
    return;
  }
  carregarLeaflet().then(() => {
    const aqui = document.getElementById('cid-mapa-lugar'); if (!aqui || Cid.mapaEl) return montarMapaCidades();
    const el = document.createElement('div');
    el.className = 'cid-mapa-base';
    aqui.replaceWith(el);
    Cid.mapaEl = el; Cid.marcas = new Map();
    Cid.mapa = L.map(el, { scrollWheelZoom: false, zoomSnap: .5 });
    fundoDoMapa();
    const pts = cidadesAtuais().filter(c => isFinite(c.lat) && isFinite(c.lng)).map(c => [c.lat, c.lng]);
    if (pts.length) Cid.mapa.fitBounds(pts, { padding: [18, 18] }); else Cid.mapa.setView([-27.3, -50.5], 7);
    // Roda do mouse só dá zoom depois de clicar no mapa (para a página continuar rolando normal).
    Cid.mapa.on('click', () => Cid.mapa.scrollWheelZoom.enable());
    Cid.mapa.on('mouseout', () => Cid.mapa.scrollWheelZoom.disable());
    // O Leaflet não deixa o clique do balão chegar na página: os botões são tratados aqui.
    Cid.mapa.on('popupopen', e => {
      e.popup.getElement().onclick = ev => {
        const b = ev.target.closest('[data-a]'); if (!b || !acoes[b.dataset.a]) return;
        ev.preventDefault();
        const r = acoes[b.dataset.a](b.dataset.v, b);
        if (!(r instanceof Promise) && !modal.open) { salvar(); render(); }
      };
    });
    marcadoresCidades(cidadesAtuais());
  }).catch(() => {
    Cid.semMapaBase = true;
    const aqui = document.getElementById('cid-mapa-lugar');
    if (aqui) aqui.outerHTML = mapaCidades(cidadesAtuais());
  });
}

// Mapa simples (sem internet para o mapa base): cada cidade é um ponto na posição real.
function mapaCidades(l) {
  const pts = l.filter(c => isFinite(c.lat) && isFinite(c.lng));
  if (!pts.length) return '';
  const lats = pts.map(c => c.lat), lngs = pts.map(c => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180), larg = 600, esc2 = larg / ((maxLng - minLng) * k || 1);
  const alt = (maxLat - minLat) * esc2, pad = 10;
  const ponto = c => {
    const x = pad + (c.lng - minLng) * k * esc2, y = pad + (maxLat - c.lat) * esc2;
    return `<circle class="cid-ponto ${c.v ? 'on' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${c.v ? 6 : 4.5}" data-a="cidAbrir" data-v="${esc(c.m)}"><title>${esc(c.m)}${c.v ? ' ✓' : ''}</title></circle>`;
  };
  // Não visitadas primeiro, para as visitadas ficarem por cima.
  return `<svg class="cid-mapa" viewBox="0 0 ${larg + pad * 2} ${(alt + pad * 2).toFixed(0)}" role="img" aria-label="Mapa das cidades de SC">
    ${pts.filter(c => !c.v).map(ponto).join('')}${pts.filter(c => c.v).map(ponto).join('')}</svg>`;
}

function vCidades() {
  const l = cidadesAtuais(), total = l.length, vis = l.filter(c => c.v).length;
  const pct = total ? vis / total * 100 : 0;
  const cfg = cfgCidades();
  const grupo = campo => {
    const g = new Map();
    l.forEach(c => { const k = c[campo] || '—'; const x = g.get(k) || { nome: k, meso: c.meso, total: 0, vis: 0 }; x.total++; if (c.v) x.vis++; g.set(k, x); });
    return [...g.values()];
  };
  const barraGrupo = x => `<div class="cid-grupo"><span class="cid-grupo-nome">${esc(x.nome)}</span>
    <div class="barra"><i style="width:${x.total ? x.vis / x.total * 100 : 0}%"></i></div>
    <span class="small"><b>${x.vis}</b>/${x.total}</span></div>`;
  const filtro = ui.cidFiltro || 'todas';
  const visiveis = l.filter(c => filtro === 'todas' || (filtro === 'visitadas' ? c.v : !c.v));
  const linha = c => `<div class="cid-linha ${c.v ? 'on' : ''}" data-busca="${esc(semAcentoApp(c.m + ' ' + c.micro + ' ' + c.meso))}">
      <button class="cid-check" data-a="cidAlternar" data-v="${esc(c.m)}" aria-pressed="${c.v}" title="${c.v ? 'Marcar como não visitada' : 'Marcar como visitada'}">${c.v ? '✓' : ''}</button>
      <div class="cid-txt" data-a="cidAbrir" data-v="${esc(c.m)}" role="button" tabindex="0"><strong>${esc(c.m)}</strong>
        <small>${esc(c.micro)}${c.d ? ' · ' + esc(c.d) : ''}${c.o ? ' · ' + esc(c.o) : ''}${c.pendente ? ' · ⏳ aguardando planilha' : ''}</small></div>
    </div>`;
  return `
    <div class="topo">
      <div><button class="btn mini voltar" data-a="aba" data-v="planos">${IC.voltar} Planos</button>
        <h1 style="margin-top:10px">Cidades de SC</h1>
        <p class="sub" style="margin:0">Marque as cidades que você já visitou. Tudo fica igual na sua planilha do Google.</p></div>
      ${cfg.id ? `<a class="btn" href="https://docs.google.com/spreadsheets/d/${esc(cfg.id)}/edit" target="_blank" rel="noopener">Abrir planilha ↗</a>` : ''}
    </div>
    ${faixaSincronizacao()}
    ${!total ? `<div class="card vazio">${panda(Cid.status.estado === 'erro' ? 'triste' : 'preguica')}${Cid.sincronizando || Cid.status.estado === 'nunca' ? 'Buscando as cidades na planilha…' : 'Ainda não há cidades: a lista vem da planilha assim que a sincronização funcionar.'}</div>` : `
    <div class="hero compacto">
      <div class="hero-txt">
        <div class="rot">Santa Catarina visitada</div>
        <div class="saldo-val">${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</div>
        <div class="chips">
          <span class="chip">✓ Visitadas <b>${vis}</b></span>
          <span class="chip">Faltam <b>${total - vis}</b></span>
          <span class="chip">Cidades em SC <b>${total}</b></span>
        </div>
      </div>
    </div>
    <div class="cols-2" style="grid-template-columns:1.3fr 1fr">
      <div class="card"><h2>Mapa</h2><div id="cid-mapa-lugar" class="cid-mapa-base"><span class="muted small">Carregando mapa…</span></div>
        <p class="muted small" style="margin:8px 0 0">Toque numa cidade para ver e marcar. <span class="cid-leg on"></span> visitada <span class="cid-leg"></span> ainda não</p></div>
      <div class="card"><h2>Por mesorregião</h2>${grupo('meso').sort((a, b) => b.vis / b.total - a.vis / a.total || a.nome.localeCompare(b.nome)).map(barraGrupo).join('')}
        <details class="cid-micro"><summary>Ver por microrregião</summary>
          ${grupo('micro').sort((a, b) => a.meso.localeCompare(b.meso) || a.nome.localeCompare(b.nome)).map(barraGrupo).join('')}</details></div>
    </div>
    <div class="card">
      <div class="topo secao"><h2>Cidades</h2>
        <div class="filtros">${[['todas', 'Todas'], ['visitadas', 'Visitadas'], ['faltam', 'Faltam']].map(([f, r]) =>
          `<button class="${filtro === f ? 'on' : ''}" data-a="cidFiltro" data-v="${f}">${r}</button>`).join('')}</div></div>
      <input id="cid-busca" type="search" placeholder="Buscar cidade ou região" autocomplete="off" value="${esc(ui.cidBusca || '')}">
      <div class="cid-lista">${visiveis.map(linha).join('')}</div>
      <p class="cid-nada muted small" hidden>Nenhuma cidade com esse nome.</p>
    </div>`}`;
}

// Filtra a lista enquanto digita, sem redesenhar a tela (não perde o foco).
function filtrarCidades() {
  const q = semAcentoApp(ui.cidBusca || ''); let algum = false;
  document.querySelectorAll('.cid-linha').forEach(el => { const v = !q || el.dataset.busca.includes(q); el.hidden = !v; algum = algum || v; });
  const nada = document.querySelector('.cid-nada'); if (nada) nada.hidden = algum;
}

function alterarCidade(nome, novo) {
  const c = cidadesAtuais().find(x => x.m === nome); if (!c) return;
  Cid.pend[nome] = { v: !!novo.v, d: novo.d || '', o: novo.o || '' };
  guardarCidades();
  agendarEnvioCidades();
}

function modalCidade(nome) {
  const c = cidadesAtuais().find(x => x.m === nome); if (!c) return;
  const op = (v, rot) => `<label class="escolha"><input type="radio" name="v" value="${v}" ${(c.v ? 's' : 'n') === v ? 'checked' : ''}><span><b>${rot}</b></span></label>`;
  abrirModal(`
    <h2>${esc(c.m)}</h2>
    <p class="muted small" style="margin:-6px 0 14px">${esc(c.micro)} · ${esc(c.meso)}</p>
    <form class="form" data-f="modal">
      <div class="full"><span class="rotulo">Visitei?</span><div class="escolhas">${op('s', '✓ Sim')}${op('n', 'Ainda não')}</div></div>
      <label class="full">Data da visita<input type="date" name="d" value="${dataISO(c.d)}"></label>
      <label class="full">Observações<textarea name="o" rows="3" placeholder="Ex.: fomos na festa, comida boa…">${esc(c.o)}</textarea></label>
      ${c.pendente ? '<p class="muted small full" style="margin:0">⏳ Esta cidade tem uma alteração aguardando ir para a planilha.</p>' : ''}
      <div class="modal-acoes full"><button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => {
    alterarCidade(c.m, { v: d.v === 's', d: dataBR(d.d), o: d.o.trim() });
    if (d.v === 's' && !c.v) reagir('feliz', `Mais uma no mapa: ${c.m}! 🗺️`, 'Cidade nova visitada! ✨');
  });
}

/* Ações (botões com data-a), juntadas às do app.js. */
const acoesCidades = {
  cidAbrir: v => { modalCidade(v); return Promise.resolve(); },
  cidAlternar: v => {
    const c = cidadesAtuais().find(x => x.m === v); if (!c) return;
    const hojeBR = new Date().toLocaleDateString('pt-BR');
    // Marcar: coloca a data de hoje se não tiver. Desmarcar: tira a data.
    alterarCidade(v, c.v ? { v: false, d: '', o: c.o } : { v: true, d: c.d || hojeBR, o: c.o });
    if (!c.v) reagir('feliz', `Mais uma no mapa: ${c.m}! 🗺️`, 'Cidade nova visitada! ✨');
  },
  cidFiltro: v => { ui.cidFiltro = v; },
  cidSincronizar: () => { sincronizarCidades(); return Promise.resolve(); },
};
document.addEventListener('input', e => { if (e.target.id === 'cid-busca') { ui.cidBusca = e.target.value; filtrarCidades(); } });
