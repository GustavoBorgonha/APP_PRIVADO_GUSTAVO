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
- `app.js` — toda a lógica e as telas (Início, Finanças, Planos, Simulador, Dados).
  O estado fica em `db = { lancamentos, planos }`; toda mudança chama `salvar()` e `render()`.
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
