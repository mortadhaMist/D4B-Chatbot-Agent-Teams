# Teams Integration Quick Start Checklist

Complete these steps in order to integrate DIGITAL4BUSINESS Chat into Microsoft Teams.

## ✅ Pre-Integration (What's Already Done)

- [x] Server has Teams Bot Framework integration in `server.js`
- [x] `/api/messages` endpoint configured for bot messaging
- [x] Chat API proxy ready at `/api/chat`
- [x] Teams app structure created in `teams-app/` folder

## 📝 Setup Checklist

### 1. Azure Bot Registration (Do This First)
- [ ] Go to [Azure Portal](https://portal.azure.com)
- [ ] Create a **Bot Channels Registration**
- [ ] Save **Microsoft App ID**
- [ ] Create and save **Client Secret**
- [ ] Note the **Messaging Endpoint** (you'll update this next)

### 2. Environment Configuration
- [ ] Add to `.env`:
  ```
  MICROSOFT_APP_ID=your-id-from-azure
  MICROSOFT_APP_PASSWORD=your-secret-from-azure
  SERVER_URL=https://your-domain.com
  ```
- [ ] Run `npm install botbuilder` (if not already installed)
- [ ] Restart server: `npm start`

### 3. Expose Your Server
Choose ONE option:

**Option A: Local Testing with ngrok**
- [ ] Install ngrok: `choco install ngrok` (Windows) or `brew install ngrok` (Mac)
- [ ] Run: `ngrok http 8080`
- [ ] Copy HTTPS URL from ngrok output
- [ ] In Azure, set Messaging Endpoint to: `https://your-ngrok-id.ngrok.io/api/messages`

**Option B: Deploy to Production**
- [ ] Deploy to Azure App Service, Heroku, or your server
- [ ] In Azure, set Messaging Endpoint to: `https://your-domain.com/api/messages`
- [ ] Wait 1-2 minutes for Azure to accept the endpoint

### 4. Update Teams App Manifest
- [ ] Open `teams-app/manifest.json`
- [ ] Replace `{MICROSOFT_APP_ID}` with your App ID
- [ ] Replace `{DOMAIN}` with your public domain
- [ ] Generate a unique GUID for `id` field (or use an online UUID generator)

### 5. Prepare Icons
- [ ] Add `color.png` (192×192) – your brand logo
- [ ] Add `outline.png` (32×32) – white outline icon
- [ ] See `teams-app/ICONS.md` for guidance

### 6. Create Teams Package
```bash
# Windows PowerShell
Compress-Archive -Path teams-app/manifest.json, teams-app/color.png, teams-app/outline.png -DestinationPath d4b-teams-app.zip

# Mac/Linux
cd teams-app && zip ../d4b-teams-app.zip manifest.json color.png outline.png
```

### 7. Upload to Teams
- [ ] Open Microsoft Teams
- [ ] Go to **Apps**
- [ ] Click **Upload a custom app**
- [ ] Select `d4b-teams-app.zip`
- [ ] Click **Add**

### 8. Test the Bot
- [ ] Open Teams → **Chat**
- [ ] Find and open your app "D4B Chat"
- [ ] Send a test message
- [ ] Bot should respond within a few seconds
- [ ] Check server logs for any errors

### 9. Test the Tab
- [ ] In the app, look for the **Chat tab**
- [ ] You should see the web chat interface embedded
- [ ] Test sending messages through the tab

## 🐛 Troubleshooting

### Bot Not Responding
1. Check `.env` has correct credentials
2. Verify Azure messaging endpoint is correct and recently updated
3. Check server logs: `npm start` should show "Teams integration enabled"
4. If using ngrok, ensure the URL is current (ngrok URLs change on restart)

### Icons Not Showing
- Verify file names: exactly `color.png` and `outline.png` (lowercase, no spaces)
- Verify sizes: 192×192 and 32×32
- Verify format: PNG files only
- Try uploading the app again after icon changes

### Tab Not Loading
1. Ensure domain in manifest matches your actual domain
2. Check `/public/chat.html` exists and is accessible
3. Look for CORS errors in browser console (F12)
4. Verify SSL certificate is valid (use ngrok or proper HTTPS)

### Server Won't Start
```bash
# Install botbuilder if missing
npm install botbuilder

# Or reinstall all dependencies
npm install
```

## 📚 Documentation Files

- `SETUP.md` – Detailed step-by-step guide
- `ICONS.md` – Icon creation guidelines
- `manifest.json` – Teams app configuration (edit with your values)

## 🚀 Next Steps

After testing locally:
1. Move ngrok to permanent deployment (Azure App Service, etc.)
2. Update manifest with production domain
3. Re-upload app to Teams with production URLs
4. Test with multiple Teams users
5. Customize bot responses in `server.js`

## 📞 Support

For Teams integration issues:
- Check Microsoft Teams documentation
- Review Azure Bot Service logs in Azure Portal
- Ensure all credentials are correct and have necessary permissions
