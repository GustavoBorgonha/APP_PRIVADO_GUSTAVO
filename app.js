'use strict';

/* =========================================================
   Meu Controle — finanças pessoais e planejamento de metas
   Dados salvos no próprio navegador (localStorage).
   ========================================================= */

const CHAVE = 'apg-dados-v1';

const CATEGORIAS = {
  despesa: ['Moradia', 'Alimentação', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Contas', 'Compras', 'Assinaturas', 'Investimentos', 'Outros'],
  receita: ['Salário', 'Renda extra', 'Rendimentos', 'Reembolso', 'Outros'],
};

const TIPOS = {
  viagem: {
    emoji: '✈️', nome: 'Viagem / Passeio',
    itens: ['Passagens', 'Hospedagem', 'Alimentação', 'Passeios e ingressos', 'Transporte local', 'Seguro viagem'],
    tarefas: ['Definir destino e datas', 'Comprar passagens', 'Reservar hospedagem', 'Montar roteiro', 'Contratar seguro viagem'],
  },
  casamento: {
    emoji: '💍', nome: 'Casamento',
    itens: ['Local da cerimônia/festa', 'Buffet', 'Bebidas', 'Fotografia e vídeo', 'Vestido e traje', 'Decoração e flores', 'Música / DJ', 'Convites', 'Alianças', 'Cartório', 'Lua de mel'],
    tarefas: ['Definir data', 'Definir orçamento total', 'Lista de convidados', 'Fechar local', 'Fechar buffet', 'Contratar fotógrafo', 'Enviar convites', 'Dar entrada no cartório'],
  },
  casa: {
    emoji: '🏠', nome: 'Compra de casa',
    itens: ['Entrada', 'ITBI', 'Escritura e registro', 'Avaliação / taxas do banco', 'Reforma', 'Móveis', 'Mudança'],
    tarefas: ['Simular financiamento', 'Separar documentos', 'Visitar imóveis', 'Aprovar crédito', 'Assinar contrato', 'Registrar imóvel'],
  },
  carro: {
    emoji: '🚗', nome: 'Compra de carro',
    itens: ['Entrada', 'Transferência / emplacamento', 'IPVA', 'Seguro', 'Revisão / manutenção inicial'],
    tarefas: ['Pesquisar modelos', 'Fazer test drive', 'Simular financiamento', 'Cotar seguro', 'Vistoria'],
  },
  outro: {
    emoji: '⭐', nome: 'Outro objetivo',
    itens: [], tarefas: [],
  },
};

/* ---------- utilitários ---------- */
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoje = () => new Date().toLocaleDateString('sv'); // AAAA-MM-DD no fuso local
const mesAtual = () => hoje().slice(0, 7);
const fmtData = d => d ? d.split('-').reverse().join('/') : '';
const soma = (arr, f) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = m => { const [a, n] = m.split('-'); return `${NOMES_MES[+n - 1]} de ${a}`; };
const panda = () => '<img src="icons/panda.svg" alt="" class="panda">';
const mesDesloc = (m, d) => { const [a, n] = m.split('-').map(Number); const x = new Date(a, n - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };

function parseValor(s) {
  if (typeof s === 'number') return s;
  s = String(s ?? '').trim().replace(/R\$|\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function parseData(s) {
  s = String(s ?? '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}
function mesesAte(data) {
  if (!data) return null;
  const [a1, m1] = mesAtual().split('-').map(Number);
  const [a2, m2] = data.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}
function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function escolherArquivo(accept) {
  return new Promise(res => {
    const i = Object.assign(document.createElement('input'), { type: 'file', accept });
    i.onchange = () => { const f = i.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(f); };
    i.click();
  });
}

/* ---------- dados ---------- */
function vazio() { return { versao: 1, lancamentos: [], planos: [] }; }
function carregar() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE));
    if (d && Array.isArray(d.lancamentos) && Array.isArray(d.planos)) return d;
  } catch (e) { /* sem dados */ }
  return vazio();
}
function salvar() {
  if (App.modo === 'nuvem') { App.sincronizar?.(db); return; }
  if (App.modo !== 'local') return;
  try { localStorage.setItem(CHAVE, JSON.stringify(db)); }
  catch (e) { alert('Não foi possível salvar os dados neste navegador. Faça um backup em "Dados".'); }
}

/* App: estado da conexão. modo = 'local' | 'carregando' | 'login' | 'nuvem' */
const App = window.App = { modo: 'local', usuario: null, msgLogin: '' };
let db = carregar();
const ui = { aba: 'inicio', mes: mesAtual(), plano: null, filtro: 'todos' };

const plano = id => db.planos.find(p => p.id === id);
const guardado = p => soma(p.aportes, a => a.valor);
const previsto = p => soma(p.itens, i => i.previsto);
const pago = p => soma(p.itens, i => i.pago);
const metaDe = p => Number(p.meta) || previsto(p);
const lancMes = m => db.lancamentos.filter(l => l.data.startsWith(m));

/* ---------- renderização ---------- */
function render() {
  App.renderPendente = false;
  document.body.classList.toggle('sem-nav', App.modo === 'carregando' || App.modo === 'login');
  if (App.modo === 'carregando') { $('#app').innerHTML = `<div class="carregando">${panda()}Carregando seus dados…</div>`; return; }
  if (App.modo === 'login') { $('#app').innerHTML = vLogin(); return; }
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('ativo', b.dataset.v === ui.aba));
  const views = { inicio: vInicio, financas: vFinancas, planos: vPlanos, simulador: vSimulador, dados: vDados };
  $('#app').innerHTML = views[ui.aba]();
  if (ui.aba === 'simulador') calcularSimulacao();
}

function vLogin() {
  return `<div class="card login">
    ${panda()}
    <h1>Meu Controle</h1>
    <p class="muted">Acesso restrito. Entre com uma conta Google autorizada.</p>
    ${App.msgLogin ? `<p class="aviso">${esc(App.msgLogin)}</p>` : ''}
    <button class="btn pri" data-a="entrar">Entrar com Google</button>
  </div>`;
}

function cardPlano(p) {
  const meta = metaDe(p), g = guardado(p), pct = meta ? Math.min(100, g / meta * 100) : 0;
  const meses = mesesAte(p.dataAlvo), falta = Math.max(0, meta - g);
  let porMes = '';
  if (falta > 0 && meses !== null) porMes = meses > 0 ? `Guardar ${brl(falta / meses)}/mês` : '<span class="neg">Prazo vencido</span>';
  const tipo = TIPOS[p.tipo] || TIPOS.outro;
  return `<div class="card plano" data-a="abrirPlano" data-v="${p.id}">
    <div class="cab"><span class="emoji">${tipo.emoji}</span><div><div class="nome">${esc(p.nome)}</div>
      <div class="muted small">${tipo.nome}${p.dataAlvo ? ' · ' + fmtData(p.dataAlvo) : ''}</div></div></div>
    <div class="barra"><i style="width:${pct}%"></i></div>
    <div class="linha"><span>${brl(g)} de ${brl(meta)}</span><strong>${pct.toFixed(0)}%</strong></div>
    <div class="linha muted"><span>${porMes || (falta <= 0 && meta ? '<span class="pos">Meta atingida 🎉</span>' : '')}</span></div>
  </div>`;
}

function vInicio() {
  const l = lancMes(mesAtual());
  const rec = soma(l.filter(x => x.tipo === 'receita'), x => x.valor);
  const des = soma(l.filter(x => x.tipo === 'despesa'), x => x.valor);
  const totalGuardado = soma(db.planos, guardado);
  const pendentes = db.planos.flatMap(p => p.tarefas.filter(t => !t.feito).map(t => ({ ...t, plano: p }))).slice(0, 8);
  return `
    <div class="hero">
      <div><h1>Olá, ${esc(App.usuario?.nome?.split(' ')[0] || 'Gustavo')}!</h1>
        <p class="sub">Aqui está o resumo de ${nomeMes(mesAtual())}.</p></div>
      ${panda()}
    </div>
    <div class="grid">
      <div class="card stat"><div class="rot">Receitas do mês</div><div class="val pos">${brl(rec)}</div></div>
      <div class="card stat"><div class="rot">Despesas do mês</div><div class="val neg">${brl(des)}</div></div>
      <div class="card stat"><div class="rot">Saldo do mês</div><div class="val ${rec - des < 0 ? 'neg' : ''}">${brl(rec - des)}</div></div>
      <div class="card stat"><div class="rot">Guardado nos planos</div><div class="val">${brl(totalGuardado)}</div></div>
    </div>
    <div class="topo"><h2 style="margin:0">Meus planos</h2>
      <div class="acoes"><button class="btn" data-a="novoLanc">+ Lançamento</button><button class="btn pri" data-a="novoPlano">+ Novo plano</button></div></div>
    ${db.planos.length ? `<div class="planos">${db.planos.map(cardPlano).join('')}</div>`
      : `<div class="card vazio">${panda()}Nenhum plano ainda. Crie um para sua viagem, casamento, casa ou carro.</div>`}
    ${pendentes.length ? `<div class="card" style="margin-top:16px"><h2>Próximas tarefas</h2>
      ${pendentes.map(t => `<div class="tarefa"><input type="checkbox" data-c="tarefaFeita" data-p="${t.plano.id}" data-i="${t.id}">
        <span>${esc(t.texto)}</span><span class="muted small" style="flex:0">${TIPOS[t.plano.tipo]?.emoji || ''} ${esc(t.plano.nome)}</span></div>`).join('')}
    </div>` : ''}`;
}

function vFinancas() {
  const l = lancMes(ui.mes).sort((a, b) => b.data.localeCompare(a.data));
  const rec = soma(l.filter(x => x.tipo === 'receita'), x => x.valor);
  const des = soma(l.filter(x => x.tipo === 'despesa'), x => x.valor);
  const porCat = {};
  l.filter(x => x.tipo === 'despesa').forEach(x => porCat[x.categoria] = (porCat[x.categoria] || 0) + x.valor);
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  const visiveis = ui.filtro === 'todos' ? l : l.filter(x => x.tipo === ui.filtro);
  return `
    <div class="topo">
      <div><h1>Finanças</h1><p class="sub" style="margin:0">Sua planilha de receitas e despesas</p></div>
      <div class="acoes">
        <button class="btn mini" data-a="mes" data-v="-1" aria-label="Mês anterior">◀</button>
        <input type="month" value="${ui.mes}" data-c="mes" style="width:auto">
        <button class="btn mini" data-a="mes" data-v="1" aria-label="Próximo mês">▶</button>
      </div>
    </div>
    <div class="grid">
      <div class="card stat"><div class="rot">Receitas</div><div class="val pos">${brl(rec)}</div></div>
      <div class="card stat"><div class="rot">Despesas</div><div class="val neg">${brl(des)}</div></div>
      <div class="card stat"><div class="rot">Saldo</div><div class="val ${rec - des < 0 ? 'neg' : ''}">${brl(rec - des)}</div></div>
      <div class="card stat"><div class="rot">Taxa de economia</div><div class="val">${rec ? ((rec - des) / rec * 100).toFixed(0) : 0}%</div></div>
    </div>
    <div class="acoes" style="margin-bottom:16px">
      <button class="btn pri" data-a="novoLanc">+ Lançamento</button>
      <button class="btn" data-a="copiarMes">Copiar fixos do mês anterior</button>
      <button class="btn" data-a="exportarCSV">Exportar planilha (CSV)</button>
      <button class="btn" data-a="importarCSV">Importar planilha (CSV)</button>
    </div>
    <div class="cols-2" style="grid-template-columns:2fr 1fr">
      <div class="card">
        <div class="topo" style="margin-bottom:8px"><h2 style="margin:0">Lançamentos</h2>
          <select data-c="filtro" style="width:auto">
            ${['todos', 'receita', 'despesa'].map(f => `<option value="${f}" ${ui.filtro === f ? 'selected' : ''}>${{ todos: 'Todos', receita: 'Receitas', despesa: 'Despesas' }[f]}</option>`).join('')}
          </select></div>
        ${visiveis.length ? `<div class="rolagem"><table class="tabela">
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody>${visiveis.map(x => `<tr>
            <td>${fmtData(x.data).slice(0, 5)}</td>
            <td>${esc(x.desc)}${x.fixo ? ' <span class="muted small">🔁</span>' : ''}</td>
            <td class="muted">${esc(x.categoria)}</td>
            <td class="num ${x.tipo === 'receita' ? 'pos' : 'neg'}">${x.tipo === 'receita' ? '+' : '−'} ${brl(x.valor)}</td>
            <td class="num" style="white-space:nowrap"><button class="x" data-a="editarLanc" data-v="${x.id}" title="Editar">✏️</button><button class="x" data-a="apagarLanc" data-v="${x.id}" title="Apagar">✕</button></td>
          </tr>`).join('')}</tbody></table></div>`
      : `<div class="vazio">${panda()}Nenhum lançamento em ${nomeMes(ui.mes)}.</div>`}
      </div>
      <div class="card"><h2>Despesas por categoria</h2>
        ${cats.length ? cats.map(([c, v]) => `<div class="cat"><span>${esc(c)}</span><div class="barra"><i style="width:${v / max * 100}%"></i></div><span class="small">${brl(v)}</span></div>`).join('')
      : '<div class="muted small">Sem despesas no mês.</div>'}
      </div>
    </div>`;
}

function vPlanos() {
  if (ui.plano && plano(ui.plano)) return vPlano(plano(ui.plano));
  return `
    <div class="topo"><div><h1>Planos e metas</h1><p class="sub" style="margin:0">Viagens, passeios, casamento, casa, carro…</p></div>
      <button class="btn pri" data-a="novoPlano">+ Novo plano</button></div>
    ${db.planos.length ? `<div class="planos">${db.planos.map(cardPlano).join('')}</div>`
      : `<div class="card"><h2>Comece um plano</h2><p class="muted">Cada plano já vem com uma lista sugerida de custos e tarefas que você pode ajustar.</p>
        <div class="tipos">${Object.entries(TIPOS).map(([k, t]) => `<button class="btn tipo" data-a="novoPlano" data-v="${k}"><span class="emoji">${t.emoji}</span>${t.nome}</button>`).join('')}</div></div>`}`;
}

function vPlano(p) {
  const tipo = TIPOS[p.tipo] || TIPOS.outro;
  const meta = metaDe(p), g = guardado(p), falta = Math.max(0, meta - g);
  const meses = mesesAte(p.dataAlvo);
  const pct = meta ? Math.min(100, g / meta * 100) : 0;
  const feitas = p.tarefas.filter(t => t.feito).length;
  return `
    <div class="topo">
      <div><button class="btn mini" data-a="voltar">← Planos</button>
        <h1 style="margin-top:10px">${tipo.emoji} ${esc(p.nome)}</h1>
        <p class="sub" style="margin:0">${tipo.nome}${p.dataAlvo ? ' · data alvo ' + fmtData(p.dataAlvo) : ''}</p></div>
      <div class="acoes"><button class="btn" data-a="editarPlano" data-v="${p.id}">Editar</button><button class="btn perigo" data-a="apagarPlano" data-v="${p.id}">Excluir</button></div>
    </div>
    <div class="grid">
      <div class="card stat"><div class="rot">Meta ${p.meta ? '' : '(soma dos custos)'}</div><div class="val">${brl(meta)}</div></div>
      <div class="card stat"><div class="rot">Já guardado</div><div class="val pos">${brl(g)}</div></div>
      <div class="card stat"><div class="rot">Falta</div><div class="val">${brl(falta)}</div></div>
      <div class="card stat"><div class="rot">Guardar por mês</div><div class="val">${falta <= 0 ? '—' : meses === null ? '<span class="small muted">defina a data</span>' : meses > 0 ? brl(falta / meses) : '<span class="neg small">prazo vencido</span>'}</div>
        ${meses > 0 && falta > 0 ? `<div class="muted small">por ${meses} ${meses === 1 ? 'mês' : 'meses'}</div>` : ''}</div>
    </div>
    <div class="card"><div class="barra" style="height:12px"><i style="width:${pct}%"></i></div>
      <div class="linha"><span>${pct.toLocaleString("pt-BR",{maximumFractionDigits:1})}% da meta</span><span class="muted">${feitas}/${p.tarefas.length} tarefas concluídas</span></div></div>

    <div class="card"><h2>Custos previstos</h2>
      <div class="rolagem"><table class="tabela">
        <thead><tr><th>Item</th><th class="num">Previsto</th><th class="num">Já pago</th><th></th></tr></thead>
        <tbody>${p.itens.map(i => `<tr>
          <td><input value="${esc(i.desc)}" data-c="item" data-p="${p.id}" data-i="${i.id}" data-f="desc" aria-label="Item"></td>
          <td class="num"><input type="number" step="0.01" min="0" value="${i.previsto || ''}" placeholder="0,00" data-c="item" data-p="${p.id}" data-i="${i.id}" data-f="previsto" style="width:120px;text-align:right" aria-label="Previsto"></td>
          <td class="num"><input type="number" step="0.01" min="0" value="${i.pago || ''}" placeholder="0,00" data-c="item" data-p="${p.id}" data-i="${i.id}" data-f="pago" style="width:120px;text-align:right" aria-label="Pago"></td>
          <td class="num"><button class="x" data-a="apagarItem" data-p="${p.id}" data-v="${i.id}" title="Remover">✕</button></td></tr>`).join('')}
        </tbody>
        <tfoot><tr><th>Total</th><th class="num">${brl(previsto(p))}</th><th class="num">${brl(pago(p))}</th><th></th></tr></tfoot>
      </table></div>
      <form class="add" data-f="addItem" data-p="${p.id}"><input name="desc" placeholder="Novo item de custo" required><input name="previsto" type="number" step="0.01" min="0" placeholder="Valor" style="max-width:130px"><button class="btn">Adicionar</button></form>
    </div>

    <div class="cols-2">
      <div class="card"><h2>Dinheiro guardado</h2>
        ${p.aportes.length ? `<table class="tabela"><tbody>${p.aportes.slice().sort((a, b) => b.data.localeCompare(a.data)).map(a => `<tr>
          <td>${fmtData(a.data)}</td><td class="muted">${esc(a.obs || '')}</td><td class="num ${a.valor < 0 ? 'neg' : 'pos'}">${brl(a.valor)}</td>
          <td class="num"><button class="x" data-a="apagarAporte" data-p="${p.id}" data-v="${a.id}" title="Remover">✕</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="muted small">Registre aqui cada valor que você separar para este plano.</div>'}
        <form class="add" data-f="addAporte" data-p="${p.id}" style="flex-wrap:wrap">
          <input name="valor" type="number" step="0.01" placeholder="Valor (− retirada)" required style="flex:1 1 140px">
          <input name="data" type="date" value="${hoje()}" style="flex:0 1 150px">
          <input name="obs" placeholder="Obs." style="flex:1 1 100px">
          <button class="btn pri">Guardar</button></form>
      </div>
      <div class="card"><h2>Tarefas</h2>
        ${p.tarefas.map(t => `<div class="tarefa ${t.feito ? 'feita' : ''}"><input type="checkbox" ${t.feito ? 'checked' : ''} data-c="tarefaFeita" data-p="${p.id}" data-i="${t.id}">
          <span>${esc(t.texto)}</span><button class="x" data-a="apagarTarefa" data-p="${p.id}" data-v="${t.id}" title="Remover">✕</button></div>`).join('') || '<div class="muted small">Nenhuma tarefa.</div>'}
        <form class="add" data-f="addTarefa" data-p="${p.id}"><input name="texto" placeholder="Nova tarefa" required><button class="btn">Adicionar</button></form>
      </div>
    </div>
    <div class="card"><h2>Anotações</h2>
      <textarea rows="4" data-c="notas" data-p="${p.id}" placeholder="Ideias, links, contatos de fornecedores…">${esc(p.notas || '')}</textarea></div>`;
}

function vSimulador() {
  return `
    <h1>Simulador de financiamento</h1>
    <p class="sub">Para casa, carro ou qualquer compra parcelada. Compare tabela Price e SAC.</p>
    <div class="cols-2" style="grid-template-columns:1fr 1.4fr">
      <div class="card"><form class="form" id="sim" onsubmit="return false">
        <label class="full">Valor do bem (R$)<input name="valor" type="number" step="0.01" min="0" value="300000"></label>
        <label>Entrada (R$)<input name="entrada" type="number" step="0.01" min="0" value="60000"></label>
        <label>Prazo (meses)<input name="prazo" type="number" min="1" max="600" value="360"></label>
        <label>Juros ao ano (%)<input name="juros" type="number" step="0.01" min="0" value="10.5"></label>
        <label>Sistema<select name="sistema"><option value="price">Price (parcelas iguais)</option><option value="sac">SAC (parcelas decrescentes)</option></select></label>
      </form>
      <p class="muted small" style="margin-bottom:0">Simulação aproximada, sem seguros e taxas do banco (que normalmente aumentam a parcela).</p></div>
      <div id="sim-res"></div>
    </div>`;
}

function calcularSimulacao() {
  const f = $('#sim'); if (!f) return;
  const v = parseValor(f.valor.value), e = parseValor(f.entrada.value);
  const n = Math.max(1, Math.min(600, parseInt(f.prazo.value) || 1));
  const i = Math.pow(1 + parseValor(f.juros.value) / 100, 1 / 12) - 1;
  const P = Math.max(0, v - e);
  const linhas = [];
  let saldo = P;
  const pmt = i ? P * i / (1 - Math.pow(1 + i, -n)) : P / n;
  for (let k = 1; k <= n; k++) {
    const juros = saldo * i;
    const amort = f.sistema.value === 'price' ? pmt - juros : P / n;
    saldo = Math.max(0, saldo - amort);
    linhas.push({ k, parcela: amort + juros, juros, amort, saldo });
  }
  const total = soma(linhas, l => l.parcela);
  $('#sim-res').innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="card stat"><div class="rot">Valor financiado</div><div class="val">${brl(P)}</div></div>
      <div class="card stat"><div class="rot">1ª parcela</div><div class="val">${brl(linhas[0]?.parcela)}</div></div>
      <div class="card stat"><div class="rot">Última parcela</div><div class="val">${brl(linhas[n - 1]?.parcela)}</div></div>
      <div class="card stat"><div class="rot">Total de juros</div><div class="val neg">${brl(total - P)}</div></div>
      <div class="card stat"><div class="rot">Total pago (c/ entrada)</div><div class="val">${brl(total + e)}</div></div>
      <div class="card stat"><div class="rot">Juros ao mês</div><div class="val">${(i * 100).toFixed(3).replace('.', ',')}%</div></div>
    </div>
    <div class="card"><h2>Parcelas</h2><div class="rolagem alta"><table class="tabela">
      <thead><tr><th>#</th><th class="num">Parcela</th><th class="num">Juros</th><th class="num">Amortização</th><th class="num">Saldo</th></tr></thead>
      <tbody>${linhas.map(l => `<tr><td>${l.k}</td><td class="num">${brl(l.parcela)}</td><td class="num muted">${brl(l.juros)}</td><td class="num muted">${brl(l.amort)}</td><td class="num">${brl(l.saldo)}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

function vDados() {
  return `
    <h1>Seus dados</h1>
    ${App.modo === 'nuvem'
      ? `<p class="sub">Dados sincronizados na nuvem e compartilhados entre os usuários autorizados.</p>
        <div class="card"><h2>Conta</h2><p style="margin-top:0">Conectado como <strong>${esc(App.usuario?.email)}</strong></p>
        <button class="btn" data-a="sair">Sair</button></div>`
      : `<p class="sub">Modo local: tudo fica salvo neste aparelho/navegador. Faça backups com frequência.</p>`}
    <div class="card"><h2>Backup</h2>
      <p class="muted">Use o backup para guardar uma cópia ou passar seus dados do computador para o celular (e vice-versa).</p>
      <div class="acoes"><button class="btn pri" data-a="exportarJSON">Baixar backup</button><button class="btn" data-a="importarJSON">Restaurar backup</button></div>
    </div>
    <div class="card"><h2>Instalar como aplicativo</h2>
      <p class="muted" style="margin:0">No celular: abra este site no navegador e toque em <strong>“Adicionar à tela inicial”</strong> (Android: menu ⋮; iPhone: botão compartilhar).<br>
      No computador (Chrome/Edge): clique no ícone de instalar na barra de endereço.</p></div>
    <div class="card"><h2>Resumo</h2>
      <p class="muted" style="margin:0">${db.lancamentos.length} lançamentos · ${db.planos.length} planos</p></div>
    <div class="card"><h2>Zona de perigo</h2>
      <button class="btn perigo" data-a="apagarTudo">Apagar todos os dados</button></div>`;
}

/* ---------- modais ---------- */
const modal = $('#modal');
let aoSalvarModal = null;
function abrirModal(html, aoSalvar) {
  $('#modal-body').innerHTML = html;
  aoSalvarModal = aoSalvar;
  modal.showModal();
  $('#modal-body input:not([type=hidden])')?.focus();
}
function fecharModal() { modal.close(); aoSalvarModal = null; }
modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); });

function modalLanc(l) {
  const novo = !l;
  l = l || { tipo: 'despesa', desc: '', categoria: '', valor: '', data: ui.aba === 'financas' && ui.mes !== mesAtual() ? ui.mes + '-01' : hoje(), fixo: false };
  abrirModal(`
    <h2>${novo ? 'Novo lançamento' : 'Editar lançamento'}</h2>
    <form class="form" data-f="modal">
      <label>Tipo<select name="tipo" id="lanc-tipo">
        <option value="despesa" ${l.tipo === 'despesa' ? 'selected' : ''}>Despesa</option>
        <option value="receita" ${l.tipo === 'receita' ? 'selected' : ''}>Receita</option></select></label>
      <label>Valor (R$)<input name="valor" type="number" step="0.01" min="0" required value="${l.valor}"></label>
      <label class="full">Descrição<input name="desc" required value="${esc(l.desc)}" placeholder="Ex.: Aluguel, mercado, salário"></label>
      <label>Categoria<input name="categoria" list="cats" value="${esc(l.categoria)}" placeholder="Escolha ou digite"></label>
      <label>Data<input name="data" type="date" required value="${l.data}"></label>
      <label class="full" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="fixo" ${l.fixo ? 'checked' : ''} style="margin:0"> Lançamento fixo (repete todo mês)</label>
      <datalist id="cats"></datalist>
      <div class="modal-acoes full"><button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => {
    const dados = { tipo: d.tipo, desc: d.desc.trim(), categoria: d.categoria.trim() || 'Outros', valor: parseValor(d.valor), data: d.data, fixo: !!d.fixo };
    if (novo) db.lancamentos.push({ id: uid(), ...dados }); else Object.assign(l, dados);
    ui.mes = dados.data.slice(0, 7);
  });
  const preencherCats = () => { $('#cats').innerHTML = CATEGORIAS[$('#lanc-tipo').value].map(c => `<option value="${c}">`).join(''); };
  $('#lanc-tipo').onchange = preencherCats; preencherCats();
}

function modalPlano(p, tipoInicial) {
  const novo = !p;
  p = p || { tipo: tipoInicial || 'viagem', nome: '', dataAlvo: '', meta: '' };
  abrirModal(`
    <h2>${novo ? 'Novo plano' : 'Editar plano'}</h2>
    <form class="form" data-f="modal">
      <label class="full">Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${p.tipo === k ? 'selected' : ''}>${t.emoji} ${t.nome}</option>`).join('')}</select></label>
      <label class="full">Nome<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Férias em Gramado, Nosso casamento, Apartamento"></label>
      <label>Data alvo<input name="dataAlvo" type="date" value="${p.dataAlvo || ''}"></label>
      <label>Meta (R$)<input name="meta" type="number" step="0.01" min="0" value="${p.meta || ''}" placeholder="Vazio = soma dos custos"></label>
      ${novo ? '<p class="muted small full" style="margin:0">Vamos adicionar uma lista sugerida de custos e tarefas para esse tipo de plano. Você pode editar tudo depois.</p>' : ''}
      <div class="modal-acoes full"><button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => {
    const dados = { tipo: d.tipo, nome: d.nome.trim(), dataAlvo: d.dataAlvo, meta: parseValor(d.meta) };
    if (novo) {
      const t = TIPOS[d.tipo];
      const np = { id: uid(), ...dados, criadoEm: hoje(), notas: '', aportes: [],
        itens: t.itens.map(desc => ({ id: uid(), desc, previsto: 0, pago: 0 })),
        tarefas: t.tarefas.map(texto => ({ id: uid(), texto, feito: false })) };
      db.planos.push(np);
      ui.aba = 'planos'; ui.plano = np.id;
    } else Object.assign(p, dados);
  });
}

/* ---------- CSV ---------- */
function csvCampo(v) { v = String(v ?? ''); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function exportarCSV() {
  const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Fixo']];
  db.lancamentos.slice().sort((a, b) => a.data.localeCompare(b.data)).forEach(l =>
    linhas.push([fmtData(l.data), l.tipo, l.desc, l.categoria, (l.tipo === 'despesa' ? -l.valor : l.valor).toFixed(2).replace('.', ','), l.fixo ? 'sim' : '']));
  baixar(`financas-${hoje()}.csv`, '﻿' + linhas.map(r => r.map(csvCampo).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
function lerCSV(txt) {
  txt = txt.replace(/^﻿/, '');
  const sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) { if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(c => c.trim()));
}
async function importarCSV() {
  const txt = await escolherArquivo('.csv,text/csv'); if (!txt) return;
  const linhas = lerCSV(txt);
  const cab = linhas.shift().map(c => c.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const col = nomes => cab.findIndex(c => nomes.some(n => c.includes(n)));
  const iD = col(['data']), iT = col(['tipo']), iDesc = col(['descr', 'historico', 'nome']), iC = col(['categ']), iV = col(['valor', 'quantia']), iF = col(['fixo']);
  if (iD < 0 || iV < 0) return alert('O arquivo precisa ter pelo menos as colunas "Data" e "Valor" na primeira linha.');
  let n = 0;
  linhas.forEach(r => {
    const data = parseData(r[iD]); let valor = parseValor(r[iV]); if (!data || !valor) return;
    let tipo = (r[iT] || '').toLowerCase().includes('rec') ? 'receita' : (r[iT] || '').toLowerCase().includes('desp') ? 'despesa' : (valor < 0 ? 'despesa' : 'receita');
    db.lancamentos.push({ id: uid(), tipo, valor: Math.abs(valor), data, desc: (r[iDesc] || '').trim() || 'Sem descrição', categoria: (r[iC] || '').trim() || 'Outros', fixo: iF >= 0 && /^s/i.test(r[iF] || '') });
    n++;
  });
  salvar(); render();
  alert(`${n} lançamento(s) importado(s).`);
}

/* ---------- ações ---------- */
const acoes = {
  aba: v => { ui.aba = v; ui.plano = null; },
  mes: v => { ui.mes = mesDesloc(ui.mes, +v); },
  novoLanc: () => modalLanc(),
  editarLanc: v => modalLanc(db.lancamentos.find(l => l.id === v)),
  apagarLanc: v => { if (confirm('Apagar este lançamento?')) db.lancamentos = db.lancamentos.filter(l => l.id !== v); },
  copiarMes: () => {
    const ant = mesDesloc(ui.mes, -1);
    const fixos = lancMes(ant).filter(l => l.fixo);
    if (!fixos.length) return alert(`Nenhum lançamento marcado como fixo em ${nomeMes(ant)}.`);
    const jaTem = new Set(lancMes(ui.mes).map(l => l.desc + '|' + l.tipo));
    const novos = fixos.filter(l => !jaTem.has(l.desc + '|' + l.tipo));
    const [a, m] = ui.mes.split('-').map(Number), ultimoDia = new Date(a, m, 0).getDate();
    novos.forEach(l => db.lancamentos.push({ ...l, id: uid(), data: `${ui.mes}-${String(Math.min(+l.data.slice(8), ultimoDia)).padStart(2, '0')}` }));
    alert(`${novos.length} lançamento(s) fixo(s) copiado(s).`);
  },
  exportarCSV, importarCSV,
  novoPlano: v => modalPlano(null, v),
  abrirPlano: v => { ui.aba = 'planos'; ui.plano = v; },
  voltar: () => { ui.plano = null; },
  editarPlano: v => modalPlano(plano(v)),
  apagarPlano: v => { if (confirm('Excluir este plano e tudo dentro dele?')) { db.planos = db.planos.filter(p => p.id !== v); ui.plano = null; } },
  apagarItem: (v, el) => { const p = plano(el.dataset.p); p.itens = p.itens.filter(i => i.id !== v); },
  apagarAporte: (v, el) => { const p = plano(el.dataset.p); p.aportes = p.aportes.filter(i => i.id !== v); },
  apagarTarefa: (v, el) => { const p = plano(el.dataset.p); p.tarefas = p.tarefas.filter(i => i.id !== v); },
  exportarJSON: () => baixar(`backup-meu-controle-${hoje()}.json`, JSON.stringify(db, null, 2), 'application/json'),
  importarJSON: async () => {
    const txt = await escolherArquivo('.json,application/json'); if (!txt) return;
    try {
      const d = JSON.parse(txt);
      if (!Array.isArray(d.lancamentos) || !Array.isArray(d.planos)) throw 0;
      if (!confirm('Isso vai substituir os dados atuais por este backup. Continuar?')) return;
      db = d; salvar(); render(); alert('Backup restaurado!');
    } catch (e) { alert('Arquivo de backup inválido.'); }
  },
  apagarTudo: () => { if (confirm('Apagar TODOS os dados? Faça um backup antes.') && confirm('Tem certeza? Não dá para desfazer.')) db = vazio(); },
  fecharModal,
  entrar: () => { App.msgLogin = ''; return Promise.resolve(App.entrar?.()); },
  sair: () => Promise.resolve(App.sair?.()),
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = acoes[el.dataset.a]; if (!fn) return;
  e.preventDefault();
  const r = fn(el.dataset.v, el);
  if (r instanceof Promise) return;
  if (!modal.open) { salvar(); render(); }
});

document.addEventListener('change', e => {
  const el = e.target, c = el.dataset.c; if (!c) return;
  const p = el.dataset.p && plano(el.dataset.p);
  if (c === 'mes' && el.value) ui.mes = el.value;
  else if (c === 'filtro') ui.filtro = el.value;
  else if (c === 'tarefaFeita') { const t = p.tarefas.find(t => t.id === el.dataset.i); t.feito = el.checked; }
  else if (c === 'item') { const i = p.itens.find(i => i.id === el.dataset.i); i[el.dataset.f] = el.dataset.f === 'desc' ? el.value : parseValor(el.value); }
  else if (c === 'notas') { p.notas = el.value; salvar(); return; }
  salvar(); render();
});

document.addEventListener('input', e => { if (e.target.closest('#sim')) calcularSimulacao(); });

document.addEventListener('submit', e => {
  const f = e.target, tipo = f.dataset.f; if (!tipo) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  if (tipo === 'modal') { aoSalvarModal?.(d); fecharModal(); }
  else {
    const p = plano(f.dataset.p);
    if (tipo === 'addItem') p.itens.push({ id: uid(), desc: d.desc.trim(), previsto: parseValor(d.previsto), pago: 0 });
    if (tipo === 'addTarefa') p.tarefas.push({ id: uid(), texto: d.texto.trim(), feito: false });
    if (tipo === 'addAporte') p.aportes.push({ id: uid(), valor: parseValor(d.valor), data: d.data || hoje(), obs: d.obs.trim() });
  }
  salvar(); render();
  if (tipo !== 'modal') $(`form[data-f="${tipo}"] input`)?.focus();
});

/* ---------- integração com a nuvem (nuvem.js) ---------- */
App.render = render;
App.mostrarLogin = msg => { App.modo = 'login'; if (msg) App.msgLogin = msg; fecharModalSeAberto(); render(); };
App.carregando = () => { App.modo = 'carregando'; db = vazio(); render(); };
App.receber = (colecao, docs, pronto) => {
  db[colecao] = docs;
  if (!pronto) return;
  if (App.modo === 'carregando') {
    App.modo = 'nuvem';
    // Primeira vez na nuvem: oferece enviar os dados que estavam só neste aparelho.
    const local = carregar();
    if (!db.lancamentos.length && !db.planos.length && (local.lancamentos.length || local.planos.length) &&
        confirm('Encontramos dados salvos neste aparelho. Enviar para a nuvem?')) {
      db.lancamentos = local.lancamentos; db.planos = local.planos; salvar();
    }
  }
  // Não atrapalha quem está digitando: atualiza a tela quando sair do campo.
  const ativo = document.activeElement;
  if (modal.open || (ativo && ativo.closest('main') && /INPUT|TEXTAREA|SELECT/.test(ativo.tagName))) App.renderPendente = true;
  else render();
};
function fecharModalSeAberto() { if (modal.open) fecharModal(); }
document.addEventListener('focusout', () => setTimeout(() => {
  const a = document.activeElement;
  if (App.renderPendente && !modal.open && !(a && a.closest('main') && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render();
}, 0));
modal.addEventListener('close', () => { if (App.renderPendente) render(); });

if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) App.carregando();
else render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
