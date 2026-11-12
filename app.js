'use strict';

/* =========================================================
   Meu Controle — finanças pessoais e planejamento de metas
   Dados salvos no próprio navegador (localStorage).
   ========================================================= */

const CHAVE = 'apg-dados-v1';

/* Transferência entre contas (salário indo de uma conta para outra, dinheiro entre as contas do casal):
   aparece no extrato, mas NÃO conta como receita nem despesa, para não somar o mesmo dinheiro duas vezes. */
const TRANSF = 'Transferência entre contas';

/* Categorias que já vêm com o app: [tipo, nome, ícone]. Na tela Categorias dá para mudar nome, tipo e
   ícone delas, excluir e criar novas. Essas mudanças ficam em db.categorias (um item por categoria:
   as que vêm com o app usam o id "padrao-<nome>"; as novas, um id próprio). */
const CATS_PADRAO = [
  ['despesa', 'Moradia', '🏠'], ['despesa', 'Alimentação', '🍽️'], ['despesa', 'Mercado', '🛒'], ['despesa', 'Transporte', '🚌'],
  ['despesa', 'Saúde', '💊'], ['despesa', 'Educação', '📚'], ['despesa', 'Lazer', '🎉'], ['despesa', 'Contas', '🧾'],
  ['despesa', 'Compras', '🛍️'], ['despesa', 'Assinaturas', '📺'], ['despesa', 'Cuidados pessoais', '💈'],
  ['despesa', 'Cartão de crédito', '💳'], ['despesa', 'Tarifas bancárias', '🏦'], ['despesa', 'Investimentos', '📈'],
  ['receita', 'Salário', '💼'], ['receita', 'Renda extra', '✨'], ['receita', 'Rendimentos', '📈'], ['receita', 'Reembolso', '↩️'],
  ['ambos', TRANSF, '🔄'], ['ambos', 'Outros', '📦'],
];
const CATS_FIXAS = [TRANSF, 'Outros'];   // não podem ser renomeadas nem excluídas (o app depende delas)
const semAcentoApp = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const idPadrao = nome => 'padrao-' + semAcentoApp(nome).replace(/[^a-z0-9]+/g, '-');
const ordemAlfa = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
// A lista é montada uma vez e reaproveitada até as categorias mudarem (salvar() invalida).
let cacheCats = null, versaoCats = 0;
function listaCategorias() {
  if (cacheCats && cacheCats.ref === db.categorias && cacheCats.v === versaoCats) return cacheCats.lista;
  const extra = new Map((db.categorias || []).map(c => [c.id, c]));
  const lista = CATS_PADRAO.map(([tipo, nome, emoji]) => {
    const id = idPadrao(nome);
    return { id, nome, tipo, emoji, padrao: true, ...(extra.get(id) || {}) };
  });
  (db.categorias || []).forEach(c => { if (!c.id.startsWith('padrao-')) lista.push(c); });
  const final = lista.filter(c => !c.excluida).sort((a, b) => ordemAlfa(a.nome, b.nome));
  const porNome = new Map();
  final.forEach(c => { if (!porNome.has(c.nome)) porNome.set(c.nome, []); porNome.get(c.nome).push(c); });
  cacheCats = { ref: db.categorias, v: versaoCats, lista: final, porNome };
  return final;
}
const serveTipo = (c, tipo) => c.tipo === tipo || c.tipo === 'ambos';
const nomesCats = tipo => listaCategorias().filter(c => serveTipo(c, tipo)).map(c => c.nome);
const catPorNome = (nome, tipo) => {
  listaCategorias(); const l = cacheCats.porNome.get(nome); if (!l) return undefined;
  return l.find(c => serveTipo(c, tipo)) || l[0];
};
const ehTransf = l => l.categoria === TRANSF;
const contaNoSaldo = l => !ehTransf(l);

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
function vazio() { return { versao: 1, lancamentos: [], planos: [], categorias: [], agendados: [] }; }
function carregar() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE));
    if (d && Array.isArray(d.lancamentos) && Array.isArray(d.planos)) { if (!Array.isArray(d.categorias)) d.categorias = []; if (!Array.isArray(d.agendados)) d.agendados = []; return d; }
  } catch (e) { /* sem dados */ }
  return vazio();
}
function salvar() {
  versaoCats++;
  if (App.modo === 'nuvem') {
    App.sincronizar?.(db);
    // Coleções que a nuvem ainda não aceita (regras antigas) ficam salvas neste aparelho.
    Object.keys(EXTRAS).forEach(c => { if (App.semNuvem[c]) try { localStorage.setItem(EXTRAS[c], JSON.stringify(db[c] || [])); } catch (e) { /* sem armazenamento */ } });
    return;
  }
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
const MEIOS = { debito: 'débito', credito: 'crédito' };
const rotuloOrigem = x => {
  const conta = x.banco || x.meio ? [x.banco, MEIOS[x.meio]].filter(Boolean).join(' ') : '';
  return [conta, x.titular].filter(Boolean).join(' · ');
};
// Titulares já usados (para sugerir no campo "De quem é a conta").
const titulares = () => {
  const nomes = new Set(db.lancamentos.map(l => l.titular).filter(Boolean));
  const eu = App.usuario?.nome?.split(' ')[0];
  if (eu) nomes.add(eu);
  nomes.add('Conjunta');
  return [...nomes];
};
// Ícone da categoria (emoji ou imagem própria), já pronto para colocar no HTML.
function iconeCat(cat, tipo) {
  const c = catPorNome(cat, tipo);
  if (c && c.img) return `<img class="cat-img" src="${esc(c.img)}" alt="">`;
  return esc((c && c.emoji) || (tipo === 'receita' ? '💵' : '🧾'));
}
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
  fecharSeletor();
  App.renderPendente = false;
  if (ui.triagem && !ui.triagem.itens) ui.triagem = null;
  if (!ui.triagem) ui.naTriagem = false;
  guardarTriagem();
  document.body.classList.toggle('sem-nav', App.modo === 'carregando' || App.modo === 'login');
  document.body.dataset.aba = ui.aba;
  if (App.modo === 'carregando') { $('#app').innerHTML = `<div class="carregando">${panda()}Carregando seus dados…</div>`; return; }
  if (App.modo === 'login') { $('#app').innerHTML = vLogin(); return; }
  const abaMenu = ['categorias', 'revisao', 'contas', 'agenda'].includes(ui.aba) ? 'financas' : ui.aba === 'cidades' ? 'planos' : ui.aba;
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('ativo', b.dataset.v === abaMenu));
  const views = { inicio: vInicio, financas: vFinancas, extratos: vExtratos, planos: vPlanos, dados: vDados, categorias: vCategorias, cidades: vCidades, revisao: vRevisao, contas: vContas, agenda: vAgenda };
  const tela = ui.aba + '|' + (ui.aba === 'planos' ? ui.plano || '' : ui.aba === 'extratos' && ui.naTriagem ? 'triagem' : ui.aba === 'extratos' ? ui.lote || '' : '');
  const trocou = tela !== render.tela; render.tela = tela;
  const app = $('#app');
  app.classList.remove('entrando');
  app.innerHTML = views[ui.aba]();
  if (trocou) { void app.offsetWidth; app.classList.add('entrando'); window.scrollTo(0, 0); }
  Panda.atualizar();
  if (ui.aba === 'cidades') { filtrarCidades(); montarMapaCidades(); aoMostrarCidades(); }
  if (ui.aba === 'categorias') filtrarCategorias();
}

/* Humor "de fundo" do panda: fica tristinho com o saldo do mês no vermelho. */
App.humorBase = () => {
  const l = lancMes(mesAtual()).filter(contaNoSaldo);
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
      <small>${esc(x.categoria)}${opc.data ? ' · ' + fmtData(x.data).slice(0, 5) : ''}${x.cidade ? ' · 📍 ' + esc(x.cidade) : ''}${rotuloOrigem(x) ? ' · ' + esc(rotuloOrigem(x)) : ''}</small></span>
    <span class="mov-val ${ehTransf(x) ? 'transf' : x.tipo === 'receita' ? 'pos' : ''}" ${ehTransf(x) ? 'title="Transferência: não entra no saldo"' : ''}>${x.tipo === 'receita' ? '+' : '−'} ${din(x.valor)}</span>
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
  const l = lancMes(mesAtual()).filter(contaNoSaldo);
  const rec = soma(l.filter(x => x.tipo === 'receita'), x => x.valor);
  const des = soma(l.filter(x => x.tipo === 'despesa'), x => x.valor);
  const totalGuardado = soma(db.planos, guardado);
  const ultimos = db.lancamentos.slice().sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
  const pendentes = db.planos.flatMap(p => p.tarefas.filter(t => !t.feito).map(t => ({ ...t, plano: p }))).slice(0, 6);
  const atalho = (acao, valor, icone, rotulo) => `<button class="atalho" data-a="${acao}" ${valor ? `data-v="${valor}"` : ''}><span class="at-ic">${icone}</span><span>${rotulo}</span></button>`;
  return `
    ${avisoTriagem()}
    ${avisoCidadesGlobal()}
    ${avisoAgenda()}
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
      ${atalho('aba', 'contas', IC.extrato, 'Conta corrente')}
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
  const valem = l.filter(contaNoSaldo), tr = l.filter(ehTransf);
  const rec = soma(valem.filter(x => x.tipo === 'receita'), x => x.valor);
  const des = soma(valem.filter(x => x.tipo === 'despesa'), x => x.valor);
  const trEntrou = soma(tr.filter(x => x.tipo === 'receita'), x => x.valor), trSaiu = soma(tr.filter(x => x.tipo === 'despesa'), x => x.valor);
  const futuros = pendentesNoMes(ui.mes);
  const aPagar = soma(futuros.filter(o => o.a.tipo === 'despesa'), o => o.a.valor), aReceber = soma(futuros.filter(o => o.a.tipo === 'receita'), o => o.a.valor);
  const porCat = {};
  valem.filter(x => x.tipo === 'despesa').forEach(x => porCat[x.categoria] = (porCat[x.categoria] || 0) + x.valor);
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const visiveis = ui.filtro === 'todos' ? l : l.filter(x => x.tipo === ui.filtro);
  const dias = [];
  visiveis.forEach(x => { const d = dias[dias.length - 1]; if (d && d.data === x.data) d.itens.push(x); else dias.push({ data: x.data, itens: [x] }); });
  const [ano, mes] = ui.mes.split('-');
  return `
    ${avisoTriagem()}
    ${avisoAgenda()}
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
          ${aPagar ? `<span class="chip" title="Agendados ainda não confirmados: não entram no saldo">📅 A pagar <b>${din(aPagar)}</b></span>` : ''}
          ${aReceber ? `<span class="chip" title="Agendados ainda não confirmados: não entram no saldo">📅 A receber <b>${din(aReceber)}</b></span>` : ''}
          ${tr.length ? `<span class="chip" title="Não entram no saldo">🔄 Entre contas <b>${trEntrou ? '+' + din(trEntrou) : ''}${trEntrou && trSaiu ? ' / ' : ''}${trSaiu ? '−' + din(trSaiu) : ''}</b></span>` : ''}
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
      <button class="btn" data-a="aba" data-v="agenda">📅 Lançamentos futuros</button>
      <button class="btn" data-a="aba" data-v="contas">🏦 Conta corrente</button>
      <button class="btn" data-a="aba" data-v="revisao">🔎 Revisar categoria</button>
      <button class="btn" data-a="aba" data-v="categorias">🏷️ Categorias</button>
    </div>
    <div class="cols-2" style="grid-template-columns:1.7fr 1fr">
      <div class="card">
        <div class="topo secao"><h2>Extrato</h2>
          <div class="filtros">${[['todos', 'Tudo'], ['receita', 'Receitas'], ['despesa', 'Despesas']].map(([f, r]) =>
            `<button class="${ui.filtro === f ? 'on' : ''}" data-a="filtro" data-v="${f}">${r}</button>`).join('')}</div></div>
        ${dias.length ? dias.map(d => `
          <div class="dia"><span>${rotuloDia(d.data)}</span><span>${din(soma(d.itens.filter(contaNoSaldo), x => x.tipo === 'receita' ? x.valor : -x.valor))}</span></div>
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
      <div class="tri-orig"><small>No extrato · ${fmtData(i.data)}${i.hora ? ' · ' + i.hora : ''}</small><span>${esc(i.bruto)}</span>${linhaDetalhes(i)}</div>
      <strong class="tri-valor ${i.tipo === 'receita' ? 'pos' : ''}">${i.tipo === 'receita' ? '+' : '−'} ${din(i.valor)}</strong>
    </div>
    ${i.forcar ? '<p class="tri-aviso forte">⚠️ Este movimento já foi importado antes. Confirmar vai lançar de novo.</p>' : ''}
    ${parecido(i) && !i.forcar ? `<p class="tri-aviso forte">⚠️ Este valor já está lançado: ${esc(descreveLanc(parecido(i)))}. Confira antes de confirmar.</p>` : ''}
    ${i.avisos.map(a => `<p class="tri-aviso">⚠️ ${esc(a)}</p>`).join('')}
    <div class="tri-campos">
      <label class="larga">Descrição<input ${campo('desc')} value="${esc(i.desc)}"></label>
      <label>Categoria${seletorCat(campo('categoria'), 'tipo:' + i.tipo, i.categoria || 'Outros')}</label>
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

// Tipo de operação do movimento (Pix, débito, boleto…), guardado ou tirado do texto do banco.
const operacaoDe = x => x.operacao ? (Extrato.operacao(x.operacao) || { nome: x.operacao, emoji: '•' }) : x.bruto ? Extrato.operacao(x.bruto) : null;
// Pix/transferência sem nome (o Bradesco só diz "PIX ENVIADO"): procura o mesmo valor, no mesmo dia, em outra conta.
function outroLado(x) {
  if (!/^\s*(pix (enviado|recebido)|transf[^"]*)\s*$/i.test(x.bruto || '')) return null;
  const valor = Math.abs(parseValor(x.valor)), oposto = x.tipo === 'receita' ? 'despesa' : 'receita';
  return db.lancamentos.find(l => l.tipo === oposto && l.data === x.data && Math.abs(l.valor - valor) < 0.005 && (l.banco || '') !== (x.banco || ''));
}
// Linha com o que dá para saber além do texto: tipo de operação, cidade, CPF/CNPJ e o outro lado do Pix.
function linhaDetalhes(x) {
  const d = Extrato.detalhes(x.bruto), op = operacaoDe(x), partes = [];
  if (op) partes.push(`<span class="op-tag">${op.emoji} ${esc(op.nome)}</span>`);
  if (x.cidade) partes.push(`📍 ${esc(x.cidade)}`);
  if (d.documento) partes.push(`🪪 ${esc(d.documento)}`);
  if (d.instituicao) partes.push(`🏦 ${x.tipo === 'receita' ? 'veio do' : 'foi para o'} ${esc(d.instituicao)}`);
  const par = outroLado(x);
  if (par) partes.push(`${x.tipo === 'receita' ? '⬅️ veio de' : '➡️ foi para'} ${esc(par.desc)}${rotuloOrigem(par) ? ' (' + esc(rotuloOrigem(par)) + ')' : ''}`);
  return partes.length ? `<small class="mov-det">${partes.join(' · ')}</small>` : '';
}

// Grava um item da triagem como lançamento (sem perguntas: quem chama já validou).
function confirmarItem(i) {
  const t = ui.triagem, desc = String(i.desc || '').trim(), valor = Math.abs(parseValor(i.valor));
  const l = { id: uid(), tipo: i.tipo, desc, categoria: String(i.categoria || '').trim() || 'Outros', valor, data: i.data, fixo: !!i.fixo,
    origem: i.origem, banco: t.banco, meio: t.meio, titular: t.titular || '', bruto: i.bruto || '', hora: i.hora || '',
    operacao: i.operacao || '', cidade: i.cidade || '',
    lote: t.lote, loteArquivo: t.arquivo, loteEm: t.em };
  if (typeof i.saldoBanco === 'number') l.saldoBanco = i.saldoBanco;   // saldo depois do movimento, como o banco informou
  // Dados gerais do extrato (agência, conta, saldo final, quando foi gerado), para a conta corrente e o histórico.
  const m = t.meta || {};
  if (m.agencia) l.loteAgencia = m.agencia;
  if (m.conta) l.loteConta = m.conta;
  if (typeof m.saldoFinal === 'number') { l.loteSaldo = m.saldoFinal; l.loteSaldoData = m.saldoData || ''; }
  if (m.geradoEm) l.loteGerado = m.geradoEm + (m.geradoHora ? ' ' + m.geradoHora : '');
  db.lancamentos.push(l);
  Object.assign(i, { estado: 'ok', lancId: l.id, desc, valor, categoria: l.categoria });
}

/* ---------- triagem automática ----------
   Redistribui descrição e categoria com base no histórico (o que você já lançou) e confirma de uma vez
   o que é seguro. Estornos que se anulam são ignorados; o que pede atenção (valor já lançado, pagamento
   de fatura, dados faltando) fica pendente para você revisar. */
// "Chave" do estabelecimento: sem prefixos (Pix, compra…) e sem números, para casar variações do mesmo lugar.
const chaveMov = s => semAcentoApp(s).replace(/^(pix( enviado| recebido)?|ted|doc|compra( no (debito|credito))?|pagamento( de titulo)?)[:\s-]+/, '')
  .replace(/["'*#]/g, ' ').replace(/\b[\d.\/-]+\b/g, ' ').replace(/\s+/g, ' ').trim();
// Início do nome do estabelecimento (2 primeiras palavras que importam): casa "Uber do Brasil" com "Uber do Brasil Tecnologia".
const inicioMov = s => { const p = chaveMov(s).split(' ').filter(w => w.length > 2 && !['dos', 'das', 'com', 'para'].includes(w)); return p.length >= 2 ? p.slice(0, 2).join(' ') : p[0] && p[0].length >= 4 ? p[0] : ''; };
function memoriaHistorico(filtro = () => true) {
  const porBruto = new Map(), porDesc = new Map(), porChave = new Map(), porInicio = new Map();
  const somar = (m, chave, tipo, valor) => {
    if (!chave) return;
    const k = tipo + '|' + chave, c = m.get(k) || new Map();
    c.set(valor, (c.get(valor) || 0) + 1); m.set(k, c);
  };
  db.lancamentos.forEach(l => {
    if (!l.categoria || !filtro(l)) return;
    somar(porDesc, semAcentoApp(l.desc), l.tipo, l.categoria);
    somar(porChave, chaveMov(l.desc), l.tipo, l.categoria);
    somar(porInicio, inicioMov(l.desc), l.tipo, l.categoria);
    if (l.bruto) {
      somar(porBruto, semAcentoApp(l.bruto), l.tipo, JSON.stringify([l.desc, l.categoria]));
      somar(porChave, chaveMov(l.bruto), l.tipo, l.categoria);
    }
  });
  const maisUsada = c => c ? [...c].sort((a, b) => b[1] - a[1])[0][0] : null;
  return i => {
    // 1º: o mesmo texto do banco já foi lançado antes → mesma descrição e categoria.
    const igual = maisUsada(porBruto.get(i.tipo + '|' + semAcentoApp(i.bruto)));
    if (igual) { const [desc, categoria] = JSON.parse(igual); return { desc, categoria }; }
    // 2º: mesma descrição ou mesmo estabelecimento → categoria mais usada nele.
    const categoria = maisUsada(porDesc.get(i.tipo + '|' + semAcentoApp(i.desc)))
      || maisUsada(porChave.get(i.tipo + '|' + chaveMov(i.desc))) || maisUsada(porChave.get(i.tipo + '|' + chaveMov(i.bruto)))
      || maisUsada(porInicio.get(i.tipo + '|' + inicioMov(i.desc))) || maisUsada(porInicio.get(i.tipo + '|' + inicioMov(i.bruto)));
    return categoria ? { categoria } : null;
  };
}
function planoTriagemAuto() {
  const sugerir = memoriaHistorico();
  return ui.triagem.itens.filter(i => i.estado === 'pendente').map(i => {
    const s = sugerir(i) || {}, novo = {};
    if (s.categoria && !i.catManual && s.categoria !== i.categoria) novo.categoria = s.categoria;
    if (s.desc && !i.descManual && s.desc !== i.desc) novo.desc = s.desc;
    const avisos = (i.avisos || []).join(' '), teste = { ...i, ...novo };
    let acao = 'confirmar', motivo = '';
    if (/se anulam/.test(avisos)) { acao = 'ignorar'; motivo = 'Estorno (envio e devolução se anulam)'; }
    else if (/fatura/i.test(avisos)) { acao = 'revisar'; motivo = 'Pagamento de fatura'; }
    else if (i.forcar || parecido(teste)) { acao = 'revisar'; motivo = 'Valor já lançado'; }
    else if (!String(teste.desc || '').trim() || !Math.abs(parseValor(teste.valor)) || !/^\d{4}-\d{2}-\d{2}$/.test(teste.data || '')) { acao = 'revisar'; motivo = 'Faltam dados'; }
    return { i, novo, acao, motivo };
  });
}
function modalTriagemAuto() {
  const plano = planoTriagemAuto();
  if (!plano.length) return alert('Não há lançamentos pendentes nesta triagem.');
  const conf = plano.filter(x => x.acao === 'confirmar'), ign = plano.filter(x => x.acao === 'ignorar'), rev = plano.filter(x => x.acao === 'revisar');
  const mudaram = plano.filter(x => x.novo.categoria || x.novo.desc).length;
  const porCat = {};
  conf.forEach(x => { const c = x.novo.categoria || x.i.categoria || 'Outros'; porCat[c] = (porCat[c] || 0) + 1; });
  const motivos = {};
  rev.forEach(x => { motivos[x.motivo] = (motivos[x.motivo] || 0) + 1; });
  abrirModal(`
    <h2>⚡ Triagem automática</h2>
    <p class="muted" style="margin-top:-6px">Com base no seu histórico de lançamentos, o app vai:</p>
    <form class="form" data-f="modal">
      <div class="full auto-resumo">
        <div class="auto-linha ok"><b>${conf.length}</b><span>${conf.length === 1 ? 'lançamento confirmado' : 'lançamentos confirmados'}${mudaram ? ` · ${mudaram} com categoria ou descrição refeita pelo histórico` : ''}</span></div>
        ${ign.length ? `<div class="auto-linha"><b>${ign.length}</b><span>${ign.length === 1 ? 'ignorado' : 'ignorados'}: estornos que se anulam</span></div>` : ''}
        ${rev.length ? `<div class="auto-linha revisar"><b>${rev.length}</b><span>para você revisar: ${Object.entries(motivos).map(([m, n]) => `${esc(m.toLowerCase())} (${n})`).join(', ')}</span></div>` : ''}
      </div>
      ${conf.length ? `<div class="full"><span class="rotulo">Como vai ficar</span>
        <div class="chips">${Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<span class="chip">${iconeCat(c, 'despesa')} ${esc(c)} <b>${n}</b></span>`).join('')}</div></div>` : ''}
      <p class="muted small full" style="margin:0">Dá para desfazer depois: cada um pode ser desfeito em "Já revisados", ou a importação inteira pode ser cancelada.</p>
      <div class="modal-acoes full"><button type="button" class="btn" data-a="fecharModal">Cancelar</button>
        <button class="btn pri" ${conf.length || ign.length ? '' : 'disabled'}>Fazer triagem automática</button></div>
    </form>`, () => {
    const atual = planoTriagemAuto();   // recalcula na hora de aplicar
    atual.forEach(x => Object.assign(x.i, x.novo));
    atual.forEach(x => { if (x.acao === 'confirmar') confirmarItem(x.i); else if (x.acao === 'ignorar') x.i.estado = 'ignorado'; });
    const n = atual.filter(x => x.acao === 'confirmar').length, r = atual.filter(x => x.acao === 'revisar').length;
    reagir('feliz', r ? `${n} lançados! Faltam ${r} para revisar 👀` : 'Triagem automática feita! ⚡🐼');
  });
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
        <p class="sub" style="margin:0"><span class="selo">${esc(t.banco)} · ${t.meio === 'credito' ? 'cartão de crédito' : 'conta (débito)'}${t.titular ? ' · ' + esc(t.titular) : ''}</span>
          ${infoExtrato(t.meta || {})}
          ${esc(t.arquivo)} · nada entra nas suas finanças sem você confirmar.</p></div>
      <div class="acoes">${pend.length ? '<button class="btn pri" data-a="triAuto">⚡ Triagem automática</button>' : ''}
        <button class="btn perigo" data-a="cancelarImportacao">Cancelar importação</button></div>
    </div>
    <div class="card tri-progresso">
      <div class="linha" style="margin:0 0 8px"><strong>${feitos} de ${total} revisados</strong>
        <span class="muted">${ok.length} ${ok.length === 1 ? 'confirmado' : 'confirmados'} · ${ign.length} ${ign.length === 1 ? 'ignorado' : 'ignorados'}${dup.length ? ` · ${dup.length} já ${dup.length === 1 ? 'importado' : 'importados'}` : ''}</span></div>
      <div class="barra"><i style="width:${total ? feitos / total * 100 : 0}%"></i></div>
    </div>
    ${pend.length ? `<div class="tri-lista">${pend.slice(0, ui.triMostrar || 10).map(cartaoTriagem).join('')}</div>
      ${pend.length > (ui.triMostrar || 10) ? `<div class="acoes" style="justify-content:center;margin:-2px 0 16px">
        <button class="btn" data-a="triMais">Mostrar mais (${pend.length - (ui.triMostrar || 10)} restantes)</button></div>` : ''}`
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
  // De quem é a conta: lembra o último titular usado para este banco + tipo; senão, quem está logado.
  const titular = (ultimo.titulares || {})[`${banco}|${meio}`] || ultimo.titular || App.usuario?.nome?.split(' ')[0] || '';
  const opcao = (v, emoji, titulo, sub) => `<label class="escolha"><input type="radio" name="meio" value="${v}" ${meio === v ? 'checked' : ''} required>
    <span><b>${emoji} ${titulo}</b><small>${sub}</small></span></label>`;
  abrirModal(`
    <h2>De onde é este extrato?</h2>
    <p class="muted small" style="margin:-6px 0 14px">${esc(arq.nome)}</p>
    <form class="form" data-f="modal">
      <label class="full">Banco<input name="banco" list="bancos" required value="${esc(banco)}" placeholder="Ex.: Inter, Bradesco, Nubank" autocomplete="off"></label>
      <datalist id="bancos">${Extrato.BANCOS.map(b => `<option value="${b}">`).join('')}</datalist>
      <label class="full">De quem é a conta<input name="titular" list="titulares" required value="${esc(titular)}" placeholder="Ex.: Gustavo, Conjunta" autocomplete="off"></label>
      <datalist id="titulares">${titulares().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="full"><span class="rotulo">Tipo de extrato</span>
        <div class="escolhas">
          ${opcao('debito', '🏦', 'Conta / débito', 'Extrato da conta: Pix, boletos, compras no débito')}
          ${opcao('credito', '💳', 'Cartão de crédito', 'Fatura do cartão: compras no crédito')}
        </div></div>
      ${det.banco ? '<p class="muted small full" style="margin:0">Reconheci pelo arquivo. Confira e corrija se precisar.</p>' : ''}
      <div class="modal-acoes full"><button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Continuar</button></div>
    </form>`, d => {
    const opc = { banco: d.banco.trim(), meio: d.meio === 'credito' ? 'credito' : 'debito', titular: d.titular.trim() };
    try {
      const lembrar = { ...ultimo, ...opc, titulares: { ...(ultimo.titulares || {}), [`${opc.banco}|${opc.meio}`]: opc.titular } };
      localStorage.setItem('apg-extrato', JSON.stringify(lembrar));
    } catch (e) { /* sem armazenamento */ }
    let itens = [], meta = {};
    try {
      const lidos = Extrato.lerArquivo(arq.nome, arq.texto, opc);
      meta = lidos.meta || {};
      itens = Extrato.preparar(lidos, { ...opc, lancamentos: db.lancamentos, meuNome: App.usuario?.nome,
        categorias: listaCategorias().map(c => c.nome) });
    } catch (e) { console.error(e); }
    if (!itens.length) return alert('Não encontrei lançamentos neste arquivo. Use o extrato em OFX ou CSV baixado do seu banco.');
    ui.triagem = { arquivo: arq.nome, ...opc, itens, lote: uid(), em: hoje(), meta };
    ui.naTriagem = true; ui.aba = 'extratos'; ui.plano = null;
  });
}
const itemTriagem = id => ui.triagem?.itens.find(i => i.id === id);

function vPlanos() {
  if (ui.plano && plano(ui.plano)) return vPlano(plano(ui.plano));
  return `
    ${avisoCidadesGlobal()}
    <div class="topo"><div><h1>Planos e metas</h1><p class="sub" style="margin:0">Viagens, passeios, casamento, casa, carro…</p></div>
      <button class="btn pri" data-a="novoPlano">+ Novo plano</button></div>
    <div class="planos" style="margin-bottom:14px">${cartaoCidades()}</div>
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

// Agência/conta, saldo final e quando o extrato foi gerado (o que o arquivo trouxer).
function infoExtrato(m) {
  const p = [];
  if (m.agencia || m.conta) p.push(`Ag ${esc(m.agencia || '—')} · Conta ${esc(m.conta || '—')}`);
  if (typeof m.saldoFinal === 'number') p.push(`saldo final ${din(m.saldoFinal)}${m.saldoData ? ' em ' + fmtData(m.saldoData) : ''}`);
  const gerado = m.gerado || (m.geradoEm ? m.geradoEm + (m.geradoHora ? ' ' + m.geradoHora : '') : '');
  if (gerado) p.push(`gerado em ${fmtData(gerado.slice(0, 10))}${gerado.length > 10 ? ' às ' + gerado.slice(11) : ''}`);
  return p.length ? `<span class="info-ext">${p.join(' · ')}</span>` : '';
}

// Importações de extrato já feitas (agrupadas pelo "lote"), com opção de desfazer a importação inteira.
function lotesImportados() {
  const m = new Map();
  db.lancamentos.filter(l => l.lote).forEach(l => {
    const g = m.get(l.lote) || { id: l.lote, arquivo: l.loteArquivo || 'Extrato', em: l.loteEm || '', banco: l.banco, meio: l.meio, titular: l.titular, itens: [],
      meta: { agencia: l.loteAgencia, conta: l.loteConta, saldoFinal: l.loteSaldo, saldoData: l.loteSaldoData, gerado: l.loteGerado } };
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
          <span class="mov-txt"><strong>${esc(g.banco || 'Banco não informado')} · ${meioRot(g.meio)}${g.titular ? ` <span class="titular">${esc(g.titular)}</span>` : ''}</strong>
            <small>${esc(g.arquivo)}</small>${infoExtrato(g.meta) ? `<small>${infoExtrato(g.meta)}</small>` : ''}
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
        <div class="card"><h2>Categorias</h2>
      <p class="muted">Crie categorias e escolha um emoji ou uma imagem para cada uma.</p>
      <button class="btn" data-a="aba" data-v="categorias">🏷️ Gerenciar categorias</button></div>
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
  fecharSeletor();
  $('#modal-body').innerHTML = html;
  aoSalvarModal = aoSalvar;
  modal.showModal();
  $('#modal-body input:not([type=hidden])')?.focus();
}
function fecharModal() { modal.close(); aoSalvarModal = null; }
modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); });

/* ---------- categorias: seleção, tela e cadastro ---------- */
/* Seletor de categoria: no lugar do <select> nativo (que não dá para deixar bonito), um botão que abre
   uma lista com ícones, em ordem alfabética e com busca. O valor fica num <input type="hidden">, que
   dispara "change" ao escolher — então o resto do app trata igual a um campo comum.
   fonte: "tipo:despesa" | "tipo:receita" (categorias do tipo) ou "mover:<nome>" (todas menos essa). */
function seletorCat(attrs, fonte, valor, vazio = 'Escolha a categoria') {
  const tipo = fonte.startsWith('tipo:') ? fonte.slice(5) : '';
  return `<div class="seletor" data-fonte="${esc(fonte)}" data-vazio="${esc(vazio)}">
    <input type="hidden" ${attrs} value="${esc(valor || '')}">
    <button type="button" class="seletor-btn" data-a="abrirSeletor" aria-haspopup="listbox">${conteudoSeletor(valor, tipo, vazio)}</button>
  </div>`;
}
function conteudoSeletor(valor, tipo, vazio) {
  return valor
    ? `<span class="seletor-ic">${iconeCat(valor, tipo || 'despesa')}</span><span class="seletor-txt">${esc(valor)}</span>${IC.seta}`
    : `<span class="seletor-ic vazio">🏷️</span><span class="seletor-txt muted">${esc(vazio)}</span>${IC.seta}`;
}

let seletorAtivo = null;   // { el: .seletor, painel }
function fecharSeletor() {
  if (!seletorAtivo) return;
  const { painel, el } = seletorAtivo; seletorAtivo = null;
  try { painel.hidePopover?.(); } catch (e) { /* já fechado */ }
  painel.remove();
  el.querySelector('.seletor-btn')?.setAttribute('aria-expanded', 'false');
}
function abrirSeletor(el) {
  if (seletorAtivo && seletorAtivo.el === el) return fecharSeletor();
  fecharSeletor();
  const fonte = el.dataset.fonte, atual = el.querySelector('input').value;
  let grupos;
  if (fonte.startsWith('tipo:')) {
    const tipo = fonte.slice(5), nomes = nomesCats(tipo);
    if (atual && !nomes.includes(atual)) nomes.unshift(atual);
    grupos = [['', nomes.map(n => ({ nome: n, ic: iconeCat(n, tipo) }))]];
  } else if (fonte === 'periodo') {
    // Revisão: mostra quantos lançamentos cada categoria tem no período escolhido (De/Até do formulário).
    const f = el.closest('form'), de = (f && f.de && f.de.value) || '0000-01-01', ate = (f && f.ate && f.ate.value) || '9999-12-31';
    const n = {};
    db.lancamentos.forEach(l => { if (l.data >= de && l.data <= ate) n[l.categoria] = (n[l.categoria] || 0) + 1; });
    const todas = listaCategorias().map(x => ({ nome: x.nome, ic: iconeCat(x.nome, x.tipo === 'receita' ? 'receita' : 'despesa') }));
    Object.keys(n).forEach(nome => { if (!todas.some(x => x.nome === nome)) todas.push({ nome, ic: '🏷️' }); });   // usadas sem cadastro
    todas.forEach(x => { x.n = n[x.nome] || 0; });
    const com = todas.filter(x => x.n).sort((a, b) => b.n - a.n || ordemAlfa(a.nome, b.nome));
    grupos = [[`Com lançamentos no período (${com.length})`, com], ['Sem lançamentos no período', todas.filter(x => !x.n)]].filter(([, l]) => l.length);
  } else {
    const origem = fonte.slice(6), destinos = listaCategorias().filter(x => x.nome !== origem);
    grupos = [['despesa', 'Despesas'], ['receita', 'Receitas'], ['ambos', 'Servem para as duas']]
      .map(([t, rot]) => [rot, destinos.filter(x => x.tipo === t).map(x => ({ nome: x.nome, ic: iconeCat(x.nome, t === 'ambos' ? 'despesa' : t) }))])
      .filter(([, l]) => l.length);
  }
  const painel = document.createElement('div');
  painel.className = 'seletor-painel';
  painel.setAttribute('popover', 'manual');
  painel.innerHTML = `
    <div class="seletor-busca"><input type="search" placeholder="Buscar categoria" aria-label="Buscar categoria" autocomplete="off"></div>
    <div class="seletor-lista" role="listbox">${grupos.map(([rot, l]) => (rot ? `<div class="seletor-grupo">${rot}</div>` : '') +
      l.map(o => `<button type="button" class="seletor-op ${o.nome === atual ? 'on' : ''} ${o.n === 0 ? 'sem-mov' : ''}" role="option" aria-selected="${o.nome === atual}"
        data-a="escolherOpcao" data-v="${esc(o.nome)}" data-busca="${esc(semAcentoApp(o.nome))}">
        <span class="seletor-ic">${o.ic}</span><span class="seletor-txt">${esc(o.nome)}</span>
        ${o.n !== undefined ? `<span class="seletor-n" title="Lançamentos no período">${o.n}</span>` : ''}<span class="seletor-ok">✓</span></button>`).join('')).join('')}
      <p class="seletor-nada muted small" hidden>Nenhuma categoria com esse nome.</p></div>
    ${fonte.startsWith('tipo:') ? `<button type="button" class="seletor-gerenciar" data-a="irCategorias">🏷️ Criar ou editar categorias</button>` : ''}`;
  // Na frente de tudo (inclusive das janelas): top layer do navegador quando disponível.
  // Dentro de uma janela aberta, o painel precisa ficar dentro dela (o resto da página fica bloqueado).
  (el.closest('dialog') || document.body).appendChild(painel);
  try { painel.showPopover?.(); } catch (e) { /* sem suporte */ }
  seletorAtivo = { el, painel };
  el.querySelector('.seletor-btn').setAttribute('aria-expanded', 'true');
  posicionarSeletor();
  const busca = painel.querySelector('input');
  busca.addEventListener('input', () => {
    const q = semAcentoApp(busca.value); let algum = false;
    painel.querySelectorAll('.seletor-op').forEach(b => { const v = !q || b.dataset.busca.includes(q); b.hidden = !v; algum = algum || v; });
    painel.querySelectorAll('.seletor-grupo').forEach(g => { let n = g.nextElementSibling, v = false; while (n && n.classList.contains('seletor-op')) { v = v || !n.hidden; n = n.nextElementSibling; } g.hidden = !v; });
    painel.querySelector('.seletor-nada').hidden = algum;
  });
  busca.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); painel.querySelector('.seletor-op:not([hidden])')?.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); painel.querySelector('.seletor-op:not([hidden])')?.focus(); }
  });
  painel.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const ops = [...painel.querySelectorAll('.seletor-op:not([hidden])')], i = ops.indexOf(document.activeElement);
    if (i < 0) return; e.preventDefault();
    (ops[i + (e.key === 'ArrowDown' ? 1 : -1)] || (e.key === 'ArrowUp' ? busca : ops[i])).focus();
  });
  // Mostra a categoria atual no meio da lista (rolando só a lista, nunca a página).
  const marcado = painel.querySelector('.seletor-op.on'), lista = painel.querySelector('.seletor-lista');
  if (marcado) lista.scrollTop = marcado.offsetTop - lista.clientHeight / 2 + marcado.offsetHeight / 2;
  if (matchMedia('(hover: hover)').matches) busca.focus({ preventScroll: true });   // no celular não abre o teclado sozinho
}
// Computador: abre colado ao campo (para cima se não couber). Celular: sobe de baixo, como folha.
function posicionarSeletor() {
  if (!seletorAtivo) return;
  const { el, painel } = seletorAtivo, st = painel.style;
  if (innerWidth <= 600) { painel.classList.add('folha'); st.left = st.top = st.width = ''; return; }
  const r = el.querySelector('.seletor-btn').getBoundingClientRect();
  const largura = Math.max(r.width, 280), alturaMax = 360;
  const embaixo = innerHeight - r.bottom - 12, emcima = r.top - 12;
  st.width = largura + 'px';
  st.left = Math.min(Math.max(8, r.left), innerWidth - largura - 8) + 'px';
  if (embaixo >= Math.min(alturaMax, 240) || embaixo >= emcima) { st.top = (r.bottom + 6) + 'px'; st.bottom = 'auto'; st.maxHeight = Math.min(alturaMax, embaixo) + 'px'; }
  else { st.top = 'auto'; st.bottom = (innerHeight - r.top + 6) + 'px'; st.maxHeight = Math.min(alturaMax, emcima) + 'px'; }
}
function escolherOpcao(valor) {
  if (!seletorAtivo) return;
  const { el } = seletorAtivo, inp = el.querySelector('input');
  fecharSeletor();
  const fonte = el.dataset.fonte, tipo = fonte.startsWith('tipo:') ? fonte.slice(5) : '';
  el.querySelector('.seletor-btn').innerHTML = conteudoSeletor(valor, tipo, el.dataset.vazio);
  if (inp.value !== valor) { inp.value = valor; inp.dispatchEvent(new Event('change', { bubbles: true })); }
  el.querySelector('.seletor-btn').focus({ preventScroll: true });
}
document.addEventListener('pointerdown', e => {
  if (seletorAtivo && !seletorAtivo.painel.contains(e.target) && !seletorAtivo.el.contains(e.target)) fecharSeletor();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && seletorAtivo) { e.preventDefault(); e.stopPropagation(); const b = seletorAtivo.el.querySelector('.seletor-btn'); fecharSeletor(); b.focus(); } }, true);
addEventListener('resize', () => posicionarSeletor());
// Rolou a página ou a janela com a lista aberta: a lista acompanha o campo.
let seletorQuadro = 0;
document.addEventListener('scroll', e => {
  if (!seletorAtivo || seletorAtivo.painel.contains(e.target) || seletorQuadro) return;
  seletorQuadro = requestAnimationFrame(() => { seletorQuadro = 0; posicionarSeletor(); });
}, true);

function vCategorias() {
  const lista = listaCategorias();
  const uso = {};
  db.lancamentos.forEach(l => { uso[l.categoria] = (uso[l.categoria] || 0) + 1; });
  const cartao = c => `<button class="cat-card" data-a="editarCat" data-v="${esc(c.id)}" data-busca="${esc(semAcentoApp(c.nome))}">
      <span class="cat-ic">${c.img ? `<img class="cat-img" src="${esc(c.img)}" alt="">` : esc(c.emoji || '🏷️')}</span>
      <span class="cat-nome">${esc(c.nome)}</span>
      <small>${uso[c.nome] ? `${uso[c.nome]} ${uso[c.nome] === 1 ? 'lançamento' : 'lançamentos'}` : 'sem lançamentos'}</small>
    </button>`;
  const soltas = Object.keys(uso).filter(n => n && !lista.some(c => c.nome === n));
  const grupo = (titulo, itens) => itens.length ? `<section class="cat-grupo"><div class="topo secao"><h2>${titulo}</h2></div><div class="cats-grid">${itens.map(cartao).join('')}</div></section>` : '';
  return `
    <div class="topo">
      <div><button class="btn mini voltar" data-a="aba" data-v="financas">${IC.voltar} Finanças</button>
        <h1 style="margin-top:10px">Categorias</h1>
        <p class="sub" style="margin:0">Toque numa categoria para mudar o nome, o tipo ou o ícone.</p></div>
      <div class="acoes"><button class="btn" data-a="aba" data-v="revisao">🔎 Revisar lançamentos</button>
        <button class="btn pri" data-a="novaCat">+ Nova categoria</button></div>
    </div>
    ${App.modo === 'nuvem' && App.semNuvem.categorias ? `<p class="tri-aviso forte" style="margin:0 0 16px">⚠️ As categorias estão salvas só neste aparelho:
      ${App.semNuvem.categorias === 'regras' ? 'falta atualizar as regras do Firebase (veja o CONFIGURAR.md).' : 'não foi possível falar com a nuvem.'}</p>` : ''}
    <input id="cat-busca" class="busca-grande" type="search" placeholder="🔎 Pesquisar categoria" autocomplete="off" value="${esc(ui.catBusca || '')}">
    <div class="vazio cat-nada" hidden>${panda('preguica')}Nenhuma categoria com esse nome.
      <div class="acoes" style="justify-content:center;margin-top:12px"><button class="btn pri" data-a="novaCatBusca">+ Criar essa categoria</button></div></div>
    ${grupo('Despesas', lista.filter(c => c.tipo === 'despesa'))}
    ${grupo('Receitas', lista.filter(c => c.tipo === 'receita'))}
    ${grupo('Servem para os dois', lista.filter(c => c.tipo === 'ambos'))}
    ${soltas.length ? `<section class="cat-grupo"><div class="topo secao"><h2>Usadas nos lançamentos, mas sem cadastro</h2></div>
      <p class="muted small" style="margin-top:-6px">Cadastre para escolher um ícone e ela aparecer na lista.</p>
      <div class="cats-grid">${soltas.map(n => `<button class="cat-card solta" data-a="cadastrarCat" data-v="${esc(n)}" data-busca="${esc(semAcentoApp(n))}">
        <span class="cat-ic">🏷️</span><span class="cat-nome">${esc(n)}</span><small>${uso[n]} ${uso[n] === 1 ? 'lançamento' : 'lançamentos'} · cadastrar</small></button>`).join('')}</div></section>` : ''}`;
}
// Pesquisa da tela de categorias: esconde os cartões que não batem, sem redesenhar a tela (não perde o foco).
function filtrarCategorias() {
  const q = semAcentoApp(ui.catBusca || ''); let algum = false;
  document.querySelectorAll('.cat-grupo').forEach(g => {
    let vis = 0;
    g.querySelectorAll('.cat-card').forEach(c => { const ok = !q || c.dataset.busca.includes(q); c.hidden = !ok; if (ok) vis++; });
    g.hidden = !vis; algum = algum || vis > 0;
  });
  const nada = document.querySelector('.cat-nada'); if (nada) nada.hidden = algum;
}

const EMOJIS = ['🏠', '🍽️', '🛒', '🍕', '🍔', '☕', '🍺', '🍿', '🚌', '🚗', '⛽', '🅿️', '✈️', '🏖️', '🏨', '🎫',
  '💊', '🏥', '🦷', '💈', '💅', '👕', '👟', '🛍️', '🎁', '💍', '👶', '🐶', '🐱', '📚', '🎓', '💻', '📱', '📺', '🎮',
  '🎵', '🎬', '🎉', '⚽', '🏋️', '🧾', '💡', '💧', '🔥', '🌐', '🔧', '🧹', '🌱', '🏦', '💳', '💼', '💰', '💵', '📈',
  '✨', '↩️', '🔄', '📦', '❤️', '⭐', '🐼', '🏷️'];
const primeiroEmoji = v => {
  v = String(v || '').trim(); if (!v) return '';
  try { return [...new Intl.Segmenter('pt', { granularity: 'grapheme' }).segment(v)][0].segment; } catch (e) { return Array.from(v)[0]; }
};

function modalCategoria(c, nomeInicial) {
  const nova = !c;
  c = c || { nome: nomeInicial || '', tipo: 'despesa', emoji: '🏷️', img: '' };
  const fixa = !nova && CATS_FIXAS.includes(c.nome);
  // Mover em massa: todos os lançamentos desta categoria (ou do nome solto, sem cadastro) para outra.
  const origem = nova ? (nomeInicial || '') : c.nome;
  const usados = origem ? db.lancamentos.filter(l => l.categoria === origem).length : 0;
  const destinos = listaCategorias().filter(x => x.nome !== origem);
  const mover = usados ? `<div class="full mover"><span class="rotulo">Mover lançamentos</span>
      <p class="muted small" style="margin:0 0 8px">${usados === 1 ? '1 lançamento usa' : `${usados} lançamentos usam`} "${esc(origem)}". Mande ${usados === 1 ? 'ele' : 'todos'} para outra categoria de uma vez:</p>
      <div class="mover-linha">${seletorCat('id="mover-para" aria-label="Categoria de destino"', 'mover:' + origem, '', 'Escolha o destino')}
        <button type="button" class="btn" data-a="moverLancs" data-v="${esc(origem)}">Mover ${usados === 1 ? '' : 'os ' + usados}</button></div>
    </div>` : '';
  const tipoOp = (v, rot) => `<label class="escolha"><input type="radio" name="tipo" value="${v}" ${c.tipo === v ? 'checked' : ''} ${fixa ? 'disabled' : ''}><span><b>${rot}</b></span></label>`;
  abrirModal(`
    <h2>${nova ? (usados ? `"${esc(origem)}" sem cadastro` : 'Nova categoria') : 'Editar categoria'}</h2>
    <form class="form" data-f="modal">
      ${nova ? mover + (usados ? '<p class="muted small full" style="margin:0">Ou cadastre como categoria, com um ícone:</p>' : '') : ''}
      <div class="full cat-previa"><span class="cat-ic grande" id="cat-prev">${c.img ? `<img class="cat-img" src="${esc(c.img)}" alt="">` : esc(c.emoji || '🏷️')}</span>
        <div><b id="cat-prev-nome">${esc(c.nome) || 'Nome da categoria'}</b><small class="muted">Assim ela aparece no extrato</small></div></div>
      <label class="full">Nome<input name="nome" required maxlength="40" value="${esc(c.nome)}" ${fixa ? 'readonly' : ''} placeholder="Ex.: Pets, Farmácia, Presentes" autocomplete="off"></label>
      ${fixa ? `<p class="muted small full" style="margin:-6px 0 0">Esta categoria é usada pelo app: dá para trocar só o ícone.</p><input type="hidden" name="tipo" value="${c.tipo}">` : ''}
      <div class="full"><span class="rotulo">Serve para</span>
        <div class="escolhas tres">${tipoOp('despesa', '↓ Despesa')}${tipoOp('receita', '↑ Receita')}${tipoOp('ambos', '↕ As duas')}</div></div>
      <div class="full"><span class="rotulo">Ícone</span>
        <div class="emojis">${EMOJIS.map(e => `<button type="button" class="emo ${!c.img && e === c.emoji ? 'on' : ''}" data-a="escolherEmoji" data-v="${e}">${e}</button>`).join('')}</div>
        <div class="emo-proprio">
          <label>Ou use o seu emoji<input name="emojiProprio" maxlength="16" placeholder="Toque e escolha no teclado 😀" autocomplete="off"></label>
          <button type="button" class="btn" data-a="imagemCat">🖼️ Usar uma imagem</button>
        </div></div>
      ${nova ? '' : mover}
      <input type="hidden" name="emoji" value="${esc(c.emoji || '🏷️')}"><input type="hidden" name="img" value="${esc(c.img || '')}">
      <div class="modal-acoes full">
        ${!nova && !fixa ? `<button type="button" class="btn perigo" data-a="excluirCat" data-v="${esc(c.id)}" style="margin-right:auto">Excluir</button>` : ''}
        <button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => salvarCategoria(c, nova, d));
}

// Atualiza a prévia do ícone na janela de categoria.
function previaCat() {
  const f = $('#modal-body form'); if (!f) return;
  $('#cat-prev').innerHTML = f.img.value ? `<img class="cat-img" src="${esc(f.img.value)}" alt="">` : esc(f.emoji.value || '🏷️');
  $('#cat-prev-nome').textContent = f.nome.value.trim() || 'Nome da categoria';
  f.querySelectorAll('.emo').forEach(b => b.classList.toggle('on', !f.img.value && b.dataset.v === f.emoji.value));
}

function salvarCategoria(c, nova, d) {
  const nome = d.nome.trim().replace(/\s+/g, ' ');
  const tipo = ['despesa', 'receita', 'ambos'].includes(d.tipo) ? d.tipo : c.tipo || 'despesa';
  if (!nome) { alert('Dê um nome para a categoria.'); return false; }
  const conflito = listaCategorias().find(x => x.id !== c.id && semAcentoApp(x.nome) === semAcentoApp(nome) &&
    (x.tipo === 'ambos' || tipo === 'ambos' || x.tipo === tipo));
  if (conflito) { alert(`Já existe a categoria "${conflito.nome}".`); return false; }
  const dados = { nome, tipo, emoji: d.emoji || '🏷️', img: d.img || '' };
  if (!nova && c.nome !== nome) {
    // Renomear: os lançamentos (e a triagem) que usavam o nome antigo passam a usar o novo.
    const muda = l => l.categoria === c.nome && (tipo === 'ambos' || l.tipo === tipo);
    db.lancamentos.filter(muda).forEach(l => { l.categoria = nome; });
    ui.triagem?.itens.filter(muda).forEach(i => { i.categoria = nome; });
  }
  db.categorias = db.categorias || [];
  const id = nova ? 'cat-' + uid() : c.id;
  const i = db.categorias.findIndex(x => x.id === id);
  const reg = { id, ...dados };
  if (i >= 0) db.categorias[i] = reg; else db.categorias.push(reg);
  salvar(); render();
  reagir('feliz', nova ? 'Categoria nova! 🏷️' : 'Categoria atualizada! ✨');
}

// Lê uma imagem escolhida pelo usuário e reduz para um ícone quadrado pequeno (cabe no banco de dados).
function imagemParaIcone() {
  return new Promise(res => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return res('');
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        const t = 96, cv = Object.assign(document.createElement('canvas'), { width: t, height: t }), ctx = cv.getContext('2d');
        const lado = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, t, t);
        URL.revokeObjectURL(url);
        let dado = cv.toDataURL('image/webp', .85);
        if (!dado.startsWith('data:image/webp')) dado = cv.toDataURL('image/png');
        res(dado);
      };
      img.onerror = () => { URL.revokeObjectURL(url); alert('Não consegui abrir esta imagem.'); res(''); };
      img.src = url;
    };
    inp.click();
  });
}

function modalLanc(l, tipoInicial) {
  const novo = !l;
  l = l || { tipo: tipoInicial === 'receita' ? 'receita' : 'despesa', desc: '', categoria: '', valor: '', data: ui.aba === 'financas' && ui.mes !== mesAtual() ? ui.mes + '-01' : hoje(), fixo: false };
  abrirModal(`
    <h2>${novo ? 'Novo lançamento' : 'Editar lançamento'}</h2>
    ${!novo && l.bruto ? `<div class="lanc-orig"><small class="muted">No extrato${l.hora ? ' · ' + l.hora : ''}${rotuloOrigem(l) ? ' · ' + esc(rotuloOrigem(l)) : ''}</small><span>${esc(l.bruto)}</span>${linhaDetalhes(l)}</div>` : ''}
    <form class="form" data-f="modal">
      <label>Tipo<select name="tipo" id="lanc-tipo">
        <option value="despesa" ${l.tipo === 'despesa' ? 'selected' : ''}>Despesa</option>
        <option value="receita" ${l.tipo === 'receita' ? 'selected' : ''}>Receita</option></select></label>
      <label>Valor (R$)<input name="valor" type="number" step="0.01" min="0" required value="${l.valor}"></label>
      <label class="full">Descrição<input name="desc" required value="${esc(l.desc)}" placeholder="Ex.: Aluguel, mercado, salário"></label>
      <label>Categoria<span id="lanc-cat-caixa">${seletorCat('name="categoria" id="lanc-cat"', 'tipo:' + l.tipo, l.categoria || 'Outros')}</span>
        <button type="button" class="link mini-link" data-a="irCategorias">Criar ou editar categorias</button></label>
      <label>Data<input name="data" type="date" required value="${l.data}"></label>
      <label class="full" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="fixo" ${l.fixo ? 'checked' : ''} style="margin:0"> Lançamento fixo (repete todo mês)</label>
      <div class="modal-acoes full"><button type="button" class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri">Salvar</button></div>
    </form>`, d => {
    const dados = { tipo: d.tipo, desc: d.desc.trim(), categoria: d.categoria.trim() || 'Outros', valor: parseValor(d.valor), data: d.data, fixo: !!d.fixo };
    if (novo) db.lancamentos.push({ id: uid(), ...dados }); else Object.assign(l, dados);
    ui.mes = dados.data.slice(0, 7);
    if (novo && dados.tipo === 'receita') reagir('feliz', 'Oba! Dinheiro entrando! 💰', 'Uhuul, receita nova! 🎉', 'Rico! 🤑🐼');
    else if (novo && dados.valor >= 1000) reagir('bravo', 'Eita! Que gastão! 😤', 'Mil reais?! Hmpf! 😤');
    else if (novo) reagir('triste', 'Lá se vai o dinheirinho… 😢', 'Mais uma despesa… 🥲');
  });
  // Trocar o tipo troca a lista de categorias do seletor (mantém a escolhida).
  $('#lanc-tipo').onchange = () => { $('#lanc-cat-caixa').innerHTML = seletorCat('name="categoria" id="lanc-cat"', 'tipo:' + $('#lanc-tipo').value, $('#lanc-cat').value); };
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
  const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Fixo', 'Banco', 'Meio', 'Titular']];
  db.lancamentos.slice().sort((a, b) => a.data.localeCompare(b.data)).forEach(l =>
    linhas.push([fmtData(l.data), l.tipo, l.desc, l.categoria, (l.tipo === 'despesa' ? -l.valor : l.valor).toFixed(2).replace('.', ','), l.fixo ? 'sim' : '', l.banco || '', MEIOS[l.meio] || '', l.titular || '']));
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
    confirmarItem(i);
    if (!ui.triagem.itens.some(x => x.estado === 'pendente')) reagir('feliz', 'Extrato em dia! 🎉', 'Triagem concluída! ✨');
  },
  triAuto: () => modalTriagemAuto(),
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
  triMais: () => { ui.triMostrar = (ui.triMostrar || 10) + 10; },
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
  abrirSeletor: (v, el) => { abrirSeletor(el.closest('.seletor')); return Promise.resolve(); },
  escolherOpcao: v => { escolherOpcao(v); return Promise.resolve(); },
  novaCat: () => modalCategoria(),
  novaCatBusca: () => modalCategoria(null, (ui.catBusca || '').trim()),
  cadastrarCat: v => modalCategoria(null, v),
  editarCat: v => { const c = listaCategorias().find(x => x.id === v); if (c) modalCategoria(c); },
  irCategorias: () => { fecharSeletor(); fecharModal(); ui.aba = 'categorias'; ui.plano = null; ui.naTriagem = false; },
  escolherEmoji: v => { const f = $('#modal-body form'); if (!f) return; f.emoji.value = v; f.img.value = ''; f.emojiProprio.value = ''; previaCat(); },
  imagemCat: () => imagemParaIcone().then(dado => { const f = $('#modal-body form'); if (dado && f) { f.img.value = dado; previaCat(); } }),
  moverLancs: origem => {
    const destino = $('#mover-para')?.value; if (!destino) return alert('Escolha para qual categoria mover.');
    if (destino === origem) return;
    const cat = catPorNome(destino);
    const todos = db.lancamentos.filter(l => l.categoria === origem);
    const cabem = todos.filter(l => !cat || serveTipo(cat, l.tipo)), ficam = todos.length - cabem.length;
    if (!cabem.length) return alert(`"${destino}" não serve para ${todos[0].tipo === 'receita' ? 'receitas' : 'despesas'}. Escolha outra categoria.`);
    const avisoTipo = ficam ? `\n\n${ficam === 1 ? '1 lançamento fica' : `${ficam} lançamentos ficam`} em "${origem}", porque "${destino}" só serve para ${cat.tipo === 'despesa' ? 'despesas' : 'receitas'}.` : '';
    if (!confirm(`Mover ${cabem.length === 1 ? '1 lançamento' : `${cabem.length} lançamentos`} de "${origem}" para "${destino}"?${avisoTipo}`)) return;
    cabem.forEach(l => { l.categoria = destino; });
    fecharModal();
    reagir('feliz', 'Tudo arrumadinho! 🗂️', 'Mudança feita! 📦');
  },
  excluirCat: v => {
    const c = listaCategorias().find(x => x.id === v); if (!c || CATS_FIXAS.includes(c.nome)) return;
    const usados = db.lancamentos.filter(l => l.categoria === c.nome && serveTipo(c, l.tipo));
    if (!confirm(`Excluir a categoria "${c.nome}"?${usados.length ? `

${usados.length === 1 ? 'O lançamento que usa' : `Os ${usados.length} lançamentos que usam`} esta categoria ${usados.length === 1 ? 'passa' : 'passam'} para "Outros".` : ''}`)) return;
    usados.forEach(l => { l.categoria = 'Outros'; });
    db.categorias = (db.categorias || []).filter(x => x.id !== v);
    if (c.padrao) db.categorias.push({ id: v, excluida: true });
    fecharModal();
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

Object.assign(acoes, acoesCidades, acoesRevisao, acoesContas, acoesAgenda);

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = acoes[el.dataset.a]; if (!fn) return;
  e.preventDefault();
  const r = fn(el.dataset.v, el);
  if (r instanceof Promise) return;
  if (!modal.open) { salvar(); render(); }
});

// Mouse: a rodinha rola de lado as fileiras que passam da largura (chips, atalhos, botões).
document.addEventListener('wheel', e => {
  const el = e.target.closest('.acoes.rolavel, .chips, .atalhos');
  if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  const antes = el.scrollLeft;
  el.scrollLeft += e.deltaY;
  if (el.scrollLeft !== antes) e.preventDefault();   // só segura a página se a fileira realmente rolou
}, { passive: false });

// Teclado: Enter/Espaço ativam as linhas clicáveis do extrato.
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'cat-busca') { ui.catBusca = t.value; filtrarCategorias(); return; }
  if (t.name === 'emojiProprio' && t.form) { const em = primeiroEmoji(t.value); if (em) { t.form.emoji.value = em; t.form.img.value = ''; } previaCat(); }
  else if (t.name === 'nome' && t.form && t.form.emojiProprio) previaCat();
});

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
  else if (c === 'rev') {
    // Revisão por categoria: guarda a escolha; só vale no lançamento ao "Confirmar".
    const id = el.dataset.i; if (!ui.revisao) return;
    ui.revisao.edit[id] = { ...(ui.revisao.edit[id] || {}), [el.dataset.f]: el.value };
    return;
  }
  else if (c === 'tri') {
    // Edição na triagem: só guarda o valor; nada vai para as finanças antes do "Confirmar".
    const i = itemTriagem(el.dataset.i), f = el.dataset.f; if (!i) return;
    i[f] = f === 'fixo' ? el.checked : f === 'valor' ? Math.abs(parseValor(el.value)) : el.value;
    if (f === 'categoria') i.catManual = true;   // a triagem automática não mexe no que você escolheu
    if (f === 'desc') i.descManual = true;
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
  if (tipo === 'modal') { if (aoSalvarModal?.(d) !== false) fecharModal(); else return; }
  else if (tipo === 'revisaoInicio') { if (!iniciarRevisao(d)) return; }
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
/* Coleções "extras" da nuvem (categorias, agendados): chegam por conta própria e, se as regras do
   Firebase ainda não as aceitarem, ficam salvas neste aparelho até a regra existir. */
const EXTRAS = { categorias: 'apg-categorias', agendados: 'apg-agendados' };
App.semNuvem = {}; App.extrasPendentes = {};
App.receberExtra = (c, docs) => {
  db[c] = docs;
  if (c === 'categorias') versaoCats++;
  // O que foi criado enquanto a nuvem recusava estava só neste aparelho: junta e envia.
  let local = null;
  try { local = JSON.parse(localStorage.getItem(EXTRAS[c])); } catch (e) { /* sem armazenamento */ }
  if (Array.isArray(local) && local.length) {
    const ids = new Set(docs.map(d => d.id));
    const faltam = local.filter(x => x && x.id && !ids.has(x.id));
    if (faltam.length) { db[c] = [...docs, ...faltam]; App.extrasPendentes[c] = true; }
    else try { localStorage.removeItem(EXTRAS[c]); } catch (e) { /* sem armazenamento */ }
  }
  if (App.modo === 'nuvem') { enviarExtrasPendentes(); renderSeguro(); }
};
function enviarExtrasPendentes() {
  const cs = Object.keys(App.extrasPendentes).filter(c => App.extrasPendentes[c]);
  if (!cs.length) return;
  App.extrasPendentes = {};
  salvar();
  cs.forEach(c => { try { localStorage.removeItem(EXTRAS[c]); } catch (e) { /* sem armazenamento */ } });
}
App.semExtraNaNuvem = (c, e) => {
  console.error(e);
  if (App.semNuvem[c]) return;
  App.semNuvem[c] = e && e.code === 'permission-denied' ? 'regras' : 'erro';
  try { db[c] = JSON.parse(localStorage.getItem(EXTRAS[c])) || db[c] || []; } catch (x) { /* sem armazenamento */ }
  if (c === 'categorias') versaoCats++;
  renderSeguro();
};
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
      db.lancamentos = local.lancamentos; db.planos = local.planos;
      if (!(db.categorias || []).length) db.categorias = local.categorias || [];
      if (!(db.agendados || []).length) db.agendados = local.agendados || [];
      salvar();
    }
    enviarExtrasPendentes();
    if (qtdPendCid()) setTimeout(sincronizarCidades, 500);   // alterações de cidades que ficaram na fila
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
