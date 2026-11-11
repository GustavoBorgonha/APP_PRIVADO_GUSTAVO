# Meu Controle — app pessoal do Gustavo

PWA em JavaScript puro (sem framework, sem build) para finanças pessoais e planejamento
(viagens/passeios, casamento, compra de casa e de carro). Interface e código em português (pt-BR).

## Como funciona

- **Site:** https://appgustavo.netlify.app — o Netlify publica sozinho a cada commit na `main`.
- **Login e dados:** Firebase (projeto `projetogustavoapp-88b20`): login Google + Cloud Firestore.
  - Coleções: `lancamentos`, `planos` (dados compartilhados entre os usuários autorizados) e
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
- `app.js` — toda a lógica e as telas (Início, Finanças, Planos, Dados).
  O estado fica em `db = { lancamentos, planos }`; toda mudança chama `salvar()` e `render()`.
- `extrato.js` — lê extratos do banco (OFX e CSV com Crédito/Débito) e sugere descrição/categoria
  (`Extrato.preparar`). Nunca grava direto: os itens vão para `ui.triagem` e a tela `vTriagem` (em
  `app.js`) exige "Confirmar" em cada um. O lançamento confirmado guarda `origem` (ex.: `ofx:FITID`)
  além de `banco` e `meio` (`debito`/`credito`), escolhidos na janela "De onde é este extrato?".
  Duplicados: mesmo `origem` fica fora da triagem (estado `duplicado`); mesma data+valor+tipo pede
  confirmação extra ao confirmar (`parecido`).
  Cada importação tem um `lote` (salvo no lançamento com `loteArquivo`/`loteEm`): "Cancelar importação"
  na triagem ou na aba Dados (`vImportacoes`) apaga todos os lançamentos daquele lote. Não versionar extratos reais; os testes usam
  extratos de mentira.
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
- Guia de configuração (Firebase, Netlify): `CONFIGURAR.md`.
