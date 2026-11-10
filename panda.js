'use strict';
/* =========================================================
   Panda: o mascote do app.
   - PandaSVG(opções) desenha o panda (humor + acessórios).
   - Mascote controla o humor, as falas e as reações.
   ========================================================= */
(function (g) {
  // Cores de um panda de verdade: preto amarronzado e branco creme.
  const P = '#2b2321';   // pelo escuro
  const C = '#241e1c';   // contorno
  const B = '#f6f1e6';   // pelo claro (creme)
  const BR = '#ffffff';  // brilho dos olhos
  const PATA = '#5e4c47'; // almofadinhas das patas
  const ROSA = '#f7a1b5';
  const VERDE = '#7cc06a', VERDE_E = '#4f8a43';
  const VERMELHO = '#e5484d', VERMELHO_E = '#b9302c';
  const MARROM = '#9a6b45';

  const HUMORES = ['fofo', 'feliz', 'triste', 'bravo', 'preguica', 'dormindo'];

  const ACESSORIOS = {
    cabeca: { '': 'Nada', chapeu: 'Chapéu de pescador', bone: 'Boné virado', bandana: 'Bandana ninja (placa)', faixa: 'Faixa de luta', fone: 'Fone de ouvido' },
    rosto: { '': 'Nada', oculos: 'Óculos escuros', bambuBoca: 'Bambu na boca' },
    roupa: { '': 'Nada', cachecol: 'Cachecol vermelho', casaco: 'Casaquinho', dino: 'Fantasia de dinossauro', moletom: 'Moletom rosa' },
    mao: { '': 'Nada', bambu: 'Segurando bambu' },
  };

  /* ---------- partes do desenho ---------- */
  function olhos(h) {
    const L = 76, R = 124, Y = 90;
    // A pupila fica num grupo próprio para poder seguir o mouse/dedo.
    const aberto = (x, dy = 0) => `<circle cx="${x}" cy="${Y}" r="8" fill="${BR}"/><g class="pupila"><circle cx="${x + .5}" cy="${Y + 1 + dy}" r="6" fill="#1a1514"/>` +
      `<circle cx="${x - 2}" cy="${Y - 2 + dy}" r="2.4" fill="${BR}"/><circle cx="${x + 2.6}" cy="${Y + 3 + dy}" r="1.2" fill="${BR}"/></g>`;
    const arco = (x, d) => `<path d="M${x - 8} ${Y} q8 ${d} 16 0" fill="none" stroke="${BR}" stroke-width="3.5" stroke-linecap="round"/>`;
    const meio = x => `<path d="M${x - 8} ${Y} a8 8 0 0 0 16 0 z" fill="${BR}"/><g class="pupila"><circle cx="${x}" cy="${Y + 3}" r="3.6" fill="#1a1514"/></g>`;
    switch (h) {
      case 'feliz': return arco(L, -9) + arco(R, -9);
      case 'dormindo': return arco(L, 7) + arco(R, 7);
      case 'bravo': return meio(L) + meio(R);
      case 'preguica': return meio(L) + meio(R) + `<path d="M${L - 9} ${Y}h18M${R - 9} ${Y}h18" stroke="${B}" stroke-width="3" stroke-linecap="round"/>`;
      case 'triste': return aberto(L, 2) + aberto(R, 2);
      default: return aberto(L) + aberto(R);
    }
  }

  function boca(h) {
    const s = `fill="none" stroke="${C}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
    switch (h) {
      case 'feliz': return `<path d="M90 111 Q100 127 110 111 Z" fill="#5a2a2f" stroke="${C}" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="100" cy="119" rx="5" ry="3" fill="${ROSA}"/>`;
      case 'triste': return `<path d="M92 120 q8 -8 16 0" ${s}/>`;
      case 'bravo': return `<path d="M90 119 l5 -4 l5 4 l5 -4 l5 4" ${s}/>`;
      case 'dormindo': return `<ellipse cx="100" cy="116" rx="3.5" ry="4.5" fill="${C}"/>`;
      case 'preguica': return `<path d="M94 115 q6 2 12 0" ${s}/>`;
      default: return `<path d="M92 111 q4 5 8 0 q4 5 8 0" ${s}/>`;
    }
  }

  function sobrancelhas(h) {
    const s = `fill="none" stroke="${C}" stroke-width="3.2" stroke-linecap="round"`;
    if (h === 'bravo') return `<path d="M60 64 L84 73 M140 64 L116 73" ${s}/>`;
    if (h === 'triste') return `<path d="M62 72 L82 66 M138 72 L118 66" ${s}/>`;
    return '';
  }

  function extrasRosto(h) {
    let s = '';
    if (h === 'triste') s += `<path class="lagrima" d="M68 104 q-5 8 0 11 q5 -3 0 -11z" fill="#7cc3f5"/>`;
    if (h === 'bravo') s += `<path d="M146 44 q5 5 0 10 M156 44 q-5 5 0 10 M146 44 q5 5 10 0 M146 54 q5 -5 10 0" fill="none" stroke="${VERMELHO}" stroke-width="3" stroke-linecap="round"/>`;
    return s;
  }

  function cabecaAcessorio(a) {
    switch (a) {
      case 'chapeu': return `<path d="M56 52 Q58 12 100 10 Q142 12 144 52 Z" fill="#cdb98a" stroke="#a8925f" stroke-width="2.5"/>` +
        `<path d="M58 44 Q100 34 142 44" fill="none" stroke="#a8925f" stroke-width="5"/>` +
        `<ellipse cx="100" cy="53" rx="74" ry="14" fill="#d8c597" stroke="#a8925f" stroke-width="2.5"/>`;
      case 'bone': return `<path d="M42 66 Q44 10 100 8 Q156 10 158 66 Q100 50 42 66 Z" fill="${VERMELHO}" stroke="${VERMELHO_E}" stroke-width="2.5"/>` +
        `<path d="M100 9 V58" stroke="${VERMELHO_E}" stroke-width="2"/><circle cx="100" cy="10" r="5" fill="${VERMELHO_E}"/>` +
        `<path d="M148 58 Q182 48 194 62 Q172 74 150 70 Z" fill="#3b6fd8" stroke="#2c56b0" stroke-width="2.5"/>`;
      case 'faixa': return `<path d="M37 70 Q100 44 163 70 L163 83 Q100 57 37 83 Z" fill="${VERMELHO}" stroke="${VERMELHO_E}" stroke-width="2"/>` +
        `<circle cx="100" cy="60" r="6" fill="${B}"/><circle cx="100" cy="60" r="3" fill="${VERMELHO}"/>` +
        `<path d="M163 76 q18 -8 28 2 M163 79 q14 10 20 24" fill="none" stroke="${VERMELHO}" stroke-width="7" stroke-linecap="round"/>`;
      case 'bandana': return `<path d="M163 73 q18 0 27 13 M162 79 q12 9 14 27" fill="none" stroke="#2c3e7a" stroke-width="7" stroke-linecap="round"/>` +
        `<path d="M37 68 Q100 40 163 68 L163 82 Q100 54 37 82 Z" fill="#34478c" stroke="#24326a" stroke-width="2"/>` +
        `<rect x="71" y="45" width="58" height="25" rx="5" fill="#cfd4dc" stroke="#7d8593" stroke-width="2.5"/>` +
        `<path d="M75 49 h50" stroke="#ffffff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>` +
        `<circle cx="76" cy="52" r="1.8" fill="#7d8593"/><circle cx="124" cy="52" r="1.8" fill="#7d8593"/><circle cx="76" cy="64" r="1.8" fill="#7d8593"/><circle cx="124" cy="64" r="1.8" fill="#7d8593"/>` +
        `<ellipse cx="100" cy="62" rx="5.5" ry="4.2" fill="#6b7280"/><circle cx="93.5" cy="55.5" r="2.2" fill="#6b7280"/><circle cx="100" cy="53.5" r="2.2" fill="#6b7280"/><circle cx="106.5" cy="55.5" r="2.2" fill="#6b7280"/>`;
      case 'fone': return `<path d="M38 92 Q38 18 100 18 Q162 18 162 92" fill="none" stroke="#4d6b40" stroke-width="9" stroke-linecap="round"/>` +
        `<rect x="24" y="74" width="24" height="38" rx="11" fill="#6b8f5a" stroke="#4d6b40" stroke-width="2.5"/>` +
        `<rect x="152" y="74" width="24" height="38" rx="11" fill="#6b8f5a" stroke="#4d6b40" stroke-width="2.5"/>`;
      default: return '';
    }
  }

  function rostoAcessorio(a) {
    if (a === 'oculos') return `<rect x="55" y="77" width="40" height="27" rx="12" fill="${C}"/><rect x="105" y="77" width="40" height="27" rx="12" fill="${C}"/>` +
      `<path d="M95 86 q5 -4 10 0 M55 84 L38 80 M145 84 L162 80" fill="none" stroke="${C}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M62 85 l9 -4 M112 85 l9 -4" stroke="${B}" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`;
    if (a === 'bambuBoca') return `<path d="M38 108 Q48 118 60 116 M140 116 Q152 118 162 108" fill="none" stroke="#3a3d44" stroke-width="3" stroke-linecap="round"/>` +
      `<rect x="58" y="109" width="84" height="15" rx="7.5" fill="${VERDE}" stroke="${VERDE_E}" stroke-width="2.5"/>` +
      `<path d="M84 109v15M116 109v15" stroke="${VERDE_E}" stroke-width="2.5"/>`;
    return '';
  }

  function efeitos(h) {
    const coracao = (x, y, cls) => `<path class="fx ${cls}" transform="translate(${x} ${y})" d="M0 3 C0 -2 -7 -2 -7 3 C-7 7 0 11 0 11 C0 11 7 7 7 3 C7 -2 0 -2 0 3Z" fill="#ff6b8a"/>`;
    const brilho = (x, y, cls) => `<path class="fx ${cls}" transform="translate(${x} ${y})" d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2Z" fill="#f3c74f"/>`;
    if (h === 'feliz') return coracao(176, 34, 'sobe') + coracao(22, 52, 'sobe d2') + brilho(30, 22, 'pisca');
    if (h === 'fofo') return brilho(178, 30, 'pisca') + brilho(24, 40, 'pisca d2');
    if (h === 'dormindo') return [0, 1, 2].map(i => `<text class="fx zzz d${i}" x="${160 + i * 10}" y="${44 - i * 12}" font-size="${14 + i * 5}" font-weight="700" font-family="Outfit, sans-serif">z</text>`).join('');
    return '';
  }

  /* ---------- desenho completo ---------- */
  function PandaSVG(o = {}) {
    const h = HUMORES.includes(o.humor) ? o.humor : 'fofo';
    const casaco = o.roupa === 'casaco';
    const ROUPA = { casaco: [MARROM], dino: ['#8fc79a', '#5f9b6b'], moletom: ['#f4a6c0', '#d77b9d'] }[o.roupa];
    const vestido = !!ROUPA;
    const bambu = o.mao === 'bambu';
    const corpo = vestido ? ROUPA[0] : B;
    const manga = vestido ? ROUPA[0] : P;

    // Capuz (dinossauro e moletom) fica atrás da cabeça.
    const capuz = (o.roupa === 'dino' ? `<path d="M54 50 L58 20 L78 38 Z M86 34 L100 6 L114 34 Z M146 50 L142 20 L122 38 Z" fill="#6aa877" stroke="${ROUPA[1]}" stroke-width="2.5" stroke-linejoin="round"/>` : '') +
      (o.roupa === 'dino' || o.roupa === 'moletom' ? `<ellipse cx="100" cy="90" rx="74" ry="63" fill="${ROUPA[0]}" stroke="${ROUPA[1]}" stroke-width="3"/>` : '');
    const orelhas = o.roupa === 'dino' ? '' : `<circle cx="52" cy="46" r="20" fill="${P}"/><circle cx="148" cy="46" r="20" fill="${P}"/>`;
    const rabo = o.roupa === 'dino' ? `<path d="M140 176 Q186 186 196 150 Q182 160 172 158 Q160 166 146 162 Z" fill="${ROUPA[0]}" stroke="${ROUPA[1]}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M176 160 l6 -9 l4 10 M186 156 l7 -7 l2 10" fill="#6aa877" stroke="${ROUPA[1]}" stroke-width="2" stroke-linejoin="round"/>` : '';
    const fx = o.efeitos === false ? '' : efeitos(h);

    const pes = [70, 130].map(x => `<ellipse cx="${x}" cy="184" rx="20" ry="13" fill="${P}"/><circle cx="${x}" cy="186" r="6" fill="${PATA}"/>` +
      `<circle cx="${x - 8}" cy="179" r="2.4" fill="${PATA}"/><circle cx="${x}" cy="176.5" r="2.4" fill="${PATA}"/><circle cx="${x + 8}" cy="179" r="2.4" fill="${PATA}"/>`).join('');

    const barriga = `<ellipse cx="100" cy="150" rx="54" ry="42" fill="${corpo}" stroke="${C}" stroke-width="3"/>` +
      // Faixa escura dos ombros, ligando as patas da frente (como no panda real).
      (vestido ? '' : `<path d="M48 126 Q100 150 152 126 L154 148 Q100 172 46 148 Z" fill="${P}"/>`) +
      (casaco ? `<ellipse cx="100" cy="158" rx="17" ry="32" fill="${B}"/><path d="M83 128 L100 150 L117 128" fill="none" stroke="#7a5034" stroke-width="3" stroke-linejoin="round"/>` +
        `<circle cx="100" cy="164" r="2.6" fill="#7a5034"/><circle cx="100" cy="176" r="2.6" fill="#7a5034"/>` : '') +
      (o.roupa === 'dino' ? `<ellipse cx="100" cy="160" rx="30" ry="27" fill="#e3f3d6"/><path d="M76 150 h48 M72 162 h56 M76 174 h48" stroke="#b9dca5" stroke-width="2.5" stroke-linecap="round"/>` : '') +
      (o.roupa === 'moletom' ? `<path d="M76 158 h48 l5 22 h-58 z" fill="#e98fae" stroke="#d77b9d" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M92 140 v16 M108 140 v16" stroke="${B}" stroke-width="2.5" stroke-linecap="round"/><circle cx="92" cy="158" r="2.6" fill="${B}"/><circle cx="108" cy="158" r="2.6" fill="${B}"/>` : '');

    const vara = bambu ? `<g transform="rotate(10 164 140)"><rect x="156" y="52" width="15" height="136" rx="7.5" fill="${VERDE}" stroke="${VERDE_E}" stroke-width="2.5"/>` +
      `<path d="M156 84h15M156 116h15M156 150h15" stroke="${VERDE_E}" stroke-width="2.5"/>` +
      `<path d="M171 112 q14 -9 20 -3 q-9 8 -20 3z" fill="#9ad38a" stroke="${VERDE_E}" stroke-width="2"/></g>` : '';

    const bracoE = `<ellipse cx="54" cy="150" rx="15" ry="24" transform="rotate(25 54 150)" fill="${manga}"/>` + (vestido ? `<circle cx="44" cy="171" r="9" fill="${P}"/>` : '');
    const bracoD = bambu
      ? `<ellipse cx="152" cy="142" rx="15" ry="24" transform="rotate(-55 152 142)" fill="${manga}"/>` + (vestido ? `<circle cx="170" cy="130" r="9" fill="${P}"/>` : '')
      : `<ellipse cx="146" cy="150" rx="15" ry="24" transform="rotate(-25 146 150)" fill="${manga}"/>` + (vestido ? `<circle cx="156" cy="171" r="9" fill="${P}"/>` : '');

    const cachecol = o.roupa === 'cachecol'
      ? `<path d="M50 134 Q100 158 150 134 L153 149 Q100 173 47 149 Z" fill="${VERMELHO}" stroke="${VERMELHO_E}" stroke-width="2"/>` +
        `<path d="M54 142 Q100 164 146 142" fill="none" stroke="${B}" stroke-opacity=".5" stroke-width="2"/>` +
        `<path d="M114 152 L130 150 L136 184 L120 186 Z" fill="${VERMELHO}" stroke="${VERMELHO_E}" stroke-width="2"/>` +
        `<path d="M122 186v6M128 185v6M134 184v6" stroke="${VERMELHO}" stroke-width="2.5" stroke-linecap="round"/>`
      : '';

    const cabeca = `<g class="cabeca">
      ${capuz}${orelhas}
      <ellipse cx="100" cy="90" rx="64" ry="54" fill="${B}" stroke="${C}" stroke-width="3"/>
      <ellipse cx="74" cy="92" rx="15" ry="19" transform="rotate(30 74 92)" fill="${P}"/>
      <ellipse cx="126" cy="92" rx="15" ry="19" transform="rotate(-30 126 92)" fill="${P}"/>
      <g class="olhos">${olhos(h)}</g>
      ${sobrancelhas(h)}
      <ellipse cx="62" cy="114" rx="10" ry="6" fill="#f08a9b" opacity="${h === 'bravo' ? .6 : .3}"/>
      <ellipse cx="138" cy="114" rx="10" ry="6" fill="#f08a9b" opacity="${h === 'bravo' ? .6 : .3}"/>
      <ellipse cx="100" cy="103" rx="7" ry="5" fill="${C}"/>
      ${boca(h)}
      ${extrasRosto(h)}
      ${rostoAcessorio(o.rosto)}
      ${cabecaAcessorio(o.cabeca)}
    </g>`;

    return `<svg class="panda-svg h-${h}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      rabo + vara + barriga + pes + bracoE + bracoD + cabeca + cachecol + fx + `</svg>`;
  }

  g.PandaSVG = PandaSVG;
  if (typeof document === 'undefined') return;

  /* =========================================================
     Mascote: humor, falas e reações
     ========================================================= */
  const CHAVE = 'apg-panda';
  const PADRAO = { cabeca: '', rosto: '', roupa: '', mao: 'bambu' };
  const sorteia = arr => arr[Math.floor(Math.random() * arr.length)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function lerPrefs() {
    try { return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE)) }; } catch (e) { return { ...PADRAO }; }
  }

  const FALAS_CUTUCAR = ['Oi! 🐼', 'Bora economizar?', 'Cadê meu bambu? 🎋', 'Hehe, cócegas!', 'Você tá indo bem! ✨', 'Já guardou dinheiro hoje?'];
  const FALAS_ACORDAR = ['Opa! Acordei 😊', 'Ah, você voltou! 🐼', 'Hmm? Tava só descansando…'];

  const M = {
    prefs: lerPrefs(),
    reacao: null,          // { humor, fala, ate }
    ocioso: null,          // null | 'preguica' | 'dormindo'
    ultimo: Date.now(),
    cutucadas: [],
    timer: null,

    humorAtual() {
      if (M.reacao && M.reacao.ate > Date.now()) return M.reacao.humor;
      if (M.ocioso) return M.ocioso;
      return (g.App && g.App.humorBase && g.App.humorBase()) || 'fofo';
    },
    falaAtual() {
      if (M.reacao && M.reacao.ate > Date.now()) return M.reacao.fala || '';
      if (M.ocioso === 'preguica') return 'Tô com preguiça… 🥱';
      return '';
    },

    /* Panda desenhado com os acessórios escolhidos. */
    svg(o = {}) { return PandaSVG({ ...M.prefs, humor: M.humorAtual(), ...o }); },

    /* Panda "vivo" (com balão de fala), atualizado sozinho. */
    html(classe = '') { return `<div class="mascote ${classe}" data-mascote data-assinatura="${M.assinatura()}">${M.interno()}</div>`; },
    assinatura() { return M.humorAtual() + '|' + Object.values(M.prefs).join(','); },
    interno() {
      const fala = M.falaAtual();
      return `<div class="balao ${fala ? 'on' : ''}" role="status">${esc(fala)}</div>` +
        `<div class="mascote-corpo" data-cutucar title="Cutuque o panda">${M.svg()}</div>`;
    },
    /* Atualiza sem "piscar": só redesenha o panda quando o humor ou o visual mudam,
       com uma transição de mola; o balão de fala só troca o texto. */
    atualizar() {
      const fala = M.falaAtual(), ativo = !!(fala || M.ocioso), assin = M.assinatura();
      document.querySelectorAll('[data-mascote]').forEach(el => {
        el.classList.toggle('ativo', ativo);
        const corpo = el.querySelector('.mascote-corpo'), balao = el.querySelector('.balao');
        if (!corpo || !balao) { el.innerHTML = M.interno(); el.dataset.assinatura = assin; return; }
        if (balao.textContent !== fala) {
          balao.textContent = fala;
          balao.classList.remove('on');
          if (fala) { void balao.offsetWidth; balao.classList.add('on'); }
        }
        if (el.dataset.assinatura !== assin) {
          el.dataset.assinatura = assin;
          corpo.innerHTML = M.svg();
          corpo.classList.remove('trocou'); void corpo.offsetWidth; corpo.classList.add('trocou');
          const fim = e => { if (e.animationName === 'mola') { corpo.classList.remove('trocou'); corpo.removeEventListener('animationend', fim); } };
          corpo.addEventListener('animationend', fim);
        }
      });
    },

    reagir(humor, fala, ms = 3800) {
      M.reacao = { humor, fala, ate: Date.now() + ms };
      M.ocioso = null;
      M.atualizar();
      clearTimeout(M.timer);
      M.timer = setTimeout(M.atualizar, ms + 30);
    },

    definir(campo, valor) {
      if (!(campo in ACESSORIOS)) return;
      M.prefs[campo] = valor in ACESSORIOS[campo] ? valor : '';
      try { localStorage.setItem(CHAVE, JSON.stringify(M.prefs)); } catch (e) { /* sem armazenamento */ }
      M.reagir('feliz', 'Gostei do visual! ✨', 2500);
    },
    sortear() {
      for (const campo of Object.keys(ACESSORIOS)) {
        const ops = Object.keys(ACESSORIOS[campo]);
        M.prefs[campo] = Math.random() < .35 ? '' : sorteia(ops.filter(Boolean));
      }
      try { localStorage.setItem(CHAVE, JSON.stringify(M.prefs)); } catch (e) { /* sem armazenamento */ }
      M.reagir('feliz', 'Visual novo! Que tal? 😎', 2500);
    },

    /* Chamado a cada clique ou tecla: acorda o panda se ele estiver cochilando. */
    atividade() {
      M.ultimo = Date.now();
      if (!M.ocioso) return false;
      M.ocioso = null;
      M.reagir('feliz', sorteia(FALAS_ACORDAR), 3000);
      return true;
    },

    cutucar() {
      const agora = Date.now();
      M.cutucadas = M.cutucadas.filter(t => agora - t < 3000).concat(agora);
      if (M.cutucadas.length >= 5) { M.cutucadas = []; M.reagir('bravo', 'Ei! Para de me cutucar! 😤', 3200); }
      else M.reagir('feliz', sorteia(FALAS_CUTUCAR), 2600);
    },
  };

  M.ACESSORIOS = ACESSORIOS;
  M.HUMORES = HUMORES;
  M.sorteiaFala = sorteia;

  // Atividade do usuário (fase de captura, antes dos outros cliques do app).
  ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, e => {
    const acordou = M.atividade();
    if (ev === 'click' && !acordou && e.target.closest && e.target.closest('[data-cutucar]')) M.cutucar();
  }, { capture: true, passive: true }));

  // Olhinhos seguem o mouse ou o dedo (no máximo 2,5 unidades para cada lado).
  let pendente = null, agendado = false;
  document.addEventListener('pointermove', e => {
    pendente = e;
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      const ev = pendente; pendente = null;
      if (!ev) return;
      document.querySelectorAll('.mascote-corpo svg').forEach(svg => {
        const r = svg.getBoundingClientRect();
        if (!r.width) return;
        const dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height * .45);
        const d = Math.hypot(dx, dy) || 1, f = Math.min(1, d / 260) * 2.5;
        svg.style.setProperty('--ox', (dx / d * f).toFixed(2) + 'px');
        svg.style.setProperty('--oy', (dy / d * f).toFixed(2) + 'px');
      });
    });
  }, { passive: true });

  // Sem atividade: preguiça depois de 40 s, sono depois de 1 min e meio.
  setInterval(() => {
    if (document.hidden) return;
    const parado = Date.now() - M.ultimo;
    const novo = parado > 90000 ? 'dormindo' : parado > 40000 ? 'preguica' : null;
    if (novo && novo !== M.ocioso && !(M.reacao && M.reacao.ate > Date.now())) { M.ocioso = novo; M.atualizar(); }
  }, 5000);

  g.Mascote = M;
})(typeof window !== 'undefined' ? window : globalThis);
