'use strict';
/* =========================================================
   Lançamentos futuros (agendados).
   Um agendamento é uma regra: uma vez numa data, ou repetindo (todo mês,
   toda semana ou todo ano) a partir de uma data, até outra data (ou sem fim).
   As ocorrências NÃO entram no saldo: quando chega o dia, o app pede para
   confirmar. Confirmar cria o lançamento de verdade; pular só marca.
   Fica em db.agendados (coleção "agendados" no Firestore).
   Carregado antes do app.js: só usa coisas dele quando as funções são chamadas.
   ========================================================= */

const REPETE = { nao: 'Uma vez', mensal: 'Todo mês', semanal: 'Toda semana', anual: 'Todo ano' };
const isoData = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const somaDias = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(a, m - 1, d + n); return isoData(x.getFullYear(), x.getMonth() + 1, x.getDate()); };
const diasEntre = (de, ate) => { const p = s => { const [a, m, d] = s.split('-').map(Number); return Date.UTC(a, m - 1, d); }; return Math.round((p(ate) - p(de)) / 864e5); };

// Datas de um agendamento até "limite" (inclusive). Dia 31 vira o último dia em meses mais curtos.
function datasAgenda(a, limite) {
  const out = []; if (!a.inicio) return out;
  const fim = a.repete === 'nao' ? (a.inicio <= limite ? a.inicio : '') : (a.ate && a.ate < limite ? a.ate : limite);
  const [y, m, d] = a.inicio.split('-').map(Number);
  for (let n = 0; n < 1200; n++) {
    let data;
    if (a.repete === 'mensal' || a.repete === 'anual') {
      const x = new Date(y, m - 1 + (a.repete === 'mensal' ? n : n * 12), 1);
      const ultimo = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
      data = isoData(x.getFullYear(), x.getMonth() + 1, Math.min(d, ultimo));
    } else if (a.repete === 'semanal') data = somaDias(a.inicio, 7 * n);
    else data = a.inicio;
    if (data > fim) break;
    out.push(data);
    if (a.repete === 'nao') break;
  }
  return out;
}
// Ocorrências (com a situação de cada uma) até "limite".
function ocorrencias(limite) {
  const out = [];
  (db.agendados || []).forEach(a => datasAgenda(a, limite).forEach(data => {
    const f = (a.feitos || {})[data];
    out.push({ a, data, estado: f ? f.estado : 'pendente', chave: a.id + '|' + data });
  }));
  return out.sort((x, y) => x.data.localeCompare(y.data) || x.a.desc.localeCompare(y.a.desc));
}
const vencidos = () => ocorrencias(hoje()).filter(o => o.estado === 'pendente');
const pendentesNoMes = m => ocorrencias(m + '-31').filter(o => o.estado === 'pendente' && o.data.startsWith(m));

function rotuloVencimento(data) {
  const d = diasEntre(hoje(), data);
  if (d === 0) return 'Vence hoje';
  if (d < 0) return `Atrasado há ${-d} ${d === -1 ? 'dia' : 'dias'}`;
  if (d === 1) return 'Amanhã';
  return `Em ${d} dias · ${fmtData(data)}`;
}
function resumoRegra(a) {
  if (a.repete === 'nao') return `Uma vez, em ${fmtData(a.inicio)}`;
  const dia = +a.inicio.slice(8);
  const quando = a.repete === 'mensal' ? `Todo mês, dia ${dia}` : a.repete === 'semanal' ? `Toda semana, a partir de ${fmtData(a.inicio)}` : `Todo ano, em ${fmtData(a.inicio).slice(0, 5)}`;
  return `${quando}${a.ate ? ` · até ${fmtData(a.ate)}` : ' · sem data final'}`;
}

// Linha de uma ocorrência (lista de vencidos e de próximos).
function linhaOcorrencia(o, botoes) {
  const atrasado = o.data < hoje();
  return `<div class="mov ag-linha ${atrasado ? 'atrasado' : ''}">
    <span class="mov-ic ${o.a.tipo}">${iconeCat(o.a.categoria, o.a.tipo)}</span>
    <span class="mov-txt" data-a="agEditar" data-v="${esc(o.a.id)}" role="button" tabindex="0"><strong>${esc(o.a.desc)}</strong>
      <small>${rotuloVencimento(o.data)} · ${esc(o.a.categoria)}${o.a.repete !== 'nao' ? ' · 🔁' : ''}</small></span>
    <span class="mov-val ${o.a.tipo === 'receita' ? 'pos' : ''}">${o.a.tipo === 'receita' ? '+' : '−'} ${din(o.a.valor)}</span>
    ${botoes ? `<span class="ag-botoes"><button class="btn mini" data-a="agPular" data-v="${esc(o.chave)}">Pular</button>
      <button class="btn mini pri" data-a="agConfirmar" data-v="${esc(o.chave)}">✓ Confirmar</button></span>` : ''}
  </div>`;
}

// Aviso do Início e de Finanças: o que venceu e ainda não foi confirmado.
function avisoAgenda() {
  const v = vencidos(); if (!v.length) return '';
  return `<div class="card ag-aviso">
    <div class="topo secao"><h2>🔔 ${v.length === 1 ? '1 lançamento para confirmar' : `${v.length} lançamentos para confirmar`}</h2>
      <button class="link" data-a="aba" data-v="agenda">Ver agenda ${IC.seta}</button></div>
    <div class="movs">${v.slice(0, 5).map(o => linhaOcorrencia(o, true)).join('')}</div>
    ${v.length > 5 ? `<p class="muted small" style="margin:8px 0 0">E mais ${v.length - 5} na agenda.</p>` : ''}
  </div>`;
}

function vAgenda() {
  const v = vencidos(), limite = somaDias(hoje(), 90);
  const proximos = ocorrencias(limite).filter(o => o.estado === 'pendente' && o.data > hoje());
  const meses = [];
  proximos.forEach(o => { const m = o.data.slice(0, 7), g = meses[meses.length - 1]; if (g && g.m === m) g.itens.push(o); else meses.push({ m, itens: [o] }); });
  const regras = (db.agendados || []).slice().sort((a, b) => a.desc.localeCompare(b.desc));
  const ativo = a => a.repete === 'nao' ? !(a.feitos || {})[a.inicio] : !a.ate || a.ate >= hoje();
  return `
    <div class="topo">
      <div><button class="btn mini voltar" data-a="aba" data-v="financas">${IC.voltar} Finanças</button>
        <h1 style="margin-top:10px">Lançamentos futuros</h1>
        <p class="sub" style="margin:0">Contas e recebimentos agendados. Só entram no saldo quando você confirma.</p></div>
      <button class="btn pri" data-a="agNovo">+ Novo agendamento</button>
    </div>
    ${App.modo === 'nuvem' && App.semNuvem.agendados ? `<p class="tri-aviso forte" style="margin:0 0 16px">⚠️ Os agendamentos estão salvos só neste aparelho:
      ${App.semNuvem.agendados === 'regras' ? 'falta atualizar as regras do Firebase (veja o CONFIGURAR.md).' : 'não foi possível falar com a nuvem.'}</p>` : ''}
    ${v.length ? `<div class="card ag-aviso"><h2>🔔 Para confirmar</h2><div class="movs">${v.map(o => linhaOcorrencia(o, true)).join('')}</div></div>` : ''}
    <div class="cols-2">
      <div class="card"><h2>Próximos 90 dias</h2>
        ${meses.length ? meses.map(g => `<div class="dia"><span>${nomeMes(g.m)}</span>
          <span>${din(soma(g.itens, o => o.a.tipo === 'receita' ? o.a.valor : -o.a.valor))}</span></div>
          <div class="movs">${g.itens.map(o => linhaOcorrencia(o, false)).join('')}</div>`).join('')
        : '<p class="muted small" style="margin:0">Nada agendado para os próximos 90 dias.</p>'}
      </div>
      <div class="card"><h2>Agendamentos</h2>
        ${regras.length ? `<div class="movs">${regras.map(a => `<div class="mov ${ativo(a) ? '' : 'ag-fim'}" data-a="agEditar" data-v="${esc(a.id)}" role="button" tabindex="0">
            <span class="mov-ic ${a.tipo}">${iconeCat(a.categoria, a.tipo)}</span>
            <span class="mov-txt"><strong>${esc(a.desc)}</strong><small>${resumoRegra(a)}${ativo(a) ? '' : ' · encerrado'}</small></span>
            <span class="mov-val ${a.tipo === 'receita' ? 'pos' : ''}">${a.tipo === 'receita' ? '+' : '−'} ${din(a.valor)}</span></div>`).join('')}</div>`
        : `<div class="vazio">${panda('preguica')}Nenhum agendamento. Cadastre o aluguel, a faculdade, o salário…</div>`}
      </div>
    </div>`;
}

function modalAgenda(a) {
  const novo = !a;
  a = a || { tipo: 'despesa', desc: '', categoria: '', valor: '', inicio: somaDias(hoje(), 1), repete: 'mensal', ate: '' };
  const op = (nome, v, rot, atual) => `<label class="escolha"><input type="radio" name="${nome}" value="${v}" ${atual === v ? 'checked' : ''}><span><b>${rot}</b></span></label>`;
  abrirModal(`
    <h2>${novo ? 'Novo agendamento' : 'Editar agendamento'}</h2>
    <form class="form" data-f="modal" id="ag-form">
      <div class="full"><div class="escolhas duas">${op('tipo', 'despesa', '↓ Despesa', a.tipo)}${op('tipo', 'receita', '↑ Receita', a.tipo)}</div></div>
      <label class="full">Descrição<input name="desc" required value="${esc(a.desc)}" placeholder="Ex.: Aluguel, Faculdade, Salário"></label>
      <label>Valor (R$)<input name="valor" type="number" step="0.01" min="0" required value="${a.valor}"></label>
      <label>Categoria<span id="ag-cat">${seletorCat('name="categoria"', 'tipo:' + a.tipo, a.categoria || 'Outros')}</span></label>
      <div class="full"><span class="rotulo">Quando</span>
        <div class="escolhas quatro">${Object.entries(REPETE).map(([k, r]) => op('repete', k, r, a.repete)).join('')}</div></div>
      <label><span id="ag-rot-inicio">${a.repete === 'nao' ? 'Data' : 'Primeira vez em'}</span><input name="inicio" type="date" required value="${a.inicio}"></label>
      <label id="ag-ate" ${a.repete === 'nao' ? 'hidden' : ''}>Até (vazio = sem data final)<input name="ate" type="date" value="${a.ate || ''}"></label>
      <p class="muted small full" style="margin:0">Não entra no saldo até você confirmar. No dia, o app pede a confirmação.</p>
      <div class="modal-acoes full">
        ${novo ? '' : `<button type="button" class="btn perigo" data-a="agExcluir" data-v="${esc(a.id)}" style="margin-right:auto">Excluir</button>`}
        <button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => {
    const dados = { tipo: d.tipo === 'receita' ? 'receita' : 'despesa', desc: d.desc.trim(), categoria: d.categoria || 'Outros', valor: Math.abs(parseValor(d.valor)),
      inicio: d.inicio, repete: REPETE[d.repete] ? d.repete : 'nao', ate: d.repete === 'nao' ? '' : (d.ate || '') };
    if (!dados.desc || !dados.valor || !dados.inicio) { alert('Preencha descrição, valor e data.'); return false; }
    if (dados.ate && dados.ate < dados.inicio) { alert('A data final precisa ser depois da primeira vez.'); return false; }
    db.agendados = db.agendados || [];
    if (novo) db.agendados.push({ id: 'ag-' + uid(), ...dados, feitos: {}, criadoEm: hoje() });
    else Object.assign(a, dados);
    reagir('feliz', novo ? 'Agendado! Eu te lembro no dia 📅' : 'Agendamento atualizado ✨');
  });
  // Tipo muda a lista de categorias; "Uma vez" esconde a data final.
  const f = $('#ag-form');
  f.addEventListener('change', e => {
    if (e.target.name === 'tipo') $('#ag-cat').innerHTML = seletorCat('name="categoria"', 'tipo:' + e.target.value, f.categoria.value);
    if (e.target.name === 'repete') {
      $('#ag-ate').hidden = e.target.value === 'nao';
      $('#ag-rot-inicio').textContent = e.target.value === 'nao' ? 'Data' : 'Primeira vez em';
    }
  });
}

// Lançamento já existente que parece ser este mesmo pagamento (ex.: veio pelo extrato).
function jaLancado(a, data) {
  return db.lancamentos.find(l => l.tipo === a.tipo && Math.abs(l.valor - a.valor) < 0.005 && Math.abs(diasEntre(l.data, data)) <= 5 && !l.agendaId);
}

function modalConfirmarAgenda(chave) {
  const [id, data] = chave.split('|'), a = (db.agendados || []).find(x => x.id === id); if (!a) return;
  const igual = jaLancado(a, data);
  abrirModal(`
    <h2>Confirmar ${a.tipo === 'receita' ? 'recebimento' : 'pagamento'}</h2>
    <p class="muted" style="margin-top:-6px">${esc(a.desc)} · ${rotuloVencimento(data)}</p>
    <form class="form" data-f="modal">
      ${igual ? `<div class="full tri-aviso">💡 Já existe um lançamento parecido: <b>${esc(igual.desc)}</b>, ${fmtData(igual.data)}, ${brl(igual.valor)}${rotuloOrigem(igual) ? ' (' + esc(rotuloOrigem(igual)) + ')' : ''}.
        <div class="escolhas" style="margin-top:8px">
          <label class="escolha"><input type="radio" name="modo" value="marcar" checked><span><b>É esse mesmo</b><small>Só marcar como ${a.tipo === 'receita' ? 'recebido' : 'pago'}</small></span></label>
          <label class="escolha"><input type="radio" name="modo" value="lancar"><span><b>É outro</b><small>Lançar mesmo assim</small></span></label>
        </div></div>` : '<input type="hidden" name="modo" value="lancar">'}
      <label>Valor pago (R$)<input name="valor" type="number" step="0.01" min="0" required value="${a.valor}"></label>
      <label>Data do pagamento<input name="data" type="date" required value="${data <= hoje() ? data : hoje()}"></label>
      <div class="modal-acoes full"><button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">✓ Confirmar</button></div>
    </form>`, d => {
    a.feitos = a.feitos || {};
    if (d.modo === 'marcar' && igual) {
      a.feitos[data] = { estado: 'pago', lancId: igual.id, em: hoje() };
    } else {
      const l = { id: uid(), tipo: a.tipo, desc: a.desc, categoria: a.categoria, valor: Math.abs(parseValor(d.valor)) || a.valor, data: d.data || data,
        fixo: a.repete !== 'nao', agendaId: a.id, agendaData: data };
      db.lancamentos.push(l);
      a.feitos[data] = { estado: 'pago', lancId: l.id, em: hoje() };
    }
    reagir(a.tipo === 'receita' ? 'feliz' : 'fofo', a.tipo === 'receita' ? 'Dinheiro na conta! 💰' : 'Conta paga! ✅');
  });
}

const acoesAgenda = {
  agNovo: () => modalAgenda(),
  agEditar: v => { const a = (db.agendados || []).find(x => x.id === v); if (a) modalAgenda(a); },
  agConfirmar: v => modalConfirmarAgenda(v),
  agPular: v => {
    const [id, data] = v.split('|'), a = (db.agendados || []).find(x => x.id === id); if (!a) return;
    if (!confirm(`Pular "${a.desc}" de ${fmtData(data)}? Nada será lançado.`)) return;
    a.feitos = a.feitos || {}; a.feitos[data] = { estado: 'pulado', em: hoje() };
  },
  agExcluir: v => {
    const a = (db.agendados || []).find(x => x.id === v); if (!a) return;
    if (!confirm(`Excluir o agendamento "${a.desc}"?\nOs lançamentos que você já confirmou continuam.`)) return;
    db.agendados = db.agendados.filter(x => x.id !== v);
    fecharModal();
  },
};
