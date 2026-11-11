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
// Valor em dinheiro na tela; vira "••••" quando o usuário oculta os valores (botão do olho).
const din = v => `<span class="din">${ui.oculto ? 'R$ ••••' : brl(v)}</span>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoje = () => new Date().toLocaleDateString('sv'); // AAAA-MM-DD no fuso local
const mesAtual = () => hoje().slice(0, 7);
const fmtData = d => d ? d.split('-').reverse().join('/') : '';
const soma = (arr, f) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = m => { const [a, n] = m.split('-'); return `${NOMES_MES[+n - 1]} de ${a}`; };
const Panda = window.Mascote;
const panda = (humor = 'fofo') => `<span class="panda">${Panda.svg({ humor })}</span>`;
const reagir = (humor, ...falas) => Panda.reagir(humor, Panda.sorteiaFala(falas));
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
const ui = { aba: 'inicio', mes: mesAtual(), plano: null, filtro: 'todos', oculto: false };
try { ui.oculto = localStorage.getItem('apg-oculto') === '1'; } catch (e) { /* sem armazenamento */ }

/* ---------- ícones e rótulos ---------- */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  olho: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  olhoFechado: svg('<path d="M4 4l16 16M9.9 5.8A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.500a15.6 15.6 0 0 1-3.3 3.900M6.3 7.700A15.3 15.3 0 0 0 2.5 12S6 18.5 12 18.500a9 9 0 0 0 3.6-.8M9.9 9.900a3 3 0 0 0 4.2 4.2"/>'),
  receita: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  despesa: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  alvo: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>'),
  calc: svg('<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8.5 7.500h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>'),
  extrato: svg('<path d="M6 3.500h12v17l-3-2-3 2-3-2-3 2zM9 8.500h6M9 12.500h6"/>'),
  baixar: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  seta: svg('<path d="M9 6l6 6-6 6"/>'),
  voltar: svg('<path d="M15 6l-6 6 6 6"/>'),
};
const ICONE_CAT = {
  'Moradia': '🏠', 'Alimentação': '🍽️', 'Mercado': '🛒', 'Transporte': '🚌', 'Saúde': '💊', 'Educação': '📚',
  'Lazer': '🎉', 'Contas': '🧾', 'Compras': '🛍️', 'Assinaturas': '📺', 'Investimentos': '📈', 'Outros': '📦',
  'Salário': '💼', 'Renda extra': '✨', 'Rendimentos': '📈', 'Reembolso': '↩️',
};
const iconeCat = (cat, tipo) => ICONE_CAT[cat] || (tipo === 'receita' ? '💵' : '🧾');
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function rotuloDia(d) {
  if (d === hoje()) return 'Hoje';
  const [a, m, dia] = d.split('-').map(Number), dt = new Date(a, m - 1, dia);
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  if (dt.toDateString() === ontem.toDateString()) return 'Ontem';
  const nome = DIAS[dt.getDay()];
  return `${nome[0].toUpperCase()}${nome.slice(1)}, ${dia} de ${NOMES_MES[m - 1]}`;
}

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
  document.body.dataset.aba = ui.aba;
  if (App.modo === 'carregando') { $('#app').innerHTML = `<div class="carregando">${panda()}Carregando seus dados…</div>`; return; }
  if (App.modo === 'login') { $('#app').innerHTML = vLogin(); return; }
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('ativo', b.dataset.v === ui.aba));
  const views = { inicio: vInicio, financas: vFinancas, planos: vPlanos, simulador: vSimulador, dados: vDados };
  const tela = ui.aba + '|' + (ui.aba === 'planos' ? ui.plano || '' : '');
  const trocou = tela !== render.tela; render.tela = tela;
  const app = $('#app');
  app.classList.remove('entrando');
  app.innerHTML = views[ui.aba]();
  if (trocou) { void app.offsetWidth; app.classList.add('entrando'); window.scrollTo(0, 0); }
  Panda.atualizar();
  if (ui.aba === 'simulador') calcularSimulacao();
}

/* Humor "de fundo" do panda: fica tristinho com o saldo do mês no vermelho. */
App.humorBase = () => {
  const l = lancMes(mesAtual());
  return soma(l, x => x.tipo === 'receita' ? x.valor : -x.valor) < 0 ? 'triste' : 'fofo';
};

function vLogin() {
  return `<div class="card login">
    ${panda(App.msgLogin ? 'triste' : 'fofo')}
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
  if (falta > 0 && meses !== null) porMes = meses > 0 ? `Guardar ${din(falta / meses)}/mês` : '<span class="neg">Prazo vencido</span>';
  const tipo = TIPOS[p.tipo] || TIPOS.outro;
  return `<div class="card plano" data-a="abrirPlano" data-v="${p.id}">
    <div class="cab"><span class="emoji">${tipo.emoji}</span><div><div class="nome">${esc(p.nome)}</div>
      <div class="muted small">${tipo.nome}${p.dataAlvo ? ' · ' + fmtData(p.dataAlvo) : ''}</div></div></div>
    <div class="barra"><i style="width:${pct}%"></i></div>
    <div class="linha"><span>${din(g)} de ${din(meta)}</span><strong>${pct.toFixed(0)}%</strong></div>
    <div class="linha muted"><span>${porMes || (falta <= 0 && meta ? '<span class="pos">Meta atingida 🎉</span>' : '')}</span></div>
  </div>`;
}

// Uma linha do extrato (estilo app de banco): ícone, descrição, categoria e valor.
function itemExtrato(x, opc = {}) {
  return `<div class="mov" data-a="editarLanc" data-v="${x.id}" role="button" tabindex="0" title="Editar">
    <span class="mov-ic ${x.tipo}">${iconeCat(x.categoria, x.tipo)}</span>
    <span class="mov-txt"><strong>${esc(x.desc)}${x.fixo ? ' <span class="fixo" title="Lançamento fixo">🔁</span>' : ''}</strong>
      <small>${esc(x.categoria)}${opc.data ? ' · ' + fmtData(x.data).slice(0, 5) : ''}</small></span>
    <span class="mov-val ${x.tipo === 'receita' ? 'pos' : ''}">${x.tipo === 'receita' ? '+' : '−'} ${din(x.valor)}</span>
    ${opc.apagar ? `<button class="x" data-a="apagarLanc" data-v="${x.id}" title="Apagar" aria-label="Apagar lançamento">✕</button>` : ''}
  </div>`;
}

function botaoOlho() {
  return `<button class="olho" data-a="olho" aria-label="${ui.oculto ? 'Mostrar valores' : 'Ocultar valores'}" title="${ui.oculto ? 'Mostrar valores' : 'Ocultar valores'}">${ui.oculto ? IC.olhoFechado : IC.olho}</button>`;
}

function vInicio() {
  const l = lancMes(mesAtual());
  const rec = soma(l.filter(x => x.tipo === 'receita'), x => x.valor);
  const des = soma(l.filter(x => x.tipo === 'despesa'), x => x.valor);
  const totalGuardado = soma(db.planos, guardado);
  const ultimos = db.lancamentos.slice().sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
  const pendentes = db.planos.flatMap(p => p.tarefas.filter(t => !t.feito).map(t => ({ ...t, plano: p }))).slice(0, 6);
  const atalho = (acao, valor, icone, rotulo) => `<button class="atalho" data-a="${acao}" ${valor ? `data-v="${valor}"` : ''}><span class="at-ic">${icone}</span><span>${rotulo}</span></button>`;
  return `
    <div class="hero">
      <div class="hero-txt">
        <p class="ola">Olá, ${esc(App.usuario?.nome?.split(' ')[0] || 'Gustavo')}</p>
        <div class="rot">Saldo de ${NOMES_MES[+mesAtual().slice(5) - 1]} ${botaoOlho()}</div>
        <div class="saldo-val ${rec - des < 0 ? 'neg' : ''}">${din(rec - des)}</div>
        <div class="chips">
          <span class="chip"><i class="seta pos">${IC.receita}</i>Receitas <b>${din(rec)}</b></span>
          <span class="chip"><i class="seta neg">${IC.despesa}</i>Despesas <b>${din(des)}</b></span>
          <span class="chip"><i class="seta">${IC.alvo}</i>Guardado <b>${din(totalGuardado)}</b></span>
        </div>
      </div>
      ${Panda.html('no-hero')}
    </div>

    <div class="atalhos">
      ${atalho('novoLanc', 'receita', IC.receita, 'Receita')}
      ${atalho('novoLanc', 'despesa', IC.despesa, 'Despesa')}
      ${atalho('novoPlano', '', IC.alvo, 'Novo plano')}
      ${atalho('aba', 'financas', IC.extrato, 'Extrato')}
      ${atalho('aba', 'simulador', IC.calc, 'Simular')}
      ${atalho('exportarCSV', '', IC.baixar, 'Planilha')}
    </div>

    <div class="topo secao"><h2>Meus planos</h2><button class="link" data-a="novoPlano">+ Novo plano</button></div>
    ${db.planos.length ? `<div class="planos carrossel">${db.planos.map(cardPlano).join('')}</div>`
      : `<div class="card vazio">${panda('preguica')}Nenhum plano ainda. Crie um para sua viagem, casamento, casa ou carro.</div>`}

    <div class="cols-2" style="margin-top:22px">
      <div class="card">
        <div class="topo secao"><h2>Últimos lançamentos</h2><button class="link" data-a="aba" data-v="financas">Ver extrato ${IC.seta}</button></div>
        ${ultimos.length ? `<div class="movs">${ultimos.map(x => itemExtrato(x, { data: true })).join('')}</div>`
      : '<p class="muted small" style="margin:0">Seus lançamentos mais recentes aparecem aqui.</p>'}
      </div>
      <div class="card">
        <div class="topo secao"><h2>Próximas tarefas</h2><button class="link" data-a="aba" data-v="planos">Ver planos ${IC.seta}</button></div>
        ${pendentes.length ? pendentes.map(t => `<div class="tarefa"><input type="checkbox" data-c="tarefaFeita" data-p="${t.plano.id}" data-i="${t.id}">
          <span>${esc(t.texto)}</span><span class="muted small">${TIPOS[t.plano.tipo]?.emoji || ''} ${esc(t.plano.nome)}</span></div>`).join('')
      : '<p class="muted small" style="margin:0">As tarefas pendentes dos seus planos aparecem aqui.</p>'}
      </div>
    </div>`;
}

function vFinancas() {
  const l = lancMes(ui.mes).sort((a, b) => b.data.localeCompare(a.data));
  const rec = soma(l.filter(x => x.tipo === 'receita'), x => x.valor);
  const des = soma(l.filter(x => x.tipo === 'despesa'), x => x.valor);
  const porCat = {};
  l.filter(x => x.tipo === 'despesa').forEach(x => porCat[x.categoria] = (porCat[x.categoria] || 0) + x.valor);
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const visiveis = ui.filtro === 'todos' ? l : l.filter(x => x.tipo === ui.filtro);
  const dias = [];
  visiveis.forEach(x => { const d = dias[dias.length - 1]; if (d && d.data === x.data) d.itens.push(x); else dias.push({ data: x.data, itens: [x] }); });
  const [ano, mes] = ui.mes.split('-');
  return `
    <div class="topo">
      <div><h1>Finanças</h1><p class="sub" style="margin:0">Seu extrato de receitas e despesas</p></div>
      <div class="mes-nav">
        <button data-a="mes" data-v="-1" aria-label="Mês anterior">${IC.voltar}</button>
        <span class="mes-rot">${NOMES_MES[+mes - 1]} <small>${ano}</small></span>
        <button data-a="mes" data-v="1" aria-label="Próximo mês">${IC.seta}</button>
      </div>
    </div>
    <div class="hero compacto">
      <div class="hero-txt">
        <div class="rot">Saldo do mês ${botaoOlho()}</div>
        <div class="saldo-val ${rec - des < 0 ? 'neg' : ''}">${din(rec - des)}</div>
        <div class="chips">
          <span class="chip"><i class="seta pos">${IC.receita}</i>Receitas <b>${din(rec)}</b></span>
          <span class="chip"><i class="seta neg">${IC.despesa}</i>Despesas <b>${din(des)}</b></span>
          <span class="chip">Economia <b>${rec ? ((rec - des) / rec * 100).toFixed(0) : 0}%</b></span>
        </div>
      </div>
    </div>
    <div class="acoes rolavel" style="margin-bottom:18px">
      <button class="btn pri" data-a="novoLanc">+ Lançamento</button>
      ${ui.mes !== mesAtual() ? '<button class="btn" data-a="mesHoje">Voltar para este mês</button>' : ''}
      <button class="btn" data-a="copiarMes">Copiar fixos do mês anterior</button>
      <button class="btn" data-a="exportarCSV">Exportar planilha</button>
      <button class="btn" data-a="importarCSV">Importar planilha</button>
    </div>
    <div class="cols-2" style="grid-template-columns:1.7fr 1fr">
      <div class="card">
        <div class="topo secao"><h2>Extrato</h2>
          <div class="filtros">${[['todos', 'Tudo'], ['receita', 'Receitas'], ['despesa', 'Despesas']].map(([f, r]) =>
            `<button class="${ui.filtro === f ? 'on' : ''}" data-a="filtro" data-v="${f}">${r}</button>`).join('')}</div></div>
        ${dias.length ? dias.map(d => `
          <div class="dia"><span>${rotuloDia(d.data)}</span><span>${din(soma(d.itens, x => x.tipo === 'receita' ? x.valor : -x.valor))}</span></div>
          <div class="movs">${d.itens.map(x => itemExtrato(x, { apagar: true })).join('')}</div>`).join('')
      : `<div class="vazio">${panda('preguica')}Nenhum lançamento em ${nomeMes(ui.mes)}.</div>`}
      </div>
      <div class="card"><h2>Para onde foi o dinheiro</h2>
        ${cats.length ? `<div class="pilha">${cats.map(([c, v], i) => `<i class="c${i % 8}" style="flex:${v}" title="${esc(c)}"></i>`).join('')}</div>` +
        cats.map(([c, v], i) => `<div class="cat"><span class="ponto c${i % 8}"></span><span>${iconeCat(c, 'despesa')} ${esc(c)}</span>
          <span class="muted small">${(v / des * 100).toFixed(0)}%</span><span class="small">${din(v)}</span></div>`).join('')
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
      <div><button class="btn mini voltar" data-a="voltar">${IC.voltar} Planos</button>
        <h1 style="margin-top:10px">${tipo.emoji} ${esc(p.nome)}</h1>
        <p class="sub" style="margin:0">${tipo.nome}${p.dataAlvo ? ' · data alvo ' + fmtData(p.dataAlvo) : ''}</p></div>
      <div class="acoes"><button class="btn" data-a="editarPlano" data-v="${p.id}">Editar</button><button class="btn perigo" data-a="apagarPlano" data-v="${p.id}">Excluir</button></div>
    </div>
    <div class="grid">
      <div class="card stat"><div class="rot">Meta ${p.meta ? '' : '(soma dos custos)'}</div><div class="val">${din(meta)}</div></div>
      <div class="card stat"><div class="rot">Já guardado</div><div class="val pos">${din(g)}</div></div>
      <div class="card stat"><div class="rot">Falta</div><div class="val">${din(falta)}</div></div>
      <div class="card stat"><div class="rot">Guardar por mês</div><div class="val">${falta <= 0 ? '—' : meses === null ? '<span class="small muted">defina a data</span>' : meses > 0 ? din(falta / meses) : '<span class="neg small">prazo vencido</span>'}</div>
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
        <tfoot><tr><th>Total</th><th class="num">${din(previsto(p))}</th><th class="num">${din(pago(p))}</th><th></th></tr></tfoot>
      </table></div>
      <form class="add" data-f="addItem" data-p="${p.id}"><input name="desc" placeholder="Novo item de custo" required><input name="previsto" type="number" step="0.01" min="0" placeholder="Valor" style="max-width:130px"><button class="btn">Adicionar</button></form>
    </div>

    <div class="cols-2">
      <div class="card"><h2>Dinheiro guardado</h2>
        ${p.aportes.length ? `<table class="tabela"><tbody>${p.aportes.slice().sort((a, b) => b.data.localeCompare(a.data)).map(a => `<tr>
          <td>${fmtData(a.data)}</td><td class="muted">${esc(a.obs || '')}</td><td class="num ${a.valor < 0 ? 'neg' : 'pos'}">${din(a.valor)}</td>
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
    ${vSeuPanda()}
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

function vSeuPanda() {
  const GRUPOS = { cabeca: ['🎩', 'Na cabeça'], rosto: ['😎', 'No rosto'], roupa: ['🧣', 'Roupinha'], mao: ['🎋', 'Na patinha'] };
  const HUMOR = { fofo: 'Fofo', feliz: 'Feliz', triste: 'Triste', bravo: 'Bravinho', preguica: 'Preguiça', dormindo: 'Dormindo' };
  const usando = Object.values(Panda.prefs).filter(Boolean).length;
  // Cada opção é um cartãozinho com um mini panda usando o acessório.
  const opcao = (campo, valor, nome) => {
    const on = (Panda.prefs[campo] || '') === valor;
    return `<button class="peca ${on ? 'on' : ''}" data-a="vestirPanda" data-f="${campo}" data-v="${valor}" aria-pressed="${on}">
      <span class="peca-img">${PandaSVG({ [campo]: valor, efeitos: false })}</span>
      <span class="peca-nome">${valor ? esc(nome) : 'Sem nada'}</span>
    </button>`;
  };
  return `<div class="card seu-panda">
    <div class="provador">
      <div class="palco">
        <span class="fita">Provador do panda 🎀</span>
        ${Panda.html('previa')}
        <p class="palco-leg">${usando ? `Usando ${usando} ${usando === 1 ? 'acessório' : 'acessórios'} ✨` : 'Ao natural, do jeitinho que veio 🐼'}</p>
        <div class="acoes" style="justify-content:center">
          <button class="btn pri" data-a="sortearPanda">🎲 Surpresa!</button>
          ${usando ? '<button class="btn" data-a="limparPanda">Tirar tudo</button>' : ''}
        </div>
      </div>
      <div class="guarda">
        ${Object.entries(Panda.ACESSORIOS).map(([campo, ops]) => `
          <h3><span>${GRUPOS[campo][0]}</span> ${GRUPOS[campo][1]}</h3>
          <div class="pecas">${Object.entries(ops).map(([v, n]) => opcao(campo, v, n)).join('')}</div>`).join('')}
      </div>
    </div>
    <p class="muted small dica">Ele reage ao que você faz, cochila quando você some e acorda quando você volta.
      Cutuque para conversar (mas não exagere 😤). Cada aparelho tem o seu panda.</p>
    <h3 class="humores-tit"><span>💭</span> Os humores dele</h3>
    <div class="humores">${Panda.HUMORES.map(h => `<figure>${panda(h)}<figcaption>${HUMOR[h]}</figcaption></figure>`).join('')}</div>
  </div>`;
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

function modalLanc(l, tipoInicial) {
  const novo = !l;
  l = l || { tipo: tipoInicial === 'receita' ? 'receita' : 'despesa', desc: '', categoria: '', valor: '', data: ui.aba === 'financas' && ui.mes !== mesAtual() ? ui.mes + '-01' : hoje(), fixo: false };
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
    if (novo && dados.tipo === 'receita') reagir('feliz', 'Oba! Dinheiro entrando! 💰', 'Uhuul, receita nova! 🎉', 'Rico! 🤑🐼');
    else if (novo && dados.valor >= 1000) reagir('bravo', 'Eita! Que gastão! 😤', 'Mil reais?! Hmpf! 😤');
    else if (novo) reagir('triste', 'Lá se vai o dinheirinho… 😢', 'Mais uma despesa… 🥲');
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
      reagir('feliz', 'Plano novo! Vamos juntos! 🐼', 'Que sonho lindo! ✨');
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
  if (n) reagir('feliz', 'Planilha importada! 📊');
  salvar(); render();
  alert(`${n} lançamento(s) importado(s).`);
}

/* ---------- ações ---------- */
const acoes = {
  aba: v => { ui.aba = v; ui.plano = null; },
  mes: v => { ui.mes = mesDesloc(ui.mes, +v); },
  novoLanc: v => modalLanc(null, v),
  filtro: v => { ui.filtro = v; },
  mesHoje: () => { ui.mes = mesAtual(); },
  olho: () => { ui.oculto = !ui.oculto; try { localStorage.setItem('apg-oculto', ui.oculto ? '1' : '0'); } catch (e) { /* sem armazenamento */ } },
  editarLanc: v => modalLanc(db.lancamentos.find(l => l.id === v)),
  apagarLanc: v => {
    if (!confirm('Apagar este lançamento?')) return;
    db.lancamentos = db.lancamentos.filter(l => l.id !== v);
    reagir('triste', 'Sumiu… 🥲', 'Apagadinho. 🫥');
  },
  copiarMes: () => {
    const ant = mesDesloc(ui.mes, -1);
    const fixos = lancMes(ant).filter(l => l.fixo);
    if (!fixos.length) return alert(`Nenhum lançamento marcado como fixo em ${nomeMes(ant)}.`);
    const jaTem = new Set(lancMes(ui.mes).map(l => l.desc + '|' + l.tipo));
    const novos = fixos.filter(l => !jaTem.has(l.desc + '|' + l.tipo));
    const [a, m] = ui.mes.split('-').map(Number), ultimoDia = new Date(a, m, 0).getDate();
    novos.forEach(l => db.lancamentos.push({ ...l, id: uid(), data: `${ui.mes}-${String(Math.min(+l.data.slice(8), ultimoDia)).padStart(2, '0')}` }));
    if (novos.length) reagir('feliz', 'Fixos copiados! Menos trabalho 😌');
    alert(`${novos.length} lançamento(s) fixo(s) copiado(s).`);
  },
  exportarCSV, importarCSV,
  novoPlano: v => modalPlano(null, v),
  abrirPlano: v => { ui.aba = 'planos'; ui.plano = v; },
  voltar: () => { ui.plano = null; },
  editarPlano: v => modalPlano(plano(v)),
  apagarPlano: v => {
    if (!confirm('Excluir este plano e tudo dentro dele?')) return;
    db.planos = db.planos.filter(p => p.id !== v); ui.plano = null;
    reagir('triste', 'Ah não, o plano… 😢');
  },
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
      db = d; reagir('feliz', 'Tudo de volta! 🎉'); salvar(); render(); alert('Backup restaurado!');
    } catch (e) { alert('Arquivo de backup inválido.'); }
  },
  apagarTudo: () => {
    if (!(confirm('Apagar TODOS os dados? Faça um backup antes.') && confirm('Tem certeza? Não dá para desfazer.'))) return;
    db = vazio();
    reagir('bravo', 'Apagou TUDO?! 😤');
  },
  vestirPanda: (v, el) => { Panda.definir(el.dataset.f, v || ''); },
  limparPanda: () => { Object.keys(Panda.ACESSORIOS).forEach(c => Panda.definir(c, '')); },
  sortearPanda: () => Panda.sortear(),
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

// Teclado: Enter/Espaço ativam as linhas clicáveis do extrato.
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-a]')) { e.preventDefault(); e.target.click(); }
});

document.addEventListener('change', e => {
  const el = e.target, c = el.dataset.c; if (!c) return;
  const p = el.dataset.p && plano(el.dataset.p);
  if (c === 'mes' && el.value) ui.mes = el.value;
  else if (c === 'filtro') ui.filtro = el.value;
  else if (c === 'tarefaFeita') {
    const t = p.tarefas.find(t => t.id === el.dataset.i); t.feito = el.checked;
    if (t.feito) reagir('feliz', 'Uma a menos! ✅', 'Tarefa feita! Arrasou 💪');
  }
  else if (c === 'panda') { Panda.definir(el.dataset.f, el.value); render(); return; }
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
    if (tipo === 'addAporte') {
      const antes = guardado(p), valor = parseValor(d.valor);
      p.aportes.push({ id: uid(), valor, data: d.data || hoje(), obs: d.obs.trim() });
      if (valor < 0) reagir('triste', 'Tirou do cofrinho… 😢');
      else if (metaDe(p) && antes < metaDe(p) && guardado(p) >= metaDe(p)) reagir('feliz', 'META BATIDA! 🎉🐼🎉');
      else reagir('feliz', 'Guardou! Rumo à meta! 🎯', 'Cofrinho mais gordo! 🐷✨');
    }
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
