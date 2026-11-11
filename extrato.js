'use strict';
/* =========================================================
   Importação de extratos do banco (OFX e CSV).
   Este arquivo só LÊ o extrato e sugere o preenchimento.
   Nada vai para as finanças aqui: cada lançamento passa
   pela triagem (app.js) e precisa ser confirmado um a um.
   ========================================================= */
(function (g) {
  const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* Extratos de banco costumam vir em Windows-1252; os mais novos, em UTF-8. */
  function decodificar(buffer) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch (e) { return new TextDecoder('windows-1252').decode(buffer); }
  }

  /* ---------- leitura dos arquivos ---------- */

  // OFX: cada movimento fica num bloco <STMTTRN>.
  function lerOFX(txt) {
    const campo = (bloco, tag) => { const m = bloco.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
    const itens = [];
    txt.split(/<STMTTRN>/i).slice(1).forEach(parte => {
      const b = parte.split(/<\/STMTTRN>/i)[0];
      const d = campo(b, 'DTPOSTED'), v = parseFloat(campo(b, 'TRNAMT').replace(',', '.'));
      if (!/^\d{8}/.test(d) || !v) return;
      const memo = campo(b, 'MEMO'), nome = campo(b, 'NAME');
      itens.push({
        origem: 'ofx:' + (campo(b, 'FITID') || `${d}|${v}|${memo}`),
        data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        valor: Math.abs(v), tipo: v < 0 ? 'despesa' : 'receita',
        bruto: memo || nome, memo, nome,
      });
    });
    return itens;
  }

  // CSV de banco: procura a linha de cabeçalho (Data + Crédito/Débito ou Valor) e lê o que vem depois.
  // Na fatura do cartão (opc.meio === 'credito') com uma coluna só de valor, compra vem positiva: vira despesa.
  function lerCSVBanco(txt, opc = {}) {
    const itens = [], vistos = {};
    let cab = null;
    g.lerCSV(txt).forEach(r => {
      const n = r.map(c => semAcento(c).trim());
      const acha = (...ini) => n.findIndex(c => ini.some(i => c.startsWith(i)));
      if (n.includes('data') && acha('credito', 'debito', 'valor') >= 0) {
        cab = { data: n.indexOf('data'), hist: acha('historico', 'descricao', 'lancamento', 'estabelecimento', 'titulo'), doc: acha('docto', 'documento'),
          cred: acha('credito'), deb: acha('debito'), valor: acha('valor'), tipo: n.indexOf('tipo'), cat: acha('categ') };
        return;
      }
      if (!cab) return;
      const data = g.parseData(r[cab.data]); if (!data) return;
      let v;
      if (cab.cred >= 0 || cab.deb >= 0) { const c = g.parseValor(r[cab.cred]), d = g.parseValor(r[cab.deb]); v = c ? Math.abs(c) : d ? -Math.abs(d) : 0; }
      else { v = g.parseValor(r[cab.valor]); if (opc.meio === 'credito') v = -v; }
      if (!v) return;
      let tipo = v < 0 ? 'despesa' : 'receita';
      if (cab.tipo >= 0) { const t = semAcento(r[cab.tipo]); if (t.includes('rec')) tipo = 'receita'; else if (t.includes('desp')) tipo = 'despesa'; }
      const hist = (r[cab.hist] || '').trim(), doc = cab.doc >= 0 ? (r[cab.doc] || '').trim() : '';
      // Identificador para reconhecer o mesmo movimento se o arquivo for importado de novo.
      let origem = `csv:${data}|${doc}|${v.toFixed(2)}|${semAcento(hist)}`;
      vistos[origem] = (vistos[origem] || 0) + 1;
      if (vistos[origem] > 1) origem += '#' + vistos[origem];
      itens.push({ origem, data, valor: Math.abs(v), tipo, bruto: hist, memo: hist, nome: '', categoriaArquivo: cab.cat >= 0 ? (r[cab.cat] || '').trim() : '' });
    });
    return itens;
  }

  const ehOFX = (nome, txt) => /<OFX>|<STMTTRN>/i.test(txt) || /\.ofx$/i.test(nome);
  function lerArquivo(nome, txt, opc = {}) {
    return ehOFX(nome, txt) ? lerOFX(txt) : lerCSVBanco(txt, opc);
  }

  // Tenta descobrir o banco e se é conta ou cartão (o usuário confirma antes da triagem).
  const BANCOS = ['Inter', 'Nubank', 'Bradesco', 'Itaú', 'Banco do Brasil', 'Caixa', 'Santander', 'C6 Bank', 'Sicredi', 'Sicoob', 'PicPay', 'Mercado Pago'];
  const CODIGOS = { '077': 'Inter', '260': 'Nubank', '237': 'Bradesco', '341': 'Itaú', '001': 'Banco do Brasil', '104': 'Caixa', '033': 'Santander', '336': 'C6 Bank', '748': 'Sicredi', '756': 'Sicoob' };
  function detectar(nome, txt) {
    const tag = t => { const m = txt.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
    const pista = semAcento(`${tag('ORG')} ${nome} ${txt.slice(0, 300)}`);
    const porNome = [['intermedium', 'Inter'], ['banco inter', 'Inter'], ['nubank', 'Nubank'], ['nu pagamentos', 'Nubank'], ['bradesco', 'Bradesco'], ['itau', 'Itaú'],
      ['banco do brasil', 'Banco do Brasil'], ['caixa economica', 'Caixa'], ['santander', 'Santander'], ['sicredi', 'Sicredi'], ['sicoob', 'Sicoob']].find(([p]) => pista.includes(p));
    const banco = CODIGOS[tag('BANKID').padStart(3, '0')] || CODIGOS[tag('FID').padStart(3, '0')] || (porNome ? porNome[1] : '');
    const meio = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>|<CCACCTFROM>/i.test(txt) || /fatura/.test(semAcento(nome)) ? 'credito' : 'debito';
    return { banco, meio };
  }

  /* ---------- sugestões de preenchimento ---------- */

  const ACENTOS = { servicos: 'serviços', credito: 'crédito', debito: 'débito', titulo: 'título', cartao: 'cartão', condominio: 'condomínio',
    imobiliaria: 'imobiliária', distribuicao: 'distribuição', telecomunicacoes: 'telecomunicações', importacao: 'importação',
    exportacao: 'exportação', salario: 'salário', farmacia: 'farmácia', transferencia: 'transferência' };
  const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'no', 'na', 'em', 'a', 'o']);
  const maiuscula = p => p.charAt(0).toUpperCase() + p.slice(1);
  const palavras = s => s.replace(/\s+/g, ' ').trim().toLowerCase().split(' ').map(p => ACENTOS[p] || p);
  const titulo = s => palavras(s).map((p, i) => i && MINUSCULAS.has(p) ? p : maiuscula(p)).join(' ');
  const frase = s => maiuscula(palavras(s).join(' '));

  // Transforma o texto do banco numa descrição legível.
  function descricao(it) {
    const m = (it.memo || '').match(/^([^:"]+):\s*"(.*)"\s*$/);   // formato do Inter: Tipo: "detalhe"
    if (!m) return /C\/SAL/i.test(it.memo) ? 'Salário' : frase(it.memo || it.nome || 'Sem descrição');
    const tipo = m[1].trim();
    let det = m[2].replace(/^cp\s*:\s*\d+\s*-\s*/i, '').replace(/^no estabelecimento\s+/i, '');
    if (/^\d/.test(det) && it.nome) det = it.nome;              // "00019 491964005 FULANO" → usa o nome
    det = det.replace(/\s+(ltda|eireli|me|s\.?\s?a\.?)\.?$/i, '').replace(/\s+(ltda|eireli|me|s\.?\s?a\.?)\.?$/i, '');
    det = titulo(det || tipo);
    return /^pix/i.test(tipo) ? `Pix: ${det}` : det;
  }

  const REGRAS_DESPESA = [
    [/condomin|imobili|aluguel|iptu/, 'Moradia'],
    [/celesc|energia|eletric|\bluz\b|casan|samae|saneamento|\bagua\b|telecom|unifique|internet|\bvivo\b|\bclaro\b|\btim\b|\bgas\b/, 'Contas'],
    [/uber|99app|\b99\b|posto|combustiv|gasolina|estacionamento|pedagio|onibus/, 'Transporte'],
    [/supermerc|mercado|atacad|hortifruti|acougue/, 'Mercado'],
    [/sorvete|lanchonete|restaurante|pizza|padaria|ifood|burger|lanche|churrasc|confeitaria|cafeteria/, 'Alimentação'],
    [/farmac|drogar|unimed|clinica|hospital|dentista|laborator/, 'Saúde'],
    [/unidavi|faculdade|universidade|escola|colegio|curso|udemy|alura/, 'Educação'],
    [/netflix|spotify|prime video|disney|hbo|youtube|icloud|google one/, 'Assinaturas'],
    [/barbearia|salao|cabeleireir|estetica/, 'Cuidados pessoais'],
    [/pacote de servicos|tarifa|anuidade|\biof\b|juros/, 'Tarifas bancárias'],
    [/fatura/, 'Cartão de crédito'],
    [/cinema|ingresso|steam|playstation|xbox/, 'Lazer'],
    [/investimento|aplicacao|\bcdb\b|tesouro|poupanca/, 'Investimentos'],
  ];
  const REGRAS_RECEITA = [
    [/c\/sal|salario|folha/, 'Salário'],
    [/devolvid|estorno|reembolso/, 'Reembolso'],
    [/cashback|resgate|rendimento|juros/, 'Rendimentos'],
  ];

  /* Devolve os itens prontos para a triagem: descrição e categoria sugeridas + avisos.
     ctx = { lancamentos: os já existentes, meuNome, banco, meio ('debito' | 'credito'), categorias }
     O que já foi importado antes (mesmo identificador do banco) sai como estado "duplicado". */
  function preparar(itens, ctx = {}) {
    const lanc = ctx.lancamentos || [];
    const jaImportado = new Map(lanc.filter(l => l.origem).map(l => [l.origem, l]));
    const conhecidas = new Map((ctx.categorias || []).map(c => [semAcento(c), c]));
    // Aprende com o que você já lançou: mesma descrição → mesma categoria.
    const aprendido = new Map(lanc.map(l => [semAcento(l.desc), l.categoria]));
    const nome = semAcento(ctx.meuNome).split(/\s+/).filter(p => p.length > 2);
    const meuNome = nome.length >= 2 ? [nome[0], nome[nome.length - 1]] : null;

    const out = itens.map((it, i) => {
      const texto = semAcento(`${it.memo} ${it.nome} ${it.categoriaArquivo || ''}`);
      const antigo = jaImportado.get(it.origem);   // já está nas finanças: mostra como foi lançado
      const desc = antigo ? antigo.desc : descricao(it);
      const regras = it.tipo === 'receita' ? REGRAS_RECEITA : REGRAS_DESPESA;
      const categoria = (antigo && antigo.categoria) || conhecidas.get(semAcento(it.categoriaArquivo)) || aprendido.get(semAcento(desc)) || (regras.find(([re]) => re.test(texto)) || [])[1] || 'Outros';
      const avisos = [];
      if (meuNome && meuNome.every(p => texto.includes(p))) avisos.push('Parece transferência entre as suas próprias contas.');
      if (ctx.meio === 'credito' && it.tipo === 'receita' && /pagamento|pagto/.test(texto)) avisos.push('Pagamento da fatura: normalmente se ignora aqui, porque as compras já estão lançadas uma a uma.');
      else if (/fatura/.test(texto)) avisos.push('Pagamento de fatura: cuidado para não contar as compras do cartão duas vezes.');
      return { id: 't' + i, origem: it.origem, data: it.data, valor: it.valor, tipo: it.tipo, bruto: it.bruto, desc, categoria, fixo: false, avisos,
        banco: ctx.banco || '', meio: ctx.meio === 'credito' ? 'credito' : 'debito', estado: antigo ? 'duplicado' : 'pendente', _texto: texto };
    });

    // Estornos: a devolução e o envio original (mesmo dia, mesmo valor) se anulam.
    const usados = new Set();
    out.filter(d => d.tipo === 'receita' && /devolvid|estorn/.test(d._texto)).forEach(d => {
      const par = out.find(o => o.tipo === 'despesa' && !usados.has(o.id) && o.data === d.data && o.valor === d.valor);
      if (!par) return;
      usados.add(par.id);
      d.avisos.push('Devolução de um envio do mesmo dia: os dois se anulam.');
      par.avisos.push('Este envio foi devolvido no mesmo dia: os dois se anulam.');
    });
    out.forEach(o => delete o._texto);
    return out.sort((a, b) => b.data.localeCompare(a.data));
  }

  g.Extrato = { decodificar, lerOFX, lerCSVBanco, lerArquivo, detectar, preparar, descricao, BANCOS };
})(typeof window !== 'undefined' ? window : globalThis);
