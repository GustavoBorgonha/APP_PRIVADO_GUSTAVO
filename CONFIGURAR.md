# Como configurar (uma vez só)

Resultado: repositório **privado**, site no ar, e só os e-mails Google que você autorizar conseguem
entrar e ver os dados. Tudo gratuito, sem cartão de crédito.

## 1. Firebase — login e banco de dados

1. Acesse https://console.firebase.google.com e clique em **Criar um projeto** (pode desativar o Google Analytics).
2. **Login com Google:** menu **Criação → Authentication → Vamos começar → Google → Ativar → Salvar**.
3. **Banco de dados:** menu **Criação → Firestore Database → Criar banco de dados** → local `southamerica-east1 (São Paulo)` → **modo de produção**.
4. **Regras:** na aba **Regras** do Firestore, apague o que estiver lá, cole o conteúdo do arquivo
   [`firestore.rules`](firestore.rules) e clique em **Publicar**.
5. **Lista de e-mails autorizados:** na aba **Dados** do Firestore:
   - **Iniciar coleção** → ID da coleção: `acesso`
   - ID do documento: `permitidos`
   - Campo: `emails` · Tipo: `array` · adicione um valor `string` para cada e-mail (em minúsculas),
     por exemplo o seu Gmail e o da sua namorada.
   - Para liberar ou remover alguém no futuro, é só editar esse campo.
6. **Configuração do app:** engrenagem ⚙️ → **Configurações do projeto → Seus apps → ícone `</>` (Web)** →
   dê um apelido e registre. Copie o bloco `firebaseConfig = { ... }` e cole em
   [`firebase-config.js`](firebase-config.js) (ou envie para o Claude preencher).

## 2. Cloudflare — colocar o site no ar a partir do repositório privado

1. Crie a conta em https://dash.cloudflare.com/sign-up (grátis, sem cartão).
2. **Workers & Pages → Create → Import a repository → GitHub**, autorize o Cloudflare só no
   repositório `APP_PRIVADO_GUSTAVO` e escolha o nome `appgustavo`.
3. Deixe o comando de publicação como `npx wrangler deploy` (sem build). A configuração fica no
   [`wrangler.jsonc`](wrangler.jsonc); o [`.assetsignore`](.assetsignore) tira do site os arquivos internos.
4. Em **Domains**, ligue o endereço **workers.dev** (Production) e deixe o Preview desligado.
   Endereço atual: **https://appgustavo.gustavo13bor.workers.dev**
5. A cada commit na `main`, o Cloudflare publica sozinho (plano grátis: centenas de publicações por mês).

## 3. Autorizar o endereço do site no Firebase

No Firebase: **Authentication → Configurações → Domínios autorizados → Adicionar domínio** e coloque o
endereço do site, sem `https://` (hoje: `appgustavo.gustavo13bor.workers.dev`). Sem isso o login com
Google é bloqueado.

## 4. Deixar o repositório privado

No GitHub: **Settings → General → Danger Zone → Change repository visibility → Private**.
(O GitHub Pages para de funcionar, mas o site continua no Cloudflare.)

## Como a proteção funciona

- O endereço do site é público, mas quem não fizer login só vê a tela **“Entrar com Google”**.
- Os dados ficam no Firestore, e as regras (`firestore.rules`) só liberam leitura/escrita para e-mails
  verificados que estejam na lista `acesso/permitidos`. Essa lista não pode ser alterada pelo app —
  só por você, no console do Firebase.
- Os valores em `firebase-config.js` não são senha; servem apenas para o app saber qual projeto usar.

## Atualizar as regras do Firebase (quando o app mudar)

Sempre que o arquivo [`firestore.rules`](firestore.rules) mudar, cole a versão nova no Firebase:
**Firestore Database → Regras** → apague tudo → cole o conteúdo do arquivo → **Publicar**.

- Novembro/2026: entrou a regra `triagens`, que deixa a triagem de extrato continuar em qualquer
  aparelho. Sem ela, a triagem funciona, mas fica salva só no aparelho onde começou.
- Novembro/2026: entrou a regra `categorias`, para as categorias criadas valerem em todos os
  aparelhos. Sem ela, as categorias ficam salvas só no aparelho onde foram criadas.
- Novembro/2026: entrou a regra `agendados` (lançamentos futuros). Sem ela, os agendamentos ficam
  salvos só no aparelho onde foram criados.
