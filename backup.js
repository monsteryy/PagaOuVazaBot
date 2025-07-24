import dotenv from 'dotenv';
import PDFDocument from 'pdfkit';
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
  const systemPrompt = `Você é o melhor amigo carioca do Rapha, ajudando ele a controlar as finanças. Responda de forma leve, informal e divertida, mas não precisa fazer piada o tempo todo. Use zoeira e piadas típicas do Rio apenas em contextos que pedem descontração ou quando o Rapha exagera nos gastos, para não saturar. Evite ser sério ou inspiracional, e não use frases tipo 'acredite nos seus sonhos'. Dê dicas de economia, controle de gastos, investimentos simples e feedback sobre gastos com lazer e besteiras, sempre mantendo o propósito de assistente financeiro. Adapte suas respostas ao histórico da conversa e lembre do que já foi falado.`;
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
// Funções de persistência
function loadData() {
  try {
    const raw = fs.readFileSync('data.json', 'utf8');
    const data = JSON.parse(raw);
    if (!data.lembretes) data.lembretes = [];
    return data;
  } catch {
    return { gastos: [], pagamentos: [], planejamento: {}, dividas: {}, lembretes: [] };
  }
}

function saveData(data) {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

// Função para enviar lembretes automáticos de pagamento
function enviarLembretes(bot) {
  setInterval(() => {
    const data = loadData();
    if (data.lembretes && data.lembretes.length > 0) {
      data.lembretes.forEach(lembrete => {
        bot.telegram.sendMessage(
          lembrete.userId,
          `Lembrete: Não esqueça de pagar ${lembrete.descricao}!`
        );
      });
    }
  }, 1000 * 60 * 60 * 6); // a cada 6 horas
}
enviarLembretes(bot);

// Função para resumo semanal
async function resumoSemanal(bot) {
  const data = loadData();
  const total = data.gastos.reduce((acc, g) => acc + g.valor, 0);
  let msg = `Resumo da semana:\nTotal de gastos: R$${total.toFixed(2)}\n`;
  const lazer = data.gastos.filter(g => /lazer|besteira|lanche|bar|balada|cinema|jogo/i.test(g.descricao));
  if (lazer.length > 0) {
    msg += `Gastos com lazer/besteiras: R$${lazer.reduce((acc, g) => acc + g.valor, 0).toFixed(2)}\n`;
  }
  if (total > 1000) {
    msg += 'Rapha, tu tá gastando igual jogador de futebol! Bora segurar a onda!';
  } else if (total > 500) {
    msg += 'Tá gastando, mas ainda tá de boa. Só não exagera no pastel!';
  } else {
    msg += 'Tá tranquilo, pode até tomar um caldo de cana na feira!';
  }
  await bot.telegram.sendMessage(process.env.TELEGRAM_USER_ID || '', msg);
}

// Agendar resumo semanal todo domingo às 20h
function agendarResumoSemanal(bot) {
  setInterval(() => {
    const agora = new Date();
    if (agora.getDay() === 0 && agora.getHours() === 20 && agora.getMinutes() < 10) {
      resumoSemanal(bot);
    }
  }, 1000 * 60 * 10); // verifica a cada 10 minutos
}
agendarResumoSemanal(bot);

// Handler principal de mensagens
bot.on('text', async (ctx) => {
  // Comando secreto de zoeira
  if (/tô pobre|to pobre|tô liso|to liso|tô quebrado|to quebrado|tô duro|to duro/i.test(text)) {
    const zoeiras = [
      'Rapha, tu tá tão liso que se tropeçar cai em débito.',
      'Tá mais seco que piscina de hotel barato!',
      'Se pedir fiado no pastel da feira, o cara te dá só o guardanapo!',
      'Tua conta tá igual praia em dia de chuva: só areia!',
      'Se continuar assim, vai ter que pedir dinheiro pro pipoqueiro da esquina!',
      'Rapha, tu tá mais duro que pão de ontem!',
      'Nem o Uber aceita tua corrida, só se for a pé!'
    ];
    const resposta = zoeiras[Math.floor(Math.random() * zoeiras.length)];
    await ctx.reply(resposta);
    return;
  }
  // Comando gerar relatório em PDF
  if (/gerar relatório|exportar dados|relatório pdf/i.test(text)) {
    const data = loadData();
    const mesAtual = new Date().getMonth();
    const gastosMes = data.gastos.filter(g => new Date(g.data).getMonth() === mesAtual);
    if (gastosMes.length === 0) {
      await ctx.reply('Nenhum gasto registrado este mês para gerar relatório.');
      return;
    }
    // Gerar PDF
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);
      await ctx.replyWithDocument({ source: pdfBuffer, filename: 'relatorio_gastos.pdf' });
    });
    doc.fontSize(18).text('Relatório de Gastos do Mês', { align: 'center' });
    doc.moveDown();
    gastosMes.forEach((g, i) => {
      doc.fontSize(12).text(
        `${i + 1}. R$${g.valor.toFixed(2)} - ${g.descricao} [${g.categoria || 'outros'}] (${new Date(g.data).toLocaleDateString()})`
      );
    });
    doc.end();
    return;
  }
  const userId = ctx.message.from.id;
  const text = ctx.message.text?.trim();
  if (!text) return;

  // Diálogo de adicionar gasto
  if (userDialogState[userId] === 'addGasto') {
    // Validação: precisa valor + descrição
    const valDesc = text.match(/([\d,.]+)\s+(.+)/);
    if (!valDesc) {
      await ctx.reply('Formato inválido. Envie: valor descrição (ex: 50 lanche)');
      return;
    }
    const valor = parseFloat(valDesc[1].replace(',', '.'));
    const descricao = valDesc[2];
    // Categorização automática
    let categoria = 'outros';
    if (/ifood|mc|burger|pizza|lanche|besteira|bar|balada|cinema|doces|sorvete/i.test(descricao)) categoria = 'besteiras';
    else if (/uber|99|taxi|ônibus|metro|transporte/i.test(descricao)) categoria = 'transporte';
    else if (/mercado|supermercado|carrefour|pão de açúcar|compras/i.test(descricao)) categoria = 'mercado';
    else if (/ps5|jogo|game/i.test(descricao)) categoria = 'games';
    else if (/farmácia|remédio|medicamento/i.test(descricao)) categoria = 'saúde';
    else if (/aluguel|condominio|iptu|conta de luz|conta de água|internet/i.test(descricao)) categoria = 'moradia';
    // Adiciona gasto
    const data = loadData();
    data.gastos.push({ valor, descricao, categoria, data: new Date().toISOString() });
    saveData(data);
    await ctx.reply(`Gasto de R$${valor.toFixed(2)} com "${descricao}" adicionado na categoria "${categoria}"!`);
    userDialogState[userId] = null;
    return;
  }

  // Diálogo de confirmar pagamento
  if (userDialogState[userId] === 'confPagamento') {
    const valDesc = text.match(/([\d,.]+)\s+(.+)/);
    if (valDesc) {
      const valor = parseFloat(valDesc[1].replace(',', '.'));
      const descricao = valDesc[2];
      const data = loadData();
      data.pagamentos.push({ valor, descricao, data: new Date().toISOString() });
      // Remover lembrete se existir
      if (data.lembretes) {
        data.lembretes = data.lembretes.filter(l => l.userId !== userId || l.descricao !== descricao);
      }
      saveData(data);
      await ctx.reply(`Pagamento de R$${valor.toFixed(2)} para "${descricao}" confirmado!`);
      userDialogState[userId] = null;
    } else {
      await ctx.reply('Formato inválido. Envie: valor descrição (ex: 30 mercado)');
    }
    return;
  }

  // Comando /ajuda
  if (/^\/ajuda$/i.test(text)) {
    await ctx.reply(
      `📝 *Comandos do Bot Financeiro*\n\n` +
      `*Gastos e Pagamentos:*\n` +
      `• adicionar gasto — Inicia diálogo para inserir gasto\n` +
      `• meus gastos ou gastos do mês — Mostra gastos registrados no mês\n` +
      `• pagar ou confirmei o pagamento — Marca uma conta como paga\n` +
      `• dashboard financeiro — Mostra resumo simplificado do mês\n` +
      `• gerar relatório — Exporta os gastos do mês em PDF\n\n` +
      `*Planejamento e Limites:*\n` +
      `• planejamento do mês — Mostra ou cria metas mensais\n` +
      `• quanto posso gastar hoje? — Mostra limite diário baseado na meta\n\n` +
      `*Monitoramento:*\n` +
      `• gastos com lazer ou besteiras — Mostra quanto foi gasto em lazer/besteiras\n` +
      `• quanto falta pagar do PS5? — Mostra saldo restante da dívida\n` +
      `• resumo da semana — Mostra resumo dos gastos e alertas\n\n` +
      `*Lembretes:*\n` +
      `• me lembra amanhã de pagar tal coisa — Agenda lembrete automático (enviado até confirmação)\n\n` +
      `*Zoeira:*\n` +
      `• tô pobre, tô liso, tô quebrado... — Recebe uma zoeira/meme aleatório\n\n` +
      `*Ajuda:*\n` +
      `• /ajuda — Lista todos os comandos\n`
    , { parse_mode: 'Markdown' });
    return;
  }

  // Adicionar gasto: inicia diálogo
  if (/adicionar gasto/i.test(text)) {
    await ctx.reply('Me envie o valor e a descrição do gasto (ex: 50 lanche).');
    userDialogState[userId] = 'addGasto';
    return;
  }

  // Meus gastos/gastos do mês
  if (/meus gastos|gastos do mês/i.test(text)) {
    const data = loadData();
    const mesAtual = new Date().getMonth();
    const gastosMes = data.gastos.filter(g => new Date(g.data).getMonth() === mesAtual);
    if (gastosMes.length === 0) {
      await ctx.reply('Nenhum gasto registrado este mês.');
    } else {
      let msg = 'Gastos do mês:\n';
      gastosMes.forEach((g, i) => {
        msg += `${i + 1}. R$${g.valor.toFixed(2)} - ${g.descricao} (${new Date(g.data).toLocaleDateString()})\n`;
      });
      await ctx.reply(msg);
    }
    return;
  }

  // Confirmar pagamento: inicia diálogo
  if (/paguei|confirmei o pagamento/i.test(text)) {
    await ctx.reply('Me envie o valor e a descrição do pagamento (ex: 30 mercado):');
    userDialogState[userId] = 'confPagamento';
    return;
  }

  // Resumo da semana
  if (/resumo da semana/i.test(text)) {
    await resumoSemanal(bot);
    return;
  }

  // Planejamento do mês
  if (/planejamento do mês/i.test(text)) {
    const data = loadData();
    if (data.planejamento && Object.keys(data.planejamento).length > 0) {
      await ctx.reply('Seu planejamento do mês já está pronto! Veja abaixo:');
      await ctx.reply(JSON.stringify(data.planejamento, null, 2));
    } else {
      await ctx.reply('Você ainda não tem um planejamento do mês. Vamos criar um juntos! Me envie os detalhes ou objetivos para começar.');
    }
    return;
  }

  // Quanto posso gastar hoje?
  if (/quanto posso gastar hoje/i.test(text)) {
    const data = loadData();
    const mesAtual = new Date().getMonth();
    const gastosMes = data.gastos.filter(g => new Date(g.data).getMonth() === mesAtual);
    const totalMes = gastosMes.reduce((acc, g) => acc + g.valor, 0);
    const meta = data.planejamento?.metaMensal || 1000;
    const hoje = new Date().getDate();
    const diasNoMes = new Date(new Date().getFullYear(), mesAtual + 1, 0).getDate();
    const saldo = meta - totalMes;
    const limiteDiario = saldo / (diasNoMes - hoje + 1);
    await ctx.reply(`Você pode gastar até R$${limiteDiario.toFixed(2)} hoje para não estourar a meta do mês!`);
    return;
  }

  // Gastos com lazer ou besteiras
  if (/gastos com lazer|besteiras/i.test(text)) {
    const data = loadData();
    const lazer = data.gastos.filter(g => g.categoria === 'besteiras');
    if (lazer.length === 0) {
      await ctx.reply('Nenhum gasto com lazer ou besteiras registrado.');
    } else {
      let msg = 'Gastos com lazer/besteiras:\n';
      lazer.forEach((g, i) => {
        msg += `${i + 1}. R$${g.valor.toFixed(2)} - ${g.descricao} (${new Date(g.data).toLocaleDateString()})\n`;
      });
      await ctx.reply(msg);
    }
    return;
  }
  if (/dashboard financeiro|resumo financeiro|painel financeiro/i.test(text)) {
    const data = loadData();
    const mesAtual = new Date().getMonth();
    const gastosMes = data.gastos.filter(g => new Date(g.data).getMonth() === mesAtual);
    const totalMes = gastosMes.reduce((acc, g) => acc + g.valor, 0);
    const meta = data.planejamento?.metaMensal || 600;
    const saldo = meta - totalMes;
    const lazer = gastosMes.filter(g => g.categoria === 'besteiras');
    const totalLazer = lazer.reduce((acc, g) => acc + g.valor, 0);
    let alertaLazer = '';
    if (totalLazer > meta * 0.2) alertaLazer = ' (👀 cuidado, já passou da média)';
    await ctx.reply(
      `💰 Gastos até agora: R$${totalMes.toFixed(2)}\n` +
      `🎯 Meta mensal: R$${meta.toFixed(2)}\n` +
      `📉 Restam: R$${saldo.toFixed(2)}\n` +
      `⚠️ Lazer: R$${totalLazer.toFixed(2)}${alertaLazer}`
    );
    return;
  }

  // Quanto falta pagar do PS5?
  if (/quanto falta pagar do ps5/i.test(text)) {
    const data = loadData();
    const divida = data.dividas?.ps5 || 0;
    const pagos = data.pagamentos.filter(p => /ps5/i.test(p.descricao)).reduce((acc, p) => acc + p.valor, 0);
    const falta = divida - pagos;
    await ctx.reply(`Falta pagar R$${falta.toFixed(2)} do PS5.`);
    return;
  }

  // Me lembra amanhã de pagar tal coisa (agenda lembrete)
  const lembreteMatch = text.match(/me lembra amanh[ãa] de pagar (.+)/i);
  if (lembreteMatch) {
    const descricao = lembreteMatch[1];
    const data = loadData();
    if (!data.lembretes) data.lembretes = [];
    data.lembretes.push({ userId, descricao });
    saveData(data);
    await ctx.reply(`Lembrete automático agendado: pagar ${descricao}. Você será lembrado até confirmar o pagamento!`);
    return;
  }

  // Avaliar se está gastando demais
  if (/estou gastando demais|avaliar gastos/i.test(text)) {
    const data = loadData();
    const total = data.gastos.reduce((acc, g) => acc + g.valor, 0);
    let msg = `Total de gastos registrados: R$${total.toFixed(2)}\n`;
    if (total > 1000) {
      msg += 'Rapha, tu tá gastando igual jogador de futebol! Bora segurar a onda!';
    } else if (total > 500) {
      msg += 'Tá gastando, mas ainda tá de boa. Só não exagera no pastel!';
    } else {
      msg += 'Tá tranquilo, pode até tomar um caldo de cana na feira!';
    }
    await ctx.reply(msg);
    return;
  }

  // Se não for nenhum comando, responde com ChatGPT
  await ctx.reply(await getChatGPTResponse(text));
});

bot.launch();
console.log('Bot rodando 24h...');
