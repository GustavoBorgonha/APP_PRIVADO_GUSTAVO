'use strict';

/* =========================================================
   Meu Controle — finanças pessoais e planejamento de metas
   Dados salvos no próprio navegador (localStorage).
   ========================================================= */

const CHAVE = 'apg-dados-v1';

const CATEGORIAS = {
  despesa: ['Moradia', 'Alimentação', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Contas', 'Compras', 'Assinaturas', 'Cuidados pessoais', 'Cartão de crédito', 'Tarifas bancárias', 'Investimentos', 'Outros'],
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

// Lê um arquivo de texto escolhido pelo usuário, acertando a codificação (extratos de banco).
function lerArquivo(accept) {
  return new Promise(res => {
    const i = Object.assign(document.createElement('input'), { type: 'file', accept });
    i.onchange = () => {
      const f = i.files[0]; if (!f) return res(null);
      const r = new FileReader();
      r.onload = () => res({ nome: f.name, texto: Extrato.decodificar(r.result) });
      r.readAsArrayBuffer(f);
    };
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

/* Triagem em andamento: fica salva para continuar depois, de onde parou.
   - Com login (nuvem): fica no Firestore (triagens/atual), então continua em qualquer aparelho ou no site.
   - Sem login (modo local), ou se a nuvem recusar: fica neste aparelho (localStorage).
   ui.triagem = a triagem (aberta ou pausada); ui.naTriagem = se a tela dela está aberta. */
const CHAVE_TRIAGEM = 'apg-triagem';
let triagemLocal = null;
try { triagemLocal = JSON.parse(localStorage.getItem(CHAVE_TRIAGEM)) || null; } catch (e) { /* sem armazenamento */ }
ui.triagem = triagemLocal;
ui.naTriagem = false;
// JSON com chaves em ordem fixa, para saber se a triagem mudou de verdade.
const jsonEstavel = v => JSON.stringify(v, (k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(c => [c, x[c]])) : x);
let triagemGuardada = ui.triagem ? jsonEstavel(ui.triagem) : '';
const triagemNaNuvem = () => App.modo === 'nuvem' && App.salvarTriagem && !App.triagemSemNuvem;
function guardarTriagem() {
  const json = ui.triagem ? jsonEstavel(ui.triagem) : '';
  if (json === triagemGuardada) return;   // só grava quando muda (render chama isto toda hora)
  triagemGuardada = json;
  if (triagemNaNuvem()) { App.salvarTriagem(ui.triagem); return; }
  if (App.modo !== 'local' && App.modo !== 'nuvem') return;
  try {
    if (ui.triagem) localStorage.setItem(CHAVE_TRIAGEM, json);
    else localStorage.removeItem(CHAVE_TRIAGEM);
  } catch (e) { /* sem armazenamento */ }
}
// Se algum lançamento confirmado foi apagado enquanto a triagem estava pausada, ele volta a ficar pendente.
function conferirTriagem() {
  const ids = new Set(db.lancamentos.map(l => l.id));
  ui.triagem?.itens.forEach(i => { if (i.estado === 'ok' && !ids.has(i.lancId)) { i.estado = 'pendente'; delete i.lancId; } });
}

/* ---------- ícones e rótulos ---------- */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  olho: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  olhoFechado: svg('<path d="M4 4l16 16M9.9 5.8A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.500a15.6 15.6 0 0 1-3.3 3.900M6.3 7.700A15.3 15.3 0 0 0 2.5 12S6 18.5 12 18.500a9 9 0 0 0 3.6-.8M9.9 9.900a3 3 0 0 0 4.2 4.2"/>'),
  receita: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  despesa: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  alvo: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>'),
  extrato: svg('<path d="M6 3.500h12v17l-3-2-3 2-3-2-3 2zM9 8.500h6M9 12.500h6"/>'),
  importar: svg('<path d="M12 15V4M7 8l5-5 5 5M5 20h14"/>'),
  baixar: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  seta: svg('<path d="M9 6l6 6-6 6"/>'),
  voltar: svg('<path d="M15 6l-6 6 6 6"/>'),
};
const ICONE_CAT = {
  'Moradia': '🏠', 'Alimentação': '🍽️', 'Mercado': '🛒', 'Transporte': '🚌', 'Saúde': '💊', 'Educação': '📚',
  'Lazer': '🎉', 'Contas': '🧾', 'Compras': '🛍️', 'Assinaturas': '📺', 'Investimentos': '📈', 'Outros': '📦',
  'Cuidados pessoais': '💈', 'Cartão de crédito': '💳', 'Tarifas bancárias': '🏦',
  'Salário': '💼', 'Renda extra': '✨', 'Rendimentos': '📈', 'Reembolso': '↩️',
};
const MEIOS = { debito: 'débito', credito: 'crédito' };
const rotuloOrigem = x => x.banco || x.meio ? [x.banco, MEIOS[x.meio]].filter(Boolean).join(' ') : '';
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
  if (ui.triagem && !ui.triagem.itens) ui.triagem = null;
  if (!ui.triagem) ui.naTriagem = false;
  guardarTriagem();
  document.body.classList.toggle('sem-nav', App.modo === 'carregando' || App.modo === 'login');
  document.body.dataset.aba = ui.aba;
  if (App.modo === 'carregando') { $('#app').innerHTML = `<div class="carregando">${panda()}Carregando seus dados…</div>`; return; }
  if (App.modo === 'login') { $('#app').innerHTML = vLogin(); return; }
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('ativo', b.dataset.v === ui.aba));
  const views = { inicio: vInicio, financas: vFinancas, extratos: vExtratos, planos: vPlanos, dados: vDados };
  const tela = ui.aba + '|' + (ui.aba === 'planos' ? ui.plano || '' : ui.aba === 'extratos' && ui.naTriagem ? 'triagem' : ui.aba === 'extratos' ? ui.lote || '' : '');
  const trocou = tela !== render.tela; render.tela = tela;
  const app = $('#app');
  app.classList.remove('entrando');
  app.innerHTML = views[ui.aba]();
  if (trocou) { void app.offsetWidth; app.classList.add('entrando'); window.scrollTo(0, 0); }
  Panda.atualizar();
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
      <small>${esc(x.categoria)}${opc.data ? ' · ' + fmtData(x.data).slice(0, 5) : ''}${rotuloOrigem(x) ? ' · ' + esc(rotuloOrigem(x)) : ''}</small></span>
    <span class="mov-val ${x.tipo === 'receita' ? 'pos' : ''}">${x.tipo === 'receita' ? '+' : '−'} ${din(x.valor)}</span>
    ${opc.apagar ? `<button class="x" data-a="apagarLanc" data-v="${x.id}" title="Apagar" aria-label="Apagar lançamento">✕</button>` : ''}
  </div>`;
}

function botaoOlho() {
  return `<button class="olho" data-a="olho" aria-label="${ui.oculto ? 'Mostrar valores' : 'Ocultar valores'}" title="${ui.oculto ? 'Mostrar valores' : 'Ocultar valores'}">${ui.oculto ? IC.olhoFechado : IC.olho}</button>`;
}

function avisoTriagem() {
  const t = ui.triagem; if (!t || ui.naTriagem) return '';
  const pend = t.itens.filter(i => i.estado === 'pendente').length;
  const ok = t.itens.filter(i => i.estado === 'ok').length;
  return `<div class="card tri-pausada">
    <span class="mov-ic">🧾</span>
    <div class="mov-txt"><strong>Triagem em andamento</strong>
      <small>${esc(t.banco)} ${t.meio === 'credito' ? 'crédito' : 'débito'} · ${esc(t.arquivo)} · ${pend} ${pend === 1 ? 'pendente' : 'pendentes'}${ok ? ` · ${ok} ${ok === 1 ? 'confirmado' : 'confirmados'}` : ''}</small></div>
    <div class="acoes"><button class="btn" data-a="descartarTriagem">Descartar</button><button class="btn pri" data-a="retomarTriagem">Continuar triagem</button></div>
  </div>`;
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
    ${avisoTriagem()}
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
      ${atalho('aba', 'financas', IC.extrato, 'Finanças')}
      ${atalho('aba', 'extratos', IC.importar, 'Extratos')}
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
    ${avisoTriagem()}
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
      <button class="btn" data-a="importarExtrato">Importar extrato do banco</button>
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

/* ---------- triagem de extrato importado ----------
   Os movimentos lidos do arquivo ficam em ui.triagem (salva na nuvem ou no aparelho) e NÃO entram nas
   finanças sozinhos: cada um precisa de "Confirmar". "Ignorar" descarta. */
function cartaoTriagem(i) {
  const campo = (f, extra) => `data-c="tri" data-i="${i.id}" data-f="${f}" ${extra || ''}`;
  return `<div class="card tri">
    <div class="tri-topo">
      <span class="mov-ic ${i.tipo}">${iconeCat(i.categoria, i.tipo)}</span>
      <div class="tri-orig"><small>No extrato · ${fmtData(i.data)}</small><span>${esc(i.bruto)}</span></div>
      <strong class="tri-valor ${i.tipo === 'receita' ? 'pos' : ''}">${i.tipo === 'receita' ? '+' : '−'} ${din(i.valor)}</strong>
    </div>
    ${i.forcar ? '<p class="tri-aviso forte">⚠️ Este movimento já foi importado antes. Confirmar vai lançar de novo.</p>' : ''}
    ${parecido(i) && !i.forcar ? `<p class="tri-aviso forte">⚠️ Este valor já está lançado: ${esc(descreveLanc(parecido(i)))}. Confira antes de confirmar.</p>` : ''}
    ${i.avisos.map(a => `<p class="tri-aviso">⚠️ ${esc(a)}</p>`).join('')}
    <div class="tri-campos">
      <label class="larga">Descrição<input ${campo('desc')} value="${esc(i.desc)}"></label>
      <label>Categoria<input ${campo('categoria', `list="cats-${i.tipo}"`)} value="${esc(i.categoria)}"></label>
      <label>Tipo<select ${campo('tipo')}>
        <option value="despesa" ${i.tipo === 'despesa' ? 'selected' : ''}>Despesa</option>
        <option value="receita" ${i.tipo === 'receita' ? 'selected' : ''}>Receita</option></select></label>
      <label>Data<input type="date" ${campo('data')} value="${i.data}"></label>
      <label>Valor (R$)<input type="number" step="0.01" min="0" ${campo('valor')} value="${i.valor}"></label>
    </div>
    <div class="tri-acoes">
      <label class="tri-fixo"><input type="checkbox" ${campo('fixo')} ${i.fixo ? 'checked' : ''}> Repete todo mês</label>
      <button class="btn" data-a="triIgnorar" data-v="${i.id}">Ignorar</button>
      <button class="btn pri" data-a="triConfirmar" data-v="${i.id}">✓ Confirmar</button>
    </div>
  </div>`;
}

// Procura nas finanças um lançamento que pareça ser o mesmo movimento:
// mesmo identificador do banco, ou mesma data + mesmo valor + mesmo tipo.
function parecido(i) {
  const valor = Math.abs(parseValor(i.valor));
  return db.lancamentos.find(l => l.id !== i.lancId && ((l.origem && l.origem === i.origem) ||
    (l.data === i.data && l.tipo === i.tipo && Math.abs(l.valor - valor) < 0.005)));
}
const descreveLanc = l => `"${l.desc}" em ${fmtData(l.data)}, ${brl(l.valor)}${rotuloOrigem(l) ? ' (' + rotuloOrigem(l) + ')' : ''}`;

function vTriagem() {
  const t = ui.triagem, total = t.itens.length;
  const dup = t.itens.filter(i => i.estado === 'duplicado');
  const pend = t.itens.filter(i => i.estado === 'pendente');
  const ok = t.itens.filter(i => i.estado === 'ok'), ign = t.itens.filter(i => i.estado === 'ignorado');
  const feitos = total - pend.length;
  return `
    <div class="topo">
      <div><button class="btn mini voltar" data-a="sairTriagem" title="A triagem fica salva para continuar depois">${IC.voltar} Extratos</button>
        <h1 style="margin-top:10px">Triagem do extrato</h1>
        <p class="sub" style="margin:0"><span class="selo">${esc(t.banco)} · ${t.meio === 'credito' ? 'cartão de crédito' : 'conta (débito)'}</span>
          ${esc(t.arquivo)} · nada entra nas suas finanças sem você confirmar.</p></div>
      <button class="btn perigo" data-a="cancelarImportacao">Cancelar importação</button>
    </div>
    <div class="card tri-progresso">
      <div class="linha" style="margin:0 0 8px"><strong>${feitos} de ${total} revisados</strong>
        <span class="muted">${ok.length} ${ok.length === 1 ? 'confirmado' : 'confirmados'} · ${ign.length} ${ign.length === 1 ? 'ignorado' : 'ignorados'}${dup.length ? ` · ${dup.length} já ${dup.length === 1 ? 'importado' : 'importados'}` : ''}</span></div>
      <div class="barra"><i style="width:${total ? feitos / total * 100 : 0}%"></i></div>
    </div>
    ${['despesa', 'receita'].map(tp => `<datalist id="cats-${tp}">${CATEGORIAS[tp].map(c => `<option value="${c}">`).join('')}</datalist>`).join('')}
    ${pend.length ? `<div class="tri-lista">${pend.map(cartaoTriagem).join('')}</div>`
      : `<div class="card vazio">${panda('feliz')}<strong style="color:var(--text);font-size:17px">Tudo revisado!</strong><br>
          ${ok.length} ${ok.length === 1 ? 'lançamento confirmado' : 'lançamentos confirmados'} e ${ign.length} ${ign.length === 1 ? 'ignorado' : 'ignorados'}.
          <div class="acoes" style="justify-content:center;margin-top:14px"><button class="btn pri" data-a="sairTriagem">Concluir</button></div></div>`}
    ${dup.length ? `<details class="card tri-feitos tri-dups"><summary>Já importados antes — ficaram de fora (${dup.length})</summary>
      <p class="muted small" style="margin:0 0 6px">Estes movimentos já estão nas suas finanças, então não entram de novo.</p>
      ${dup.map(i => `<div class="mov tri-feito">
        <span class="mov-ic ${i.tipo}">✅</span>
        <span class="mov-txt"><strong>${esc(i.desc)}</strong><small>${fmtData(i.data)} · já lançado</small></span>
        <span class="mov-val ${i.tipo === 'receita' ? 'pos' : ''}">${i.tipo === 'receita' ? '+' : '−'} ${din(i.valor)}</span>
        <button class="btn mini" data-a="triForcar" data-v="${i.id}">Lançar mesmo assim</button></div>`).join('')}
    </details>` : ''}
    ${ok.length + ign.length ? `<details class="card tri-feitos tri-revisados" ${pend.length ? '' : 'open'}><summary>Já revisados (${ok.length + ign.length})</summary>
      ${[...ok, ...ign].map(i => `<div class="mov tri-feito ${i.estado}">
        <span class="mov-ic ${i.tipo}">${i.estado === 'ok' ? iconeCat(i.categoria, i.tipo) : '🚫'}</span>
        <span class="mov-txt"><strong>${esc(i.desc)}</strong><small>${i.estado === 'ok' ? esc(i.categoria) : 'Ignorado'} · ${fmtData(i.data)}</small></span>
        <span class="mov-val ${i.tipo === 'receita' ? 'pos' : ''}">${i.tipo === 'receita' ? '+' : '−'} ${din(i.valor)}</span>
        <button class="btn mini" data-a="triDesfazer" data-v="${i.id}">Desfazer</button></div>`).join('')}
    </details>` : ''}`;
}

async function importarExtrato() {
  if (ui.triagem && ui.triagem.itens.some(i => i.estado === 'pendente') &&
      !confirm(`Você tem uma triagem em andamento (${ui.triagem.arquivo}).\n\nImportar outro extrato descarta os pendentes dela. Os já confirmados continuam salvos.\n\nContinuar?`)) return;
  const arq = await lerArquivo('.ofx,.csv,.txt'); if (!arq) return;
  const det = Extrato.detectar(arq.nome, arq.texto);
  let ultimo = {};
  try { ultimo = JSON.parse(localStorage.getItem('apg-extrato')) || {}; } catch (e) { /* sem armazenamento */ }
  const banco = det.banco || ultimo.banco || '', meio = det.banco ? det.meio : ultimo.meio || det.meio;
  const opcao = (v, emoji, titulo, sub) => `<label class="escolha"><input type="radio" name="meio" value="${v}" ${meio === v ? 'checked' : ''} required>
    <span><b>${emoji} ${titulo}</b><small>${sub}</small></span></label>`;
  abrirModal(`
    <h2>De onde é este extrato?</h2>
    <p class="muted small" style="margin:-6px 0 14px">${esc(arq.nome)}</p>
    <form class="form" data-f="modal">
      <label class="full">Banco<input name="banco" list="bancos" required value="${esc(banco)}" placeholder="Ex.: Inter, Bradesco, Nubank" autocomplete="off"></label>
      <datalist id="bancos">${Extrato.BANCOS.map(b => `<option value="${b}">`).join('')}</datalist>
      <div class="full"><span class="rotulo">Tipo de extrato</span>
        <div class="escolhas">
          ${opcao('debito', '🏦', 'Conta / débito', 'Extrato da conta: Pix, boletos, compras no débito')}
          ${opcao('credito', '💳', 'Cartão de crédito', 'Fatura do cartão: compras no crédito')}
        </div></div>
      ${det.banco ? '<p class="muted small full" style="margin:0">Reconheci pelo arquivo. Confira e corrija se precisar.</p>' : ''}
      <div class="modal-acoes full"><button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Continuar</button></div>
    </form>`, d => {
    const opc = { banco: d.banco.trim(), meio: d.meio === 'credito' ? 'credito' : 'debito' };
    try { localStorage.setItem('apg-extrato', JSON.stringify(opc)); } catch (e) { /* sem armazenamento */ }
    let itens = [];
    try {
      itens = Extrato.preparar(Extrato.lerArquivo(arq.nome, arq.texto, opc), { ...opc, lancamentos: db.lancamentos, meuNome: App.usuario?.nome,
        categorias: [...CATEGORIAS.despesa, ...CATEGORIAS.receita] });
    } catch (e) { console.error(e); }
    if (!itens.length) return alert('Não encontrei lançamentos neste arquivo. Use o extrato em OFX ou CSV baixado do seu banco.');
    ui.triagem = { arquivo: arq.nome, ...opc, itens, lote: uid(), em: hoje() };
    ui.naTriagem = true; ui.aba = 'extratos'; ui.plano = null;
  });
}
const itemTriagem = id => ui.triagem?.itens.find(i => i.id === id);

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

// Importações de extrato já feitas (agrupadas pelo "lote"), com opção de desfazer a importação inteira.
function lotesImportados() {
  const m = new Map();
  db.lancamentos.filter(l => l.lote).forEach(l => {
    const g = m.get(l.lote) || { id: l.lote, arquivo: l.loteArquivo || 'Extrato', em: l.loteEm || '', banco: l.banco, meio: l.meio, itens: [] };
    g.itens.push(l); m.set(l.lote, g);
  });
  return [...m.values()].sort((a, b) => (b.em || '').localeCompare(a.em || ''));
}

/* ---------- aba Extratos: importar, triagem em andamento e histórico ---------- */
function vExtratos() {
  if (ui.triagem && ui.naTriagem) return vTriagem();
  const lotes = lotesImportados();
  const total = lotes.reduce((n, g) => n + g.itens.length, 0);
  const meioRot = m => m === 'credito' ? 'Cartão de crédito' : 'Conta (débito)';
  return `
    <div class="topo">
      <div><h1>Extratos</h1><p class="sub" style="margin:0">Importe o extrato do banco, revise na triagem e acompanhe o histórico.</p></div>
      <button class="btn pri" data-a="importarExtrato">${IC.importar} Importar extrato</button>
    </div>
    ${App.modo === 'nuvem' && App.triagemSemNuvem ? `<p class="tri-aviso forte" style="margin:0 0 16px">⚠️ A triagem está salva só neste aparelho:
      ${App.triagemSemNuvem === 'regras' ? 'falta atualizar as regras do Firebase (veja o CONFIGURAR.md, passo 2).' : 'não foi possível falar com a nuvem.'}</p>` : ''}
    ${ui.triagem ? avisoTriagem() : ''}
    <div class="card como">
      <div><span>1</span><b>Baixe</b> o extrato no app do banco em <b>OFX</b> ou <b>CSV</b>.</div>
      <div><span>2</span><b>Importe</b> e diga de qual banco é e se é conta ou cartão.</div>
      <div><span>3</span><b>Revise</b> cada lançamento na triagem: confirmar ou ignorar.</div>
    </div>
    <div class="topo secao"><h2>Histórico de extratos</h2>
      ${lotes.length ? `<span class="muted small">${lotes.length} ${lotes.length === 1 ? 'extrato' : 'extratos'} · ${total} ${total === 1 ? 'lançamento' : 'lançamentos'}</span>` : ''}</div>
    ${lotes.length ? lotes.map(g => {
      const datas = g.itens.map(l => l.data).sort();
      const rec = soma(g.itens.filter(l => l.tipo === 'receita'), l => l.valor), des = soma(g.itens.filter(l => l.tipo === 'despesa'), l => l.valor);
      const aberto = ui.lote === g.id;
      return `<div class="card lote ${aberto ? 'aberto' : ''}">
        <div class="lote-cab" data-a="abrirLote" data-v="${g.id}" role="button" tabindex="0" aria-expanded="${aberto}">
          <span class="mov-ic">${g.meio === 'credito' ? '💳' : '🏦'}</span>
          <span class="mov-txt"><strong>${esc(g.banco || 'Banco não informado')} · ${meioRot(g.meio)}</strong>
            <small>${esc(g.arquivo)}</small>
            <small>${fmtData(datas[0])} a ${fmtData(datas[datas.length - 1])}${g.em ? ' · importado em ' + fmtData(g.em) : ''}</small></span>
          <span class="lote-num"><b>${g.itens.length}</b><small>${g.itens.length === 1 ? 'lançamento' : 'lançamentos'}</small></span>
          <span class="lote-seta">${IC.seta}</span>
        </div>
        ${aberto ? `<div class="lote-corpo">
          <div class="chips">
            ${rec ? `<span class="chip"><i class="seta pos">${IC.receita}</i>Entradas <b>${din(rec)}</b></span>` : ''}
            ${des ? `<span class="chip"><i class="seta neg">${IC.despesa}</i>Saídas <b>${din(des)}</b></span>` : ''}
          </div>
          <div class="movs">${g.itens.slice().sort((a, b) => b.data.localeCompare(a.data)).map(l => itemExtrato(l, { data: true })).join('')}</div>
          <div class="acoes" style="justify-content:flex-end;margin-top:10px">
            <button class="btn perigo" data-a="desfazerLote" data-v="${g.id}">Cancelar importação</button></div>
        </div>` : ''}
      </div>`;
    }).join('')
    : `<div class="card vazio">${panda('preguica')}Nenhum extrato importado ainda.<br>
        <div class="acoes" style="justify-content:center;margin-top:14px"><button class="btn pri" data-a="importarExtrato">Importar o primeiro</button></div></div>`}
    ${lotes.length ? '<p class="muted small">Cancelar uma importação apaga todos os lançamentos que vieram daquele extrato, mesmo os já confirmados. Extratos importados antes do histórico existir não aparecem aqui.</p>' : ''}`;
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
  const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Fixo', 'Banco', 'Meio']];
  db.lancamentos.slice().sort((a, b) => a.data.localeCompare(b.data)).forEach(l =>
    linhas.push([fmtData(l.data), l.tipo, l.desc, l.categoria, (l.tipo === 'despesa' ? -l.valor : l.valor).toFixed(2).replace('.', ','), l.fixo ? 'sim' : '', l.banco || '', MEIOS[l.meio] || '']));
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
  aba: v => { ui.aba = v; ui.plano = null; ui.naTriagem = false; },   // trocar de aba pausa a triagem (fica salva)
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
  exportarCSV, importarCSV, importarExtrato,
  triConfirmar: v => {
    const i = itemTriagem(v); if (!i) return;
    const desc = String(i.desc || '').trim(), valor = Math.abs(parseValor(i.valor));
    if (!desc) return alert('Preencha a descrição antes de confirmar.');
    if (!valor) return alert('O valor precisa ser maior que zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.data || '')) return alert('Preencha a data antes de confirmar.');
    // Validação: se este valor já está lançado (mesma data, valor e tipo), só entra com confirmação explícita.
    const igual = parecido(i);
    if (igual && !confirm(`Atenção: este valor parece já estar lançado.\n\nJá existe: ${descreveLanc(igual)}\n\nLançar mesmo assim? (vai ficar em dobro se for o mesmo movimento)`)) return;
    const l = { id: uid(), tipo: i.tipo, desc, categoria: String(i.categoria || '').trim() || 'Outros', valor, data: i.data, fixo: !!i.fixo,
      origem: i.origem, banco: ui.triagem.banco, meio: ui.triagem.meio,
      lote: ui.triagem.lote, loteArquivo: ui.triagem.arquivo, loteEm: ui.triagem.em };
    db.lancamentos.push(l);
    Object.assign(i, { estado: 'ok', lancId: l.id, desc, valor, categoria: l.categoria });
    if (!ui.triagem.itens.some(x => x.estado === 'pendente')) reagir('feliz', 'Extrato em dia! 🎉', 'Triagem concluída! ✨');
  },
  cancelarImportacao: () => {
    const t = ui.triagem; if (!t) return;
    const n = db.lancamentos.filter(l => l.lote === t.lote).length;
    const msg = n
      ? `Cancelar a importação inteira?\n\n${n === 1 ? 'O lançamento já confirmado' : `Os ${n} lançamentos já confirmados`} deste extrato ${n === 1 ? 'será apagado' : 'serão apagados'} e nada mais será importado.`
      : 'Cancelar a importação? Nada deste extrato será lançado.';
    if (!confirm(msg)) return;
    db.lancamentos = db.lancamentos.filter(l => l.lote !== t.lote);
    ui.triagem = null;
    if (n) reagir('triste', 'Importação cancelada… 🫥');
  },
  desfazerLote: v => {
    const g = lotesImportados().find(x => x.id === v); if (!g) return;
    if (!confirm(`Cancelar a importação de "${g.arquivo}"?\n\n${g.itens.length === 1 ? 'O lançamento que veio' : `Os ${g.itens.length} lançamentos que vieram`} deste extrato ${g.itens.length === 1 ? 'será apagado' : 'serão apagados'}, mesmo ${g.itens.length === 1 ? 'tendo sido confirmado' : 'os já confirmados'}. Não dá para desfazer.`)) return;
    db.lancamentos = db.lancamentos.filter(l => l.lote !== v);
    reagir('triste', 'Importação cancelada… 🫥');
  },
  triForcar: v => { const i = itemTriagem(v); if (i) Object.assign(i, { estado: 'pendente', forcar: true }); },
  triIgnorar: v => { const i = itemTriagem(v); if (i) i.estado = 'ignorado'; },
  triDesfazer: v => {
    const i = itemTriagem(v); if (!i) return;
    if (i.estado === 'ok') db.lancamentos = db.lancamentos.filter(l => l.id !== i.lancId);
    i.estado = 'pendente'; delete i.lancId;
    // Se outro igual já estava lançado antes desta importação, volta para a lista de "já importados".
    if (!i.forcar && db.lancamentos.some(l => l.origem && l.origem === i.origem)) i.estado = 'duplicado';
  },
  // Voltar: se ainda há pendentes, a triagem fica pausada (salva) para continuar depois.
  sairTriagem: () => {
    const t = ui.triagem; if (!t) return;
    const ultimo = t.itens.filter(i => i.estado === 'ok').map(i => i.data).sort().pop();
    if (ultimo) ui.mes = ultimo.slice(0, 7);
    ui.naTriagem = false;
    if (!t.itens.some(i => i.estado === 'pendente')) ui.triagem = null;
  },
  abrirLote: v => { ui.lote = ui.lote === v ? null : v; },
  retomarTriagem: () => { if (!ui.triagem) return; conferirTriagem(); ui.naTriagem = true; ui.aba = 'extratos'; ui.plano = null; },
  descartarTriagem: () => {
    const t = ui.triagem; if (!t) return;
    const pend = t.itens.filter(i => i.estado === 'pendente').length;
    if (!confirm(`Descartar a triagem de "${t.arquivo}"?\n\n${pend === 1 ? 'O lançamento pendente não será importado' : `Os ${pend} lançamentos pendentes não serão importados`}. Os já confirmados continuam salvos (para tirar, use "Cancelar importação").`)) return;
    ui.triagem = null;
  },
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
  // Ao sair da conta, a triagem salva neste aparelho é apagada (para a próxima pessoa não ver o extrato).
  // Sair da conta: a triagem continua na nuvem; só some deste aparelho (e da cópia local, se houver).
  sair: () => {
    ui.triagem = null; ui.naTriagem = false; triagemGuardada = '';
    try { localStorage.removeItem(CHAVE_TRIAGEM); } catch (e) { /* sem armazenamento */ }
    return Promise.resolve(App.sair?.());
  },
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
  else if (c === 'tri') {
    // Edição na triagem: só guarda o valor; nada vai para as finanças antes do "Confirmar".
    const i = itemTriagem(el.dataset.i), f = el.dataset.f; if (!i) return;
    i[f] = f === 'fixo' ? el.checked : f === 'valor' ? Math.abs(parseValor(el.value)) : el.value;
    guardarTriagem();
    if (f === 'tipo' || f === 'categoria' || f === 'valor') render();
    return;
  }
  else if (c === 'panda') { Panda.definir(el.dataset.f, el.value); render(); return; }
  else if (c === 'item') { const i = p.itens.find(i => i.id === el.dataset.i); i[el.dataset.f] = el.dataset.f === 'desc' ? el.value : parseValor(el.value); }
  else if (c === 'notas') { p.notas = el.value; salvar(); return; }
  salvar(); render();
});


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
App.carregando = () => {
  App.modo = 'carregando'; db = vazio();
  ui.triagem = null; ui.naTriagem = false; triagemGuardada = ''; App.triagemRecebida = false;
  render();
};
// Triagem vinda da nuvem (de qualquer aparelho).
App.receberTriagem = t => {
  const primeira = !App.triagemRecebida; App.triagemRecebida = true;
  // Primeira vez: se a nuvem não tem triagem e este aparelho tinha uma, envia a deste aparelho.
  if (primeira && !t && triagemLocal) {
    ui.triagem = triagemLocal; triagemLocal = null;
    try { localStorage.removeItem(CHAVE_TRIAGEM); } catch (e) { /* sem armazenamento */ }
    if (App.modo === 'nuvem') guardarTriagem();
    renderSeguro(); return;
  }
  const json = t && t.itens ? jsonEstavel(t) : '';
  if (json === triagemGuardada) return;
  triagemGuardada = json;
  ui.triagem = json ? t : null;
  if (!ui.triagem) ui.naTriagem = false;
  if (App.modo === 'nuvem') renderSeguro();
};
// A nuvem recusou a triagem (regras do Firebase antigas): continua funcionando neste aparelho.
App.semTriagemNaNuvem = e => {
  console.error(e);
  if (App.triagemSemNuvem) return;
  App.triagemSemNuvem = e && e.code === 'permission-denied' ? 'regras' : 'erro';
  if (!ui.triagem && triagemLocal) ui.triagem = triagemLocal;
  triagemGuardada = '';
  guardarTriagem();
  renderSeguro();
};
// Não atrapalha quem está digitando: atualiza a tela quando sair do campo.
function renderSeguro() {
  const ativo = document.activeElement;
  if (modal.open || (ativo && ativo.closest('main') && /INPUT|TEXTAREA|SELECT/.test(ativo.tagName))) App.renderPendente = true;
  else render();
}
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
  renderSeguro();
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
