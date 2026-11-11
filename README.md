# Meu Controle — aplicativo pessoal do Gustavo

App e site (PWA) para controle pessoal: funciona no navegador do computador e pode ser
instalado no celular como aplicativo, inclusive offline.

## O que tem

- **💰 Finanças** — planilha de receitas e despesas por mês, categorias, saldo, taxa de economia,
  lançamentos fixos (copiar para o mês seguinte) e exportar/importar **CSV** (abre no Excel e Google Sheets).
- **🏦 Importar extrato do banco** (OFX ou CSV) — os movimentos passam por uma **triagem**: o app sugere
  descrição e categoria, e você confirma ou ignora um por um. Nada entra sozinho.
- **🎯 Planos** — viagens e passeios, casamento, compra de casa, compra de carro ou outro objetivo:
  - meta e data alvo, com cálculo de **quanto guardar por mês**
  - lista de custos previstos x pagos (já vem com sugestões para cada tipo)
  - registro do dinheiro guardado
  - checklist de tarefas e anotações
- **⚙️ Dados** — backup e restauração (JSON).

## Acesso e dados

- **Com Firebase configurado** (veja [CONFIGURAR.md](CONFIGURAR.md)): login com Google, acesso apenas
  para os e-mails autorizados, e dados **compartilhados e sincronizados em tempo real** entre
  computador e celulares (funciona offline e sincroniza depois).
- **Sem configurar**: modo local — os dados ficam só no aparelho (localStorage).

O site é publicado pelo **Cloudflare** (Workers com arquivos estáticos) a partir deste repositório:
**https://appgustavo.gustavo13bor.workers.dev**

## Rodar localmente

```bash
python3 -m http.server 8000
```

Depois abra http://localhost:8000.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | estrutura da página |
| `styles.css` | visual (tema claro/escuro, layout celular/computador) |
| `app.js` | toda a lógica do app |
| `nuvem.js`, `firebase-config.js` | login Google e sincronização (Firebase) |
| `firestore.rules` | regras de segurança do banco de dados |
| `wrangler.jsonc`, `.assetsignore`, `_headers` | configuração da publicação no Cloudflare |
| `manifest.webmanifest`, `sw.js`, `icons/` | instalação como app e funcionamento offline |
