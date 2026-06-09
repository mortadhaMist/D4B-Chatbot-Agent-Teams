# 🔧 Render Webhook Fix Guide

## 🎯 **Issue**: Telegram bot not responding on Render

The server is running but the bot isn't responding to messages. Here's how to fix it:

## ✅ **Step 1: Add SERVER_URL Environment Variable**

In your Render dashboard → Environment tab, **add**:

```
SERVER_URL=https://solaria-bot-v3.onrender.com
```

**Important**: Use `https://` (not `http://`) - Telegram requires HTTPS for webhooks!

## ✅ **Step 2: Check Webhook Status**

Visit this URL in your browser (replace with your bot token):
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

You should see:
```json
{
  "ok": true,
  "result": {
    "url": "https://solaria-bot-v3.onrender.com/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

## ✅ **Step 3: Test Webhook Endpoint**

Visit: `https://solaria-bot-v3.onrender.com/webhook`

You should see: `{"error":"Bot not available"}` or similar (not a 404)

## ✅ **Step 4: Reset Webhook (if needed)**

If webhook info shows wrong URL, reset it:
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://solaria-bot-v3.onrender.com/webhook
```

## 🔍 **Debugging Steps:**

### Check Render Logs for:

**✅ Good logs:**
```
🔍 Environment check:
  - TELEGRAM_BOT_TOKEN: ✅ Set
  - Final server URL: https://solaria-bot-v3.onrender.com
🤖 Telegram bot started successfully
🌐 Webhook set successfully
📡 Webhook verification: { url: 'https://...', pending_update_count: 0 }
```

**❌ Problem logs:**
```
❌ Failed to setup webhook: 404 Not Found
❌ Failed to setup webhook: SSL certificate problem
❌ Failed to setup webhook: Connection refused
```

### Test Message Flow:

1. **Send message** to your bot on Telegram
2. **Check Render logs** for: `📨 Telegram webhook received`
3. **Look for processing logs**: Guest registration, FAQ matching, etc.

## 🚨 **Common Issues & Fixes:**

### Issue 1: Wrong URL
**Problem**: Webhook set to `http://` instead of `https://`
**Fix**: Add `SERVER_URL=https://solaria-bot-v3.onrender.com` to environment

### Issue 2: Invalid Certificate
**Problem**: Render's SSL certificate not accepted by Telegram
**Fix**: This should work automatically with Render's valid SSL

### Issue 3: Port Issues
**Problem**: Webhook not on allowed port (443, 80, 88, 8443)
**Fix**: Render handles this automatically

### Issue 4: Bot Token Issues
**Problem**: Invalid or expired token
**Fix**: Get fresh token from @BotFather

## 🎯 **Quick Test:**

After setting `SERVER_URL` environment variable:

1. **Redeploy** your service
2. **Check logs** for successful webhook setup
3. **Message your bot** on Telegram
4. **Look for** `📨 Telegram webhook received` in logs

If you see webhook messages in logs but no responses, the issue is in message processing. If you don't see webhook messages, the issue is in webhook setup.

## 💡 **Emergency Fallback:**

If webhook mode still doesn't work, you can temporarily switch back to polling by setting:
```
FORCE_POLLING=true
```

But webhooks are the proper solution for production! 🚀
