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
        ...conversationHistory
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
  const reply = data.choices[0].message.content.trim();
  conversationHistory.push({ role: 'assistant', content: reply });
  if (conversationHistory.length > 10) conversationHistory = conversationHistory.slice(-10);
  return reply;
}

// Utilidades de armazenamento
const DATA_FILE = 'data.json';
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { gastos: [], pagamentos: [], planejamento: {} };
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Resposta motivacional e financeira via ChatGPT
async function zoaRapha(msg, foco = false) {
  const prompt = `Responda como um amigo carioca zoeiro, mas que quer ajudar o Rapha a se organizar financeiramente. Seja engraçado, mas puxe pro foco. Mensagem: ${msg}`;
  return await getChatGPTResponse(prompt);
}

// /start

// Bot responde concretamente a qualquer mensagem (texto ou áudio)
bot.on('message', async (ctx) => {
  if (ctx.message.voice || ctx.message.audio) {
    // Gera resposta concreta via ChatGPT
    const respostaTexto = await getChatGPTResponse('Rapha mandou áudio: ' + (ctx.message.caption || '')); 
    try {
      const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: respostaTexto,
          voice: 'onyx'
        })
      });
      const audioBuffer = await ttsRes.arrayBuffer();
      await ctx.replyWithVoice({ source: Buffer.from(audioBuffer) });
    } catch (err) {
      ctx.reply('Erro ao gerar áudio: ' + err.message);
    }
    return;
  }

  const text = ctx.message.text?.trim();
  const from = ctx.message.from?.username || ctx.message.from?.id || 'desconhecido';
  const isForwarded = !!ctx.message.forward_date;
  console.log(`[TELEGRAM LOG] De: ${from} | Texto: "${ctx.message.text}" | Encaminhada: ${isForwarded}`);

  if (isForwarded) {
    ctx.reply(await getChatGPTResponse('Mensagem encaminhada: ' + ctx.message.text));
    return;
  }

  if (text) {
    ctx.reply(await getChatGPTResponse(text));
  }
});

// Handler de erro
global.onerror = (err) => console.error('Erro global:', err);

bot.launch();
console.log('Bot rodando 24h...');
