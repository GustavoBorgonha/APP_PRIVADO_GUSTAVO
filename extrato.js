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
  // Compra no débito do Inter: o NAME vem em colunas fixas (estabelecimento 22 · cidade 13 · país 3).
  function estabelecimentoECidade(nome) {
    const m = String(nome || '').replace(/\s+$/, '').match(/^(.{22})(.{13})([A-Za-z]{3})$/);
    if (!m || !/\S/.test(m[2])) return null;
    return { estabelecimento: m[1].trim(), cidade: titulo(m[2].trim()), pais: m[3] };
  }
  const isoDe = d => /^\d{8}/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '';
  const horaDe = d => /^\d{12}/.test(d) && d.slice(8, 14) !== '000000' && d.slice(8, 12) !== '1200' ? `${d.slice(8, 10)}:${d.slice(10, 12)}` : '';

  function lerOFX(txt) {
    const campo = (bloco, tag) => { const m = bloco.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
    const itens = [];
    // Dados gerais do extrato: agência, conta, saldo final e quando o arquivo foi gerado.
    const bal = (txt.match(/<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/i) || [])[1] || '';
    const servidor = campo(txt, 'DTSERVER');
    itens.meta = {
      agencia: campo(txt, 'BRANCHID'), conta: campo(txt, 'ACCTID'), bancoCodigo: campo(txt, 'BANKID'),
      saldoFinal: bal ? parseFloat(campo(bal, 'BALAMT').replace(',', '.')) : null, saldoData: isoDe(campo(bal, 'DTASOF')),
      geradoEm: isoDe(servidor), geradoHora: horaDe(servidor),
    };
    txt.split(/<STMTTRN>/i).slice(1).forEach(parte => {
      const b = parte.split(/<\/STMTTRN>/i)[0];
      const d = campo(b, 'DTPOSTED'), v = parseFloat(campo(b, 'TRNAMT').replace(',', '.'));
      if (!/^\d{8}/.test(d) || !v) return;
      const memo = campo(b, 'MEMO'), nome = campo(b, 'NAME');
      // Horário: alguns bancos mandam data+hora (AAAAMMDDHHMMSS). O Inter manda só a data.
      const dh = /^\d{12}/.test(campo(b, 'DTUSER')) ? campo(b, 'DTUSER') : d;
      const hora = /^\d{12}/.test(dh) && dh.slice(8, 14) !== '000000' && dh.slice(8, 12) !== '1200' ? `${dh.slice(8, 10)}:${dh.slice(10, 12)}` : '';
      const ec = /compra/i.test(memo) ? estabelecimentoECidade(nome) : null;
      itens.push({
        origem: 'ofx:' + (campo(b, 'FITID') || `${d}|${v}|${memo}`),
        data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        valor: Math.abs(v), tipo: v < 0 ? 'despesa' : 'receita',
        bruto: memo || nome, memo, nome, hora,
        cidade: ec ? ec.cidade : '', estabelecimento: ec ? ec.estabelecimento : '',
      });
    });
    return itens;
  }

  // CSV de banco: procura a linha de cabeçalho (Data + Crédito/Débito ou Valor) e lê o que vem depois.
  // Na fatura do cartão (opc.meio === 'credito') com uma coluna só de valor, compra vem positiva: vira despesa.
  function lerCSVBanco(txt, opc = {}) {
    const itens = [], vistos = {};
    const ag = txt.match(/Ag:\s*([\d-]+)\s*\|\s*Conta:\s*([\d-]+)/i);
    const base = txt.match(/base\s+(\d{2}\/\d{2}\/\d{4})\s+(?:às|as|a)\s+(\d{2}:\d{2})/i);
    itens.meta = { agencia: ag ? ag[1] : '', conta: ag ? ag[2] : '', geradoEm: base ? g.parseData(base[1]) : '', geradoHora: base ? base[2] : '', saldoFinal: null, saldoData: '' };
    let cab = null;
    g.lerCSV(txt).forEach(r => {
      const n = r.map(c => semAcento(c).trim());
      const acha = (...ini) => n.findIndex(c => ini.some(i => c.startsWith(i)));
      if (n.includes('data') && acha('credito', 'debito', 'valor') >= 0) {
        cab = { data: n.indexOf('data'), hist: acha('historico', 'descricao', 'lancamento', 'estabelecimento', 'titulo'), doc: acha('docto', 'documento'),
          cred: acha('credito'), deb: acha('debito'), valor: acha('valor'), tipo: n.indexOf('tipo'), cat: acha('categ'), saldo: acha('saldo'),
          id: acha('identificador'), cod: acha('codtrans') };
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
      const hist = consertar((r[cab.hist] || '').trim()), doc = cab.doc >= 0 ? (r[cab.doc] || '').trim() : '';
      const ident = cab.id >= 0 ? (r[cab.id] || '').trim() : '', cod = cab.cod >= 0 ? (r[cab.cod] || '').trim() : '';
      // Identificador para reconhecer o mesmo movimento se o arquivo for importado de novo
      // (o Sicredi manda um identificador único por movimento: usa ele).
      let origem = ident ? `csv:id:${ident}` : `csv:${data}|${doc}|${v.toFixed(2)}|${semAcento(hist)}`;
      vistos[origem] = (vistos[origem] || 0) + 1;
      if (vistos[origem] > 1) origem += '#' + vistos[origem];
      // Saldo depois do movimento, quando o banco manda (Bradesco manda).
      const saldoTxt = cab.saldo >= 0 ? String(r[cab.saldo] || '').trim() : '';
      const saldoBanco = /\d/.test(saldoTxt) ? g.parseValor(saldoTxt) : null;
      const extra = dadosIdentificador(ident);
      itens.push({ origem, data, valor: Math.abs(v), tipo, bruto: hist, memo: hist, nome: '', saldoBanco, codTransacao: cod, ...extra,
        categoriaArquivo: cab.cat >= 0 ? (r[cab.cat] || '').trim() : '' });
    });
    // Ordem do arquivo: alguns bancos (Sicredi) listam do mais novo para o mais antigo.
    // "seq" guarda a ordem real dos movimentos (do mais antigo para o mais novo), inclusive dentro do mesmo dia.
    const desc = itens.length > 1 && itens[0].data > itens[itens.length - 1].data;
    itens.forEach((it, i) => { it.seq = desc ? itens.length - 1 - i : i; });
    const ultimo = itens.slice().sort((a, b) => a.seq - b.seq).reverse().find(it => it.saldoBanco !== null);
    if (ultimo) { itens.meta.saldoFinal = ultimo.saldoBanco; itens.meta.saldoData = ultimo.data; }
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
    // CSV do Bradesco não diz o banco, mas tem um formato próprio: "Extrato de: Ag: … | Conta: …" + Docto. + Saldo.
    const bradesco = /Extrato de:\s*Ag:/i.test(txt) && /Docto\./i.test(txt) && /Saldo \(R\$\)/i.test(txt) ? 'Bradesco' : '';
    const sicredi = /^\s*Data;Descricao;CodTransacao;Identificador;Tipo;Valor;Saldo/im.test(txt) ? 'Sicredi' : '';
    const banco = CODIGOS[tag('BANKID').padStart(3, '0')] || CODIGOS[tag('FID').padStart(3, '0')] || (porNome ? porNome[1] : '') || bradesco || sicredi;
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
    if (!m) {
      if (/C\/SAL/i.test(it.memo)) return 'Salário';
      const s = String(it.memo || '').match(/^(.+?)\s+-\s+(?:(\d{11}|\d{14})\s+)?(.+?)(?:\s+-\s+[A-Z]{2})?$/);   // Sicredi
      if (s) {
        const tipo = semAcento(s[1]), nome = s[3].replace(/^\d{8}\s+/, '').replace(/\s+(ltda|eireli|me|s\.?\s?a\.?)\.?$/i, '');
        if (/fatura/.test(tipo)) return `Fatura do cartão ${titulo(nome).replace(/\s+de\s+est$/i, '')}`.trim();
        if (/salario/.test(tipo)) return `Salário: ${titulo(nome)}`;
        if (/pix/.test(tipo)) return `Pix: ${titulo(nome)}`;
        return titulo(nome);
      }
      return frase(it.memo || it.nome || 'Sem descrição');
    }
    const tipo = m[1].trim();
    let det = m[2].replace(/^cp\s*:\s*\d+\s*-\s*/i, '').replace(/^no estabelecimento\s+/i, '');
    if (it.estabelecimento) det = it.estabelecimento.replace(/^\d{8}(?=\D)/, '');   // compra: sem a cidade (e sem a raiz do CNPJ)
    else if (/^\d/.test(det) && it.nome) det = it.nome;              // "00019 491964005 FULANO" → usa o nome
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
  const TRANSF = 'Transferência entre contas';
  const RE_TRANSF = /transferencia entre contas|mesma titularidade|entre contas proprias|transf(erencia)? para conta propria/;
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
      const proprio = meuNome && meuNome.every(p => texto.includes(p));   // seu nome no movimento
      const op = operacao(`${it.memo} ${it.nome}`);
      const categoria = (antigo && antigo.categoria) || (proprio || RE_TRANSF.test(texto) ? TRANSF : '') || conhecidas.get(semAcento(it.categoriaArquivo)) || aprendido.get(semAcento(desc)) || (regras.find(([re]) => re.test(texto)) || [])[1] || (op && op.categoria) || 'Outros';
      const avisos = [];
      if (proprio) avisos.push('Seu nome aparece no movimento: sugeri "Transferência entre contas", que não entra no saldo.');
      if (ctx.meio === 'credito' && it.tipo === 'receita' && /pagamento|pagto/.test(texto)) avisos.push('Pagamento da fatura: normalmente se ignora aqui, porque as compras já estão lançadas uma a uma.');
      else if (/fatura/.test(texto)) avisos.push('Pagamento de fatura: cuidado para não contar as compras do cartão duas vezes.');
      return { id: 't' + i, origem: it.origem, data: it.data, hora: it.hora || '', valor: it.valor, tipo: it.tipo, bruto: it.bruto, desc, categoria, fixo: false, avisos,
        operacao: op ? op.nome : '', cidade: it.cidade || '', saldoBanco: typeof it.saldoBanco === 'number' ? it.saldoBanco : null,
        seq: typeof it.seq === 'number' ? it.seq : null, dataCompra: it.dataCompra || '',
        instituicao: it.tipo === 'receita' && ISPB[it.ispbOrigem] ? ISPB[it.ispbOrigem] : '',
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

  /* Tipo de operação (Pix, débito, boleto, tarifa…), tirado do texto do banco.
     Também sugere uma categoria quando o histórico e as regras não dizem nada. */
  const OPERACOES = [
    [/devolvid|estorn/, 'Devolução', '↩️', 'Reembolso'],
    [/pix no credito|credito liberado/, 'Pix no crédito', '💳', ''],
    [/pix enviado|pix emitido|pix - enviado|pagamento pix/, 'Pix enviado', '⚡', ''],
    [/pix recebido|pix - recebido|recebimento pix/, 'Pix recebido', '⚡', ''],
    [/c\/sal|salario|folha de pag/, 'Salário', '💼', 'Salário'],
    [/compra no debito|compra debito|cartao de debito|cartao debito/, 'Débito', '💳', ''],
    [/compra no credito|compra a vista|parcela \d|compra parcelada/, 'Crédito', '💳', ''],
    [/fatura/, 'Fatura', '💳', 'Cartão de crédito'],
    [/pagamento de titulo|pagto titulo|boleto|cobranca|cod\.? ?barras|codigo de barras/, 'Boleto', '🧾', ''],
    [/cashback|resgate pontos|pontos/, 'Cashback', '🎁', 'Rendimentos'],
    [/pacote de servicos|tarifa|anuidade|\biof\b/, 'Tarifa', '🏦', 'Tarifas bancárias'],
    [/rendimento|juros|remuneracao/, 'Rendimento', '📈', 'Rendimentos'],
    [/\bted\b|\bdoc\b|transf/, 'Transferência', '🔁', ''],
    [/recebimento fornecedor|credito em conta|deposito/, 'Recebimento', '📥', ''],
    [/saque/, 'Saque', '🏧', ''],
  ];
  function operacao(texto) {
    const t = semAcento(texto);
    const o = OPERACOES.find(op => semAcento(op[1]) === t.trim()) || OPERACOES.find(([re]) => re.test(t));   // nome já salvo ou texto do banco
    return o ? { nome: o[1], emoji: o[2], categoria: o[3] } : null;
  }

  /* Detalhes que dá para tirar do texto do banco (não vêm em campo próprio no extrato):
     - CPF/CNPJ completos, quando aparecem (alguns bancos mascaram: ***.123.456-**);
     - raiz do CNPJ (8 dígitos) colada no nome, comum em MEI ("51245806Larissa");
     - no Pix do Inter, "Cp :60701190-" é o código (ISPB) do banco do outro lado. */
  // Texto com acentos estragados (ex.: "IntegraÃ§Ã£o"): conserta quando dá.
  function consertar(s) {
    if (!/Ã[\u0080-\u00bf]/.test(s)) return s;
    try {
      const bytes = Uint8Array.from([...s].map(c => { const n = c.charCodeAt(0); if (n > 255) throw 0; return n; }));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) { return s; }
  }
  /* Identificador do movimento (Sicredi):
     - Pix: "E" + código do banco que enviou (8) + data e hora em UTC (AAAAMMDDHHmm) + … → horário (Brasília) e,
       no Pix recebido, de qual banco veio;
     - cartão de débito: "TRA-…-AAAAMMDD-…" → dia em que a compra foi feita (o lançamento pode cair depois). */
  function dadosIdentificador(id) {
    const out = {};
    let m = String(id || '').match(/^E(\d{8})(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (m) {
      const utc = new Date(Date.UTC(+m[2], +m[3] - 1, +m[4], +m[5], +m[6]));
      const br = new Date(utc.getTime() - 3 * 3600e3);   // Brasília (sem horário de verão desde 2019)
      out.hora = `${String(br.getUTCHours()).padStart(2, '0')}:${String(br.getUTCMinutes()).padStart(2, '0')}`;
      out.ispbOrigem = m[1];
    }
    if ((m = String(id || '').match(/^TRA-\d+-(\d{4})(\d{2})(\d{2})-/))) out.dataCompra = `${m[1]}-${m[2]}-${m[3]}`;
    return out;
  }
  const ISPB = { '00000000': 'Banco do Brasil', '00360305': 'Caixa', '00416968': 'Inter', '60701190': 'Itaú', '60746948': 'Bradesco',
    '90400888': 'Santander', '18236120': 'Nubank', '31872495': 'C6 Bank', '10573521': 'Mercado Pago', '22896431': 'PicPay',
    '08561701': 'PagBank', '92702067': 'Banrisul', '01181521': 'Sicredi', '02038232': 'Sicoob' };
  const fmtCNPJ = d => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  const fmtCPF = d => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  function detalhes(texto) {
    const t = String(texto || ''), out = {};
    let m = t.match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/);
    if (m) out.documento = 'CNPJ ' + fmtCNPJ(m[1].replace(/\D/g, ''));
    if (!out.documento && (m = t.match(/(\*{3}\.\d{3}\.\d{3}-\*{2})/))) out.documento = 'CPF ' + m[1];
    if (!out.documento && (m = t.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/))) out.documento = 'CPF ' + m[1];
    if (!out.documento && (m = t.match(/\s-\s+(\d{11})\s+\S/))) out.documento = 'CPF ' + fmtCPF(m[1]);
    if (!out.documento && (m = t.match(/\b(\d{8})(?=[A-Za-zÀ-ú])/)) && !/cp\s*:\s*$/i.test(t.slice(0, m.index))) out.documento = `CNPJ ${m[1].slice(0, 2)}.${m[1].slice(2, 5)}.${m[1].slice(5)}/…`;
    if ((m = t.match(/cp\s*:\s*(\d{8})\s*-/i))) { if (ISPB[m[1]]) out.instituicao = ISPB[m[1]]; }
    return out;
  }

  g.Extrato = { operacao, estabelecimentoECidade, detalhes, decodificar, lerOFX, lerCSVBanco, lerArquivo, detectar, preparar, descricao, BANCOS };
})(typeof window !== 'undefined' ? window : globalThis);
