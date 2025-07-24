
import { create, Client } from '@open-wa/wa-automate';

import fetch from 'node-fetch';

const OPENAI_API_KEY = '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';

async function getChatGPTResponse(userPrompt) {
  const systemPrompt = 'Você é um assistente financeiro pessoal, focado em ajudar o usuário a organizar, planejar e melhorar sua vida financeira. Seja objetivo, amigável e prático. Dê dicas de economia, controle de gastos, investimentos simples e motivação para manter as finanças em dia.';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error('OpenAI API error: ' + err);
  }
  const data = await response.json();
  return data.choices[0].message.content.trim();
}


create().then((client) => start(client));

function start(client) {
  client.onMessage(async (message) => {
    // Número do usuário autorizado (formato WhatsApp JID)
    const allowedNumber = '5521980915678@c.us';
    if (message.from !== allowedNumber) return;
    if (message.body.startsWith('!')) {
      const pergunta = message.body.slice(1).trim();
      if (pergunta.length === 0) return;
      try {
        const resposta = await getChatGPTResponse(pergunta);
        await client.sendText(message.from, resposta);
      } catch (err) {
        await client.sendText(message.from, 'Erro ao consultar ChatGPT: ' + err.message);
      }
    }
  });
}
