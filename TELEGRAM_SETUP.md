# 🚀 Telegram Bot Setup Guide for Solaria Hotel Concierge

## 📋 Prerequisites

1. **Telegram Account**: You need a Telegram account
2. **Node.js**: Your server is already running Node.js
3. **Mistral API Key**: For AI-powered responses (optional but recommended)

## 🔧 Step-by-Step Setup

### 1. Create Your Telegram Bot

1. **Open Telegram** and search for `@BotFather`
2. **Start a chat** with BotFather by clicking "Start"
3. **Send the command**: `/newbot`
4. **Choose a name** for your bot (e.g., "Solaria Hotel Concierge")
5. **Choose a username** (must end with 'bot', e.g., "solaria_concierge_bot")
6. **Save the bot token** that BotFather gives you (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Configure Environment Variables

Since you can't create a `.env` file directly, you have two options:

#### Option A: Set Environment Variables in PowerShell (Temporary)
```powershell
$env:TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN_HERE"
$env:MISTRAL_API_KEY="YOUR_MISTRAL_API_KEY_HERE"
```

#### Option B: Set Environment Variables in Windows (Permanent)
1. Press `Win + R`, type `sysdm.cpl`, press Enter
2. Click "Environment Variables"
3. Under "User variables", click "New"
4. Add:
   - Variable name: `TELEGRAM_BOT_TOKEN`
   - Variable value: `YOUR_BOT_TOKEN_HERE`
5. Repeat for `MISTRAL_API_KEY` if you have one

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Server

```bash
node server.js
```

## 🎯 Bot Features

Your Telegram bot will have these commands:

- `/start` - Welcome message and introduction
- `/help` - Show all available commands
- `/faq` - Common questions and answers
- `/services` - Hotel services and amenities
- `/contact` - Contact information

**Plus**: Natural language chat for any hotel-related questions!

## 🔍 Testing Your Bot

1. **Start your server** with the bot token set
2. **Open Telegram** and search for your bot username
3. **Click "Start"** to begin chatting
4. **Try the commands** like `/start`, `/help`, `/faq`
5. **Ask questions** like "What time is check-in?" or "Do you have a spa?"

## 📱 Bot Capabilities

### ✅ What Works Out of the Box:
- **FAQ Responses**: Instant answers to common questions
- **Command System**: Easy navigation with slash commands
- **Fallback Responses**: Helpful responses even without AI
- **Hotel Information**: Services, amenities, policies
- **Contact Details**: How to reach hotel staff

### 🚀 With Mistral API Key:
- **AI-Powered Chat**: Natural language understanding
- **Complex Queries**: Detailed responses to specific questions
- **Context Awareness**: Remembers conversation context
- **Personalized Responses**: Tailored to guest needs

## 🛠️ Customization Options

### Modify Bot Responses
Edit `telegram-bot.js` to customize:
- Welcome messages
- FAQ content
- Service descriptions
- Contact information

### Add New Commands
```javascript
// Add new command in setupHandlers()
this.bot.onText(/\/newcommand/, (msg) => {
  const chatId = msg.chat.id;
  this.bot.sendMessage(chatId, 'Your custom response');
});
```

### Customize AI Behavior
Modify the system prompt in `getAIResponse()` method to change how the AI responds.

## 🔒 Security Considerations

1. **Keep your bot token secret** - never share it publicly
2. **Monitor bot usage** - check server logs for unusual activity
3. **Rate limiting** - consider implementing message rate limits
4. **User verification** - optionally verify users are hotel guests

## 📊 Monitoring and Logs

The bot logs all activities:
- Message received: `💬 Telegram message from UserName: message`
- Bot responses: `🤖 Telegram bot: response sent`
- Errors: `❌ Telegram bot error: details`

## 🚨 Troubleshooting

### Bot Not Responding?
1. Check if `TELEGRAM_BOT_TOKEN` is set correctly
2. Verify the token is valid with BotFather
3. Check server logs for errors
4. Ensure the bot is not blocked by users

### AI Responses Not Working?
1. Verify `MISTRAL_API_KEY` is set
2. Check if Mistral API is accessible
3. Review server logs for API errors

### Server Won't Start?
1. Check if port 8080 is available
2. Verify all dependencies are installed
3. Check for syntax errors in the code

## 🌟 Advanced Features (Future Enhancements)

- **Multi-language Support**: Respond in guest's preferred language
- **Booking Integration**: Direct booking through bot
- **Payment Processing**: Handle payments for services
- **Guest Authentication**: Verify guest identity
- **Push Notifications**: Send updates about bookings/services
- **Analytics Dashboard**: Track bot usage and guest satisfaction

## 📞 Support

If you encounter issues:
1. Check the server logs for error messages
2. Verify all environment variables are set correctly
3. Test with a simple message first
4. Ensure your bot hasn't been blocked or deleted

---

**🎉 Congratulations!** Your hotel now has a professional Telegram concierge bot that can assist guests 24/7!
