import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';

dotenv.config();

// Carrega tokens do .env
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let conversationHistory = [];
// Estados de diálogo por usuário
const userDialogState = {};

async function getChatGPTResponse(userPrompt) {
  const systemPrompt = `Você é o melhor amigo carioca zoeiro do Rapha, ajudando ele a controlar as finanças. Sempre responda de forma informal, engraçada, com humor leve ou pesado, usando piadas e tiradas típicas do Rio. Nunca seja sério ou inspiracional, nada de frases tipo 'acredite nos seus sonhos'. Use frases como 'Rapha, tu vai gastar com lanche de novo? Tá achando que é o Whindersson?' ou 'Se continuar assim, vai ter que pedir fiado pro pastel da feira!'. Sempre mantenha a motivação e leveza, mas sem perder a zoeira. Dê dicas de economia, controle de gastos, investimentos simples e feedback sobre gastos com lazer e besteiras, tudo no tom de amigo zoeiro. Mantenha o propósito de assistente financeiro, sempre trazendo o Rapha de volta pro foco quando ele se perder. Adapte suas respostas ao histórico da conversa e lembre do que já foi falado.`;
  conversationHistory.push({ role: 'user', content: userPrompt });
  if (conversationHistory.length > 10) conversationHistory = conversationHistory.slice(-10);
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
        ...conversationHistory,
      ],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Não consegui responder agora, tenta de novo!';
}

// Handler de erro
global.onerror = (err) => console.error('Erro global:', err);

bot.launch();
console.log('Bot rodando 24h...');
