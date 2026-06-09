const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

class KFCTelegramBot {
  constructor(token, serverUrl) {
    console.log('🔍 Initializing Telegram bot...');
    console.log('  - Token provided:', token ? '✅ Yes' : '❌ No');
    console.log('  - Server URL:', serverUrl);
    
    this.token = token;
    this.serverUrl = serverUrl;
    
    // Detect Render environment for logging only
    const isRender = process.env.RENDER_EXTERNAL_URL || 
                     process.env.RENDER || 
                     process.env.RENDER_SERVICE_NAME ||
                     serverUrl.includes('onrender.com') ||
                     process.env.NODE_ENV === 'production';
    
    // Only use webhook mode when explicitly requested
    const forceWebhook = process.env.TELEGRAM_WEBHOOK === 'true';
    const useWebhook = forceWebhook;
    
    if (process.env.SERVER_URL && process.env.SERVER_URL.includes('onrender.com')) {
      console.log('🔧 Detected Render deployment - webhook mode is NOT forced automatically');
    }
    
    console.log('  - Is Render:', !!isRender);
    console.log('  - Force webhook:', forceWebhook);
    console.log('  - Use webhook:', useWebhook);
    
    console.log('  - Environment:', useWebhook ? 'Webhook mode' : 'Polling mode');
    
    try {
      // Create bot with appropriate mode
      if (useWebhook) {
        // For webhook mode, disable polling completely
        this.bot = new TelegramBot(token, { 
          polling: false,
          webHook: false, // We'll set this up manually
          request: {
            agentOptions: {
              keepAlive: true,
              family: 4
            }
          }
        });
        console.log(' TelegramBot instance created for webhook mode (polling disabled)');
      } else {
        // For polling mode (local development)
        this.bot = new TelegramBot(token, { 
          polling: true,
          request: {
            agentOptions: {
              keepAlive: true,
              family: 4
            }
          }
        });
        console.log(' TelegramBot instance created for polling mode');
      }
    } catch (error) {
      console.error(' Failed to create TelegramBot instance:', error);
      throw error;
    }
    
    this.faqData = this.loadFAQData();
    this.telegramGuests = new Map(); // Store Telegram user -> guest info mapping
    
    try {
      this.setupHandlers();
      console.log(' Telegram bot handlers set up');
    } catch (error) {
      console.error(' Failed to set up handlers:', error);
      throw error;
    }
    
    console.log(` Telegram bot initialized with database integration (${useWebhook ? 'webhook' : 'polling'} mode)`);
    
    // Store webhook mode for later setup
    this.useWebhook = useWebhook;
    
    // For polling mode, test connection immediately
    if (!useWebhook) {
      this.bot.getMe().then(botInfo => {
        console.log(' Bot info:', botInfo);
        console.log(` Connected to Telegram as @${botInfo.username} (polling mode)`);
      }).catch(error => {
        console.error(' Failed to get bot info:', error);
      });
    }
  }

  async setupWebhook() {
    // Only set up webhook if we're in webhook mode
    if (!this.useWebhook) {
      console.log(' Skipping webhook setup - bot is in polling mode');
      return;
    }

    if (!this.token) {
      throw new Error('Cannot set up webhook without bot token');
    }

    try {
      const botInfo = await this.bot.getMe();
      console.log(' Bot info:', botInfo);
      console.log(` Connected to Telegram as @${botInfo.username}`);
      
      // Use Telegram API directly to manage webhooks
      const telegramApi = 'https://api.telegram.org';
      
      // First, delete any existing webhook
      try {
        const deleteUrl = `${telegramApi}/bot${this.token}/deleteWebhook`;
        const deleteResponse = await fetch(deleteUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drop_pending_updates: true })
        });
        const deleteData = await deleteResponse.json();
        console.log(' Webhook deletion result:', deleteData.ok ? '✅ Success' : '❌ Failed');
        
        // Wait a moment for deletion to take effect
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (deleteError) {
        console.log(' Webhook deletion failed (may not exist):', deleteError.message);
      }
      
      // Set webhook URL
      const webhookUrl = `${this.serverUrl}/webhook`;
      console.log(` Setting webhook to: ${webhookUrl}`);
      
      // Validate webhook URL format
      if (!webhookUrl.startsWith('https://')) {
        throw new Error(`Webhook URL must use HTTPS. Got: ${webhookUrl}`);
      }
      
      // Set webhook using Telegram API
      const setUrl = `${telegramApi}/bot${this.token}/setWebhook`;
      const setResponse = await fetch(setUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          max_connections: 40,
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true
        })
      });
      
      const setData = await setResponse.json();
      console.log(` Webhook set result:`, setData.ok ? '✅ Success' : '❌ Failed');
      
      if (!setData.ok) {
        throw new Error(`Telegram API error: ${setData.description}`);
      }
      
      // Wait a moment for webhook to be fully set
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify webhook
      const verifyUrl = `${telegramApi}/bot${this.token}/getWebhookInfo`;
      const verifyResponse = await fetch(verifyUrl);
      const webhookData = await verifyResponse.json();
      
      if (webhookData.ok && webhookData.result) {
        console.log(' Webhook verification:', {
          url: webhookData.result.url,
          has_custom_certificate: webhookData.result.has_custom_certificate,
          pending_update_count: webhookData.result.pending_update_count,
          last_error_date: webhookData.result.last_error_date,
          last_error_message: webhookData.result.last_error_message,
          max_connections: webhookData.result.max_connections
        });
        
        if (webhookData.result.url === webhookUrl) {
          console.log(' ✅ Webhook setup completed successfully');
        } else {
          throw new Error(`Webhook URL mismatch. Expected: ${webhookUrl}, Got: ${webhookData.result.url}`);
        }
      }
      
    } catch (error) {
      console.error(' ❌ Failed to setup webhook:', error.message);
      console.error(' Full error:', error);
      console.log(' Server will continue running without Telegram bot');
      
      // Log additional debugging info
      console.log(' Debug info:');
      console.log('  - Server URL:', this.serverUrl);
      console.log('  - Use webhook:', this.useWebhook);
      console.log('  - Environment variables:');
      console.log('    - SERVER_URL:', process.env.SERVER_URL);
      console.log('    - RENDER_EXTERNAL_URL:', process.env.RENDER_EXTERNAL_URL);
      console.log('    - TELEGRAM_WEBHOOK:', process.env.TELEGRAM_WEBHOOK);
    }
  }

  loadFAQData() {
    try {
      const faqPath = path.join(__dirname, 'data', 'restaurant-faq.json');
      const raw = fs.readFileSync(faqPath, 'utf8');
      const cleaned = raw.replace(/^\uFEFF/, '');
      return JSON.parse(cleaned);
    } catch (error) {
      console.error(' Error loading FAQ data:', error);
      return [];
    }
  }

  setupHandlers() {
    // Handle /start command
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const welcomeMessage = this.getWelcomeMessage();
      this.bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'HTML' });
    });

    // Handle /help command
    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      const helpMessage = this.getHelpMessage();
      this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'HTML' });
    });

    // Handle /faq command
    this.bot.onText(/\/faq/, (msg) => {
      const chatId = msg.chat.id;
      const faqMessage = this.getFAQMessage();
      this.bot.sendMessage(chatId, faqMessage, { parse_mode: 'HTML' });
    });

    // Handle /services command
    this.bot.onText(/\/services/, (msg) => {
      const chatId = msg.chat.id;
      const servicesMessage = this.getServicesMessage();
      this.bot.sendMessage(chatId, servicesMessage, { parse_mode: 'HTML' });
    });

    // Handle /contact command
    this.bot.onText(/\/contact/, (msg) => {
      const chatId = msg.chat.id;
      const contactMessage = this.getContactMessage();
      this.bot.sendMessage(chatId, contactMessage, { parse_mode: 'HTML' });
    });

    // Handle /myrequests command
    this.bot.onText(/\/myrequests|\/mesdemandes|\/requests/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramUserId = msg.from.id;
      await this.handleRequestHistory(chatId, telegramUserId);
    });

    // Handle /history command
    this.bot.onText(/\/history|\/historique/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramUserId = msg.from.id;
      await this.handleConversationHistory(chatId, telegramUserId);
    });

    // Handle text messages (AI chat)
    this.bot.on('message', async (msg) => {
      if (msg.text && !msg.text.startsWith('/')) {
        await this.handleChatMessage(msg);
      }
    });

    // Handle errors
    this.bot.on('error', (error) => {
      console.error(' Telegram bot error:', error);
    });

    // Handle polling errors
    this.bot.on('polling_error', (error) => {
      console.error(' Telegram polling error:', error);
    });
  }

  getWelcomeMessage() {
    return `
 <b>Bienvenue chez KFC France Support IT</b> 🇫🇷

Avant de commencer, merci de m\'envoyer :
• Le nom du demandeur
• Le code restaurant
• L\'adresse email

<b>Commandes rapides :</b>
/help - Afficher cette aide
/faq - Questions fréquentes
/mesdemandes - Voir vos demandes récentes
/historique - Voir l\'historique de conversation

Envoyez-moi votre problème IT dès maintenant et je vous aiderai à le classer et à le résoudre.
    `;
  }

  getHelpMessage() {
    return `
📋 <b>Commandes disponibles :</b>

/start - Message de bienvenue
/help - Afficher cette aide
/faq - Questions fréquentes
/mesdemandes - Voir vos demandes récentes
/historique - Voir l\'historique de conversation

Je suis votre assistant support IT KFC France pour restaurant. Expliquez-moi votre incident et je le classe en P1, P2, P3 ou P4.
    `;
  }

  getFAQMessage() {
    let faqText = ' <b>Questions fréquentes :</b>\n\n';
    
    this.faqData.forEach((item, index) => {
      if (index < 10) {
        faqText += `<b>Q :</b> ${item.question}\n`;
        faqText += `<b>R :</b> ${item.answer}\n\n`;
      }
    });
    
    faqText += ' <i>Posez-moi votre problème IT en restaurant KFC et je vous aiderai à le classer.</i>';
    return faqText;
  }

  getServicesMessage() {
    return `
🛠️ <b>Support IT KFC France :</b>

Je peux vous aider avec :
• Problèmes de réseau et Wi-Fi
• Pannes de terminaux et POS/Aloha
• Erreurs d\'imprimantes de tickets
• Problèmes de synchronisation menu Red Biscuit / Aloha
• Accès, login, et connexion réseau

Expliquez simplement votre incident, je le classerai et vous guiderai vers le bon lot de support.
    `;
  }

  getContactMessage() {
    return `
 <b>Support IT KFC France :</b>

Pour toute demande non résolue ici, contactez le support IT de restaurant KFC.

Si vous êtes un restaurant, précisez : nom du demandeur, code restaurant, email, et description de l\'incident.

Je suis là pour vous aider à traiter votre problème rapidement.
    `;
  }

  async handleChatMessage(msg) {
    const chatId = msg.chat.id;
    const userMessage = msg.text;
    const userName = msg.from.first_name || 'Guest';
    const telegramUserId = msg.from.id;

    console.log(` Telegram message from ${userName} (ID: ${telegramUserId}): ${userMessage}`);

    try {
      // Show typing indicator
      this.bot.sendChatAction(chatId, 'typing');

      const isRegistrationAttempt = this.isRegistrationMessage(userMessage);

      // Check if user needs to register first
      if (!this.telegramGuests.has(telegramUserId) && !isRegistrationAttempt) {
        await this.requestGuestRegistration(chatId, userName);
        return;
      }

      // Handle registration messages for unregistered users
      if (!this.telegramGuests.has(telegramUserId) && isRegistrationAttempt) {
        await this.handleGuestRegistration(chatId, telegramUserId, userName, userMessage);
        return;
      }

      // Check if it's a simple FAQ question first
      const faqAnswer = this.findFAQAnswer(userMessage);
      if (faqAnswer) {
        await this.bot.sendMessage(chatId, faqAnswer, { parse_mode: 'HTML' });
        // Log conversation to database
        await this.logConversationToDatabase(telegramUserId, userMessage, faqAnswer);
        return;
      }

      // Check if it's a service request
      if (this.isServiceRequest(userMessage)) {
        await this.handleServiceRequest(chatId, telegramUserId, userMessage);
        return;
      }

      // Check if user asked about their tickets (/tickets, "mes tickets", "statut ticket")
      const lm = userMessage.toLowerCase();
      if (lm.startsWith('/tickets') || lm.includes('mes tickets') || lm.includes('statut ticket') || lm.includes('statut des tickets') || lm.includes('ticket status') || lm.includes('mes demandes')) {
        const ticketText = await this.getAteraTicketsForGuest(telegramUserId);
        await this.bot.sendMessage(chatId, ticketText, { parse_mode: 'HTML' });
        await this.logConversationToDatabase(telegramUserId, userMessage, ticketText);
        return;
      }

      // For more complex queries, use AI (if available)
      if (process.env.MISTRAL_API_KEY) {
        const aiResponse = await this.getAIResponse(userMessage, userName, telegramUserId, msg);
        await this.bot.sendMessage(chatId, aiResponse, { parse_mode: 'HTML' });
        // Log conversation to database
        await this.logConversationToDatabase(telegramUserId, userMessage, aiResponse);
      } else {
        // Fallback response
        const fallbackResponse = this.getFallbackResponse(userMessage);
        await this.bot.sendMessage(chatId, fallbackResponse, { parse_mode: 'HTML' });
        // Log conversation to database
        await this.logConversationToDatabase(telegramUserId, userMessage, fallbackResponse);
      }

    } catch (error) {
      console.error(' Error handling Telegram message:', error);
      await this.bot.sendMessage(chatId, 
        ' Une erreur est survenue. Veuillez réessayer ou contacter la réception pour une assistance immédiate.',
        { parse_mode: 'HTML' }
      );
    }
  }

  findFAQAnswer(userMessage) {
    const lowerText = userMessage.toLowerCase().trim();
    
    // Search for matching FAQ with improved algorithm (same as web interface)
    let bestMatch = null;
    let bestScore = 0;
    
    for (const faq of this.faqData) {
      const lowerQuestion = faq.question.toLowerCase();
      
      // Skip common words that don't add meaning
      const skipWords = ['the', 'at', 'is', 'are', 'do', 'does', 'have', 'has', 'can', 'will', 'there', 'a', 'an', 'and', 'or', 'but', 'of', 'for', 'in', 'on', 'to', 'with', 'by'];
      
      const questionWords = lowerQuestion.split(/\s+/)
        .filter(word => word.length > 2 && !skipWords.includes(word));
      const userWords = lowerText.split(/\s+/)
        .filter(word => word.length > 2 && !skipWords.includes(word));
      
      // Calculate match score with better algorithm
      let matchScore = 0;
      let exactMatches = 0;
      
      for (const userWord of userWords) {
        for (const questionWord of questionWords) {
          if (userWord === questionWord) {
            // Exact word match gets higher score
            matchScore += 3;
            exactMatches += 1;
          } else if (questionWord.includes(userWord) && userWord.length > 3) {
            // Partial match for longer words
            matchScore += 1;
          } else if (userWord.includes(questionWord) && questionWord.length > 3) {
            // Reverse partial match
            matchScore += 1;
          }
        }
      }
      
      // Require at least 2 exact matches or high score with exact matches
      const isGoodMatch = exactMatches >= 2 || (matchScore >= 6 && exactMatches >= 1);
      
      if (isGoodMatch && matchScore > bestScore) {
        bestMatch = faq;
        bestScore = matchScore;
        console.log(` Telegram FAQ candidate: "${faq.question}" (score: ${matchScore}, exact: ${exactMatches})`);
      }
    }
    
    if (bestMatch) {
      console.log(` Best Telegram FAQ match: "${bestMatch.question}" (final score: ${bestScore})`);
      return `💡 <b>Answer:</b>\n${bestMatch.answer}`;
    }
    
    // No good FAQ match found
    console.log(` No Telegram FAQ match for: "${userMessage}"`);
    return null;
  }

  async getAIResponse(userMessage, userName, telegramUserId, msg) {
    try {
      // Get guest info for conversation context
      const guestInfo = this.telegramGuests.get(telegramUserId);
      
      // Use registered guest name if available, otherwise fall back to Telegram username
      const actualGuestName = guestInfo?.name || userName;
      
      console.log(` Using guest name: ${actualGuestName} (registered: ${guestInfo?.name}, telegram: ${userName})`);

      // Use the same system prompts as the web chatbot so Telegram shares the same "mind"
      const SYSTEM_PROMPT = `You are KFC France IT support assistant for restaurant operations. Respond in English or French based on the requester's language. You support KFC restaurant teams in France, DOM-TOM, and Luxembourg with IT incidents, ticket classification, service lot routing, and SLA expectations.\n\nYour scope includes:\n- Lot 1 Helpdesk / Service Desk: network, Wi-Fi, power, hardware, printers, terminals, access, connectivity, and general infrastructure issues.\n- Lot 2 Menu Management Red Biscuit: menu content changes, promotions, pricing updates, and Red Biscuit feed issues.\n- Lot 3 Menu Management Aloha: POS/Aloha/NCR terminal issues, login problems, transaction failures, menu sync, and KDS/printing.\n\nDo not answer questions that are not related to IT incident problems. If the user asks something unrelated, politely explain that you only handle restaurant IT support incidents and ask them to describe their problem.\n\nUse the incident typology as the reference for classification: P1/P2/P3/P4 and attempt guided troubleshooting before opening a ticket.`;

      const SYSTEM_PROMPT_FR = `Vous êtes l'assistant support IT de KFC France pour les opérations en restaurant. Répondez en français; aidez les équipes des restaurants KFC en France, DOM‑TOM et Luxembourg pour la classification des incidents, l'orientation vers le bon lot (Lot 1 Helpdesk, Lot 2 Red Biscuit, Lot 3 Aloha) et l'estimation des SLA (P1 à P4).\n\nNe répondez pas aux questions qui ne sont pas liées aux problèmes IT. Si l'utilisateur pose une question non liée, expliquez poliment que vous ne traitez que les incidents de support IT en restaurant et demandez-lui de décrire son problème.`;

      // Choose French prompt when Telegram reports French language
      const userLang = (msg && msg.from && msg.from.language_code) ? msg.from.language_code : null;
      const useFrench = (userLang && userLang.toLowerCase().startsWith('fr'));

      const messages = [
        { role: 'system', content: useFrench ? SYSTEM_PROMPT_FR : SYSTEM_PROMPT },
        { role: 'user', content: `Bonjour, je suis ${actualGuestName}. ${userMessage}` }
      ];

      const response = await fetch(`${this.serverUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mistral-medium-latest',
          messages,
          temperature: 0.4,
          sessionId: `telegram-${telegramUserId}`,
          guestInfo: guestInfo || { name: actualGuestName, room: 'Telegram User' }
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'Je suis désolé, je n\'ai pas pu traiter votre demande. Merci de contacter le support IT du restaurant.';
      }
      throw new Error(`AI API error: ${response.status}`);
    } catch (error) {
      console.error(' AI API error:', error);
      return this.getFallbackResponse(userMessage);
    }
  }

  getFallbackResponse(userMessage) {
    const message = userMessage.toLowerCase();
    
    if (message.includes('wifi') || message.includes('internet') || message.includes('réseau')) {
      return '📶 Service IT KFC : si le Wi-Fi ou le réseau pose problème, vérifiez d\'abord la connexion du terminal et redémarrez l\'équipement si possible. Si cela persiste, précisez le terminal affecté et le code restaurant.';
    }
    
    if (message.includes('caisse') || message.includes('terminal') || message.includes('aloha') || message.includes('pos')) {
      return '🖥️ Service IT KFC : les problèmes de terminal ou de caisse doivent être décrits précisément. Dites-moi si c\'est un problème de connexion, de login, d\'impression ou de transaction.';
    }
    
    if (message.includes('imprimante') || message.includes('ticket') || message.includes('kds')) {
      return '🖨️ Service IT KFC : indiquez si l\'imprimante de tickets ou le KDS ne répond plus, affiche une erreur ou ne synchronise plus le menu.';
    }
    
    if (message.includes('menu') || message.includes('red biscuit') || message.includes('red biscuit') || message.includes('promo')) {
      return 'Ce chatbot fournit le support IT pour le personnel KFC. Pour les questions liées au menu, aux promotions ou aux commandes, merci d\'utiliser les canaux clients KFC.';
    }
    
    return `💬 Merci pour votre message. Je suis l\'assistant support IT KFC France pour les restaurants. Décrivez votre incident avec le code restaurant, l\'email et ce qui ne fonctionne pas, et je le classerai.`;
  }

  async fetchGuestByRoom(room) {
    try {
      const response = await fetch(`${this.serverUrl}/api/db/guests/room/${encodeURIComponent(room)}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.guest || null;
    } catch (error) {
      console.error('❌ Error fetching guest by room:', error);
      return null;
    }
  }

  async ensureGuestRecord(telegramUserId) {
    const guestInfo = this.telegramGuests.get(telegramUserId);
    if (!guestInfo || !guestInfo.room) return null;
    if (guestInfo.guestId) return guestInfo;

    const guest = await this.fetchGuestByRoom(guestInfo.room);
    if (guest) {
      guestInfo.guestId = guest.id;
      this.telegramGuests.set(telegramUserId, guestInfo);
    }
    return guestInfo;
  }

  async logConversationToDatabase(telegramUserId, userMessage, botResponse) {
    const guestInfo = await this.ensureGuestRecord(telegramUserId);
    if (!guestInfo?.guestId) {
      console.log('⚠️ Skipping DB conversation log - no guest record found for Telegram user', telegramUserId);
      return;
    }

    try {
      await fetch(`${this.serverUrl}/api/db/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId: guestInfo.guestId,
          message: userMessage,
          response: botResponse
        })
      });
    } catch (error) {
      console.error('❌ Failed to log conversation to database:', error);
    }
  }

  async handleRequestHistory(chatId, telegramUserId) {
    const guestInfo = await this.ensureGuestRecord(telegramUserId);
    if (!guestInfo?.room) {
      await this.bot.sendMessage(chatId, 'Veuillez d\u00e9j\u00e0 vous inscrire et fournir votre num\u00e9ro de salle pour afficher vos demandes.', { parse_mode: 'HTML' });
      return;
    }

    const response = await fetch(`${this.serverUrl}/api/db/guests/room/${encodeURIComponent(guestInfo.room)}`);
    if (!response.ok) {
      await this.bot.sendMessage(chatId, 'Impossible de retrouver vos demandes. Veuillez r\u00e9essayer plus tard.', { parse_mode: 'HTML' });
      return;
    }

    const data = await response.json();
    const requests = data.requests || [];
    if (requests.length === 0) {
      await this.bot.sendMessage(chatId, 'Aucune demande n\u2019a \u00e9t\u00e9 trouv\u00e9e pour votre salle.', { parse_mode: 'HTML' });
      return;
    }

    const lines = requests.slice(0, 10).map(req => `• [${req.status}] ${req.type || req.category || 'Request'} — ${req.notes || req.text || 'No details'} (${req.created_at || req.createdAt})`);
    await this.bot.sendMessage(chatId, `<b>Vos demandes r\u00e9centes:</b>\n${lines.join('\n')}`, { parse_mode: 'HTML' });
  }

  async getAteraTicketsForGuest(telegramUserId) {
    const guestInfo = await this.ensureGuestRecord(telegramUserId);
    if (!guestInfo?.email) {
      return 'Veuillez d\u00e9j\u00e0 vous inscrire et fournir une adresse email afin que je puisse rechercher vos tickets.';
    }

    try {
      const url = `${this.serverUrl}/api/atera?endUserEmail=${encodeURIComponent(guestInfo.email)}`;
      const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        console.error(' Atera query failed', res.status);
        return 'Impossible de r\u00e9cup\u00e9rer vos tickets pour le moment. Veuillez r\u00e9essayer plus tard.';
      }

      const data = await res.json();
      // Atera may return an array or an object with tickets; normalize
      const tickets = Array.isArray(data) ? data : (data.tickets || data.data || []);
      if (!tickets || tickets.length === 0) {
        return 'Aucun ticket trouv\u00e9 pour votre adresse email.';
      }

      const lines = tickets.slice(0, 10).map(t => {
        const id = t.id || t.ticketId || t.TicketID || t.TicketId || t.ActionID || t.number || t.ticketNumber || 'N/A';
        const status = t.status || t.TicketStatus || t.State || t.state || 'Unknown';
        const title = t.TicketTitle || t.title || t.subject || t.summary || (t.description ? String(t.description).slice(0,60) : '') || '';
        const created = t.createdAt || t.created_on || t.CreatedOn || t.CreatedAt || t.created || '';
        return `• [${status}] ${title} (ID: ${id}${created ? ' — ' + created : ''})`;
      });

      return `<b>Vos tickets Atera:</b>\n${lines.join('\n')}`;
    } catch (err) {
      console.error(' Error fetching Atera tickets:', err);
      return 'Erreur lors de la recherche de vos tickets. Veuillez r\u00e9essayer plus tard.';
    }
  }

  async handleConversationHistory(chatId, telegramUserId) {
    const guestInfo = await this.ensureGuestRecord(telegramUserId);
    if (!guestInfo?.room) {
      await this.bot.sendMessage(chatId, 'Veuillez d\u00e9j\u00e0 vous inscrire et fournir votre num\u00e9ro de salle pour afficher votre historique.', { parse_mode: 'HTML' });
      return;
    }

    const response = await fetch(`${this.serverUrl}/api/db/guests/room/${encodeURIComponent(guestInfo.room)}`);
    if (!response.ok) {
      await this.bot.sendMessage(chatId, 'Impossible de retrouver votre historique de conversation. Veuillez r\u00e9essayer plus tard.', { parse_mode: 'HTML' });
      return;
    }

    const data = await response.json();
    const conversations = data.conversations || [];
    if (conversations.length === 0) {
      await this.bot.sendMessage(chatId, 'Aucun historique de conversation trouv\u00e9.', { parse_mode: 'HTML' });
      return;
    }

    const lines = conversations.slice(-10).reverse().map(conv => `• ${conv.message} → ${conv.response}`);
    await this.bot.sendMessage(chatId, `<b>Historique de conversation:</b>\n${lines.join('\n\n')}`, { parse_mode: 'HTML' });
  }

  // Guest registration methods
  isRegistrationMessage(message) {
    const lowerMessage = message.toLowerCase();
    return /(@|\bemail\b|\bmail\b|\bnom\b|\bdemandeur\b|\bcode restaurant\b|\brestaurant\b|\btable\b|\d{1,4})/.test(lowerMessage);
  }

  async requestGuestRegistration(chatId, userName) {
    const message = `
👋 Bonjour ${userName} !

Avant de pouvoir vous aider, merci de m\'envoyer :
• Le nom du demandeur
• Le code restaurant / numéro de table
• L\'adresse email

<i>Exemple :</i>
Jean Dupont, restaurant 1234, jean@example.fr

Cela me permet de retrouver votre dossier dans la base de données. Merci ! 🍗
    `;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  }

  async handleGuestRegistration(chatId, telegramUserId, userName, message) {
    try {
      const guestInfo = this.parseGuestInfo(message, userName);
      
      if (!guestInfo.name || !guestInfo.room || !guestInfo.email) {
        await this.bot.sendMessage(chatId, 
          '❌ Je n\'ai pas pu lire toutes vos informations. Merci d\'envoyer le nom du demandeur, le code restaurant et l\'email.\n\nExemple : "Jean Dupont, restaurant 1234, jean@example.fr"',
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Store guest info locally
      this.telegramGuests.set(telegramUserId, guestInfo);

      // Create guest in database via API
      try {
        await this.createGuestInDatabase(guestInfo, telegramUserId);
      } catch (dbError) {
        console.error('❌ Failed to create guest in database:', dbError);
        // Continue with local registration even if database fails
      }

      await this.bot.sendMessage(chatId, 
        `✅ <b>Inscription terminée !</b>\n\nBienvenue ${guestInfo.name}!\nRestaurant: ${guestInfo.room}\n\nJe suis maintenant prêt à vous aider avec les incidents IT du restaurant.`,
        { parse_mode: 'HTML' }
      );

      console.log(`✅ Telegram guest registered: ${guestInfo.name} (Room ${guestInfo.room})`);
    } catch (error) {
      console.error('❌ Error handling guest registration:', error);
      await this.bot.sendMessage(chatId, 
        '❌ Une erreur est survenue lors de l\'inscription. Veuillez réessayer ou contacter le support IT du restaurant.',
        { parse_mode: 'HTML' }
      );
    }
  }

  parseGuestInfo(message, fallbackName) {
    const text = message.trim();
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const parts = lines.length > 1 ? lines : text.split(',').map(part => part.trim()).filter(Boolean);

    let name = null;
    let room = null;
    let email = null;

    for (const part of parts) {
      const lowerPart = part.toLowerCase();

      const emailMatch = part.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (emailMatch) {
        email = emailMatch[0].toLowerCase();
      }

      const roomMatch = part.match(/(?:room|table|restaurant|code restaurant|code|n\.?°|num(?:éro)?|numero)?\s*(\d{1,4})/i);
      if (roomMatch) {
        room = roomMatch[1];
      }

      const looksLikeName = !lowerPart.includes('@') && !/\b(room|table|restaurant|code|n\.?°|num(?:éro)?|numero)\b/i.test(lowerPart) && !/\d{1,4}/.test(lowerPart);
      if (!name && looksLikeName) {
        name = part;
      }
    }

    if (!name) {
      name = fallbackName;
    }

    return { name, room, email };
  }

  async createGuestInDatabase(guestInfo, telegramUserId) {
    try {
      // Create a guest session that will trigger database creation
      const response = await fetch(`${this.serverUrl}/api/guest-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: guestInfo.name,
          room: guestInfo.room,
          email: guestInfo.email,
          checkout: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
          source: 'telegram',
          telegramUserId: telegramUserId
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`🗄️ Telegram guest created in database: ${guestInfo.name}`);
        if (data.guest?.id) {
          guestInfo.guestId = data.guest.id;
          this.telegramGuests.set(telegramUserId, guestInfo);
        }
        
        // Auto-approve Telegram guests (they're already verified through Telegram)
        if (data.sessionId) {
          await this.approveGuestSession(data.sessionId);
        }
      }
    } catch (error) {
      console.error('❌ Error creating guest in database:', error);
    }
  }

  async approveGuestSession(sessionId) {
    try {
      const response = await fetch(`${this.serverUrl}/api/guest-sessions/${sessionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        console.log(`✅ Auto-approved Telegram guest session: ${sessionId}`);
      }
    } catch (error) {
      console.error('❌ Error approving guest session:', error);
    }
  }

  // Service request detection and handling
  isServiceRequest(message) {
    const lowerMessage = message.toLowerCase();
    return /\b(need|want|request|bring|send|can you|could you|pillow|towel|water|clean|taxi|doctor|help)\b/.test(lowerMessage);
  }

  async handleServiceRequest(chatId, telegramUserId, message) {
    const guestInfo = this.telegramGuests.get(telegramUserId);
    
    if (!guestInfo) {
      await this.requestGuestRegistration(chatId, 'Guest');
      return;
    }

    try {
      // Log service request to database
      const response = await fetch(`${this.serverUrl}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: `telegram-${telegramUserId}`,
          name: guestInfo.name,
          room: guestInfo.room,
          text: message,
          priority: this.detectPriority(message),
          lang: 'en',
          source: 'telegram'
        })
      });

      if (response.ok) {
        const confirmationMessage = this.getServiceConfirmation(message, guestInfo);
        await this.bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'HTML' });
        console.log(`📝 Service request logged from Telegram: ${guestInfo.name} - ${message}`);
      } else {
        throw new Error('Failed to log service request');
      }
    } catch (error) {
      console.error('❌ Error handling service request:', error);
      await this.bot.sendMessage(chatId, 
        '❌ Une erreur est survenue lors de l\'enregistrement de votre demande IT. Veuillez réessayer ou contacter le support IT du restaurant.',
        { parse_mode: 'HTML' }
      );
    }
  }

  detectPriority(message) {
    const lowerMessage = message.toLowerCase();
    return /\b(urgent|emergency|doctor|medical|help|asap|immediately)\b/.test(lowerMessage) ? 'PRIORITY' : 'NORMAL';
  }

  getServiceConfirmation(message, guestInfo) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('wifi') || lowerMessage.includes('réseau') || lowerMessage.includes('internet')) {
      return `✅ <b>Demande IT enregistrée</b>\n\n${guestInfo.name}, votre problème réseau/Wi-Fi a bien été transmis au support IT KFC. Nous allons le traiter pour le restaurant ${guestInfo.room}.`;
    }
    
    if (lowerMessage.includes('caisse') || lowerMessage.includes('terminal') || lowerMessage.includes('aloha') || lowerMessage.includes('pos')) {
      return `✅ <b>Demande IT enregistrée</b>\n\n${guestInfo.name}, votre problème de terminal / caisse a bien été transmis au support IT KFC. Nous allons le traiter pour le restaurant ${guestInfo.room}.`;
    }
    
    if (lowerMessage.includes('imprimante') || lowerMessage.includes('ticket') || lowerMessage.includes('kds')) {
      return `✅ <b>Demande IT enregistrée</b>\n\n${guestInfo.name}, votre problème d'impression / KDS a bien été transmis au support IT KFC. Nous allons le traiter pour le restaurant ${guestInfo.room}.`;
    }
    
    return `✅ <b>Demande IT enregistrée</b>\n\n${guestInfo.name}, votre demande a été transmise au support IT KFC pour le restaurant ${guestInfo.room}. Nous vous contacterons dès que possible.`;
  }

  // Database conversation logging
  async logConversationToDatabase(telegramUserId, userMessage, botResponse) {
    try {
      const guestInfo = this.telegramGuests.get(telegramUserId);
      
      if (!guestInfo) {
        console.log('⚠️ Skipping conversation log - guest not registered');
        return;
      }

      // The conversation logging will be handled automatically by the server
      // when we make the API call with guestInfo in getAIResponse
      console.log(`💬 Conversation logged for Telegram user ${guestInfo.name}`);
    } catch (error) {
      console.error('❌ Error logging conversation:', error);
    }
  }

  // Method to send proactive messages (e.g., notifications)
  async sendNotification(chatId, message) {
    try {
      await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      return true;
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      return false;
    }
  }

  // Method to get bot info
  async getBotInfo() {
    try {
      const me = await this.bot.getMe();
      return me;
    } catch (error) {
      console.error('❌ Error getting bot info:', error);
      return null;
    }
  }

  // Process webhook update
  processUpdate(update) {
    try {
      console.log('🔄 Processing webhook update:', update);
      this.bot.processUpdate(update);
    } catch (error) {
      console.error('❌ Error processing webhook update:', error);
    }
  }

  // Stop the bot
  stop() {
    if (this.bot.isPolling && this.bot.isPolling()) {
      this.bot.stopPolling();
    }
    console.log('🤖 Telegram bot stopped');
  }
}

module.exports = KFCTelegramBot;
