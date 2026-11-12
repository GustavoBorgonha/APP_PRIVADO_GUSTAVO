# Meu Controle — app pessoal do Gustavo

PWA em JavaScript puro (sem framework, sem build) para finanças pessoais e planejamento
(viagens/passeios, casamento, compra de casa e de carro). Interface e código em português (pt-BR).

## Como funciona

- **Site:** https://appgustavo.gustavo13bor.workers.dev — o Cloudflare (Workers com arquivos estáticos,
  `wrangler.jsonc` + `.assetsignore` + `_headers`) publica sozinho a cada commit na `main`. Saiu do
  Netlify em novembro/2026 por causa do limite de créditos do plano grátis.
- **Login e dados:** Firebase (projeto `projetogustavoapp-88b20`): login Google + Cloud Firestore.
  - Coleções: `lancamentos`, `planos` (dados compartilhados entre os usuários autorizados),
    `triagens` (triagem de extrato em andamento), `categorias` (categorias criadas/editadas),
    `agendados` (lançamentos futuros) e
    `acesso/permitidos` (campo `emails`: lista de quem pode entrar, editada só pelo console).
  - Regras em `firestore.rules`. Se mudarem, o Gustavo precisa colar no console do Firebase
    (aba Regras) — não há deploy automático das regras.
- **Modo local:** se `window.FIREBASE_CONFIG` for `null`, o app usa só `localStorage`.

## Arquivos

- `index.html`, `styles.css` — estrutura e visual (tema claro/escuro, celular/computador).
  Visual inspirado no app Toki: base preto/branco, degradê pastel, cards arredondados, botões em pílula.
  Telas no padrão de app de banco: cartão de saldo (`.hero`) com botão do olho para ocultar valores
  (`ui.oculto`; use `din()` para dinheiro na tela), atalhos (`.atalhos`), extrato por dia (`itemExtrato`).
  Animação de entrada só ao trocar de tela (classe `entrando` no `#app`); janelas viram "folha" no celular.
  Mascote: panda em `panda.js` (`PandaSVG` desenha humores/acessórios; `Mascote` cuida de reações,
  cochilo por inatividade e falas). Estilo chibi; poses por humor: deitado (preguiça/dormindo, com lua),
  ✌️ (feliz) e golpe de kung fu (bravo). Acessórios ficam no localStorage (`apg-panda`), por aparelho,
  e são escolhidos no "Provador do panda" da aba Dados (`vSeuPanda`: cartões com mini pandas).
  `icons/panda.svg` e `icons/icon.svg` são gerados a partir do `PandaSVG`. Fonte Outfit em `fonts/`.
- Categorias: `CATS_PADRAO` (as que vêm com o app) + `db.categorias` (novas e alterações; coleção
  `categorias` no Firestore, em lote separado; sem a regra, ficam no aparelho em `apg-categorias`).
  Tela `vCategorias` (aba interna `categorias`, aberta por Finanças/Dados) e janela `modalCategoria`:
  nome, tipo (despesa/receita/ambos) e ícone (emoji da lista, emoji próprio ou imagem reduzida a 96px).
  Use `listaCategorias()`, `nomesCats(tipo)`, `iconeCat(nome, tipo)` (devolve HTML) e `opcoesCats()`.
  Renomear atualiza os lançamentos; excluir passa os lançamentos para "Outros".
  Escolha de categoria é feita pelo seletor próprio `seletorCat()` (botão + lista com ícones, em ordem
  alfabética e com busca; valor num input hidden que dispara "change"), não por <select>.
  A janela também tem "Mover lançamentos" (`moverLancs`): leva todos os lançamentos daquela categoria
  (cadastrada ou solta) para outra; os de tipo incompatível com o destino ficam onde estão.
- Categoria "Transferência entre contas" (`TRANSF`): aparece no extrato, mas fica fora de receitas,
  despesas e saldo (`contaNoSaldo`). Na importação é sugerida quando o nome do usuário aparece no movimento.
- `app.js` — toda a lógica e as telas (Início, Finanças, Extratos, Planos, Dados).
  O estado fica em `db = { lancamentos, planos }`; toda mudança chama `salvar()` e `render()`.
- `extrato.js` — lê extratos do banco (OFX e CSV com Crédito/Débito) e sugere descrição/categoria
  (`Extrato.preparar`). Nunca grava direto: os itens vão para `ui.triagem` e a tela `vTriagem` (em
  `app.js`) exige "Confirmar" em cada um. O lançamento confirmado guarda `origem` (ex.: `ofx:FITID`)
  além de `banco`, `meio` (`debito`/`credito`) e `titular` (de quem é a conta), escolhidos na janela
  "De onde é este extrato?". O titular é texto livre, com sugestões dos já usados.
  Duplicados: mesmo `origem` fica fora da triagem (estado `duplicado`); mesma data+valor+tipo pede
  confirmação extra ao confirmar (`parecido`).
  Cada importação tem um `lote` (salvo no lançamento com `loteArquivo`/`loteEm`): "Cancelar importação"
  na triagem ou no histórico da aba Extratos (`vExtratos`) apaga todos os lançamentos daquele lote.
  A triagem fica salva para continuar de onde parou: com login, no Firestore (`triagens/atual`, uma
  triagem por vez, compartilhada entre aparelhos — `App.salvarTriagem`/`App.receberTriagem`); sem login
  ou se as regras recusarem, no aparelho (`apg-triagem`). "Voltar" pausa, e o aviso "Triagem em
  andamento" (Início/Finanças/Extratos) permite continuar ou descartar.
  "⚡ Triagem automática" (`modalTriagemAuto`/`planoTriagemAuto`): refaz descrição/categoria pelo histórico
  (`memoriaHistorico`: mesmo texto do banco → `bruto` salvo no lançamento; depois descrição e "chave" do
  estabelecimento, `chaveMov`) e confirma de uma vez; estornos são ignorados; valor já lançado, fatura e dados
  faltando ficam para revisar. Não mexe no que foi editado à mão (`catManual`/`descManual`).
  Detalhes nos cartões (triagem e revisão): `hora` (só se o OFX trouxer DTPOSTED/DTUSER com horário; o Inter
  não traz) e `Extrato.detalhes(bruto)`: CPF/CNPJ que aparecer no texto, raiz do CNPJ colada no nome (MEI) e
  banco do outro lado do Pix pelo código ISPB em "Cp :XXXXXXXX-" (tabela `ISPB`). O extrato do Inter não traz
  o CPF/CNPJ da outra parte.
  Dados do arquivo (`lerOFX`/`lerCSVBanco` devolvem `itens.meta`): agência, conta, saldo final (+data) e data/hora
  em que o extrato foi gerado; vão para `ui.triagem.meta` e para cada lançamento (`loteAgencia`, `loteConta`,
  `loteSaldo`, `loteSaldoData`, `loteGerado`). Por movimento: `operacao` (Pix, Débito, Boleto, Tarifa… —
  `Extrato.operacao`, também sugere categoria), `cidade` (compra no débito do Inter: NAME em colunas fixas
  22/13/3) e `saldoBanco` (coluna Saldo do Bradesco). O Bradesco é reconhecido pelo formato do CSV.
  Conta corrente usa o último saldo informado pelo banco como referência (✓ bate / ⚠️ difere) e
  `outroLado()` liga "PIX ENVIADO" sem nome ao mesmo valor recebido em outra conta no mesmo dia.
  Saídas aparecem em vermelho (CSS em `.mov-val`), transferências entre contas em cinza. Não versionar extratos reais; os testes usam
  extratos de mentira.
- `revisao.js` — duas telas internas abertas por Finanças: **Revisar categoria** (`vRevisao`, aba `revisao`):
  período + categoria → cartões estilo triagem para trocar categoria/descrição e confirmar ou pular; sugere
  pelo histórico sem contar a própria categoria (`memoriaHistorico(filtro)`), com "Aplicar sugestões".
  **Conta corrente** (`vContas`, aba `contas`): cada conta = banco + meio + titular (`chaveConta`), lista
  cada movimento (inclusive transferências) com o saldo depois dele; saldo começa em zero no 1º lançamento.
- `agenda.js` — **Lançamentos futuros** (aba interna `agenda`, aberta por Finanças): `db.agendados` (coleção
  `agendados`), cada um uma regra (`inicio`, `repete`: nao/mensal/semanal/anual, `ate` opcional) com `feitos`
  por data (`pago` com `lancId` ou `pulado`). Ocorrências (`ocorrencias`/`vencidos`) NÃO entram no saldo; as
  vencidas aparecem em "🔔 para confirmar" (Início, Finanças, agenda). Confirmar cria o lançamento (com
  `agendaId`) ou, se já veio pelo extrato (`jaLancado`: mesmo valor/tipo, ±5 dias), só marca como pago.
  Finanças mostra "📅 A pagar/A receber" do mês. Coleções extras da nuvem (`EXTRAS`: categorias, agendados)
  caem para o aparelho se as regras recusarem (`App.semNuvem`).
- `cidades.js` + `planilha-config.js` — tela "Cidades de SC" (aba interna `cidades`, entrada pelo cartão em
  Planos), espelho da planilha do Google "Cidades_SC_visitadas" (aba Cidades). A planilha é a fonte: o app
  fala com ela por uma ponte em Apps Script (`apps-script/Codigo.gs`, publicada como App da Web; a URL vai em
  `planilha-config.js`), mandando o ID token do Firebase (`App.idToken()`), que a ponte confere no Identity
  Toolkit + lista de e-mails. Alterações vão para a fila `Cid.pend` (localStorage `apg-cidades-pend`) e são
  enviadas na hora; a lista fica em cache (`apg-cidades`). Busca novidades ao abrir a tela e a cada 1 min.
  Falhou: faixa de aviso na tela (`faixaSincronizacao`) e, se houver fila, também em Início/Planos
  (`avisoCidadesGlobal`). O teste simula a ponte.
  Mapa estilo "Maps": Leaflet 1.9.4 (unpkg, com SRI, carregado só nessa tela) + mapa base do OpenStreetMap
  (sem chave; no tema escuro as imagens são escurecidas por CSS — o CARTO passou a exigir chave); criado uma vez e reaproveitado entre redesenhos (`montarMapaCidades`).
  Sem internet para o mapa, cai no mapa simples de pontos (`mapaCidades`). No CI o Leaflet vem de node_modules.
- `nuvem.js` — login e sincronização. `App.sincronizar(db)` envia só o que mudou; os
  `onSnapshot` chamam `App.receber()`.
- `firebase-config.js` — configuração pública do Firebase (não é segredo).
- `sw.js`, `manifest.webmanifest`, `icons/` — instalação como app e uso offline.
  Ao mudar a lista de arquivos do app, atualize `ARQUIVOS` e a versão do `CACHE` em `sw.js`.
- `tests/smoke.js` — teste no navegador (Playwright) dos modos local e nuvem (Firebase simulado).
- `.github/workflows/verificar.yml` — roda sintaxe + teste a cada commit.

## Regras de trabalho

- Rode `node tests/smoke.js` antes de cada commit (precisa de `playwright` instalado).
- Commits em português, direto na `main` (o site atualiza em ~1 minuto).
- Manter sem dependências e sem etapa de build.
- O Gustavo não é programador experiente: explique os passos de configuração de forma simples.
- Guia de configuração (Firebase, Cloudflare): `CONFIGURAR.md`.
- Arquivo novo que não deve ir para o site? Adicione no `.assetsignore`.
