'use strict';
/* =========================================================
   🧠 Modelos de categoria (aprendizado de máquina no navegador, sem bibliotecas).
   Aprende com os lançamentos já categorizados e sugere a categoria de movimentos novos.

   - Atributos (`atributos`): palavras e pares de palavras do texto do banco/descrição, tipo,
     operação (Pix, débito…), banco, meio, titular, faixa de valor, valor exato, dia da semana e
     parte do mês. Tudo vira atributo binário (esparso).
   - Modelos: regressão logística multinomial (softmax, SGD com L2) e Random Forest
     (árvores de decisão por Gini sobre atributos binários, bootstrap e sorteio de atributos).
   - Linha de base: a regra que o app já usa (`memoriaHistorico`: mesmo texto/estabelecimento).
   - Avaliação (`avaliar`): validação cruzada em 5 partes, como no TCC. Mede acerto geral,
     acerto nos "estabelecimentos novos" (onde a regra não tem o que sugerir), top-3 e a
     confiança mínima (`limiar`) que mantém o acerto do modelo em pelo menos 80%.
   - Uso: regra primeiro; se ela não souber, o modelo escolhido sugere quando a confiança
     passa do limiar. O modelo final é treinado em segundo plano e refeito quando os
     lançamentos mudam (`assinatura`). A avaliação fica no aparelho (`apg-ml-aval`).
   Carregado antes do app.js: só usa coisas dele quando as funções são chamadas.
   ========================================================= */

const ML = (() => {
  const PARADAS = new Set(['para', 'com', 'dos', 'das', 'del', 'por', 'pix', 'enviado', 'recebido', 'compra', 'debito', 'credito', 'pagamento',
    'transferencia', 'ted', 'doc', 'titulo', 'estabelecimento', 'ltda', 'eireli', 'cp', 'no', 'na', 'em', 'de', 'do', 'da']);
  const MIN_AMOSTRAS = 30;

  // Gerador aleatório com semente: a mesma avaliação dá o mesmo resultado.
  const sorteador = semente => () => { semente = (semente * 1664525 + 1013904223) % 4294967296; return semente / 4294967296; };
  const embaralhar = (arr, rnd) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const pausa = () => new Promise(r => setTimeout(r, 0));

  function atributos(x) {
    const txt = semAcentoApp((x.bruto || '') + ' ' + (x.desc || '')).replace(/[^a-z0-9 ]/g, ' ');
    const ws = txt.split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w) && !PARADAS.has(w));
    const f = new Set();
    ws.forEach((w, k) => { f.add('w:' + w); if (ws[k + 1]) f.add('b:' + w + '_' + ws[k + 1]); });
    f.add('t:' + (x.tipo || ''));
    const op = x.operacao || (x.bruto && Extrato.operacao(x.bruto)?.nome) || '';
    if (op) f.add('op:' + op);
    if (x.banco) f.add('bc:' + x.banco);
    if (x.meio) f.add('me:' + x.meio);
    if (x.titular) f.add('ti:' + semAcentoApp(x.titular));
    const v = Math.abs(parseValor(x.valor));
    if (v) { f.add('v:' + Math.round(Math.log2(v))); f.add('ve:' + v.toFixed(2)); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(x.data || '')) {
      f.add('ds:' + new Date(x.data + 'T12:00:00').getDay());
      f.add('dm:' + Math.min(5, Math.floor((+x.data.slice(8) - 1) / 6)));
    }
    return [...f];
  }

  /* ---------- regressão logística multinomial ---------- */
  function treinarLogistica(amostras, K, { epocas = 25, taxa = 0.35, l2 = 1e-4 } = {}) {
    const W = new Map(), b = new Float64Array(K), rnd = sorteador(7);
    const pesos = f => { let a = W.get(f); if (!a) { a = new Float64Array(K); W.set(f, a); } return a; };
    const ordem = amostras.map((_, i) => i);
    const p = new Float64Array(K);
    for (let ep = 0; ep < epocas; ep++) {
      const lr = taxa / (1 + ep * 0.15);
      embaralhar(ordem, rnd);
      for (const i of ordem) {
        const { f, y } = amostras[i], ws = f.map(pesos);
        let max = -Infinity;
        for (let k = 0; k < K; k++) { let s = b[k]; for (const a of ws) s += a[k]; p[k] = s; if (s > max) max = s; }
        let tot = 0; for (let k = 0; k < K; k++) { p[k] = Math.exp(p[k] - max); tot += p[k]; }
        for (let k = 0; k < K; k++) {
          const g = p[k] / tot - (k === y ? 1 : 0);
          b[k] -= lr * g;
          for (const a of ws) a[k] -= lr * (g + l2 * a[k]);
        }
      }
    }
    return { tipo: 'log', K, prever(f) {
      const s = Float64Array.from(b);
      for (const nome of f) { const a = W.get(nome); if (a) for (let k = 0; k < K; k++) s[k] += a[k]; }
      const max = Math.max(...s); let tot = 0;
      for (let k = 0; k < K; k++) { s[k] = Math.exp(s[k] - max); tot += s[k]; }
      for (let k = 0; k < K; k++) s[k] /= tot;
      return s;
    } };
  }

  /* ---------- Random Forest (classificação) ---------- */
  async function treinarFloresta(amostras, K, { arvores = 60, profMax = 24, minFolha = 1 } = {}) {
    const conj = amostras.map(a => new Set(a.f)), rnd = sorteador(11), floresta = [];
    const contar = idx => { const c = new Float64Array(K); for (const i of idx) c[amostras[i].y]++; return c; };
    const gini = (c, n) => { if (!n) return 0; let s = 1; for (let k = 0; k < K; k++) { const q = c[k] / n; s -= q * q; } return s; };
    function no(idx, prof) {
      const c = contar(idx), n = idx.length;
      const puro = c.filter(x => x > 0).length <= 1;
      if (puro || n <= minFolha * 2 || prof >= profMax) return { folha: c.map(x => x / n) };
      // Sorteia atributos entre os que aparecem neste nó (√ do total, no mínimo 8).
      const presentes = new Set(); for (const i of idx) for (const f of amostras[i].f) presentes.add(f);
      const lista = [...presentes], m = Math.min(lista.length, Math.max(8, Math.ceil(Math.sqrt(lista.length))));
      embaralhar(lista, rnd);
      const base = gini(c, n);
      let melhor = null, ganho = 1e-9;
      for (let j = 0; j < m; j++) {
        const f = lista[j], cs = new Float64Array(K); let ns = 0;
        for (const i of idx) if (conj[i].has(f)) { cs[amostras[i].y]++; ns++; }
        if (!ns || ns === n) continue;
        const cn = c.map((x, k) => x - cs[k]);
        const g = base - (ns / n) * gini(cs, ns) - ((n - ns) / n) * gini(cn, n - ns);
        if (g > ganho) { ganho = g; melhor = f; }
      }
      if (!melhor) return { folha: c.map(x => x / n) };
      const sim = [], nao = [];
      for (const i of idx) (conj[i].has(melhor) ? sim : nao).push(i);
      return { f: melhor, sim: no(sim, prof + 1), nao: no(nao, prof + 1) };
    }
    for (let t = 0; t < arvores; t++) {
      const idx = amostras.map(() => Math.floor(rnd() * amostras.length));   // bootstrap
      floresta.push(no(idx, 0));
      if (t % 10 === 9) await pausa();   // não trava a tela
    }
    return { tipo: 'rf', K, prever(f) {
      const s = new Set(f), p = new Float64Array(K);
      for (const raiz of floresta) { let n = raiz; while (!n.folha) n = s.has(n.f) ? n.sim : n.nao; for (let k = 0; k < K; k++) p[k] += n.folha[k]; }
      for (let k = 0; k < K; k++) p[k] /= floresta.length;
      return p;
    } };
  }

  /* ---------- dados ---------- */
  const usaveis = () => db.lancamentos.filter(l => l.categoria && l.tipo && (l.desc || l.bruto));
  function preparar(lancs) {
    const contagem = {}; lancs.forEach(l => { contagem[l.categoria] = (contagem[l.categoria] || 0) + 1; });
    const ok = lancs.filter(l => contagem[l.categoria] >= 2);   // categoria com 1 exemplo só não dá para aprender
    const classes = [...new Set(ok.map(l => l.categoria))].sort();
    const porTipo = { receita: new Set(), despesa: new Set() };
    ok.forEach(l => porTipo[l.tipo]?.add(l.categoria));
    return { lancs: ok, classes, porTipo, amostras: ok.map(l => ({ f: atributos(l), y: classes.indexOf(l.categoria), l })) };
  }
  // Só sugere categorias que já apareceram com aquele tipo (despesa/receita).
  function ordenar(p, classes, porTipo, tipo) {
    return classes.map((c, k) => ({ c, p: porTipo[tipo]?.has(c) ? p[k] : 0 })).sort((a, b) => b.p - a.p)
      .map((x, _, arr) => { const tot = arr.reduce((s, y) => s + y.p, 0) || 1; return { categoria: x.c, p: x.p / tot }; });
  }
  async function treinar(tipo, amostras, K) { return tipo === 'rf' ? treinarFloresta(amostras, K) : treinarLogistica(amostras, K); }

  /* ---------- avaliação: validação cruzada em 5 partes ---------- */
  async function avaliar(progresso = () => {}) {
    const d = preparar(usaveis());
    if (d.amostras.length < MIN_AMOSTRAS || d.classes.length < 2) throw new Error(`Preciso de pelo menos ${MIN_AMOSTRAS} lançamentos com categoria (tem ${d.amostras.length}).`);
    const PARTES = 5, rnd = sorteador(42), ordem = embaralhar(d.amostras.map((_, i) => i), rnd);
    const parte = new Int8Array(d.amostras.length); ordem.forEach((i, j) => { parte[i] = j % PARTES; });
    const MODELOS = ['regra', 'log', 'rf', 'regra+log', 'regra+rf'];
    const res = Object.fromEntries(MODELOS.map(m => [m, { certos: 0, top3: 0, novosCertos: 0 }]));
    let novos = 0;
    const confiancas = { log: [], rf: [] };   // [confiança, acertou] nos estabelecimentos novos
    for (let p = 0; p < PARTES; p++) {
      progresso(p, PARTES);
      const treinoIdx = [], testeIdx = [];
      d.amostras.forEach((_, i) => (parte[i] === p ? testeIdx : treinoIdx).push(i));
      const noTreino = new Set(treinoIdx.map(i => d.amostras[i].l.id));
      const regra = memoriaHistorico(l => noTreino.has(l.id));
      const tr = treinoIdx.map(i => d.amostras[i]);
      const mods = { log: await treinar('log', tr, d.classes.length) }; await pausa();
      mods.rf = await treinar('rf', tr, d.classes.length); await pausa();
      for (const i of testeIdx) {
        const a = d.amostras[i], real = a.l.categoria;
        const r = regra(a.l)?.categoria || null, novo = !r;
        if (novo) novos++;
        const marcar = (m, previsto, top) => {
          if (previsto === real) { res[m].certos++; if (novo) res[m].novosCertos++; }
          if ((top || [previsto]).slice(0, 3).includes(real)) res[m].top3++;
        };
        marcar('regra', r);
        for (const m of ['log', 'rf']) {
          const ord = ordenar(mods[m].prever(a.f), d.classes, d.porTipo, a.l.tipo), top = ord.map(x => x.categoria);
          marcar(m, top[0], top);
          marcar('regra+' + m, r || top[0], r ? [r, ...top.filter(c => c !== r)] : top);
          if (novo) confiancas[m].push([ord[0].p, top[0] === real]);
        }
      }
      await pausa();
    }
    const n = d.amostras.length, pct = (x, t) => t ? x / t : null;
    const tabela = MODELOS.map(m => ({ modelo: m, acerto: pct(res[m].certos, n), novos: pct(res[m].novosCertos, novos), top3: pct(res[m].top3, n) }));
    // Escolha: o modelo (logística ou floresta) que mais acerta nos estabelecimentos novos.
    const escolhido = (tabela.find(t => t.modelo === 'rf').novos || 0) > (tabela.find(t => t.modelo === 'log').novos || 0) ? 'rf' : 'log';
    // Limiar de confiança: o menor que mantém o acerto do modelo em ≥ 80% (fora da amostra).
    const limiares = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(l => {
      const acima = confiancas[escolhido].filter(([c]) => c >= l);
      return { limiar: l, acerto: pct(acima.filter(([, ok]) => ok).length, acima.length), cobertura: pct(acima.length, confiancas[escolhido].length) };
    });
    const limiar = (limiares.find(x => x.acerto !== null && x.acerto >= 0.8) || { limiar: 0.9 }).limiar;
    const aval = { em: new Date().toISOString(), n, novos, categorias: d.classes.length, tabela, escolhido, limiares, limiar, assinatura: assinatura() };
    try { localStorage.setItem('apg-ml-aval', JSON.stringify(aval)); } catch (e) { /* sem armazenamento */ }
    estado.aval = aval; estado.assin = '';   // retreina o final com o escolhido
    return aval;
  }

  /* ---------- modelo final (todos os dados) e sugestão ---------- */
  const estado = { aval: null, modelo: null, treinando: false, assin: '' };
  try { estado.aval = JSON.parse(localStorage.getItem('apg-ml-aval')); } catch (e) { /* sem armazenamento */ }
  let memo = { em: 0, valor: '' };
  function assinatura() {
    if (Date.now() - memo.em < 300) return memo.valor;   // várias sugestões na mesma tela: calcula uma vez
    let h = 0; for (const l of db.lancamentos) { if (!l.categoria) continue; const s = l.id + l.categoria + (l.desc || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; }
    memo = { em: Date.now(), valor: db.lancamentos.length + ':' + h };
    return memo.valor;
  }
  async function prepararFinal() {
    if (estado.treinando) return;
    estado.treinando = true;
    try {
      const assin = assinatura(), d = preparar(usaveis());
      estado.assin = assin;
      if (d.amostras.length < MIN_AMOSTRAS || d.classes.length < 2) { estado.modelo = null; return; }
      const tipo = estado.aval?.escolhido || 'log';
      await pausa();
      const m = await treinar(tipo, d.amostras, d.classes.length);
      estado.modelo = { m, classes: d.classes, porTipo: d.porTipo, tipo, regra: memoriaHistorico() };
      if (typeof renderSeguro === 'function' && (ui.naTriagem || ui.aba === 'dados')) renderSeguro();
    } finally { estado.treinando = false; }
  }
  // Sugestão do modelo para um movimento (só quando a regra não sabe). null = sem sugestão.
  function sugerir(x) {
    if (estado.assin !== assinatura() && !estado.treinando) setTimeout(prepararFinal, 50);
    if (!estado.modelo) return null;
    const md = estado.modelo;
    if (md.regra(x)?.categoria) return null;
    const ord = ordenar(md.m.prever(atributos(x)), md.classes, md.porTipo, x.tipo);
    const limiar = estado.aval?.limiar ?? 0.6;
    return ord[0] && ord[0].p >= limiar ? { categoria: ord[0].categoria, p: ord[0].p, modelo: md.tipo } : null;
  }

  return { atributos, avaliar, sugerir, prepararFinal, estado, MIN_AMOSTRAS, usaveis, nomes: { regra: 'Regra atual (histórico)', log: 'Regressão logística', rf: 'Random Forest', 'regra+log': 'Regra + logística', 'regra+rf': 'Regra + Random Forest' } };
})();

/* ---------- cartão "🧠 Modelos" (Configurações) ---------- */
function cartaoModelos() {
  const n = ML.usaveis().length, a = ML.estado.aval, pct = x => x === null || x === undefined ? '—' : Math.round(x * 100) + '%';
  const desatualizada = a && n !== a.n;
  const linhas = a ? a.tabela.map(t => {
    const emUso = t.modelo === 'regra+' + a.escolhido;
    return `<tr class="${emUso ? 'ml-uso' : ''}"><td>${ML.nomes[t.modelo]}${emUso ? ' <span class="chip">em uso</span>' : ''}</td>
      <td class="num">${pct(t.acerto)}</td><td class="num">${pct(t.novos)}</td><td class="num">${pct(t.top3)}</td></tr>`;
  }).join('') : '';
  const lim = a ? a.limiares.find(x => x.limiar === a.limiar) : null;
  return `<div class="card"><div class="topo secao"><h2>🧠 Modelos de categoria</h2></div>
    <p class="muted" style="margin-top:0">Aprende com os seus lançamentos para sugerir a categoria de estabelecimentos que o app ainda não conhece.
      Compara a regra atual com <b>regressão logística</b> e <b>Random Forest</b> em validação cruzada (5 partes).</p>
    <p class="small" style="margin:0 0 10px">${n} lançamentos com categoria${n < ML.MIN_AMOSTRAS ? ` — precisa de pelo menos ${ML.MIN_AMOSTRAS} para treinar.` : '.'}</p>
    ${a ? `<div class="rolagem"><table class="tabela ml-tabela">
        <thead><tr><th>Modelo</th><th class="num">Acerto geral</th><th class="num">Acerto em novos</th><th class="num">Certa entre 3</th></tr></thead>
        <tbody>${linhas}</tbody></table></div>
      <p class="muted small">Avaliado em ${fmtData(a.em.slice(0, 10))} com ${a.n} lançamentos e ${a.categorias} categorias; ${a.novos} deles eram de estabelecimentos
        "novos" (a regra não tinha o que sugerir). ${lim && lim.acerto !== null ? `Na triagem, o modelo só sugere com confiança de pelo menos <b>${Math.round(a.limiar * 100)}%</b>:
        nos testes, acertou <b>${pct(lim.acerto)}</b> dessas vezes e deu sugestão para ${pct(lim.cobertura)} dos novos.` : ''}
        ${desatualizada ? '<br>⚠️ Entraram lançamentos novos desde a avaliação: avalie de novo para atualizar os números.' : ''}</p>
      <details class="cal-ajuda"><summary>Confiança × acerto (fora da amostra)</summary>
        <table class="tabela"><thead><tr><th>Confiança mínima</th><th class="num">Acerto</th><th class="num">Sugere em</th></tr></thead>
        <tbody>${a.limiares.map(x => `<tr><td>${Math.round(x.limiar * 100)}%${x.limiar === a.limiar ? ' ←' : ''}</td><td class="num">${pct(x.acerto)}</td><td class="num">${pct(x.cobertura)}</td></tr>`).join('')}</tbody></table></details>` : ''}
    <div class="acoes" style="margin-top:10px">${ui.mlAvaliando ? `<span class="muted">⏳ ${esc(ui.mlAvaliando)}</span>`
      : `<button class="btn ${a ? '' : 'pri'}" data-a="mlAvaliar" ${n < ML.MIN_AMOSTRAS ? 'disabled' : ''}>${a ? '🔄 Avaliar de novo' : '▶️ Avaliar modelos'}</button>`}</div>
  </div>`;
}
