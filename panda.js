'use strict';
/* =========================================================
   Panda: o mascote do app.
   - PandaSVG(opções) desenha o panda (humor + acessórios).
   - Mascote controla o humor, as falas e as reações.
   ========================================================= */
(function (g) {
  const P = '#26282e';   // pelo escuro
  const C = '#1d2221';   // contorno
  const B = '#ffffff';   // pelo branco
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

  /* ---------- partes do desenho (estilo minimalista: corpo único em degradê) ---------- */
  const EY = 94, EL = 76, ER = 124;   // centro dos olhos

  function olhos(h) {
    const pilula = (x, alt = 18, dy = 0) => `<rect x="${x - 4.5}" y="${EY - alt / 2 + dy}" width="9" height="${alt}" rx="4.5" fill="${B}"/>`;
    const arco = (x, d) => `<path d="M${x - 7} ${EY + (d > 0 ? -2 : 3)} q7 ${d} 14 0" fill="none" stroke="${B}" stroke-width="4" stroke-linecap="round"/>`;
    switch (h) {
      case 'feliz': return arco(EL, -10) + arco(ER, -10);
      case 'dormindo': return arco(EL, 7) + arco(ER, 7);
      case 'preguica': return pilula(EL, 8, 5) + pilula(ER, 8, 5);
      case 'triste': return pilula(EL, 13, 4) + pilula(ER, 13, 4);
      case 'bravo': return `<path d="M${EL - 4.5} ${EY - 3} L${EL + 4.5} ${EY + 1} V${EY + 9} a4.5 4.5 0 0 1 -9 0 Z" fill="${B}"/>` +
        `<path d="M${ER + 4.5} ${EY - 3} L${ER - 4.5} ${EY + 1} V${EY + 9} a4.5 4.5 0 0 0 9 0 Z" fill="${B}"/>`;
      default: return pilula(EL) + pilula(ER);
    }
  }

  function boca(h) {
    const s = `fill="none" stroke="${C}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
    switch (h) {
      case 'feliz': return `<path d="M91 120 Q100 134 109 120 Z" fill="${C}" stroke="${C}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="100" cy="127.5" rx="4.5" ry="2.6" fill="${ROSA}"/>`;
      case 'triste': return `<path d="M93 129 q7 -7 14 0" ${s}/>`;
      case 'bravo': return `<path d="M91 128 l4.5 -4 l4.5 4 l4.5 -4 l4.5 4" ${s}/>`;
      case 'dormindo': return `<ellipse cx="100" cy="125" rx="3" ry="4" fill="${C}"/>`;
      case 'preguica': return `<path d="M95 124 q5 2 10 0" ${s}/>`;
      default: return `<path d="M93 120 q3.5 4.5 7 0 q3.5 4.5 7 0" ${s}/>`;
    }
  }

  function sobrancelhas(h) {
    const s = `fill="none" stroke="${C}" stroke-width="3.5" stroke-linecap="round"`;
    if (h === 'bravo') return `<path d="M62 70 L84 78 M138 70 L116 78" ${s}/>`;
    if (h === 'triste') return `<path d="M64 77 L82 71 M136 77 L118 71" ${s}/>`;
    return '';
  }

  function extrasRosto(h) {
    let s = '';
    if (h === 'triste') s += `<path class="lagrima" d="M69 108 q-4.5 7 0 10 q4.5 -3 0 -10z" fill="#7cc3f5"/>`;
    if (h === 'bravo') s += `<path d="M148 50 q5 5 0 10 M158 50 q-5 5 0 10 M148 50 q5 5 10 0 M148 60 q5 -5 10 0" fill="none" stroke="${VERMELHO}" stroke-width="3" stroke-linecap="round"/>`;
    return s;
  }

  function cabecaAcessorio(a) {
    switch (a) {
      case 'chapeu': return `<path d="M54 50 Q56 8 100 6 Q144 8 146 50 Z" fill="#cdb98a"/>` +
        `<path d="M56 42 Q100 32 144 42" fill="none" stroke="#a8925f" stroke-width="5"/>` +
        `<ellipse cx="100" cy="51" rx="78" ry="14" fill="#d8c597"/>`;
      case 'bone': return `<path d="M36 64 Q38 6 100 4 Q162 6 164 64 Q100 48 36 64 Z" fill="${VERMELHO}"/>` +
        `<path d="M100 5 V56" stroke="${VERMELHO_E}" stroke-width="2"/><circle cx="100" cy="6" r="5" fill="${VERMELHO_E}"/>` +
        `<path d="M154 56 Q186 46 197 60 Q176 72 156 68 Z" fill="#3b6fd8"/>`;
      case 'faixa': return `<path d="M30 70 Q100 42 170 70 L170 84 Q100 56 30 84 Z" fill="${VERMELHO}"/>` +
        `<circle cx="100" cy="60" r="6" fill="${B}"/><circle cx="100" cy="60" r="3" fill="${VERMELHO}"/>` +
        `<path d="M170 76 q16 -8 24 2 M170 80 q12 10 16 24" fill="none" stroke="${VERMELHO}" stroke-width="7" stroke-linecap="round"/>`;
      case 'bandana': return `<path d="M168 74 q16 0 24 13 M167 80 q10 9 12 26" fill="none" stroke="#2c3e7a" stroke-width="7" stroke-linecap="round"/>` +
        `<path d="M30 70 Q100 40 170 70 L170 84 Q100 54 30 84 Z" fill="#34478c"/>` +
        `<rect x="71" y="44" width="58" height="25" rx="6" fill="#cfd4dc"/>` +
        `<path d="M75 48 h50" stroke="${B}" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>` +
        `<circle cx="76" cy="51" r="1.8" fill="#7d8593"/><circle cx="124" cy="51" r="1.8" fill="#7d8593"/><circle cx="76" cy="63" r="1.8" fill="#7d8593"/><circle cx="124" cy="63" r="1.8" fill="#7d8593"/>` +
        `<ellipse cx="100" cy="61" rx="5.5" ry="4.2" fill="#6b7280"/><circle cx="93.5" cy="54.5" r="2.2" fill="#6b7280"/><circle cx="100" cy="52.5" r="2.2" fill="#6b7280"/><circle cx="106.5" cy="54.5" r="2.2" fill="#6b7280"/>`;
      case 'fone': return `<path d="M30 96 Q30 14 100 14 Q170 14 170 96" fill="none" stroke="#4d6b40" stroke-width="9" stroke-linecap="round"/>` +
        `<rect x="14" y="78" width="24" height="40" rx="11" fill="#6b8f5a"/>` +
        `<rect x="162" y="78" width="24" height="40" rx="11" fill="#6b8f5a"/>`;
      default: return '';
    }
  }

  function rostoAcessorio(a) {
    if (a === 'oculos') return `<rect x="55" y="81" width="40" height="27" rx="13" fill="${C}"/><rect x="105" y="81" width="40" height="27" rx="13" fill="${C}"/>` +
      `<path d="M95 90 q5 -4 10 0 M55 88 L40 84 M145 88 L160 84" fill="none" stroke="${C}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M62 89 l9 -4 M112 89 l9 -4" stroke="${B}" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`;
    if (a === 'bambuBoca') return `<path d="M40 118 Q50 126 60 125 M140 125 Q150 126 160 118" fill="none" stroke="#3a3d44" stroke-width="3" stroke-linecap="round"/>` +
      `<rect x="58" y="118" width="84" height="15" rx="7.5" fill="${VERDE}"/>` +
      `<path d="M84 118v15M116 118v15" stroke="${VERDE_E}" stroke-width="2.5"/>`;
    return '';
  }

  function efeitos(h) {
    const coracao = (x, y, cls) => `<path class="fx ${cls}" transform="translate(${x} ${y})" d="M0 3 C0 -2 -7 -2 -7 3 C-7 7 0 11 0 11 C0 11 7 7 7 3 C7 -2 0 -2 0 3Z" fill="#ff6b8a"/>`;
    const brilho = (x, y, cls) => `<path class="fx ${cls}" transform="translate(${x} ${y})" d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2Z" fill="#f3c74f"/>`;
    if (h === 'feliz') return coracao(180, 30, 'sobe') + coracao(18, 50, 'sobe d2') + brilho(28, 18, 'pisca');
    if (h === 'fofo') return brilho(182, 26, 'pisca') + brilho(16, 40, 'pisca d2');
    if (h === 'dormindo') return [0, 1, 2].map(i => `<text class="fx zzz d${i}" x="${162 + i * 10}" y="${40 - i * 12}" font-size="${14 + i * 5}" font-weight="700" font-family="Outfit, sans-serif">z</text>`).join('');
    return '';
  }

  /* ---------- desenho completo ---------- */
  let contador = 0;
  function PandaSVG(o = {}) {
    const h = HUMORES.includes(o.humor) ? o.humor : 'fofo';
    const id = 'pd' + (++contador);
    const fx = o.efeitos === false ? '' : efeitos(h);
    const bambu = o.mao === 'bambu';

    // Cor do corpo: pelo escuro em degradê, ou a cor da roupa.
    const CORES = { '': ['#53555c', '#111112'], casaco: ['#b08158', '#6e4a2e'], dino: ['#9fd3a8', '#5f9b6b'], moletom: ['#f7b6cc', '#d77b9d'] };
    const [c1, c2] = CORES[o.roupa] || CORES[''];
    const defs = `<defs>
      <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
      <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#53555c"/><stop offset="1" stop-color="#111112"/></linearGradient>
      <filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
    </defs>`;
    const pelo = `url(#${id}p)`, corpo = `url(#${id}c)`;

    // Brilho colorido desfocado atrás do panda.
    const brilho = o.brilho === false ? '' : `<g class="aura" filter="url(#${id}b)" opacity=".38">
      <circle cx="58" cy="78" r="42" fill="#ce7bfe"/><circle cx="146" cy="70" r="40" fill="#ffa946"/>
      <circle cx="100" cy="160" r="46" fill="#86ebd7"/><circle cx="150" cy="150" r="30" fill="#f95b6d"/></g>`;

    const espinhos = o.roupa === 'dino' ? `<path d="M52 48 L56 16 L78 36 Z M86 32 L100 4 L114 32 Z M148 48 L144 16 L122 36 Z" fill="#6aa877"/>` : '';
    const rabo = o.roupa === 'dino' ? `<path d="M150 178 Q188 188 197 152 Q184 162 174 160 Q162 168 152 164 Z" fill="#7fbf8b"/>` : '';
    const orelhas = o.roupa === 'dino' ? '' : `<circle class="pelo" cx="50" cy="44" r="20" fill="${pelo}"/><circle class="pelo" cx="150" cy="44" r="20" fill="${pelo}"/>`;

    const vara = bambu ? `<g transform="rotate(8 176 130)"><rect x="168" y="48" width="15" height="140" rx="7.5" fill="${VERDE}"/>` +
      `<path d="M168 82h15M168 116h15M168 152h15" stroke="${VERDE_E}" stroke-width="2.5"/>` +
      `<path d="M168 76 q-16 -12 -22 -4 q9 9 22 4z" fill="#9ad38a"/></g>` : '';

    // Detalhes da roupa na barriga (abaixo do rosto).
    const roupa = {
      casaco: `<path d="M84 154 L100 192 L116 154 Z" fill="${B}"/><path d="M84 154 L100 176 L116 154" fill="none" stroke="#5a3b24" stroke-width="3" stroke-linejoin="round"/>`,
      dino: `<path d="M64 166 h72 M70 178 h60" stroke="#e3f3d6" stroke-opacity=".8" stroke-width="4" stroke-linecap="round"/>`,
      moletom: `<path d="M74 166 h52 l6 20 h-64 z" fill="#e98fae"/><path d="M90 150 v14 M110 150 v14" stroke="${B}" stroke-width="2.5" stroke-linecap="round"/><circle cx="90" cy="166" r="2.6" fill="${B}"/><circle cx="110" cy="166" r="2.6" fill="${B}"/>`,
      cachecol: `<path d="M26 148 Q100 176 174 148 L176 163 Q100 191 24 163 Z" fill="${VERMELHO}"/>` +
        `<path d="M118 166 L134 163 L140 192 L124 194 Z" fill="${VERMELHO_E}"/>`,
    }[o.roupa] || '';

    const pes = `<ellipse class="pelo" cx="70" cy="192" rx="18" ry="7" fill="${pelo}"/><ellipse class="pelo" cx="130" cy="192" rx="18" ry="7" fill="${pelo}"/>`;
    const pata = bambu ? `<circle class="pelo" cx="172" cy="140" r="12" fill="${pelo}"/>` : '';

    const rosto = `<g class="cabeca">
      <rect x="38" y="54" width="124" height="98" rx="49" fill="${B}"/>
      <ellipse class="pelo" cx="76" cy="98" rx="14" ry="18" transform="rotate(30 76 98)" fill="${pelo}"/>
      <ellipse class="pelo" cx="124" cy="98" rx="14" ry="18" transform="rotate(-30 124 98)" fill="${pelo}"/>
      <g class="olhos">${olhos(h)}</g>
      ${sobrancelhas(h)}
      <ellipse cx="58" cy="122" rx="9" ry="5" fill="#ff8fa3" opacity="${h === 'bravo' ? .7 : .4}"/>
      <ellipse cx="142" cy="122" rx="9" ry="5" fill="#ff8fa3" opacity="${h === 'bravo' ? .7 : .4}"/>
      <ellipse cx="100" cy="112" rx="6.5" ry="4.5" fill="${C}"/>
      ${boca(h)}
      ${extrasRosto(h)}
      ${rostoAcessorio(o.rosto)}
      ${cabecaAcessorio(o.cabeca)}
    </g>`;

    return `<svg class="panda-svg h-${h}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` + defs + brilho +
      rabo + espinhos + orelhas + vara + pes +
      `<rect class="pelo corpo" x="24" y="32" width="152" height="162" rx="70" fill="${corpo}"/>` +
      roupa + pata + rosto + fx + `</svg>`;
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
    html(classe = '') { return `<div class="mascote ${classe}" data-mascote>${M.interno()}</div>`; },
    interno() {
      const fala = M.falaAtual();
      return `<div class="balao ${fala ? 'on' : ''}" role="status">${esc(fala)}</div>` +
        `<div class="mascote-corpo" data-cutucar title="Cutuque o panda">${M.svg()}</div>`;
    },
    atualizar() {
      const ativo = !!(M.falaAtual() || M.ocioso);
      document.querySelectorAll('[data-mascote]').forEach(el => { el.innerHTML = M.interno(); el.classList.toggle('ativo', ativo); });
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

  // Sem atividade: preguiça depois de 40 s, sono depois de 1 min e meio.
  setInterval(() => {
    if (document.hidden) return;
    const parado = Date.now() - M.ultimo;
    const novo = parado > 90000 ? 'dormindo' : parado > 40000 ? 'preguica' : null;
    if (novo && novo !== M.ocioso && !(M.reacao && M.reacao.ate > Date.now())) { M.ocioso = novo; M.atualizar(); }
  }, 5000);

  g.Mascote = M;
})(typeof window !== 'undefined' ? window : globalThis);
