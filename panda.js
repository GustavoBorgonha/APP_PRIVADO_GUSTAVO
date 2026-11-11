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

  /* ---------- partes do desenho ----------
     Estilo "chibi": cabeça grande, corpo pequeno, olhos escuros e brilhantes dentro
     das manchas, focinho miúdo, bochechas rosadas e patinhas com almofadas rosa. */
  const OLHO = '#120d0c';       // olho (mais escuro que a mancha)
  const MANCHA = '#3a302d';     // manchas dos olhos
  const SOMBRA = '#ebe2d3';     // sombra suave do pelo claro
  const ALMOFADA = '#f6b9ae';   // almofadinhas rosa
  const EX = 75, DX = 125, OY = 98; // centro dos olhos

  function olhos(h) {
    // O olho inteiro fica num grupo próprio para poder seguir o mouse/dedo.
    const aberto = (x, o = {}) => `<g class="pupila"><circle cx="${x}" cy="${OY + (o.dy || 0)}" r="${o.r || 7.6}" fill="${OLHO}"/>` +
      `<path d="M${x - 5} ${OY + 2.5 + (o.dy || 0)} a5.4 5.4 0 0 0 10 0" fill="none" stroke="#7a6862" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>` +
      `<circle cx="${x - 2.4}" cy="${OY - 2.6 + (o.dy || 0)}" r="${o.brilho || 2.7}" fill="${BR}"/><circle cx="${x + 3}" cy="${OY + 2.2 + (o.dy || 0)}" r="1.2" fill="${BR}"/>` +
      (o.extra ? `<circle cx="${x + 2.6}" cy="${OY - 3.4 + (o.dy || 0)}" r="1" fill="${BR}"/>` : '') + `</g>`;
    const arco = (x, d) => `<path d="M${x - 7.5} ${OY + (d < 0 ? 2 : -1)} q7.5 ${d} 15 0" fill="none" stroke="${B}" stroke-width="3" stroke-linecap="round"/>`;
    // Pálpebra na cor da mancha: "corta" o olho (reto = preguiça, inclinado = bravo).
    const palpebra = (x, incl) => `<path d="M${x - 11} ${OY - 12} H${x + 11} V${OY - 1 + incl} L${x - 11} ${OY - 1 - incl} Z" fill="${MANCHA}"/>`;
    switch (h) {
      case 'feliz': return arco(EX, -8) + arco(DX, -8);
      case 'dormindo': return arco(EX, 6) + arco(DX, 6) +
        `<path d="M${EX - 8} ${OY + 1} l-3 2 M${DX + 8} ${OY + 1} l3 2" stroke="${B}" stroke-width="2" stroke-linecap="round"/>`;
      case 'bravo': return aberto(EX, { r: 7 }) + aberto(DX, { r: 7 }) + palpebra(EX, 4) + palpebra(DX, -4);
      case 'preguica': return aberto(EX, { dy: 1 }) + aberto(DX, { dy: 1 }) + palpebra(EX, 0) + palpebra(DX, 0) +
        `<path d="M${EX - 8} ${OY - 1}h16M${DX - 8} ${OY - 1}h16" stroke="${B}" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>`;
      case 'triste': return aberto(EX, { dy: 1.5, brilho: 3.2, extra: true }) + aberto(DX, { dy: 1.5, brilho: 3.2, extra: true });
      default: return aberto(EX) + aberto(DX);
    }
  }

  function boca(h) {
    const s = `fill="none" stroke="${C}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;
    switch (h) {
      case 'feliz': return `<path d="M92 119 Q100 132 108 119 Z" fill="#6b2f36" stroke="${C}" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="100" cy="125.5" rx="4" ry="2.4" fill="${ROSA}"/>`;
      case 'triste': return `<path d="M94 125 q6 -6 12 0" ${s}/>`;
      case 'bravo': return `<path d="M94 125 q6 -5 12 0" ${s}/>`;
      case 'dormindo': return `<ellipse cx="100" cy="123" rx="2.8" ry="3.6" fill="${C}"/>`;
      case 'preguica': return `<path d="M95 122 q5 2 10 0" ${s}/>`;
      default: return `<path d="M100 115.5 v3 M93 119.5 q3.5 4.5 7 0 q3.5 4.5 7 0" ${s}/>`;
    }
  }

  function sobrancelhas(h) {
    const s = `fill="none" stroke="${C}" stroke-width="3.2" stroke-linecap="round"`;
    if (h === 'bravo') return `<path d="M57 73 L83 83 M143 73 L117 83" ${s}/>`;
    if (h === 'triste') return `<path d="M58 78 L78 72 M142 78 L122 72" ${s}/>`;
    return '';
  }

  function extrasRosto(h) {
    let s = '';
    if (h === 'triste') s += `<path class="lagrima" d="M64 112 q-4.5 7.5 0 10 q4.5 -2.5 0 -10z" fill="#8ccdf7" stroke="#5aa9dc" stroke-width="1"/>`;
    if (h === 'bravo') s += `<path d="M160 30 q5 5 0 10 M170 30 q-5 5 0 10 M160 30 q5 5 10 0 M160 40 q5 -5 10 0" fill="none" stroke="${VERMELHO}" stroke-width="3" stroke-linecap="round"/>`;
    return s;
  }

  function cabecaAcessorio(a) {
    switch (a) {
      case 'chapeu': return `<path d="M56 52 Q58 12 100 10 Q142 12 144 52 Z" fill="#d6c594" stroke="#a8925f" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<path d="M100 11 V44 M72 20 Q80 34 78 46 M128 20 Q120 34 122 46" fill="none" stroke="#a8925f" stroke-width="1.5" stroke-dasharray="3 3" opacity=".8"/>` +
        `<path d="M58 44 Q100 34 142 44" fill="none" stroke="#a8925f" stroke-width="4"/>` +
        `<path d="M26 56 Q100 30 174 56 Q178 66 166 68 Q100 50 34 68 Q22 66 26 56 Z" fill="#e0d0a2" stroke="#a8925f" stroke-width="2.5" stroke-linejoin="round"/>`;
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
        `<rect x="24" y="74" width="24" height="38" rx="11" fill="#7d9c6a" stroke="#4d6b40" stroke-width="2.5"/>` +
        `<rect x="152" y="74" width="24" height="38" rx="11" fill="#7d9c6a" stroke="#4d6b40" stroke-width="2.5"/>` +
        `<path d="M30 84 v16 M170 84 v16" stroke="#a9c495" stroke-width="3" stroke-linecap="round"/>`;
      default: return '';
    }
  }

  function rostoAcessorio(a) {
    if (a === 'oculos') return `<rect x="55" y="77" width="40" height="27" rx="12" fill="#17181c"/><rect x="105" y="77" width="40" height="27" rx="12" fill="#17181c"/>` +
      `<path d="M95 86 q5 -4 10 0 M55 84 L38 80 M145 84 L162 80" fill="none" stroke="#17181c" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M62 85 l9 -4 M112 85 l9 -4" stroke="#ffffff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>`;
    if (a === 'bambuBoca') return `<rect x="62" y="110" width="76" height="13" rx="6.5" fill="${VERDE}" stroke="${VERDE_E}" stroke-width="2.2"/>` +
      `<path d="M86 110v13M114 110v13" stroke="${VERDE_E}" stroke-width="2.2"/>` +
      `<path d="M138 114 q10 -8 16 -3 q-7 7 -16 3z" fill="#9ad38a" stroke="${VERDE_E}" stroke-width="1.8"/>`;
    return '';
  }

  // A posição fica num <g> de fora: a animação CSS usa "transform" e apagaria o translate.
  function efeitos(h) {
    const coracao = (x, y, cls) => `<g transform="translate(${x} ${y})"><path class="fx ${cls}" d="M0 3 C0 -2 -7 -2 -7 3 C-7 7 0 11 0 11 C0 11 7 7 7 3 C7 -2 0 -2 0 3Z" fill="#ff7d98" stroke="#e85b7b" stroke-width="1"/></g>`;
    const brilho = (x, y, cls) => `<g transform="translate(${x} ${y})"><path class="fx ${cls}" d="M0 -8 Q1 -1 8 0 Q1 1 0 8 Q-1 1 -8 0 Q-1 -1 0 -8Z" fill="#f6cf62"/></g>`;
    if (h === 'feliz') return coracao(184, 26, 'sobe') + coracao(14, 62, 'sobe d2') + brilho(18, 22, 'pisca');
    if (h === 'fofo') return brilho(186, 22, 'pisca') + brilho(14, 26, 'pisca d2');
    if (h === 'dormindo') return [0, 1, 2].map(i => `<text class="fx zzz d${i}" x="${164 + i * 10}" y="${34 - i * 11}" font-size="${13 + i * 5}" font-weight="700" font-family="Outfit, sans-serif">z</text>`).join('');
    return '';
  }

  /* ---------- desenho completo ---------- */
  function PandaSVG(o = {}) {
    const h = HUMORES.includes(o.humor) ? o.humor : 'fofo';
    const casaco = o.roupa === 'casaco';
    const ROUPA = { casaco: ['#b08460', '#7a5034'], dino: ['#9ccaa0', '#5f9b6b'], moletom: ['#f6b3c9', '#d77b9d'] }[o.roupa];
    const vestido = !!ROUPA;
    const bambu = o.mao === 'bambu';
    const corpo = vestido ? ROUPA[0] : B;
    const manga = vestido ? ROUPA[0] : P;
    const borda = vestido ? ROUPA[1] : C;
    const t = `stroke="${C}" stroke-width="2.6" stroke-linejoin="round"`;   // contorno padrão
    const capuzado = o.roupa === 'dino' || o.roupa === 'moletom';

    const chao = `<ellipse cx="100" cy="193" rx="58" ry="5.5" fill="#000" opacity=".09"/>`;

    // Capuz (dinossauro e moletom) fica atrás da cabeça.
    const capuz = (o.roupa === 'dino' ? `<path d="M50 44 L52 12 L76 30 Z M86 26 L100 0 L114 26 Z M150 44 L148 12 L124 30 Z" fill="#7fb98a" stroke="${ROUPA[1]}" stroke-width="2.5" stroke-linejoin="round"/>` : '') +
      (o.roupa === 'moletom' ? `<circle cx="42" cy="38" r="15" fill="${ROUPA[0]}" stroke="${ROUPA[1]}" stroke-width="2.5"/><circle cx="158" cy="38" r="15" fill="${ROUPA[0]}" stroke="${ROUPA[1]}" stroke-width="2.5"/>` : '') +
      (capuzado ? `<path d="M100 16 C150 16 182 46 182 92 C182 132 148 152 100 152 C52 152 18 132 18 92 C18 46 50 16 100 16 Z" fill="${ROUPA[0]}" stroke="${ROUPA[1]}" stroke-width="2.6"/>` : '') +
      (o.roupa === 'dino' ? `<circle cx="64" cy="27" r="3" fill="${ROUPA[1]}"/><circle cx="136" cy="27" r="3" fill="${ROUPA[1]}"/>` : '');
    const orelha = x => `<g class="orelha ${x < 100 ? 'e' : 'd'}"><circle cx="${x}" cy="42" r="19" fill="${P}" ${t}/><circle cx="${x}" cy="44" r="9" fill="#4a3d39"/></g>`;
    const orelhas = capuzado ? '' : orelha(46) + orelha(154);
    const rabo = o.roupa === 'dino' ? `<path d="M134 178 Q182 190 194 152 Q180 162 170 160 Q158 168 142 164 Z" fill="${ROUPA[0]}" stroke="${ROUPA[1]}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M174 162 l6 -9 l4 10 M184 158 l7 -7 l2 10" fill="#7fb98a" stroke="${ROUPA[1]}" stroke-width="2" stroke-linejoin="round"/>` : '';
    const fx = o.efeitos === false ? '' : efeitos(h);

    // Patinhas de trás viradas para a frente, com almofadas rosa.
    const pes = [70, 130].map(x => `<g class="pe ${x < 100 ? 'e' : 'd'}"><ellipse cx="${x}" cy="179" rx="18" ry="14.5" fill="${P}" ${t}/>` +
      `<ellipse cx="${x}" cy="182.5" rx="7.5" ry="6" fill="${ALMOFADA}"/>` +
      `<circle cx="${x - 8}" cy="173.5" r="2.7" fill="${ALMOFADA}"/><circle cx="${x}" cy="171" r="2.7" fill="${ALMOFADA}"/><circle cx="${x + 8}" cy="173.5" r="2.7" fill="${ALMOFADA}"/></g>`).join('');

    // Enfeites da roupa foram desenhados para uma barriga maior: aqui só encolhem um pouco.
    const enfeite = s => `<g transform="translate(100 158) scale(.8) translate(-100 -152)">${s}</g>`;
    const barriga = `<path d="M56 152 C56 130 76 124 100 124 C124 124 144 130 144 152 C144 178 126 190 100 190 C74 190 56 178 56 152 Z" fill="${corpo}" stroke="${borda}" stroke-width="2.6"/>` +
      (vestido ? '' : `<ellipse cx="100" cy="164" rx="27" ry="20" fill="${BR}" opacity=".55"/>`) +
      (casaco ? enfeite(`<ellipse cx="100" cy="158" rx="17" ry="32" fill="${B}"/><path d="M83 128 L100 150 L117 128" fill="none" stroke="#7a5034" stroke-width="3" stroke-linejoin="round"/>` +
        `<circle cx="100" cy="164" r="2.6" fill="#7a5034"/><circle cx="100" cy="176" r="2.6" fill="#7a5034"/>`) : '') +
      (o.roupa === 'dino' ? enfeite(`<ellipse cx="100" cy="160" rx="30" ry="27" fill="#f1ecd6"/><path d="M76 150 h48 M72 162 h56 M76 174 h48" stroke="#d9cfa6" stroke-width="2.5" stroke-linecap="round"/>`) : '') +
      (o.roupa === 'moletom' ? enfeite(`<path d="M76 158 h48 l5 22 h-58 z" fill="#ef9cb8" stroke="#d77b9d" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M92 140 v16 M108 140 v16" stroke="${B}" stroke-width="2.5" stroke-linecap="round"/><circle cx="92" cy="158" r="2.6" fill="${B}"/><circle cx="108" cy="158" r="2.6" fill="${B}"/>`) : '');

    const vara = bambu ? `<g transform="rotate(6 173 150)"><rect x="166" y="64" width="14" height="126" rx="7" fill="${VERDE}" stroke="${VERDE_E}" stroke-width="2.4"/>` +
      `<path d="M166 94h14M166 124h14M166 156h14" stroke="${VERDE_E}" stroke-width="2.4"/>` +
      `<path d="M171 70 v18 M171 100 v18" stroke="#b5e3a4" stroke-width="2" stroke-linecap="round" opacity=".7"/>` +
      `<path d="M180 118 q11 -10 18 -5 q-7 9 -18 5z" fill="#9ad38a" stroke="${VERDE_E}" stroke-width="1.8"/>` +
      `<path d="M166 100 q-10 -9 -16 -3 q7 8 16 3z" fill="#9ad38a" stroke="${VERDE_E}" stroke-width="1.8"/></g>` : '';

    const mao = (x, y) => vestido ? `<circle cx="${x}" cy="${y}" r="8" fill="${P}" ${t}/>` : '';
    const braco = (x, y, rot) => `<ellipse cx="${x}" cy="${y}" rx="12.5" ry="20" transform="rotate(${rot} ${x} ${y})" fill="${manga}" stroke="${borda}" stroke-width="2.6"/>`;
    const bracoE = braco(60, 156, 22) + mao(53, 172);
    const bracoD = bambu ? braco(150, 150, -62) + mao(166, 142) : braco(140, 156, -22) + mao(147, 172);

    const cachecol = o.roupa === 'cachecol'
      ? `<path d="M50 132 Q100 156 150 132 L153 147 Q100 171 47 147 Z" fill="${VERMELHO}" stroke="${VERMELHO_E}" stroke-width="2"/>` +
        `<path d="M56 141 Q100 162 144 141" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="2"/>` +
        `<path d="M112 152 L129 150 L135 182 L118 184 Z" fill="${VERMELHO}" stroke="${VERMELHO_E}" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M120 184v6M126 183v6M132 182v6" stroke="${VERMELHO_E}" stroke-width="2.5" stroke-linecap="round"/>`
      : '';

    const bochecha = x => `<ellipse cx="${x}" cy="117" rx="10.5" ry="6.5" fill="#f79aa8" opacity="${h === 'bravo' ? .75 : .55}"/>` +
      `<path d="M${x - 4} 115 l-2 4 M${x + 1} 115 l-2 4 M${x + 6} 115 l-2 4" stroke="#e8778a" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>`;

    const cabeca = `<g class="cabeca">
      ${capuz}${orelhas}
      <path d="M100 28 C142 28 170 54 170 92 C170 126 140 144 100 144 C60 144 30 126 30 92 C30 54 58 28 100 28 Z" fill="${B}" ${t}/>
      <path d="M36 108 C52 134 148 134 164 108 C160 132 136 142 100 142 C64 142 40 132 36 108 Z" fill="${SOMBRA}" opacity=".8"/>
      ${capuzado || o.cabeca ? '' : `<path d="M90 30 q1 -9 6 -3 q2 -9 7 -1 q4 -6 7 4" fill="${B}" ${t}/>`}
      <ellipse cx="72" cy="97" rx="14.5" ry="18.5" transform="rotate(28 72 97)" fill="${MANCHA}"/>
      <ellipse cx="128" cy="97" rx="14.5" ry="18.5" transform="rotate(-28 128 97)" fill="${MANCHA}"/>
      <g class="olhos">${olhos(h)}</g>
      ${sobrancelhas(h)}
      ${bochecha(54)}${bochecha(146)}
      <path d="M94 108.5 Q100 105 106 108.5 Q106 114.5 100 116 Q94 114.5 94 108.5 Z" fill="${C}"/>
      <ellipse cx="98.5" cy="109.5" rx="2.2" ry="1.1" fill="${BR}" opacity=".5"/>
      ${boca(h)}
      ${extrasRosto(h)}
      <g transform="translate(100 97) scale(1.08) translate(-100 -90)">${rostoAcessorio(o.rosto)}</g>
      <g transform="translate(100 88) scale(1.09) translate(-100 -92)">${cabecaAcessorio(o.cabeca)}</g>
    </g>`;

    return `<svg class="panda-svg h-${h}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      chao + rabo + vara + barriga + pes + bracoE + bracoD + cabeca + cachecol + fx + `</svg>`;
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
