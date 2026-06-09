# Teams Integration Guide — Personal Chatbot (per-user)

This document explains how to expose the local Node.js assistant as a personal Microsoft Teams chatbot (1:1). It covers Azure bot registration, local testing with ngrok, environment variables, a minimal Teams app manifest, and deployment tips.

## Prerequisites
- An Azure subscription with permission to register a Bot Channels Registration (or a Microsoft App registration).
- Node.js installed and project dependencies installed (`npm install`).
- `ngrok` (or other HTTPS tunneling) for local testing.
- The repository cloned locally and the server running (see `server.js`).

## High-level steps
1. Register a bot in Azure and get `MICROSOFT_APP_ID` and `MICROSOFT_APP_PASSWORD`.
2. Update `.env` with the credentials and restart the server.
3. Expose your local server via HTTPS (ngrok) and update the bot messaging endpoint in Azure.
4. Create a Teams app package (manifest) that points to your bot and sideload it in Teams.
5. Test 1:1 chats — each Teams user will get a per-user session (namespaced by Teams user id).

## Detailed steps

### 1) Register the bot in Azure
1. Open the Azure portal and create a new **Bot Channels Registration** (or register an app under App registrations and add the Bot Channels configuration).
2. When creating, set the messaging endpoint temporarily to `https://example.invalid/api/messages` — you will update this with your ngrok URL in the next steps.
3. After creation, note the **Application (client) ID** — this is your `MICROSOFT_APP_ID`.
4. Under **Certificates & secrets**, create a **Client secret** — this is your `MICROSOFT_APP_PASSWORD`. Save the value safely.

### 2) Install dependencies
On your machine, from the project root run:

```bash
npm install
```

This installs `botbuilder` (optional dependency added) and other packages. If your environment blocks `npm` in PowerShell, run from Command Prompt or set execution policy appropriately.

### 3) Configure environment
Add the following to your `.env` (or export as environment variables):

```
MICROSOFT_APP_ID=your-azure-app-id
MICROSOFT_APP_PASSWORD=your-azure-app-secret
SERVER_URL=https://your-public-host  # optional
```

Then restart your server:

```bash
npm start
```

### 4) Expose your local server with ngrok (local testing)
1. Start ngrok to forward HTTPS to your local port (default 8080):

```bash
ngrok http 8080
```

2. Note the generated HTTPS URL (e.g. `https://abcd1234.ngrok.io`).
3. In Azure Bot Channels Registration → Settings, set **Messaging endpoint** to:

```
https://<your-ngrok-id>.ngrok.io/api/messages
```

Azure may take a minute to accept the new endpoint.

### 5) Create a Teams app manifest (minimal)
Create a folder `teams-app/` and add `manifest.json`, `color.png`, `outline.png`. A minimal `manifest.json` looks like:

```json
{
  "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.14/MicrosoftTeams.schema.json",
  "manifestVersion": "1.14",
  "version": "1.0.0",
  "id": "YOUR-TEAMS-APP-GUID",
  "packageName": "com.yourcompany.kfc-assistant",
  "developer": { "name": "Your Company", "websiteUrl": "https://your.company" },
  "name": { "short": "KFC IT Bot", "full": "KFC IT Assistant" },
  "description": { "short": "IT support assistant", "full": "Personal IT support assistant for restaurant staff." },
  "icons": { "outline": "outline.png", "color": "color.png" },
  "bots": [
    {
      "botId": "MICROSOFT_APP_ID",
      "scopes": ["personal"],
      "supportsFiles": true
    }
  ],
  "permissions": ["identity", "messageTeamMembers"],
  "validDomains": []
}
```

Replace `MICROSOFT_APP_ID` with the application ID from Azure and choose a GUID for `id` (you can generate one with `uuidgen`).

Package the app: zip `manifest.json`, `color.png`, `outline.png` into `kfc-teams-app.zip` and upload in Teams (Apps → Upload a custom app → Upload for me or my org).

### 6) Test in Teams (personal chat)
1. In Teams, open the uploaded app or search for it by the app name.
2. Start a 1:1 chat with the bot. Send a message.
3. Your server receives the activity at `/api/messages`, forwards message text to `/api/chat` (the existing proxy), and replies are posted back into Teams.

Each Teams user will be mapped to a session id prefixed with `teams-<userId>` (see `server.js`). This isolates per-user sessions.

### 7) Handling images from Teams
- Teams sends attachments as content URLs in activity attachments. To process images directly from Teams you can extend the bot handler to download the content URL and then pass the binary to the same image analysis flow used by `/api/upload-image`.

### 8) Troubleshooting
- If the Teams bot says "Cannot reach bot", confirm the messaging endpoint is HTTPS and reachable from the public internet.
- Check server logs for `/api/messages` POSTs and any errors.
- If messages arrive but bot returns no reply, verify `MICROSOFT_APP_ID` and `MICROSOFT_APP_PASSWORD` are correct and `botbuilder` is installed.

## Optional: Production deployment
- Deploy the server to a public host (Azure App Service, AWS, DigitalOcean) and use a stable HTTPS URL in the Azure bot configuration instead of ngrok.
- Secure secrets with Azure Key Vault or environment variables in your hosting environment.

## Next steps I can implement for you
- Scaffold the Teams app `manifest.json` and placeholder icons in `teams-app/`.
- Add attachment download support and OCR (`tesseract.js`) for on-image text recognition.
- Add adaptive cards for richer replies and button actions (e.g., open ticket, escalate).

---
File added to repository: `TEAMS_INTEGRATION.md`
