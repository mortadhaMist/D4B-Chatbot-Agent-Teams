# 🚀 Render Deployment Guide for Solaria Hotel Bot

## 🎯 Quick Fix for Telegram Bot on Render

Your web interface works but Telegram doesn't because of these common Render deployment issues:

### ✅ **Step 1: Set Environment Variables in Render**

1. **Go to your Render dashboard**
2. **Select your service**
3. **Click "Environment" tab**
4. **Add these variables:**

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
MISTRAL_API_KEY=your_mistral_key_here
SERVER_URL=https://your-app-name.onrender.com
```

### ✅ **Step 2: Check Render Logs**

1. **Go to "Logs" tab** in your Render dashboard
2. **Look for these messages:**
   - ✅ `🤖 Telegram bot started successfully`
   - ❌ `⚠️ TELEGRAM_BOT_TOKEN not found`

### ✅ **Step 3: Verify Bot Dependencies**

Make sure your `package.json` includes:
```json
{
  "dependencies": {
    "node-telegram-bot-api": "^0.64.0"
  }
}
```

## 🔍 **Common Issues & Solutions:**

### Issue 1: "TELEGRAM_BOT_TOKEN not found"
**Cause**: Environment variable not set in Render
**Solution**: Add `TELEGRAM_BOT_TOKEN` in Render Environment tab

### Issue 2: Bot starts but doesn't respond
**Cause**: Bot trying to connect to localhost instead of Render URL
**Solution**: Set `SERVER_URL` environment variable to your Render URL

### Issue 3: "Failed to start Telegram bot"
**Cause**: Missing dependencies or invalid token
**Solutions**: 
- Verify bot token is correct
- Check if `node-telegram-bot-api` is in dependencies
- Redeploy after adding environment variables

### Issue 4: Webhook vs Polling
**Cause**: Render might have issues with polling
**Solution**: The bot uses polling by default, which should work on Render

## 🛠️ **Render Configuration Steps:**

### 1. **Environment Variables** (Most Important!)
```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
MISTRAL_API_KEY=sk-proj-your-key-here
SERVER_URL=https://your-app-name.onrender.com
SKIP_APPROVAL=true
```

### 2. **Build Command**
```
npm install
```

### 3. **Start Command**
```
npm start
```

### 4. **Port Configuration**
Render automatically sets the `PORT` environment variable, so your code should work as-is.

## 🔧 **Debugging Steps:**

### Check Render Logs for:

1. **Bot Initialization:**
```
🤖 Telegram bot initialized with database integration
🤖 Telegram bot started successfully
🌐 Bot server URL: https://your-app.onrender.com
```

2. **Missing Token:**
```
⚠️ TELEGRAM_BOT_TOKEN not found - Telegram bot disabled
```

3. **Database Connection:**
```
✅ Connected to SQLite database
✅ Database tables created/verified
```

## 🎯 **Testing After Deployment:**

1. **Check Render logs** for bot startup messages
2. **Message your bot** on Telegram
3. **Look for these log entries:**
```
💬 Telegram message from [User] (ID: [ID]): [message]
✅ Telegram guest registered: [Name] (Room [Number])
```

## 🚨 **If Still Not Working:**

### Option A: Check Bot Token
1. Message @BotFather on Telegram
2. Send `/mybots`
3. Select your bot
4. Go to "API Token" 
5. Copy the token again and update in Render

### Option B: Verify Render Environment
1. In Render dashboard → Environment tab
2. Make sure `TELEGRAM_BOT_TOKEN` is set
3. **Redeploy** after adding environment variables

### Option C: Check Render Service Logs
Look for error messages like:
- `Error: 401 Unauthorized` (bad token)
- `Error: getaddrinfo ENOTFOUND` (network issue)
- `Failed to start Telegram bot` (dependency issue)

## 📱 **Quick Test:**

1. **Set environment variable** in Render
2. **Redeploy** your service
3. **Check logs** for `🤖 Telegram bot started successfully`
4. **Message your bot** on Telegram
5. **Check database viewer** at your Render URL + `/database.html`

## 🎉 **Expected Behavior:**

When working correctly, you should see in Render logs:
```
🤖 Telegram bot initialized with database integration
🤖 Telegram bot started successfully
🌐 Bot server URL: https://your-app-name.onrender.com
💬 Telegram message from [User]: hello
✅ Telegram guest registered: [Name] (Room [Number])
```

The most likely fix is **adding the `TELEGRAM_BOT_TOKEN` environment variable** in your Render dashboard and redeploying! 🎯
