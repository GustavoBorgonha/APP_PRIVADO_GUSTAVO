'use strict';
/* =========================================================
   Revisão por categoria (estilo triagem) e Conta corrente.
   Carregado antes do app.js: só usa coisas do app.js (db, ui, esc,
   seletorCat, memoriaHistorico…) quando as funções são chamadas.
   ========================================================= */

/* ---------- Revisão por categoria ----------
   Escolhe período + categoria e revisa lançamento por lançamento: trocar a categoria
   (ou a descrição) e confirmar, ou pular. O app sugere a categoria pelo histórico
   (sem contar a própria categoria revisada, para não sugerir "Outros" de novo). */
const lancPorId = id => db.lancamentos.find(l => l.id === id);
const inicioDoMes = m => m + '-01';

function iniciarRevisao(d) {
  const de = d.de || '0000-01-01', ate = d.ate || '9999-12-31', categoria = d.categoria;
  if (!categoria) { alert('Escolha a categoria para revisar.'); return false; }
  const ids = db.lancamentos.filter(l => l.categoria === categoria && l.data >= de && l.data <= ate)
    .sort((a, b) => b.data.localeCompare(a.data)).map(l => l.id);
  if (!ids.length) { alert(`Não há lançamentos em "${categoria}" nesse período.`); return false; }
  const sugerir = memoriaHistorico(l => l.categoria !== categoria);
  const sug = {};
  ids.forEach(id => {
    const l = lancPorId(id), s = sugerir({ ...l, bruto: l.bruto || '' });
    if (s && s.categoria && s.categoria !== categoria) sug[id] = s.categoria;
  });
  ui.revisao = { de: d.de || '', ate: d.ate || '', categoria, ids, estado: {}, edit: {}, sug, mostrar: 10 };
  return true;
}

function cartaoRevisao(l) {
  const r = ui.revisao, e = r.edit[l.id] || {}, sug = r.sug[l.id];
  const campo = f => `data-c="rev" data-i="${esc(l.id)}" data-f="${f}"`;
  return `<div class="card tri rev">
    <div class="tri-topo">
      <span class="mov-ic ${l.tipo}">${iconeCat(e.categoria || sug || l.categoria, l.tipo)}</span>
      <div class="tri-orig"><small>${fmtData(l.data)}${l.hora ? ' · ' + l.hora : ''}${rotuloOrigem(l) ? ' · ' + esc(rotuloOrigem(l)) : ''}</small>
        <span>${esc(l.bruto || l.desc)}</span>${linhaDetalhes(l)}</div>
      <strong class="tri-valor ${l.tipo === 'receita' ? 'pos' : ''}">${l.tipo === 'receita' ? '+' : '−'} ${din(l.valor)}</strong>
    </div>
    ${sug ? `<p class="rev-sug">💡 Pelo seu histórico, parece <b>${esc(sug)}</b>. Já deixei escolhido.</p>` : ''}
    <div class="tri-campos">
      <label class="larga">Descrição<input ${campo('desc')} value="${esc(e.desc ?? l.desc)}"></label>
      <label class="larga">Categoria${seletorCat(campo('categoria'), 'tipo:' + l.tipo, e.categoria || sug || l.categoria)}</label>
    </div>
    <div class="tri-acoes">
      <span class="muted small" style="margin-right:auto">Hoje: ${iconeCat(l.categoria, l.tipo)} ${esc(l.categoria)}</span>
      <button class="btn" data-a="revPular" data-v="${esc(l.id)}">Pular</button>
      <button class="btn pri" data-a="revConfirmar" data-v="${esc(l.id)}">✓ Confirmar</button>
    </div>
  </div>`;
}

function vRevisao() {
  const r = ui.revisao;
  const volta = `<button class="btn mini voltar" data-a="aba" data-v="financas">${IC.voltar} Finanças</button>`;
  if (!r) {
    const hojeISO = hoje(), tresMeses = inicioDoMes(mesDesloc(mesAtual(), -2));
    return `
      <div class="topo"><div>${volta}<h1 style="margin-top:10px">Revisar categoria</h1>
        <p class="sub" style="margin:0">Escolha o período e a categoria. Você revisa os lançamentos um a um, como na triagem.</p></div></div>
      <div class="card" style="max-width:640px">
        <form class="form" data-f="revisaoInicio">
          <label>De<input type="date" name="de" value="${tresMeses}"></label>
          <label>Até<input type="date" name="ate" value="${hojeISO}"></label>
          <label class="full">Categoria${seletorCat('name="categoria" id="rev-cat"', 'periodo', 'Outros', 'Escolha a categoria')}</label>
          <div class="acoes full rev-atalhos">
            <span class="muted small">Período rápido:</span>
            <button type="button" class="btn mini" data-a="revPeriodo" data-v="mes">Este mês</button>
            <button type="button" class="btn mini" data-a="revPeriodo" data-v="3">3 meses</button>
            <button type="button" class="btn mini" data-a="revPeriodo" data-v="ano">Este ano</button>
            <button type="button" class="btn mini" data-a="revPeriodo" data-v="tudo">Tudo</button>
          </div>
          <div class="modal-acoes full"><button class="btn pri">Começar revisão</button></div>
        </form>
      </div>`;
  }
  const lancs = r.ids.map(lancPorId).filter(Boolean);
  const pend = lancs.filter(l => !r.estado[l.id]);
  const feitos = lancs.length - pend.length;
  const mudou = lancs.filter(l => r.estado[l.id] === 'mudou').length, pulou = lancs.filter(l => r.estado[l.id] === 'pulado').length;
  const comSug = pend.filter(l => r.sug[l.id]).length;
  const periodo = r.de || r.ate ? `${r.de ? fmtData(r.de) : 'início'} a ${r.ate ? fmtData(r.ate) : 'hoje'}` : 'todo o período';
  return `
    <div class="topo">
      <div>${volta}<h1 style="margin-top:10px">Revisar categoria</h1>
        <p class="sub" style="margin:0"><span class="selo">${iconeCat(r.categoria, 'despesa')} ${esc(r.categoria)}</span> ${periodo}</p></div>
      <div class="acoes">${comSug ? `<button class="btn pri" data-a="revAplicarSug">⚡ Aplicar sugestões (${comSug})</button>` : ''}
        ${pend.length > 1 ? `<button class="btn" data-a="revPularTodos">Pular todos (${pend.length})</button>` : ''}
        <button class="btn" data-a="revNova">Trocar filtro</button>
        <button class="btn" data-a="revEncerrar">Encerrar revisão</button></div>
    </div>
    <div class="card tri-progresso">
      <div class="linha" style="margin:0 0 8px"><strong>${feitos} de ${lancs.length} revisados</strong>
        <span class="muted">${mudou} ${mudou === 1 ? 'mudou' : 'mudaram'} · ${pulou} ${pulou === 1 ? 'pulado' : 'pulados'}</span></div>
      <div class="barra"><i style="width:${lancs.length ? feitos / lancs.length * 100 : 0}%"></i></div>
    </div>
    ${pend.length ? `<div class="tri-lista">${pend.slice(0, r.mostrar).map(cartaoRevisao).join('')}</div>
      ${pend.length > r.mostrar ? `<div class="acoes" style="justify-content:center;margin:-2px 0 16px">
        <button class="btn" data-a="revMais">Mostrar mais (${pend.length - r.mostrar} restantes)</button></div>` : ''}`
      : `<div class="card vazio">${panda('feliz')}<strong style="color:var(--text);font-size:17px">Revisão concluída!</strong><br>
          ${mudou} ${mudou === 1 ? 'lançamento mudou' : 'lançamentos mudaram'} de categoria ou descrição.
          <div class="acoes" style="justify-content:center;margin-top:14px"><button class="btn pri" data-a="revNova">Revisar outra categoria</button></div></div>`}`;
}

// Aplica a escolha de um cartão no lançamento.
function aplicarRevisao(id, usarSug = true) {
  const r = ui.revisao, l = lancPorId(id); if (!l) return;
  const e = r.edit[id] || {};
  const categoria = e.categoria || (usarSug && r.sug[id]) || l.categoria, desc = String(e.desc ?? l.desc).trim() || l.desc;
  const mudou = categoria !== l.categoria || desc !== l.desc;
  l.categoria = categoria; l.desc = desc;
  r.estado[id] = mudou ? 'mudou' : 'ok';
}

const acoesRevisao = {
  revConfirmar: v => { aplicarRevisao(v); },
  revPular: v => { ui.revisao.estado[v] = 'pulado'; },
  revMais: () => { ui.revisao.mostrar += 10; },
  revNova: () => { ui.revisao = null; },
  // Pular todos: os que faltam ficam como estão (nada muda neles).
  revPularTodos: () => {
    const r = ui.revisao, ids = r.ids.filter(id => !r.estado[id]);
    if (!confirm(`Pular ${ids.length === 1 ? 'o lançamento que falta' : `os ${ids.length} lançamentos que faltam`}?\nEles continuam com a categoria de hoje.`)) return;
    ids.forEach(id => { r.estado[id] = 'pulado'; });
  },
  // Encerrar: sai da revisão; o que já foi confirmado fica salvo, o resto não muda.
  revEncerrar: () => {
    const r = ui.revisao, falta = r ? r.ids.filter(id => !r.estado[id]).length : 0;
    if (falta && !confirm(`Encerrar a revisão?\n${falta === 1 ? '1 lançamento não revisado continua' : `${falta} lançamentos não revisados continuam`} como está. O que você já confirmou fica salvo.`)) return;
    ui.revisao = null; ui.aba = 'financas';
  },
  revAplicarSug: () => {
    const r = ui.revisao, ids = r.ids.filter(id => !r.estado[id] && r.sug[id] && !(r.edit[id] && r.edit[id].categoria));
    if (!confirm(`Aplicar a sugestão do histórico em ${ids.length === 1 ? '1 lançamento' : `${ids.length} lançamentos`}?\nOs outros continuam para você revisar.`)) return;
    ids.forEach(id => aplicarRevisao(id));
    reagir('feliz', 'Tudo no lugar! 🗂️');
  },
  revPeriodo: v => {
    const f = document.querySelector('form[data-f=revisaoInicio]'); if (!f) return Promise.resolve();
    const m = mesAtual();
    f.de.value = v === 'mes' ? inicioDoMes(m) : v === '3' ? inicioDoMes(mesDesloc(m, -2)) : v === 'ano' ? m.slice(0, 4) + '-01-01' : '';
    f.ate.value = v === 'tudo' ? '' : hoje();
    return Promise.resolve();
  },
};

/* ---------- Conta corrente ----------
   Cada conta = banco + débito/crédito + titular (como veio do extrato). Mostra cada movimento,
   inclusive transferências, com o saldo depois de cada um. O saldo é calculado só com o que está
   lançado no app (começa em zero no primeiro lançamento daquela conta). */
const chaveConta = l => [l.banco || '', l.meio || '', l.titular || ''].join('|');
function contasDisponiveis() {
  const m = new Map();
  db.lancamentos.forEach(l => {
    const k = chaveConta(l), c = m.get(k) || { chave: k, banco: l.banco || '', meio: l.meio || '', titular: l.titular || '', n: 0 };
    c.n++; m.set(k, c);
  });
  return [...m.values()].sort((a, b) => (!a.banco) - (!b.banco) || b.n - a.n);
}
const nomeConta = c => c.banco ? `${c.banco} ${c.meio === 'credito' ? 'cartão' : c.meio === 'debito' ? 'conta' : ''}`.trim() + (c.titular ? ' · ' + c.titular : '') : 'Lançados à mão';

function vContas() {
  const volta = `<button class="btn mini voltar" data-a="aba" data-v="financas">${IC.voltar} Finanças</button>`;
  const contas = contasDisponiveis();
  if (!contas.length) return `<div class="topo"><div>${volta}<h1 style="margin-top:10px">Conta corrente</h1></div></div>
    <div class="card vazio">${panda('preguica')}Nenhum lançamento ainda. Importe um extrato para ver a conta aqui.</div>`;
  const c = contas.find(x => x.chave === ui.conta) || contas[0];
  // Ordem do extrato do banco: por data; no mesmo dia, entradas antes das saídas.
  const movs = db.lancamentos.filter(l => chaveConta(l) === c.chave)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === b.tipo ? 0 : a.tipo === 'receita' ? -1 : 1));
  let calc = 0;
  const lista = movs.map(l => { calc += l.tipo === 'receita' ? l.valor : -l.valor; return { l, calc }; });
  // Saldo real: o app soma os lançamentos a partir de zero; quando o banco informa um saldo (saldo depois do
  // movimento no Bradesco, saldo final do extrato no Inter), ele vira a referência e o resto se ajusta a ele.
  const refs = [];
  lista.forEach(x => { if (typeof x.l.saldoBanco === 'number') refs.push({ data: x.l.data, real: x.l.saldoBanco, calc: x.calc, tipo: 'mov' }); });
  const finais = new Map();
  movs.forEach(l => { if (typeof l.loteSaldo === 'number' && l.loteSaldoData) finais.set(l.loteSaldoData + '|' + l.loteSaldo, { data: l.loteSaldoData, real: l.loteSaldo }); });
  finais.forEach(f => {
    const ate = lista.filter(x => x.l.data <= f.data);
    refs.push({ data: f.data, real: f.real, calc: ate.length ? ate[ate.length - 1].calc : 0, tipo: 'final' });
  });
  refs.sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === 'final') - (b.tipo === 'final'));
  const ref = refs[refs.length - 1], ajuste = ref ? ref.real - ref.calc : 0;
  const comSaldo = lista.map(x => {
    const saldo = x.calc + ajuste;
    const confere = typeof x.l.saldoBanco === 'number' ? Math.abs(x.l.saldoBanco - saldo) < 0.01 : null;
    return { l: x.l, saldo, confere };
  });
  const info = movs.slice().reverse().find(l => l.loteAgencia || l.loteConta);
  const tudo = !!ui.contaTudo;
  const noPeriodo = comSaldo.filter(x => tudo || x.l.data.startsWith(ui.mes));
  const antes = tudo ? [] : comSaldo.filter(x => x.l.data < ui.mes + '-01');
  const saldoAnterior = antes.length ? antes[antes.length - 1].saldo : 0;
  const saldoFinal = noPeriodo.length ? noPeriodo[noPeriodo.length - 1].saldo : saldoAnterior;
  const entradas = soma(noPeriodo.filter(x => x.l.tipo === 'receita'), x => x.l.valor);
  const saidas = soma(noPeriodo.filter(x => x.l.tipo === 'despesa'), x => x.l.valor);
  const dias = [];
  noPeriodo.slice().reverse().forEach(x => { const d = dias[dias.length - 1]; if (d && d.data === x.l.data) d.itens.push(x); else dias.push({ data: x.l.data, itens: [x] }); });
  const [ano, mes] = ui.mes.split('-');
  const linha = ({ l, saldo, confere }) => `<div class="mov" data-a="editarLanc" data-v="${l.id}" role="button" tabindex="0" title="Editar">
      <span class="mov-ic ${l.tipo}">${iconeCat(l.categoria, l.tipo)}</span>
      <span class="mov-txt"><strong>${esc(l.desc)}</strong><small>${esc(l.categoria)}${l.hora ? ' · ' + l.hora : ''}</small>${linhaDetalhes(l)}</span>
      <span class="cc-dir"><span class="mov-val ${ehTransf(l) ? 'transf' : l.tipo === 'receita' ? 'pos' : ''}">${l.tipo === 'receita' ? '+' : '−'} ${din(l.valor)}</span>
        <small class="cc-saldo ${saldo < 0 ? 'neg' : ''}">saldo ${din(saldo)}${confere === true ? ' <span title="Igual ao saldo informado pelo banco">✓</span>' : ''}</small>
        ${confere === false ? `<small class="cc-difere" title="O banco informou outro saldo: pode faltar algum lançamento antes deste">⚠️ banco: ${din(l.saldoBanco)}</small>` : ''}</span>
    </div>`;
  return `
    <div class="topo">
      <div>${volta}<h1 style="margin-top:10px">Conta corrente</h1>
        <p class="sub" style="margin:0">Cada movimentação da conta, com o saldo depois de cada uma.</p></div>
      <div class="mes-nav">
        ${tudo ? '' : `<button data-a="mes" data-v="-1" aria-label="Mês anterior">${IC.voltar}</button>`}
        <span class="mes-rot">${tudo ? 'Todo o período' : `${NOMES_MES[+mes - 1]} <small>${ano}</small>`}</span>
        ${tudo ? '' : `<button data-a="mes" data-v="1" aria-label="Próximo mês">${IC.seta}</button>`}
      </div>
    </div>
    <div class="acoes rolavel cc-contas" style="margin-bottom:16px">
      ${contas.map(x => `<button class="btn ${x.chave === c.chave ? 'pri' : ''}" data-a="conta" data-v="${esc(x.chave)}">${x.meio === 'credito' ? '💳' : x.banco ? '🏦' : '✍️'} ${esc(nomeConta(x))} <span class="cc-n">${x.n}</span></button>`).join('')}
      <button class="btn" data-a="contaTudo">${tudo ? 'Ver por mês' : 'Ver tudo'}</button>
    </div>
    <div class="hero compacto">
      <div class="hero-txt">
        <div class="rot">Saldo ${tudo ? 'atual' : `no fim de ${NOMES_MES[+mes - 1]}`} · ${esc(nomeConta(c))} ${botaoOlho()}</div>
        <div class="saldo-val ${saldoFinal < 0 ? 'neg' : ''}">${din(saldoFinal)}</div>
        <div class="chips">
          ${tudo ? '' : `<span class="chip">Saldo anterior <b>${din(saldoAnterior)}</b></span>`}
          <span class="chip"><i class="seta pos">${IC.receita}</i>Entradas <b>${din(entradas)}</b></span>
          <span class="chip"><i class="seta neg">${IC.despesa}</i>Saídas <b>${din(saidas)}</b></span>
          ${info ? `<span class="chip">🏦 Ag <b>${esc(info.loteAgencia || '—')}</b> · Conta <b>${esc(info.loteConta || '—')}</b></span>` : ''}
          ${ref ? `<span class="chip" title="O saldo segue o valor informado pelo banco">✓ Conferido com o banco em <b>${fmtData(ref.data)}</b></span>` : ''}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="topo secao"><h2>Movimentações</h2><span class="muted small">${noPeriodo.length} no período</span></div>
      ${dias.length ? dias.map(d => `
        <div class="dia"><span>${rotuloDia(d.data)}</span><span>saldo do dia ${din(d.itens[0].saldo)}</span></div>
        <div class="movs">${d.itens.map(linha).join('')}</div>`).join('')
      : `<div class="vazio">${panda('preguica')}Sem movimentações nesta conta ${tudo ? '' : `em ${nomeMes(ui.mes)}`}.</div>`}
    </div>
    <p class="muted small">${ref ? 'O saldo segue o último saldo informado pelo banco no extrato; ✓ indica que bate com o banco e ⚠️ que o banco informou outro valor (pode faltar algum lançamento antes).' : 'O saldo é calculado com os lançamentos que estão no app, começando em zero no primeiro lançamento desta conta. Importe um extrato com saldo para conferir com o banco.'} Transferências entre contas entram aqui, porque o dinheiro sai ou entra da conta.</p>`;
}

const acoesContas = {
  conta: v => { ui.conta = v; },
  contaTudo: () => { ui.contaTudo = !ui.contaTudo; },
};
