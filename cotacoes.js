'use strict';
/* =========================================================
   🧮 Cotações: comparar orçamentos de fornecedores para qualquer coisa
   (foto e vídeo do casamento, buffet, carro, reforma, viagem…).
   - db.cotacoes (coleção "cotacoes"): { id, nome, planoId, itemId, componentes: [nome],
     campos: [nome], fornecedores: [{ id, nome, status, contato, valores: {componente: número},
     dados: {campo: texto}, nota (0–5), obs }], criadoEm }
   - Total de cada fornecedor = soma dos componentes de preço (vazio se nenhum foi preenchido).
   - Fechar um fornecedor pode levar o total para o "previsto" do item de custo do plano ligado.
   - "📋 Colar cotação" cria uma cotação inteira a partir de um texto (JSON), como o "Colar plano".
   Carregado antes do app.js: só usa coisas dele quando as funções são chamadas.
   ========================================================= */

const STATUS_COT = {
  contatar: { nome: 'A contatar', cor: 'cinza' },
  pedido: { nome: 'Orçamento pedido', cor: 'amarelo' },
  recebido: { nome: 'Orçamento recebido', cor: 'azul' },
  fechado: { nome: 'Fechado', cor: 'verde' },
  descartado: { nome: 'Descartado', cor: 'vermelho' },
};
// Modelos prontos: componentes do preço (somados no total) e outros campos para comparar.
const MODELOS_COT = {
  geral: { nome: 'Geral', emoji: '🧮', componentes: ['Preço'], campos: ['Prazo', 'Forma de pagamento'] },
  foto: { nome: 'Foto e vídeo', emoji: '📸', componentes: ['Foto', 'Vídeo', 'Pré-wedding', 'Deslocamento'], campos: ['Serviço', 'Horas de cobertura', 'Nº de fotógrafos', 'Álbum / impressos', 'Forma de pagamento'] },
  fotografia: { nome: 'Fotografia', emoji: '📷', componentes: ['Foto', 'Pré-wedding', 'Deslocamento'], campos: ['Serviço', 'Horas de cobertura', 'Nº de fotógrafos', 'Álbum / impressos', 'Forma de pagamento'] },
  video: { nome: 'Vídeo', emoji: '🎬', componentes: ['Vídeo', 'Pré-wedding', 'Deslocamento'], campos: ['Serviço', 'Horas de cobertura', 'Filme / entregas', 'Drone', 'Forma de pagamento'] },
  fotovideo: { nome: 'Foto + vídeo', emoji: '🎞️', componentes: ['Foto', 'Vídeo', 'Pré-wedding', 'Deslocamento'], campos: ['Serviço', 'Horas de cobertura', 'Equipe', 'Álbum / impressos', 'Filme / entregas', 'Forma de pagamento'] },
  festa: { nome: 'Buffet / festa', emoji: '🍽️', componentes: ['Por pessoa × convidados', 'Bebidas', 'Taxas'], campos: ['Cardápio', 'Horas de evento', 'Forma de pagamento'] },
  carro: { nome: 'Carro', emoji: '🚗', componentes: ['Preço', 'Documentação', 'Revisão'], campos: ['Ano / modelo', 'Km', 'Cor', 'Forma de pagamento'] },
  obra: { nome: 'Reforma / serviço', emoji: '🛠️', componentes: ['Mão de obra', 'Material'], campos: ['Prazo', 'Garantia', 'Forma de pagamento'] },
  viagem: { nome: 'Viagem / hospedagem', emoji: '✈️', componentes: ['Hospedagem', 'Passagens', 'Taxas'], campos: ['Datas', 'Café da manhã', 'Cancelamento'] },
};

const cotacao = id => (db.cotacoes || []).find(c => c.id === id);
const fornecedorDe = (c, id) => (c.fornecedores || []).find(f => f.id === id);
function totalForn(c, f) {
  const vs = (c.componentes || []).map(k => (f.valores || {})[k]).filter(v => typeof v === 'number' && !isNaN(v));
  return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
}
const temOrcamento = f => f.status === 'recebido' || f.status === 'fechado';
function resumoCot(c) {
  const fs = c.fornecedores || [], comTotal = fs.filter(f => f.status !== 'descartado').map(f => ({ f, t: totalForn(c, f) })).filter(x => x.t !== null);
  const menor = comTotal.length ? comTotal.reduce((a, b) => (b.t < a.t ? b : a)) : null;
  const media = comTotal.length ? comTotal.reduce((s, x) => s + x.t, 0) / comTotal.length : null;
  return { total: fs.length, recebidos: fs.filter(temOrcamento).length, comTotal, menor, media, fechado: fs.find(f => f.status === 'fechado') || null };
}
// Ordem da comparação: fechado, depois quem tem preço (do menor ao maior), depois o resto; descartados no fim.
function ordemForn(c) {
  const peso = f => f.status === 'fechado' ? 0 : f.status === 'descartado' ? 3 : totalForn(c, f) !== null ? 1 : 2;
  return (c.fornecedores || []).slice().sort((a, b) => peso(a) - peso(b) || (totalForn(c, a) ?? 0) - (totalForn(c, b) ?? 0) || a.nome.localeCompare(b.nome));
}
// Contato vira link: telefone → WhatsApp; @perfil → Instagram; endereço da web → ele mesmo.
function linkContato(txt) {
  const t = String(txt || '').trim(); if (!t) return '';
  const url = (/https?:\/\/\S+/.exec(t) || [])[0];
  if (url) return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(t)}</a>`;
  const insta = (/@([\w.]{2,30})/.exec(t) || [])[1];
  if (insta && !/\S+@\S+\.\S+/.test(t)) return `<a href="https://instagram.com/${esc(insta)}" target="_blank" rel="noopener">${esc(t)}</a>`;
  const dig = t.replace(/\D/g, '');
  if (dig.length >= 10 && dig.length <= 13 && !/fixo/i.test(t)) return `<a href="https://wa.me/${dig.length <= 11 ? '55' + dig : dig}" target="_blank" rel="noopener">💬 ${esc(t)}</a>`;
  if (dig.length >= 10) return `<a href="tel:+${dig.length <= 11 ? '55' + dig : dig}">📞 ${esc(t)}</a>`;
  return esc(t);
}
const estrelas = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
const pillStatus = s => `<span class="cot-st st-${(STATUS_COT[s] || STATUS_COT.contatar).cor}">${(STATUS_COT[s] || STATUS_COT.contatar).nome}</span>`;

/* ---------- telas ---------- */
function cartaoCotacoes() {
  const cs = db.cotacoes || [];
  const abertas = cs.filter(c => !resumoCot(c).fechado).length;
  return `<div class="card plano cid-entrada" data-a="aba" data-v="cotacoes" role="button" tabindex="0">
    <div class="cab"><span class="emoji">🧮</span><div><div class="nome">Cotações</div>
      <div class="muted small">${cs.length ? `${cs.length} ${cs.length === 1 ? 'comparação' : 'comparações'} · ${abertas} em aberto` : 'Compare orçamentos de fornecedores'}</div></div></div>
  </div>`;
}

function vCotacoes() {
  if (ui.cotacao && cotacao(ui.cotacao)) return vCotacao(cotacao(ui.cotacao));
  const cs = (db.cotacoes || []).slice().sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  const aviso = App.modo === 'nuvem' && App.semNuvem.cotacoes ? `<p class="tri-aviso forte" style="margin:0 0 16px">⚠️ As cotações estão salvas só neste aparelho:
    ${App.semNuvem.cotacoes === 'regras' ? 'falta atualizar as regras do Firebase (veja o CONFIGURAR.md).' : 'não foi possível falar com a nuvem.'}</p>` : '';
  return `
    <div class="topo">
      <div><button class="btn mini voltar" data-a="aba" data-v="planos">${IC.voltar} Planos</button>
        <h1 style="margin-top:10px">Cotações</h1>
        <p class="sub" style="margin:0">Compare orçamentos de fornecedores lado a lado: preço, status, contato e o que cada um oferece.</p></div>
      <div class="acoes">${(db.cotacoes || []).length ? '<button class="btn" data-a="cotExportar" data-v="">📤 Exportar todas</button>' : ''}<button class="btn" data-a="cotColar">📋 Colar cotação</button><button class="btn pri" data-a="cotNova">+ Nova cotação</button></div>
    </div>
    ${aviso}
    ${cs.length ? `<div class="planos">${cs.map(c => {
      const r = resumoCot(c), p = c.planoId && plano(c.planoId);
      return `<div class="card plano" data-a="cotAbrir" data-v="${esc(c.id)}" role="button" tabindex="0">
        <div class="cab"><span class="emoji">${MODELOS_COT[c.modelo]?.emoji || '🧮'}</span><div><div class="nome">${esc(c.nome)}</div>
          <div class="muted small">${r.total} fornecedores · ${r.recebidos} com orçamento${p ? ' · ' + esc(p.nome) : ''}</div></div></div>
        <div class="linha"><span>${r.fechado ? '✅ Fechado: ' + esc(r.fechado.nome) : r.menor ? 'Menor: ' + esc(r.menor.f.nome) : 'Sem preços ainda'}</span>
          <strong>${r.fechado ? din(totalForn(c, r.fechado) || 0) : r.menor ? din(r.menor.t) : ''}</strong></div>
      </div>`;
    }).join('')}</div>`
    : `<div class="card vazio">${panda('preguica')}Nenhuma cotação ainda. Crie uma para comparar fotógrafos, buffets, carros, reformas…</div>`}`;
}

function vCotacao(c) {
  const r = resumoCot(c), p = c.planoId && plano(c.planoId), item = p && c.itemId && p.itens.find(i => i.id === c.itemId);
  const fs = ordemForn(c), filtro = ui.cotFiltro || 'todos';
  const visiveis = fs.filter(f => filtro === 'todos' || (filtro === 'preco' ? totalForn(c, f) !== null : f.status === filtro));
  const comparar = fs.filter(f => totalForn(c, f) !== null && f.status !== 'descartado');
  const contagem = s => (c.fornecedores || []).filter(f => f.status === s).length;
  return `
    <div class="topo">
      <div><button class="btn mini voltar" data-a="cotVoltar">${IC.voltar} Cotações</button>
        <h1 style="margin-top:10px">${MODELOS_COT[c.modelo]?.emoji || '🧮'} ${esc(c.nome)}</h1>
        <p class="sub" style="margin:0">${p ? `Plano: <b>${esc(p.nome)}</b>${item ? ' · item "' + esc(item.desc) + '"' : ''}` : 'Sem plano ligado'}</p></div>
      <div class="acoes"><button class="btn" data-a="cotExportar" data-v="${esc(c.id)}">📤 Exportar</button><button class="btn" data-a="cotEditar" data-v="${esc(c.id)}">Editar</button><button class="btn pri" data-a="cotNovoForn" data-v="${esc(c.id)}">+ Fornecedor</button></div>
    </div>
    <div class="grid">
      <div class="card stat"><div class="rot">Menor total</div><div class="val pos">${r.menor ? din(r.menor.t) : '—'}</div>${r.menor ? `<div class="muted small">${esc(r.menor.f.nome)}</div>` : ''}</div>
      <div class="card stat"><div class="rot">Média dos orçamentos</div><div class="val">${r.media !== null ? din(r.media) : '—'}</div></div>
      <div class="card stat"><div class="rot">Com orçamento</div><div class="val">${r.recebidos} de ${r.total}</div></div>
      <div class="card stat"><div class="rot">Fechado</div><div class="val">${r.fechado ? esc(r.fechado.nome) : '—'}</div>${r.fechado && totalForn(c, r.fechado) !== null ? `<div class="muted small">${din(totalForn(c, r.fechado))}</div>` : ''}</div>
    </div>
    ${comparar.length >= 1 ? `<div class="card"><h2>Comparativo</h2><div class="rolagem"><table class="tabela cot-tabela">
      <thead><tr><th>Fornecedor</th><th class="num">Total</th>${(c.componentes || []).map(k => `<th class="num">${esc(k)}</th>`).join('')}
        ${(c.campos || []).map(k => `<th>${esc(k)}</th>`).join('')}<th>Nota</th></tr></thead>
      <tbody>${comparar.map(f => {
        const t = totalForn(c, f), menor = r.menor && r.menor.f.id === f.id;
        return `<tr class="${menor ? 'cot-menor' : ''} ${f.status === 'fechado' ? 'cot-fechado' : ''}" data-a="cotEditarForn" data-v="${esc(c.id)}|${esc(f.id)}">
          <td><b>${esc(f.nome)}</b>${menor ? ' <span class="chip">menor</span>' : ''}${f.status === 'fechado' ? ' <span class="chip">fechado</span>' : ''}</td>
          <td class="num"><b>${din(t)}</b>${r.menor && !menor ? `<br><small class="neg">+${din(t - r.menor.t)}</small>` : ''}</td>
          ${(c.componentes || []).map(k => `<td class="num">${typeof (f.valores || {})[k] === 'number' ? din(f.valores[k]) : '—'}</td>`).join('')}
          ${(c.campos || []).map(k => `<td>${esc((f.dados || {})[k] || '—')}</td>`).join('')}<td class="cot-nota">${estrelas(f.nota)}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="muted small" style="margin:8px 0 0">Toque numa linha para editar. "+R$" é quanto fica acima do menor total.</p></div>` : ''}
    <div class="chips cot-filtros">
      ${[['todos', `Todos (${(c.fornecedores || []).length})`], ['preco', 'Com preço'], ...Object.entries(STATUS_COT).map(([k, s]) => [k, `${s.nome} (${contagem(k)})`])]
        .map(([k, rot]) => `<button class="chip ${filtro === k ? 'ativo' : ''}" data-a="cotFiltro" data-v="${k}">${rot}</button>`).join('')}
    </div>
    <div class="cot-lista">${visiveis.map(f => cartaoForn(c, f, r)).join('') || '<p class="muted">Nenhum fornecedor neste filtro.</p>'}</div>`;
}

function cartaoForn(c, f, r) {
  const t = totalForn(c, f), menor = r.menor && r.menor.f.id === f.id;
  const dados = (c.campos || []).filter(k => (f.dados || {})[k]).map(k => `<div><small>${esc(k)}</small><span>${esc(f.dados[k])}</span></div>`).join('');
  const valores = (c.componentes || []).filter(k => typeof (f.valores || {})[k] === 'number').map(k => `<span>${esc(k)}: <b>${din(f.valores[k])}</b></span>`).join('');
  return `<div class="card cot-forn ${menor ? 'cot-menor' : ''} st-${(STATUS_COT[f.status] || STATUS_COT.contatar).cor}">
    <div class="cot-cab"><div><strong>${esc(f.nome)}</strong> ${estrelas(f.nota) ? `<span class="cot-nota">${estrelas(f.nota)}</span>` : ''}
      <div class="muted small">${linkContato(f.contato)}</div></div>
      <div class="cot-total">${t !== null ? din(t) : '<span class="muted small">sem preço</span>'}${menor ? '<small>menor total</small>' : ''}</div></div>
    ${valores ? `<div class="cot-valores">${valores}</div>` : ''}
    ${dados ? `<div class="cot-dados">${dados}</div>` : ''}
    ${f.obs ? `<p class="cot-obs">${esc(f.obs)}</p>` : ''}
    <div class="cot-acoes">
      <select data-c="cotStatus" data-i="${esc(c.id)}|${esc(f.id)}" aria-label="Status">${Object.entries(STATUS_COT).map(([k, s]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${s.nome}</option>`).join('')}</select>
      <button class="btn mini" data-a="cotEditarForn" data-v="${esc(c.id)}|${esc(f.id)}">Editar</button>
    </div>
  </div>`;
}

/* ---------- janelas ---------- */
const listaTexto = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
function opcoesPlanoItem(c) {
  return `<label>Plano (opcional)<select name="planoId" id="cot-plano"><option value="">— nenhum —</option>
      ${db.planos.map(p => `<option value="${esc(p.id)}" ${c.planoId === p.id ? 'selected' : ''}>${TIPOS[p.tipo]?.emoji || ''} ${esc(p.nome)}</option>`).join('')}</select></label>
    <label>Item de custo do plano<select name="itemId" id="cot-item">${itensPlanoOpcoes(c.planoId, c.itemId)}</select></label>`;
}
const itensPlanoOpcoes = (planoId, itemId) => {
  const p = planoId && plano(planoId);
  return `<option value="">${p ? '— nenhum —' : 'escolha o plano'}</option>` + (p ? p.itens.map(i => `<option value="${esc(i.id)}" ${i.id === itemId ? 'selected' : ''}>${esc(i.desc)}</option>`).join('') : '');
};

function modalCotacao(c) {
  const nova = !c;
  c = c || { nome: '', modelo: 'geral', planoId: '', itemId: '', componentes: MODELOS_COT.geral.componentes, campos: MODELOS_COT.geral.campos };
  abrirModal(`
    <h2>${nova ? 'Nova cotação' : 'Editar cotação'}</h2>
    <form class="form" data-f="modal" id="cot-form">
      <label class="full">O que você está cotando<input name="nome" required value="${esc(c.nome)}" placeholder="Ex.: Foto e vídeo do casamento, Buffet, Pintura da casa"></label>
      ${nova ? `<div class="full"><span class="rotulo">Modelo</span><div class="cot-modelos">${Object.entries(MODELOS_COT).map(([k, m]) =>
        `<label class="escolha"><input type="radio" name="modelo" value="${k}" ${c.modelo === k ? 'checked' : ''}><span><b>${m.emoji} ${m.nome}</b></span></label>`).join('')}</div></div>` : ''}
      <label class="full">Componentes do preço <small class="muted">(separados por vírgula; somados no total)</small>
        <input name="componentes" value="${esc((c.componentes || []).join(', '))}"></label>
      <label class="full">Outros campos para comparar <small class="muted">(separados por vírgula)</small>
        <input name="campos" value="${esc((c.campos || []).join(', '))}"></label>
      ${opcoesPlanoItem(c)}
      <p class="muted small full" style="margin:0">Ligando a um item do plano, ao marcar um fornecedor como <b>Fechado</b> o app oferece levar o total para o "previsto" desse item.</p>
      <div class="modal-acoes full">
        ${nova ? '' : `<button type="button" class="btn perigo" data-a="cotExcluir" data-v="${esc(c.id)}" style="margin-right:auto">Excluir</button>`}
        <button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => {
    const dados = { nome: String(d.nome || '').trim(), componentes: listaTexto(d.componentes), campos: listaTexto(d.campos), planoId: d.planoId || '', itemId: d.planoId ? (d.itemId || '') : '' };
    if (!dados.nome) { alert('Diga o que você está cotando.'); return false; }
    if (!dados.componentes.length) dados.componentes = ['Preço'];
    db.cotacoes = db.cotacoes || [];
    if (nova) {
      const nc = { id: 'ct-' + uid(), ...dados, modelo: d.modelo || 'geral', fornecedores: [], criadoEm: new Date().toISOString() };
      db.cotacoes.push(nc); ui.cotacao = nc.id;
      reagir('feliz', 'Bora pesquisar preço! 🧮');
    } else Object.assign(c, dados);
  });
  const f = $('#cot-form');
  f.addEventListener('change', e => {
    if (e.target.name === 'planoId') $('#cot-item').innerHTML = itensPlanoOpcoes(e.target.value, '');
    if (e.target.name === 'modelo') { const m = MODELOS_COT[e.target.value]; f.componentes.value = m.componentes.join(', '); f.campos.value = m.campos.join(', '); }
  });
}

function modalFornecedor(c, f) {
  const novo = !f;
  f = f || { nome: '', status: 'contatar', contato: '', valores: {}, dados: {}, nota: 0, obs: '' };
  abrirModal(`
    <h2>${novo ? 'Novo fornecedor' : esc(f.nome)}</h2>
    <form class="form" data-f="modal" id="forn-form">
      <label class="full">Fornecedor<input name="nome" required value="${esc(f.nome)}" placeholder="Nome da empresa ou do profissional"></label>
      <div class="full"><span class="rotulo">Status</span><div class="cot-status-esc">${Object.entries(STATUS_COT).map(([k, s]) =>
        `<label class="escolha"><input type="radio" name="status" value="${k}" ${f.status === k ? 'checked' : ''}><span><b>${s.nome}</b></span></label>`).join('')}</div></div>
      <label class="full">Contato <small class="muted">(WhatsApp, @instagram, site…)</small><input name="contato" value="${esc(f.contato || '')}"></label>
      ${(c.componentes || []).map((k, n) => `<label>${esc(k)} (R$)<input name="v${n}" type="number" step="0.01" min="0" value="${typeof (f.valores || {})[k] === 'number' ? f.valores[k] : ''}" placeholder="—"></label>`).join('')}
      ${(c.campos || []).map((k, n) => `<label>${esc(k)}<input name="c${n}" value="${esc((f.dados || {})[k] || '')}"></label>`).join('')}
      <div class="full"><span class="rotulo">Sua nota</span><div class="cot-estrelas">${[1, 2, 3, 4, 5].map(n =>
        `<label><input type="radio" name="nota" value="${n}" ${f.nota === n ? 'checked' : ''}><span>★</span></label>`).join('')}
        <label class="cot-sem-nota"><input type="radio" name="nota" value="0" ${!f.nota ? 'checked' : ''}><span>sem nota</span></label></div></div>
      <label class="full">Observações<textarea name="obs" rows="3" placeholder="O que inclui, hora extra, condições…">${esc(f.obs || '')}</textarea></label>
      <div class="modal-acoes full">
        ${novo ? '' : `<button type="button" class="btn perigo" data-a="cotExcluirForn" data-v="${esc(c.id)}|${esc(f.id)}" style="margin-right:auto">Excluir</button>`}
        <button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => {
    const valores = {}, dados = {};
    (c.componentes || []).forEach((k, n) => { if (String(d['v' + n] ?? '').trim() !== '') valores[k] = Math.abs(parseValor(d['v' + n])); });
    (c.campos || []).forEach((k, n) => { if (String(d['c' + n] || '').trim()) dados[k] = String(d['c' + n]).trim(); });
    const novoF = { nome: String(d.nome || '').trim(), status: STATUS_COT[d.status] ? d.status : 'contatar', contato: String(d.contato || '').trim(), valores, dados, nota: Number(d.nota) || 0, obs: String(d.obs || '').trim() };
    if (!novoF.nome) { alert('Coloque o nome do fornecedor.'); return false; }
    const virouFechado = novoF.status === 'fechado' && f.status !== 'fechado';
    if (novo) { f = { id: 'fo-' + uid(), ...novoF }; c.fornecedores.push(f); } else Object.assign(f, novoF);
    if (virouFechado) aoFechar(c, f);
  });
}

// Fechou com um fornecedor: os outros fechados voltam para "orçamento recebido" e, se houver
// item de plano ligado, oferece levar o total para o previsto.
function aoFechar(c, f) {
  (c.fornecedores || []).forEach(o => { if (o !== f && o.status === 'fechado') o.status = 'recebido'; });
  const t = totalForn(c, f), p = c.planoId && plano(c.planoId), item = p && c.itemId && p.itens.find(i => i.id === c.itemId);
  if (item && t !== null && Math.abs((item.previsto || 0) - t) > 0.004 &&
      confirm(`Fechado com ${f.nome}! Atualizar o previsto de "${item.desc}" no plano "${p.nome}" para ${brl(t)}?`)) item.previsto = t;
  reagir('feliz', 'Fechado! 🤝');
}

/* ---------- colar cotação pronta (JSON) ---------- */
// Aceita uma cotação ({ cotacao: {...} }) ou várias ({ cotacoes: [...] }, como sai do "Exportar" em .json).
function lerCotacoesColadas(texto) {
  const t = String(texto || '').replace(/^\s*```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  let j; try { j = JSON.parse(t); } catch (e) { throw new Error('Não consegui ler o texto. Copie e cole o bloco inteiro, do primeiro "{" até o último "}".'); }
  const lista = Array.isArray(j?.cotacoes) ? j.cotacoes : [j && (j.cotacao || j)];
  return lista.map(montarCotacao);
}
const lerCotacaoColada = texto => lerCotacoesColadas(texto)[0];
function montarCotacao(c) {
  if (!c || !String(c.nome || '').trim()) throw new Error('O texto precisa ter pelo menos o nome da cotação.');
  const lista = x => Array.isArray(x) ? x : [];
  const componentes = lista(c.componentes).map(String).filter(Boolean), campos = lista(c.campos).map(String).filter(Boolean);
  const statusDe = s => { const k = Object.keys(STATUS_COT).find(k => k === s || semAcentoApp(STATUS_COT[k].nome) === semAcentoApp(s)); return k || 'contatar'; };
  const p = c.plano ? db.planos.find(x => semAcentoApp(x.nome) === semAcentoApp(c.plano)) : null;
  const item = p && c.item ? p.itens.find(i => semAcentoApp(i.desc) === semAcentoApp(c.item)) : null;
  return {
    id: 'ct-' + uid(), nome: String(c.nome).trim(), modelo: MODELOS_COT[c.modelo] ? c.modelo : 'geral',
    componentes: componentes.length ? componentes : ['Preço'], campos, planoId: p ? p.id : '', itemId: item ? item.id : '', criadoEm: new Date().toISOString(),
    fornecedores: lista(c.fornecedores).filter(f => f && String(f.nome || '').trim()).map(f => {
      const valores = {}, dados = {};
      Object.entries(f.valores || {}).forEach(([k, v]) => { if (v !== null && v !== '' && !isNaN(parseValor(v))) valores[k] = Math.abs(parseValor(v)); });
      Object.entries(f.dados || {}).forEach(([k, v]) => { if (v !== null && String(v).trim()) dados[k] = String(v).trim(); });
      return { id: 'fo-' + uid(), nome: String(f.nome).trim(), status: statusDe(f.status), contato: String(f.contato || ''), valores, dados, nota: Math.min(5, Math.max(0, Number(f.nota) || 0)), obs: String(f.obs || '') };
    }),
  };
}
function modalColarCotacao() {
  abrirModal(`
    <h2>Colar cotação</h2>
    <form class="form" data-f="modal">
      <p class="muted small full" style="margin:0">Cole aqui o texto da cotação (começa com <b>{</b> e termina com <b>}</b>). O app cria a comparação com todos os fornecedores.</p>
      <label class="full">Texto da cotação<textarea name="texto" rows="10" required spellcheck="false" style="font-family:ui-monospace,monospace;font-size:13px" placeholder='{ "cotacao": { "nome": "...", ... } }'></textarea></label>
      <div class="modal-acoes full"><button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Criar cotação</button></div>
    </form>`, d => {
    let cs; try { cs = lerCotacoesColadas(d.texto); } catch (e) { alert(e.message); return false; }
    db.cotacoes = db.cotacoes || [];
    cs.forEach(c => {
      const igual = db.cotacoes.find(x => semAcentoApp(x.nome) === semAcentoApp(c.nome));
      if (igual && confirm(`Já existe a cotação "${igual.nome}". Substituir o conteúdo dela por esta?\n\nOK = substituir · Cancelar = criar outra`)) {
        const id = igual.id; Object.assign(igual, c, { id }); ui.cotacao = id;
      } else { db.cotacoes.push(c); ui.cotacao = c.id; }
    });
    if (cs.length > 1) ui.cotacao = null;
    ui.aba = 'cotacoes';
    reagir('feliz', 'Cotação colada! 🧮');
    alert(cs.length === 1 ? `Cotação "${cs[0].nome}" pronta: ${cs[0].fornecedores.length} fornecedor(es).` : `${cs.length} cotações prontas.`);
  });
}

/* ---------- exportar (texto para WhatsApp/IA, planilha .csv e .json) ---------- */
const nomeStatus = s => (STATUS_COT[s] || STATUS_COT.contatar).nome;
const brlTxt = v => typeof v === 'number' ? brl(v) : '—';
function textoCotacao(c) {
  const r = resumoCot(c), p = c.planoId && plano(c.planoId), item = p && c.itemId && p.itens.find(i => i.id === c.itemId);
  const linhas = [`# ${c.nome}`];
  if (p) linhas.push(`Plano: ${p.nome}${p.dataAlvo ? ' (data ' + fmtData(p.dataAlvo) + ')' : ''}${item ? ' · item "' + item.desc + '"' : ''}`);
  linhas.push(`O total de cada fornecedor é a soma de: ${(c.componentes || []).join(' + ')}.`);
  linhas.push(`Resumo: ${r.recebidos} de ${r.total} com orçamento` + (r.menor ? ` · menor total ${brl(r.menor.t)} (${r.menor.f.nome})` : '') +
    (r.media !== null ? ` · média ${brl(r.media)}` : '') + (r.fechado ? ` · FECHADO com ${r.fechado.nome}` : '') + '.');
  const comPreco = ordemForn(c).filter(f => totalForn(c, f) !== null && f.status !== 'descartado');
  if (comPreco.length) {
    linhas.push('', '## Comparativo (com preço)', '', `| Fornecedor | Total | ${(c.componentes || []).join(' | ')} |`, `|---|---|${(c.componentes || []).map(() => '---|').join('')}`);
    comPreco.forEach(f => linhas.push(`| ${f.nome} | ${brl(totalForn(c, f))} | ${(c.componentes || []).map(k => brlTxt((f.valores || {})[k])).join(' | ')} |`));
  }
  linhas.push('', '## Fornecedores');
  ordemForn(c).forEach(f => {
    const t = totalForn(c, f);
    linhas.push('', `### ${f.nome}`, `- Status: ${nomeStatus(f.status)}`, `- Total: ${t !== null ? brl(t) : 'sem preço'}`);
    (c.componentes || []).forEach(k => { if (typeof (f.valores || {})[k] === 'number') linhas.push(`- ${k}: ${brl(f.valores[k])}`); });
    (c.campos || []).forEach(k => { if ((f.dados || {})[k]) linhas.push(`- ${k}: ${f.dados[k]}`); });
    if (f.contato) linhas.push(`- Contato: ${f.contato}`);
    if (f.nota) linhas.push(`- Nossa nota: ${f.nota}/5`);
    if (f.obs) linhas.push(`- Observações: ${f.obs}`);
  });
  return linhas.join('\n');
}
function csvCotacoes(cs) {
  const comps = [...new Set(cs.flatMap(c => c.componentes || []))], campos = [...new Set(cs.flatMap(c => c.campos || []))];
  const q = v => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const num = v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '';
  const linhas = [['Cotação', 'Fornecedor', 'Status', 'Total (R$)', ...comps.map(k => k + ' (R$)'), ...campos, 'Nota', 'Contato', 'Observações'].map(q).join(';')];
  cs.forEach(c => ordemForn(c).forEach(f => linhas.push([c.nome, f.nome, nomeStatus(f.status), num(totalForn(c, f)),
    ...comps.map(k => num((f.valores || {})[k])), ...campos.map(k => (f.dados || {})[k] || ''), f.nota || '', f.contato || '', f.obs || ''].map(q).join(';'))));
  return '\ufeff' + linhas.join('\r\n');   // BOM: o Excel abre os acentos certos
}
function jsonCotacoes(cs) {
  const uma = c => { const p = c.planoId && plano(c.planoId), item = p && c.itemId && p.itens.find(i => i.id === c.itemId);
    return { nome: c.nome, modelo: c.modelo || 'geral', ...(p ? { plano: p.nome } : {}), ...(item ? { item: item.desc } : {}), componentes: c.componentes || [], campos: c.campos || [],
      fornecedores: (c.fornecedores || []).map(f => ({ nome: f.nome, status: nomeStatus(f.status), contato: f.contato || '', valores: f.valores || {}, dados: f.dados || {}, nota: f.nota || 0, obs: f.obs || '' })) }; };
  return JSON.stringify(cs.length === 1 ? { cotacao: uma(cs[0]) } : { cotacoes: cs.map(uma) }, null, 1);
}
const PEDIDO_IA = 'Me ajude a escolher o melhor fornecedor. Compare preço, o que cada um inclui, horas de cobertura, entregas e forma de pagamento; aponte o que falta perguntar a cada um.';
function modalExportar(ids) {
  const cs = ids.map(cotacao).filter(Boolean); if (!cs.length) return;
  const nome = cs.length === 1 ? cs[0].nome : 'Cotações';
  abrirModal(`
    <h2>📤 Exportar ${cs.length === 1 ? 'cotação' : cs.length + ' cotações'}</h2>
    <div class="form">
      <p class="muted small full" style="margin:0">Tudo: fornecedores, status, valores, campos, contato, nota e observações.</p>
      <label class="full cal-check"><input type="checkbox" id="exp-ia"><span>🤖 Incluir um pedido para a IA no começo do texto <small class="muted">("${PEDIDO_IA.slice(0, 60)}…")</small></span></label>
      <div class="full exp-opcoes">
        <button type="button" class="btn pri" data-exp="copiar">📋 Copiar texto<small>para WhatsApp, e-mail ou IA</small></button>
        ${navigator.share ? '<button type="button" class="btn" data-exp="compartilhar">📲 Compartilhar<small>abre o WhatsApp e outros apps</small></button>' : ''}
        <button type="button" class="btn" data-exp="csv">📊 Planilha (.csv)<small>abre no Excel / Google Planilhas</small></button>
        <button type="button" class="btn" data-exp="json">💾 Arquivo .json<small>volta pro app com "Colar cotação"</small></button>
      </div>
      <details class="full cal-ajuda"><summary>Ver o texto</summary><pre class="exp-previa">${esc(cs.map(textoCotacao).join('\n\n---\n\n'))}</pre></details>
      <div class="modal-acoes full"><button type="button" class="btn" data-a="fecharModal">Fechar</button></div>
    </div>`);
  const texto = () => ($('#exp-ia').checked ? PEDIDO_IA + '\n\n' : '') + cs.map(textoCotacao).join('\n\n---\n\n');
  const arquivo = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'cotacoes';
  $('#modal-body .form').addEventListener('click', async e => {
    const b = e.target.closest('[data-exp]'); if (!b) return;
    const tipo = b.dataset.exp;
    if (tipo === 'copiar') {
      try { await navigator.clipboard.writeText(texto()); b.firstChild.textContent = '✅ Copiado! '; }
      catch (err) { prompt('Copie o texto:', texto()); }
    } else if (tipo === 'compartilhar') {
      try { await navigator.share({ title: nome, text: texto() }); } catch (err) { /* cancelado */ }
    } else if (tipo === 'csv') baixar(arquivo + '.csv', csvCotacoes(cs), 'text/csv;charset=utf-8');
    else if (tipo === 'json') baixar(arquivo + '.json', jsonCotacoes(cs), 'application/json');
  });
}

const acoesCotacoes = {
  cotExportar: v => modalExportar(v ? [v] : (db.cotacoes || []).map(c => c.id)),
  cotNova: () => modalCotacao(),
  cotColar: () => modalColarCotacao(),
  cotAbrir: v => { ui.cotacao = v; ui.cotFiltro = 'todos'; },
  cotIrPara: v => { ui.aba = 'cotacoes'; ui.plano = null; ui.cotacao = v; ui.cotFiltro = 'todos'; },
  cotVoltar: () => { ui.cotacao = null; },
  cotEditar: v => { const c = cotacao(v); if (c) modalCotacao(c); },
  cotExcluir: v => {
    const c = cotacao(v); if (!c || !confirm(`Excluir a cotação "${c.nome}" com todos os fornecedores?`)) return;
    db.cotacoes = db.cotacoes.filter(x => x.id !== v); ui.cotacao = null; fecharModal();
  },
  cotNovoForn: v => { const c = cotacao(v); if (c) modalFornecedor(c); },
  cotEditarForn: v => { const [ci, fi] = v.split('|'), c = cotacao(ci), f = c && fornecedorDe(c, fi); if (f) modalFornecedor(c, f); },
  cotExcluirForn: v => {
    const [ci, fi] = v.split('|'), c = cotacao(ci), f = c && fornecedorDe(c, fi);
    if (!f || !confirm(`Excluir ${f.nome} desta cotação?`)) return;
    c.fornecedores = c.fornecedores.filter(x => x.id !== fi); fecharModal();
  },
  cotFiltro: v => { ui.cotFiltro = v; },
};
