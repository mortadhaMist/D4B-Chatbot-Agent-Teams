# Teams Integration Setup Guide

This guide walks you through integrating the DIGITAL4BUSINESS Chat bot into Microsoft Teams with both bot messaging and an embedded Tab.

## Overview

Your Teams app will have two components:
1. **Bot** – Responds to direct messages in Teams via `/api/messages`
2. **Tab** – Embeds the web chat interface directly in Teams personal scope

## Prerequisites

- Microsoft 365 tenant with Teams
- Azure subscription with permissions to create bot registrations
- Node.js 18+ and npm installed
- ngrok (for local testing) or a public domain
- PowerShell or Command Prompt

## Step 1: Install botbuilder Package

```bash
npm install botbuilder
```

This installs the Microsoft Bot Framework SDK (already in optionalDependencies).

## Step 2: Register Bot in Azure

1. Go to [Azure Portal](https://portal.azure.com)
2. Create a **Bot Channels Registration**:
   - Search for "Bot Channels Registration"
   - Create new resource
   - **Resource name**: `d4b-chat-bot` (or your preference)
   - **Messaging endpoint**: Leave as `https://example.invalid/api/messages` for now (update after step 3)
   - **Microsoft App ID**: Auto-generated, save this value
   - **Microsoft App type**: Multi Tenant or Single Tenant (choose based on your needs)

3. After creation, go to **Settings** → **Configuration**:
   - Copy the **Microsoft App ID**
   - Create a **Client secret** under Certificates & secrets
   - Copy the secret value

4. Update the messaging endpoint:
   - Find your public URL/domain (from step 3)
   - Set messaging endpoint to: `https://your-domain.com/api/messages` or `https://your-ngrok-id.ngrok.io/api/messages`

## Step 3: Configure Environment Variables

Create or update your `.env` file:

```env
MICROSOFT_APP_ID=your-app-id-from-azure
MICROSOFT_APP_PASSWORD=your-secret-from-azure
SERVER_URL=https://your-public-domain.com
MISTRAL_API_KEY=your-mistral-key
SKIP_APPROVAL=false
```

Then restart the server:

```bash
npm start
```

## Step 4: Expose Local Server (For Testing)

### Option A: Using ngrok (Local Testing)

```bash
ngrok http 8080
```

Copy the HTTPS URL (e.g., `https://isotimic-generable-rhys.ngrok-free.dev`).

Update Azure Bot / Teams Developer Portal → Settings → Messaging endpoint to:
```
https://isotimic-generable-rhys.ngrok-free.dev/api/messages
```

### Option B: Deploy to Azure or Your Server

If deploying to production, use your actual domain instead of ngrok.

## Step 5: Update Teams App Manifest

Edit `teams-app/manifest.json`:

1. Replace `{MICROSOFT_APP_ID}` with your actual App ID from Azure
2. Replace `{DOMAIN}` with your public domain (e.g., `d4b-chat.azurewebsites.net` or `your-domain.com`)
3. Update `id` field to a unique GUID (you can generate one via `uuidgen` or online UUID generator)

Example:
```json
{
  "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  ...
  "bots": [{ "botId": "12345678-1234-5678-1234-567812345678", ... }],
  "staticTabs": [{ "contentUrl": "https://your-domain.com/public/chat.html", ... }],
  "validDomains": ["your-domain.com"]
}
```

## Step 6: Create Teams App Package

1. Create or add:
   - `manifest.json` (updated with your values)
   - `color.png` – 192x192 square logo (your D4B logo)
   - `outline.png` – 32x32 outline icon (white on transparent)

2. Zip these three files:
   ```bash
   # Windows PowerShell
   Compress-Archive -Path "manifest.json", "color.png", "outline.png" -DestinationPath "d4b-teams-app.zip"
   
   # Or Mac/Linux
   zip d4b-teams-app.zip manifest.json color.png outline.png
   ```

## Step 7: Upload App to Teams

1. Open Microsoft Teams
2. Go to **Apps** → **Manage your apps** (or click the three dots)
3. Click **Upload a custom app**
4. Select **Upload for me or my organization**
5. Select `d4b-teams-app.zip`
6. Review permissions and click **Add**

The bot will appear in your Teams apps list.

## Step 8: Test the Integration

### Test the Bot (1:1 Chat):
1. Open Teams → **Chat**
2. Search for and open your app
3. Send a message
4. The bot should respond via `/api/messages` → `/api/chat` proxy

### Test the Tab:
1. Open the app (from your app list)
2. You should see a "Chat" tab with the embedded web interface
3. Test the chat interface directly

## Troubleshooting

### Bot Not Responding
- Check `.env` has correct `MICROSOFT_APP_ID` and `MICROSOFT_APP_PASSWORD`
- Verify Azure Bot messaging endpoint is correct
- Check server logs: `npm start` should show "Teams integration enabled"
- If using ngrok, verify the forwarding URL is up-to-date in Azure

### Tab Not Loading
- Ensure `SERVER_URL` or domain is publicly accessible
- Check browser console (F12) for CORS or SSL errors
- Verify the `contentUrl` in manifest.json matches your domain
- Make sure the `/public/chat.html` file exists and is served correctly

### SSL Certificate Issues
- Use ngrok (provides HTTPS automatically)
- Or use a service like Let's Encrypt for production

## Next Steps

- **Customize** the bot response in `server.js` → `teamsBotHandler.onMessage()`
- **Add more tabs** or static tabs in `manifest.json`
- **Deploy** to Azure App Service or your preferred hosting
- **Test in Teams Web** or **Teams Desktop**

## References

- [Microsoft Teams Bot Framework](https://docs.microsoft.com/en-us/microsoftteams/platform/bots/what-are-bots)
- [Teams App Manifest Schema](https://docs.microsoft.com/en-us/microsoftteams/platform/resources/schema/manifest-schema)
- [Bot Framework Documentation](https://docs.microsoft.com/en-us/azure/bot-service/)
