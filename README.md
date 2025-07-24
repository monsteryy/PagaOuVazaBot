# Bot Finanças Rapha

Assistente financeiro pessoal no Telegram, com integração Gemini AI.

## Comandos principais
- `/start` — Boas-vindas e comandos
- `/planejamento` — Mostra planejamento financeiro
- `/addgasto <valor> <desc>` — Adiciona gasto (ex: `/addgasto 25 lanche`)
- `/resumo` — Resumo semanal e motivação
- `/lembretes` — Lembretes de pagamentos
- `/comandos` ou `/suporte` — Lista comandos

## Rodando localmente
1. Instale dependências:
   ```
npm install
   ```
2. Configure o arquivo `.env` com os tokens (já incluso)
3. Inicie o bot:
   ```
npm start
   ```

## Observações
- Dados salvos em `data.json` (pode migrar para banco cloud depois)
- Integração Gemini AI para mensagens motivacionais/zoeiras
- Pronto para deploy em Railway, Render, Heroku, etc.
