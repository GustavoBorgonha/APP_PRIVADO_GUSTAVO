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
- Novembro/2026: entraram as regras `tarefas` e `pessoas` (calendário). Sem elas, o calendário
  fica salvo só no aparelho onde foi usado.
- Novembro/2026: entrou a regra `cotacoes`. Sem ela, as cotações ficam salvas só no aparelho.

## Avisos no Telegram do calendário

Os avisos saem pela mesma ponte do Google (Apps Script) da planilha de cidades, por um robô do
Telegram que é só seu (gratuito e oficial).

1. **Criar o robô:** no Telegram, procure **@BotFather** (tem o selo azul), toque em **Iniciar** e mande
   `/newbot`. Ele pede um nome (ex.: *Meu Controle*) e depois um usuário que termine em `bot`
   (ex.: *meucontrole_gustavo_bot*). No fim ele manda um **token** (algo como `123456789:AAH…`).
   Esse token é senha: não mande para ninguém.
2. **Atualizar a ponte:** abra o projeto do Apps Script, apague o código e cole o de
   [`apps-script/Codigo.gs`](apps-script/Codigo.gs). Preencha `EMAILS_PERMITIDOS` com os e-mails de vocês
   dois e cole o token em `TELEGRAM_TOKEN` (entre as aspas). Salve.
3. **Publicar a versão nova** (o endereço continua o mesmo): **Implantar → Gerenciar implantações →
   lápis (editar) → Versão: Nova versão → Implantar**.
4. **Ligar o relógio dos avisos:** no editor, escolha a função **instalarAvisos** e clique em **Executar**.
   Aceite as permissões. O relógio roda a cada 5 minutos (lembretes na hora das rotinas). Se você rodou
   antes de novembro/2026 (versão de hora em hora), rode de novo.
5. **Conectar o grupo do casal:** no Telegram, crie um grupo com vocês dois. No app, **Configurações →
   Pessoas e Telegram → Conectar grupo**: o Telegram pergunta em qual grupo pôr o robô; escolha o de
   vocês. O robô dá "Oi, casal!" no grupo. Volte ao app, toque em **🔄 Atualizar** e em **Enviar teste**.
   (Se preferir cada um no privado: **Conectar** ao lado de cada nome, no celular de cada um.)

Como funciona: quando alguém cria uma tarefa para o outro, chega uma mensagem na hora. Enquanto a
pessoa não tocar em **👀 Vi**, todo dia às 8h chega um resumo com o que falta ver (e o que é para hoje).
