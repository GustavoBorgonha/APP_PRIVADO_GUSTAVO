# Meu Controle — aplicativo pessoal do Gustavo

App e site (PWA) para controle pessoal: funciona no navegador do computador e pode ser
instalado no celular como aplicativo, inclusive offline.

## O que tem

- **💰 Finanças** — planilha de receitas e despesas por mês, categorias, saldo, taxa de economia,
  lançamentos fixos (copiar para o mês seguinte) e exportar/importar **CSV** (abre no Excel e Google Sheets).
- **🎯 Planos** — viagens e passeios, casamento, compra de casa, compra de carro ou outro objetivo:
  - meta e data alvo, com cálculo de **quanto guardar por mês**
  - lista de custos previstos x pagos (já vem com sugestões para cada tipo)
  - registro do dinheiro guardado
  - checklist de tarefas e anotações
- **🧮 Simulador** de financiamento (Price e SAC) para casa e carro.
- **⚙️ Dados** — backup e restauração (JSON).

Os dados ficam salvos **no próprio aparelho** (localStorage). Use o backup para passar do computador
para o celular ou guardar uma cópia.

## Como publicar (GitHub Pages)

1. No GitHub: **Settings → Pages**.
2. Em *Source*, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e salve.
3. Em ~1 minuto o site estará em `https://<seu-usuario>.github.io/aplicativo_pessoal_gustavo/`.
4. No celular, abra esse endereço e use **“Adicionar à tela inicial”**.

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
| `manifest.webmanifest`, `sw.js`, `icons/` | instalação como app e funcionamento offline |
