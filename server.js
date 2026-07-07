const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const dotenv = require('dotenv');

dotenv.config();

const PORT = process.env.PORT || 8080;
const ALLOW_INTERNET_FALLBACK = String(process.env.ALLOW_INTERNET_FALLBACK || 'false').toLowerCase() === 'true';
const SYSTEM_PROMPT = `Vous êtes un assistant support IT Digital4Business pour les équipes D4B.
Répondez uniquement en français.
Vous supportez la classification des incidents IT, l'orientation des lots de service, la priorisation des tickets et le dépannage des problèmes informatiques des équipes D4B.
Ne répondez qu'aux questions liées au support IT : réseau, Wi-Fi, alimentation, matériel, imprimantes, terminaux, connectivité, authentification et infrastructure.
Ne répondez pas aux questions non liées au support IT, aux commandes, aux promotions, au service client ou aux produits.
Si l'utilisateur demande quelque chose en dehors du support IT, expliquez poliment que vous ne gérez que les incidents IT D4B et demandez une description du problème technique.
Utilisez les extraits de la base de connaissances lorsque disponibles.
`;
const teamsConversationHistory = new Map();
const MAX_TEAMS_HISTORY_TURNS = 20;

function normalizeTextForIntent(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isGreetingOnly(text) {
  const normalized = normalizeTextForIntent(text);
  return /^(bonjour|bonsoir|salut|hello|hi|coucou|bjr)[\s!.?]*$/i.test(normalized);
}

function isCreateTicketRequest(text) {
  const normalized = normalizeTextForIntent(text);
  return /^(technicien|ticket|creer ticket|cree ticket|ouvrir ticket|ouvrir un ticket|1)$/i.test(normalized);
}

function getTeamsConversationHistory(key) {
  return teamsConversationHistory.get(key) || [];
}

function saveTeamsConversationTurn(key, userText, botText) {
  const history = getTeamsConversationHistory(key);
  history.push({
    at: new Date().toISOString(),
    user: String(userText || '').trim(),
    assistant: String(botText || '').trim()
  });
  teamsConversationHistory.set(key, history.slice(-MAX_TEAMS_HISTORY_TURNS));
}

function getTeamsUserEmail(context) {
  const activity = context?.activity || {};
  const channelData = activity.channelData || {};

  return (
    channelData?.tenant?.userPrincipalName ||
    channelData?.user?.userPrincipalName ||
    channelData?.from?.userPrincipalName ||
    channelData?.teamsUser?.userPrincipalName ||
    activity.from?.userPrincipalName ||
    activity.from?.email ||
    null
  );
}

function classifyTeamsTicket(text) {
  const normalized = normalizeTextForIntent(text);

  let priority = 'P3';
  let category = 'General IT Support';
  let serviceLot = 'Lot 1 - Helpdesk / Service Desk';

  if (
    normalized.includes('caisse') ||
    normalized.includes('ncr') ||
    normalized.includes('tpe') ||
    normalized.includes('encaissement') ||
    normalized.includes('paiement')
  ) {
    category = 'Caisse et encaissement';
    serviceLot = 'Lot 2 - Support caisse / encaissement';
    priority = 'P2';
  }

  if (
    normalized.includes('internet') ||
    normalized.includes('reseau') ||
    normalized.includes('wifi') ||
    normalized.includes('wi-fi') ||
    normalized.includes('connexion')
  ) {
    category = 'Réseau / Wi-Fi';
    serviceLot = 'Lot 3 - Réseau / Infrastructure';
    priority = 'P2';
  }

  if (
    normalized.includes('imprimante') ||
    normalized.includes('ticket') ||
    normalized.includes('impression')
  ) {
    category = 'Imprimante';
    serviceLot = 'Lot 1 - Helpdesk / Service Desk';
  }

  if (
    normalized.includes('bloque') ||
    normalized.includes('bloquee') ||
    normalized.includes('hors service') ||
    normalized.includes('panne') ||
    normalized.includes('urgent') ||
    normalized.includes('impossible')
  ) {
    priority = priority === 'P3' ? 'P2' : priority;
  }

  return { priority, category, serviceLot };
}

function buildTeamsTicketDescription(history, triggerText, userName, userEmail) {
  const conversationLines = history.map((turn, index) => {
    return [
      `--- Message ${index + 1} ---`,
      `Utilisateur: ${turn.user}`,
      `Assistant: ${turn.assistant}`
    ].join('\n');
  });

  return [
    `Ticket créé depuis Microsoft Teams.`,
    `Demandeur Teams: ${userName || 'Unknown'}`,
    `Email Teams: ${userEmail || 'Unknown'}`,
    '',
    'Résumé / conversation:',
    conversationLines.length ? conversationLines.join('\n') : 'Aucun détail avant la demande de création du ticket.',
    '',
    `Déclencheur utilisateur: ${triggerText || 'technicien'}`
  ].join('\n');
}

function getAteraTicketId(data) {
  return data?.TicketID ||
    data?.TicketId ||
    data?.ticketId ||
    data?.id ||
    data?.Id ||
    data?.ID ||
    data?.TicketNumber ||
    null;
}

function appendTechnicienPromptOnce(replyText) {
  const prompt = '🎫 Pour créer un ticket, écrivez « technicien ».';
  const cleaned = String(replyText || '')
    .replace(/🎫\s*Pour créer un ticket, écrivez « technicien »\.?/gi, '')
    .trim();

  return `${cleaned}\n\n${prompt}`;
}
let teamsAdapter = null;
let teamsBotHandler = null;
try {
  const { BotFrameworkAdapter, TeamsActivityHandler, TeamsInfo } = require('botbuilder');
  
  // SÃ©curisation de la rÃ©cupÃ©ration des variables d'environnement
  const microsoftAppId = process.env.MICROSOFT_APP_ID ? String(process.env.MICROSOFT_APP_ID).trim() : null;
  const microsoftAppPassword = process.env.MICROSOFT_APP_PASSWORD ? String(process.env.MICROSOFT_APP_PASSWORD).trim() : null;
  const microsoftAppTenantId = process.env.MICROSOFT_APP_TENANT_ID ? String(process.env.MICROSOFT_APP_TENANT_ID).trim() : null;

  console.log('MICROSOFT_APP_ID loaded:', microsoftAppId ? 'âœ…' : 'âŒ');
  console.log('MICROSOFT_APP_PASSWORD loaded:', microsoftAppPassword ? 'âœ…' : 'âŒ');
  
  if (microsoftAppId && microsoftAppPassword) {
    // Configuration de l'adaptateur avec prise en charge du Tenant ID si prÃ©sent
    const openIdMetadata = process.env.BOT_OPENID_METADATA || 'https://login.botframework.com/v1/.well-known/openidconfiguration';
    teamsAdapter = new BotFrameworkAdapter({ 
      appId: microsoftAppId, 
      appPassword: microsoftAppPassword,
      channelAuthTenant: microsoftAppTenantId || undefined,
      openIdMetadata,
      channelService: process.env.CHANNEL_SERVICE || undefined
    });
    console.log('Teams adapter config:', {
      appId: !!microsoftAppId,
      openIdMetadata,
      channelService: process.env.CHANNEL_SERVICE || 'default'
    });

    teamsAdapter.onTurnError = async (context, error) => {
      console.error('Teams adapter onTurnError:', {
        message: error?.message || String(error),
        name: error?.name,
        statusCode: error?.statusCode || error?.status || null,
        activityType: context?.activity?.type,
        conversationId: context?.activity?.conversation?.id,
        serviceUrl: context?.activity?.serviceUrl
      });
      if (error?.statusCode === 401 || error?.status === 401) {
        console.error('Skipping onTurnError reply because the Teams connector is rejecting authentication.');
        return;
      }
      try {
        await context.sendActivity('Sorry, the Teams bot encountered an authentication error. Please verify the App ID and App Password.');
      } catch (sendError) {
        console.error('Failed to send onTurnError message:', sendError);
      }
    };
    
      // Create connector credentials and log token claims for debugging outbound auth
      try {
        const { MicrosoftAppCredentials } = require('botframework-connector');
        const connectorCreds = new MicrosoftAppCredentials(microsoftAppId, microsoftAppPassword);
        connectorCreds.getToken().then(t => {
          try {
            const token = typeof t === 'string' ? t : (t && t.accessToken ? t.accessToken : null);
            if (token) {
              const p = token.split('.')[1] || '';
              const s = p.replace(/-/g, '+').replace(/_/g, '/');
              const padded = s + '='.repeat((4 - s.length % 4) % 4);
              const claims = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
              console.log('Connector token claims:', { aud: claims.aud, appid: claims.appid, iss: claims.iss });
            } else {
              console.log('Connector token: empty');
            }
          } catch (e) { console.warn('Failed to decode connector token', e); }
        }).catch(err => console.warn('Failed to acquire connector token', err));
      } catch (e) {
        console.warn('Connector credentials unavailable:', e?.message || e);
      }
    teamsBotHandler = new TeamsActivityHandler();

    teamsBotHandler.onMessage(async (context, next) => {
      // Ensure the Teams service URL is trusted for connector auth
      try {
        const { MicrosoftAppCredentials } = require('botframework-connector');
        if (context?.activity?.serviceUrl) {
          MicrosoftAppCredentials.trustServiceUrl(context.activity.serviceUrl);
        }
      } catch (e) { console.warn('Failed to trust serviceUrl for Teams:', e); }

      // --- TYPING ANIMATION ACTIVATION ---
      try {
        await context.sendActivity({ type: 'typing' });
      } catch (typingError) {
        console.warn('Failed to dispatch typing status indicator activity:', typingError);
      }

const rawText = (context.activity && context.activity.text) ? context.activity.text : '';
const text = String(rawText || '').trim();
const userName = context.activity.from?.name || 'TeamsUser';
let userEmail = getTeamsUserEmail(context);

if (!userEmail) {
  try {
    const member = await TeamsInfo.getMember(context, context.activity.from.id);
    userEmail =
      member?.email ||
      member?.userPrincipalName ||
      member?.userPrincipalName?.toLowerCase() ||
      null;

    console.log('Teams member resolved:', {
      name: member?.name,
      email: member?.email,
      userPrincipalName: member?.userPrincipalName
    });
  } catch (memberError) {
    console.warn('Could not resolve Teams member email:', memberError?.message || memberError);
  }
}

const teamsConversationKey =
  context.activity.conversation?.id ||
  context.activity.from?.id ||
  `teams-${Date.now()}`;

// Message d'accueil seulement au début si l'utilisateur dit juste bonjour
if (getTeamsConversationHistory(teamsConversationKey).length === 0 && isGreetingOnly(text)) {
  const welcomeText = 'Bonjour ! Je suis là pour vous aider avec tout problème ou question lié au support IT pour les équipes D4B (réseau, Wi-Fi, matériel, imprimantes, authentification, etc.)';
  saveTeamsConversationTurn(teamsConversationKey, text, welcomeText);
  await context.sendActivity(appendTechnicienPromptOnce(welcomeText));
  await next();
  return;
}

// Création ticket Teams : l'utilisateur écrit "technicien"
if (isCreateTicketRequest(text)) {
  try {
    const history = getTeamsConversationHistory(teamsConversationKey);
    const searchableText = history.map(t => `${t.user}\n${t.assistant}`).join('\n');
    const classification = classifyTeamsTicket(searchableText || text);

    const ticketBody = {
      name: userName,
      email: userEmail,
      room: 'Teams',
      category: classification.category,
      priority: classification.priority,
      serviceLot: classification.serviceLot,
      sessionId: teamsConversationKey,
      text: buildTeamsTicketDescription(history, text, userName, userEmail)
    };

    const ticketData = await createAteraTicket(ticketBody);
    const ticketId = getAteraTicketId(ticketData);

    const ticketReply = ticketId
      ? `Votre ticket Atera a été créé avec succès. Numéro : ${ticketId}`
      : 'Votre ticket Atera a été créé avec succès.';

    saveTeamsConversationTurn(teamsConversationKey, text, ticketReply);
    await context.sendActivity(ticketReply);
  } catch (ticketError) {
    console.error('Teams ticket creation failed:', ticketError);
    await context.sendActivity(
  `Je n’ai pas pu créer le ticket Atera.\n\nErreur technique : ${ticketError.message || ticketError}`
);
  }

  await next();
  return;
}

// Forward user message to existing chat proxy
try {
  const proxyUrl = process.env.CHAT_PROXY_URL || `http://127.0.0.1:${PORT}/api/chat`;
  const resp = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text }
      ],
      sessionId: teamsConversationKey,
      guestInfo: {
        name: userName,
        email: userEmail
      }
    })
  });

  const contentType = resp.headers.get('content-type') || '';
  let data = null;

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => 'Unable to read response body');
    console.error('Teams->chat proxy returned error', {
      status: resp.status,
      statusText: resp.statusText,
      bodyText
    });
    throw new Error(`Chat proxy returned ${resp.status}`);
  }

  if (contentType.includes('application/json')) {
    data = await resp.json();
  } else {
    const bodyText = await resp.text().catch(() => 'Unable to read non-JSON response body');
    console.error('Teams->chat proxy returned non-JSON response', {
      contentType,
      bodyText
    });
    throw new Error('Invalid chat proxy response');
  }

  const reply = data?.choices?.[0]?.message?.content || data?.error || 'No response from assistant';
  const cleanedReply = String(reply || '').trim();

  let replyText = data?.sharepoint_used
    ? `${cleanedReply}\n\n✅ Source SharePoint utilisée pour cette réponse.`
    : cleanedReply;

  replyText = appendTechnicienPromptOnce(replyText);

  saveTeamsConversationTurn(teamsConversationKey, text, replyText);
  await context.sendActivity(replyText);
} catch (e) {
  console.error('Teams->chat proxy error:', e);
  await context.sendActivity('Sorry, an error occurred while processing your message.');
}
      await next();
    });
    console.log('Teams integration enabled (botbuilder present)');
  } else {
    console.warn('Teams integration disabled: missing MICROSOFT_APP_ID or MICROSOFT_APP_PASSWORD');
  }
} catch (e) {
  console.error('Teams integration failed to initialize:', e);
}

console.log("API KEY Loaded:", process.env.MISTRAL_API_KEY ? "âœ…" : "âŒ");
console.log("SKIP_APPROVAL:", process.env.SKIP_APPROVAL === "true" ? "ðŸš€ ENABLED (Auto-approval active)" : " DISABLED (Manual approval required)");
// Import database
const DatabaseClass = require('./database');
const db = new DatabaseClass();

const PUBLIC_DIR = './public';
const DATA_DIR = path.join(__dirname, 'data');
const GUEST_SESSIONS_FILE = path.join(DATA_DIR, 'guest_sessions.json');
const REQUESTS_FILE = path.join(DATA_DIR, 'requests.json');
const KB_DIR = path.join(DATA_DIR, 'kb');

//Récupérer un token Graph côté backend
const axios = require("axios");
async function getGraphToken() {
const url = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`;
const params = new URLSearchParams();
params.append("client_id", process.env.CLIENT_ID);
params.append("client_secret", process.env.CLIENT_SECRET);
params.append("scope", "https://graph.microsoft.com/.default");
params.append("grant_type", "client_credentials");
const response = await axios.post(url, params, {
headers: {
"Content-Type": "application/x-www-form-urlencoded"
}
});
return response.data.access_token;
}


//Récupérer l’ID du site SharePoint

async function getSharePointSiteId() {
  const token = await getGraphToken();
  const rawHostname = process.env.SHAREPOINT_HOSTNAME || '';
  const rawSitePath = process.env.SHAREPOINT_SITE_PATH || '';
  const hostname = rawHostname.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const sitePath = rawSitePath.startsWith('/') ? rawSitePath : `/${rawSitePath}`;
  const url = `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`;
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data.id;
  } catch (err) {
    const ctx = {
      url,
      hostname,
      sitePath,
      error: err?.response?.data || err.message || String(err)
    };
    console.error('getSharePointSiteId failed', ctx);
    throw err;
  }
}

//Lister les bibliothèques de documents
async function listDocumentLibraries() {
  const token = await getGraphToken();
  const siteId = await getSharePointSiteId();
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`;
  const response = await axios.get(url, {
headers: {
Authorization: `Bearer ${token}`
}
});
return response.data.value.map(drive => ({
id: drive.id,
name: drive.name,
webUrl: drive.webUrl
}));
}

//Lister les documents dans une bibliothèque
async function listDocuments(driveId, folderId = 'root') {
const token = await getGraphToken();
const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/children`;
const response = await axios.get(url, {
headers: {
Authorization: `Bearer ${token}`
}
});
return response.data.value.map(item => ({
id: item.id,
name: item.name,
type: item.folder ? "folder" : "file",
webUrl: item.webUrl,
downloadUrl: item["@microsoft.graph.downloadUrl"] || null
}));
}


//Télécharger le contenu d’un document

async function downloadDocument(driveId, itemId) {
  const token = await getGraphToken();
 
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;
 
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    responseType: "arraybuffer"
  });
 
  return response.data;
}


async function searchDocuments(driveId, query, folderId = 'root') {
  const token = await getGraphToken();
 
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/search(q='${encodeURIComponent(query)}')`;
 
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
 
  return response.data.value.map(item => ({
    id: item.id,
    name: item.name,
    webUrl: item.webUrl,
    downloadUrl: item["@microsoft.graph.downloadUrl"] || null
  }));
}

// Find the target folder by name (e.g., "D4B ChatBot Teams")
async function findFolderByName(driveId, targetFolderName, parentFolderId = 'root') {
  try {
    const items = await listDocuments(driveId, parentFolderId);
    const targetFolder = items.find(item => item.type === 'folder' && item.name && item.name.toLowerCase().includes(targetFolderName.toLowerCase()));
    return targetFolder || null;
  } catch (e) {
    console.warn('findFolderByName failed', e?.message || e);
    return null;
  }
}

async function getTargetKbFolderId(driveId, folderName = 'D4B ChatBot Teams') {
  if (process.env.SHAREPOINT_KB_FOLDER_ID) {
    return process.env.SHAREPOINT_KB_FOLDER_ID.trim();
  }
  const folder = await findFolderByName(driveId, folderName);
  return folder ? folder.id : null;
}







// In-memory knowledge index: [{ filename, text }]
let KNOWLEDGE = [];

function ensureKbDir() {
  if (!fs.existsSync(KB_DIR)) fs.mkdirSync(KB_DIR, { recursive: true });
}

function extractDocxText(buffer) {
  try {
    let pos = 0;
    while (pos + 30 <= buffer.length) {
      const signature = buffer.readUInt32LE(pos);
      if (signature !== 0x04034b50) break;
      const flags = buffer.readUInt16LE(pos + 6);
      const compression = buffer.readUInt16LE(pos + 8);
      const fnameLen = buffer.readUInt16LE(pos + 26);
      const extraLen = buffer.readUInt16LE(pos + 28);
      const compSize = buffer.readUInt32LE(pos + 18);
      const fileName = buffer.slice(pos + 30, pos + 30 + fnameLen).toString('utf8');
      const dataStart = pos + 30 + fnameLen + extraLen;
      if (fileName === 'word/document.xml') {
        const compressedSlice = buffer.slice(dataStart, dataStart + compSize);
        let xml = '';
        if (compression === 0) {
          xml = compressedSlice.toString('utf8');
        } else if (compression === 8) {
          xml = require('zlib').inflateRawSync(compressedSlice).toString('utf8');
        }
        return xml.replace(/<w:t[^>]*>(.*?)<\/w:t>/gs, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      pos = dataStart + compSize;
      if (compSize === 0) break;
    }
  } catch (e) {
    return '';
  }
  return '';
}

function loadKnowledgeIndex() {
  ensureKbDir();
  KNOWLEDGE = [];
  const files = fs.readdirSync(KB_DIR).filter(f => fs.statSync(path.join(KB_DIR, f)).isFile());
  for (const f of files) {
    try {
      const p = path.join(KB_DIR, f);
      const ext = path.extname(f).toLowerCase();
      let text = '';
      if (ext === '.json') {
        const raw = fs.readFileSync(p, 'utf8');
        try {
          const json = JSON.parse(raw);
          text = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
        } catch (err) {
          text = raw;
        }
      } else if (ext === '.docx') {
        const buffer = fs.readFileSync(p);
        text = extractDocxText(buffer);
      } else {
        text = fs.readFileSync(p, 'utf8');
      }
      if (text && text.trim().length > 20) {
        KNOWLEDGE.push({ filename: f, text: text.trim() });
      }
    } catch (e) {
      console.warn(`Skipping KB file ${f}:`, e?.message || e);
    }
  }
  console.log(` Loaded ${KNOWLEDGE.length} knowledge files`);
}

function searchKnowledge(query, maxSnippets = 3) {
  if (!query || KNOWLEDGE.length === 0) return '';
  const q = String(query).toLowerCase();
  const tokens = q.split(/\W+/).filter(Boolean);
  if (tokens.length === 0) return '';

  // Score documents by number of token occurrences and extract matching lines
  const hits = [];
  for (const doc of KNOWLEDGE) {
    const lines = doc.text.split(/\r?\n/);
    let score = 0;
    const excerpts = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].toLowerCase();
      let matched = false;
      for (const t of tokens) {
        if (t.length > 2 && l.includes(t)) { matched = true; score++; }
      }
      if (matched) excerpts.push(lines[i].trim());
      if (excerpts.length >= 3) break;
    }
    if (score > 0) hits.push({ doc: doc.filename, score, excerpts });
  }

  hits.sort((a,b) => b.score - a.score);
  const pieces = [];
  for (let i = 0; i < Math.min(maxSnippets, hits.length); i++) {
    const h = hits[i];
    pieces.push(`From ${h.doc}: ${h.excerpts.slice(0,2).join(' | ')}`);
  }
  return pieces.join('\n');
}

// Fetch snippets from SharePoint (uses Graph helper functions defined above)
async function getSharePointSnippets(query, maxSnippets = 3) {
  try {
    if (!query) return '';
    const libs = await listDocumentLibraries();
    if (!libs || libs.length === 0) return '';
    const documentsLib = libs.find(lib => lib.name && lib.name.toLowerCase().includes('documents')) || libs[0];
    if (!documentsLib) return '';
    
    const folderId = await getTargetKbFolderId(documentsLib.id);
    if (!folderId) {
      console.warn('No SharePoint KB folder found for snippets');
      return '';
    }
    
    const results = await searchDocuments(documentsLib.id, query, folderId);
    if (!results || results.length === 0) return '';
    const pieces = [];
    for (let i = 0; i < Math.min(maxSnippets, results.length); i++) {
      const it = results[i];
      try {
        const raw = await downloadDocument(documentsLib.id, it.id).catch(() => null);
        if (!raw) continue;
        const name = it.name || 'document';
        const ext = (path.extname(name) || '').toLowerCase();
        let text = '';
        if (ext === '.docx') {
          text = extractDocxText(Buffer.from(raw));
        } else {
          try { text = Buffer.from(raw).toString('utf8').replace(/\s+/g, ' ').trim(); } catch (e) { text = ''; }
        }
        if (!text) continue;
        if (text.length > 400) text = text.slice(0, 400) + '...';
        pieces.push(`From SharePoint (${name}): ${text}`);
      } catch (e) {
        console.warn('SharePoint snippet fetch failed for', it?.name, e?.message || e);
      }
    }
    return pieces.join('\n');
  } catch (e) {
    console.warn('getSharePointSnippets failed', e?.message || e);
    return '';
  }
}

// Initialize data directory and files
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(REQUESTS_FILE)) {
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify([], null, 2));
  console.log(' Created requests.json file');
}
console.log(' Request store:', path.resolve(REQUESTS_FILE));

// In-memory storage for guest sessions (fallback if file doesn't exist)
let guestSessions = [];

// Load existing guest sessions from file
function loadGuestSessions() {
  try {
    if (fs.existsSync(GUEST_SESSIONS_FILE)) {
      const data = fs.readFileSync(GUEST_SESSIONS_FILE, 'utf8');
      guestSessions = JSON.parse(data);
      console.log(` Loaded ${guestSessions.length} guest sessions from file`);
    } else {
      // Create the file if it doesn't exist
      fs.writeFileSync(GUEST_SESSIONS_FILE, JSON.stringify([], null, 2));
      console.log(' Created new guest sessions file');
    }
  } catch (error) {
    console.error(' Error loading guest sessions:', error);
    guestSessions = [];
  }
}

// Save guest sessions to file
function saveGuestSessions() {
  try {
    fs.writeFileSync(GUEST_SESSIONS_FILE, JSON.stringify(guestSessions, null, 2));
    console.log(` Saved ${guestSessions.length} guest sessions to file`);
  } catch (error) {
    console.error(' Error saving guest sessions:', error);
  }
}

// Load sessions on startup
loadGuestSessions();
// SharePoint will be used as the knowledge source (local data/kb is not loaded)

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

// Helper function to send JSON response
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Helper functions for JSON file operations
function readJsonSafe(p) { 
  try { 
    return JSON.parse(fs.readFileSync(p, 'utf8')); 
  } catch { 
    return []; 
  } 
}

function writeJsonSafe(p, obj) { 
  try {
    fs.writeFileSync(p, JSON.stringify(obj, null, 2)); 
  } catch (e) {
    console.error(`Error writing to ${p}:`, e);
    throw e;
  }
}

// Helper function to parse request body
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

// --- Mistral proxy endpoint ---
async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch (e) {
    return null;
  }
}
async function createAteraTicket(body) {
  if (!process.env.ATERA_API_KEY || !process.env.ATERA_API_URL) {
    throw new Error('Missing ATERA_API_KEY or ATERA_API_URL on server');
  }

  const baseUrl = String(process.env.ATERA_API_URL || '').trim();

  const ateraUrl = baseUrl.toLowerCase().includes('/api/v3/tickets')
    ? baseUrl
    : new URL('/api/v3/tickets', baseUrl).toString();

  const problemLabel = body.category || 'problème';
  const subjectName = body.name || 'demandeur inconnu';
  const subjectRoom = body.room || 'Restaurant inconnu';
  const ateraSubject = `${subjectRoom} - ${problemLabel} - ${subjectName}`;

  const descriptionLines = [
    `Nom: ${body.name || 'Unknown'}`,
    `Restaurant: ${body.room || 'Unknown'}`,
    `Email: ${body.email || 'Unknown'}`,
    `Catégorie: ${body.category || 'problème'}`,
    `Priorité: ${body.priority || 'P3'}`,
    `Service Lot: ${body.serviceLot || 'Lot 1 - Helpdesk / Service Desk'}`,
    `Session ID: ${body.sessionId || 'N/A'}`,
    '',
    `${body.text || 'No additional details provided'}`
  ];

  const priorityMap = {
    P1: 'Critical',
    P2: 'High',
    P3: 'Medium',
    P4: 'Low'
  };

  const ateraPayload = {
    TicketTitle: ateraSubject,
    Description: descriptionLines.join('\n'),
    TicketPriority: priorityMap[body.priority] || 'Medium'
  };

  if (body.email) {
    ateraPayload.EndUserEmail = body.email;

    const nameParts = String(body.name || 'Guest')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    ateraPayload.EndUserFirstName = nameParts[0] || 'Guest';
    ateraPayload.EndUserLastName = nameParts.slice(1).join(' ') || 'User';
  }

  console.log('[Atera] Forwarding request to:', ateraUrl);
  console.log('[Atera] Forwarding payload:', ateraPayload);

  const aRes = await fetch(ateraUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-KEY': process.env.ATERA_API_KEY
    },
    body: JSON.stringify(ateraPayload)
  });

  const text = await aRes.text();

  let aData;
  try {
    aData = JSON.parse(text);
  } catch (err) {
    console.warn('[Atera] Failed to parse response as JSON:', text);
    aData = {
      text,
      rawText: text
    };
  }

  console.log('[Atera] Response status:', aRes.status);
  console.log('[Atera] Response body:', aData);

  try {
    const store = readJsonSafe(REQUESTS_FILE);
    store.push({
      id: `ATERA-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ticket: getAteraTicketId(aData),
      payload: body
    });
    writeJsonSafe(REQUESTS_FILE, store);
  } catch (e) {
    console.warn('Failed to persist Atera request locally', e);
  }

 if (!aRes.ok) {
  const readableDetails =
    typeof aData === 'string'
      ? aData
      : JSON.stringify(aData, null, 2);

  const err = new Error(`Atera HTTP ${aRes.status}: ${readableDetails}`);
  err.status = aRes.status;
  err.details = aData;
  throw err;
}

  return aData;
}
async function handleApi(req, res) {
  try {
    
        // SharePoint status/debug endpoint
        if (req.method === 'GET' && req.url.startsWith('/api/sharepoint/status')) {
          try {
            console.log('/api/sharepoint/status requested');
            const rawHostname = process.env.SHAREPOINT_HOSTNAME || '';
            const rawSitePath = process.env.SHAREPOINT_SITE_PATH || '';
            const hostname = rawHostname.replace(/^https?:\/\//, '').replace(/\/+$/, '');
            const sitePath = rawSitePath.startsWith('/') ? rawSitePath : `/${rawSitePath}`;

            // Try to acquire Graph token
            let tokenOk = false;
            let tokenError = null;
            try { await getGraphToken(); tokenOk = true; } catch (e) { tokenOk = false; tokenError = e?.response?.data || e.message || String(e); }

            let siteId = null;
            let siteError = null;
            try { siteId = await getSharePointSiteId(); } catch (e) { siteId = null; siteError = e?.response?.data || e.message || String(e); }

            let libraries = [];
            let librariesError = null;
            try { if (siteId) libraries = await listDocumentLibraries(); } catch (e) { libraries = []; librariesError = e?.response?.data || e.message || String(e); }

            // Find Documents library specifically
            let documentsLib = null;
            let allFilesInDocuments = [];
            let targetFolder = null;
            let targetFolderFiles = [];
            let targetFolderError = null;
            
            if (libraries && libraries.length > 0) {
              documentsLib = libraries.find(lib => lib.name && lib.name.toLowerCase().includes('documents')) || libraries[0];
              if (documentsLib) {
                try {
                  allFilesInDocuments = await listDocuments(documentsLib.id).catch(() => []);
                } catch (e) { allFilesInDocuments = []; }
                
                // Find the target KB folder
                try {
                  targetFolder = await findFolderByName(documentsLib.id, 'D4B ChatBot Teams');
                  if (targetFolder) {
                    targetFolderFiles = await listDocuments(documentsLib.id, targetFolder.id).catch(() => []);
                  }
                } catch (e) { targetFolderError = e?.response?.data || e.message || String(e); }
              }
            }

            let sampleDocs = [];
            let docsError = null;
            try {
              if (documentsLib && allFilesInDocuments && allFilesInDocuments.length > 0) {
                sampleDocs = allFilesInDocuments.slice(0, 5).map(d => ({ id: d.id, name: d.name, type: d.type, webUrl: d.webUrl }));
              }
            } catch (e) { sampleDocs = []; docsError = e?.response?.data || e.message || String(e); }

            const sharepointUrl = `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`;
            const responseBody = {
              success: true,
              env: {
                SHAREPOINT_HOSTNAME: rawHostname,
                SHAREPOINT_SITE_PATH: rawSitePath,
                normalizedHost: hostname,
                normalizedPath: sitePath,
                sharepointUrl
              },
              token_acquired: tokenOk,
              token_error: tokenError,
              siteId: siteId || null,
              site_error: siteError,
              libraries,
              libraries_error: librariesError,
              documentsLibrary: documentsLib || null,
              allFilesInDocuments: allFilesInDocuments.map(f => ({ id: f.id, name: f.name, type: f.type, webUrl: f.webUrl })),
              sampleDocs,
              docs_error: docsError,
              targetKBFolder: targetFolder ? { id: targetFolder.id, name: targetFolder.name, type: targetFolder.type } : null,
              filesInTargetFolder: targetFolderFiles.map(f => ({ id: f.id, name: f.name, type: f.type, webUrl: f.webUrl })),
              targetFolder_error: targetFolderError
            };
            return sendJsonResponse(res, 200, responseBody);
          } catch (err) {
            console.error('/api/sharepoint/status failed', err);
            return sendJsonResponse(res, 500, { success: false, error: String(err) });
          }
        }

        // SharePoint search endpoint
        if (req.method === 'GET' && req.url.startsWith('/api/sharepoint/search')) {
      try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const query = url.searchParams.get('q');

        if (!query) {
          return sendJsonResponse(res, 400, {
            success: false,
            error: "Paramètre q obligatoire"
          });
        }

        const libraries = await listDocumentLibraries();

        const documentsLibrary = libraries.find(lib =>
          lib.name.toLowerCase().includes("documents")
        );

        if (!documentsLibrary) {
          return sendJsonResponse(res, 404, {
            success: false,
            error: "Bibliothèque Documents introuvable"
          });
        }

        const folderId = await getTargetKbFolderId(documentsLibrary.id);
        if (!folderId) {
          return sendJsonResponse(res, 404, {
            success: false,
            error: "Dossier KB SharePoint introuvable"
          });
        }

        const results = await searchDocuments(documentsLibrary.id, query, folderId);

        return sendJsonResponse(res, 200, {
          success: true,
          query,
          folderId,
          results
        });

      } catch (error) {
        console.error("Erreur SharePoint search:", error.response?.data || error.message);

        return sendJsonResponse(res, 500, {
          success: false,
          error: error.response?.data || error.message
        });
      }
    }
    
    // Chat proxy
    if (req.method === 'POST' && req.url === '/api/chat') {
      if (!process.env.MISTRAL_API_KEY) return sendJsonResponse(res, 500, { error: 'Missing MISTRAL_API_KEY on server' });
      const { messages = [], model, temperature = 0.4, sessionId, guestInfo, responseFormat } = await readJson(req).catch(e => ({}));
      const modelName = model && model.toLowerCase().startsWith('mistral') ? model : 'mistral-medium-latest';

      // Attach KB snippets (SharePoint only)
      const lastUser = Array.isArray(messages) ? [...messages].reverse().find(m => m.role === 'user') : null;
      const userText = lastUser ? (typeof lastUser.content === 'string' ? lastUser.content : JSON.stringify(lastUser.content)) : '';
      let snippets = '';
      if (lastUser && process.env.SHAREPOINT_HOSTNAME && process.env.SHAREPOINT_SITE_PATH) {
        try {
          snippets = await getSharePointSnippets(userText, 3);
        } catch (e) {
          console.warn('SharePoint snippets fetch failed in /api/chat', e?.message || e);
          snippets = '';
        }
      }

      // Determine if we should force the D4B troubleshooting template (French)
      let format = responseFormat || null;
      const lower = String(userText || '').toLowerCase();
      if (!format && (lower.includes('bsod') || lower.includes('Ã©cran bleu') || lower.includes('blue screen'))) format = 'D4B_troubleshoot_fr';

      const outgoing = [];
      if (snippets) {
        outgoing.push({ role: 'system', content: `Relevant knowledge:\n${snippets}` });
      } else if (ALLOW_INTERNET_FALLBACK) {
        outgoing.push({ role: 'system', content: `Aucune information pertinente n'a été trouvée dans la base SharePoint. Vous pouvez utiliser vos connaissances générales/internet pour répondre, sans utiliser de fichiers locaux ou d'autres bases internes.` });
      } else {
        outgoing.push({ role: 'system', content: `Aucune information pertinente n'a été trouvée dans la base SharePoint. Répondez uniquement à partir de vos connaissances internes, sans utiliser d'autres bases de données ni de fichiers locaux.` });
      }

      // If requested, instruct the assistant to reply using the D4B-friendly French troubleshooting template
      if (format === 'D4B_troubleshoot_fr') {
        const guide = `RÃ©pondez en franÃ§ais en utilisant exactement le format suivant (ne rajoutez pas d'autres sections) :\n\n**Classification :**\n- PrioritÃ© : P1 / P2 / ...\n- Lot : Nom du lot\n\n**Ã‰tapes de dÃ©pannage (suivre dans l'ordre)**\n1. Titre de l'Ã©tape :\n- Action : description claire et courte\n- VÃ©rifier : question binaire ou instruction prÃ©cise\n- Question Ã  renvoyer : une question courte que l'utilisateur doit rÃ©pondre\n\n( rÃ©pÃ©tez pour chaque Ã©tape )\n\n**Si les Ã©tapes ciâ€‘dessus Ã©chouent**\n- Action : instructions pour ouvrir un ticket ou escalade\n\n**Contournements temporaires**\n- Liste courte des contournements\n\n**Checklist rapide Ã  renvoyer (copier/coller)**\n- [ ] Item 1 - rÃ©sultat : (Oui / Non / autre)\n- [ ] Item 2 - rÃ©sultat : ...\n\n**Question pour l'utilisateur :**\nUne question claire demandant l'Ã©tat actuel et toute info (codes d'erreur, photo).`;
        outgoing.push({ role: 'system', content: guide });
      }

      // Append the original conversation messages
      for (const m of messages) outgoing.push(m);

      // Debug log: show outgoing messages (truncated) so we can confirm KB snippets are injected
      try {
        const preview = outgoing.slice(0, 6).map(m => ({ role: m.role, content: typeof m.content === 'string' ? (m.content.length > 240 ? m.content.slice(0,240) + '...': m.content) : typeof m.content }));
        console.log('Chat outgoing ->', { modelName, temperature, messagesCount: outgoing.length, preview, snippetsPresent: !!snippets });
      } catch (e) { console.warn('Failed to serialize outgoing preview', e); }

      const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}` },
        body: JSON.stringify({ model: modelName, messages: outgoing, temperature })
      });
      const data = await resp.json().catch(() => ({}));

      // optional DB logging
      if (resp.ok && guestInfo && Array.isArray(messages) && messages.length >= 1) {
        try {
          // Only attempt to look up by room when a room identifier is provided
          if (guestInfo.room) {
            const guest = await db.getGuestByRoom(guestInfo.room).catch(() => null);
            if (guest) await db.logConversation(guest.id, messages[messages.length - 1].content, data.choices?.[0]?.message?.content || '');
          } else {
            console.warn('Conversation not logged: guestInfo.room is undefined', { guestInfo });
          }
        } catch (e) { console.warn('Conversation log failed', e); }
      }

      const responsePayload = { ...data, sharepoint_used: !!snippets };
      return res.writeHead(resp.ok ? 200 : (resp.status || 500), { 'Content-Type': 'application/json' }), res.end(JSON.stringify(responsePayload));
    }

    // Atera ticket proxy
    // Atera ticket proxy
if (req.method === 'POST' && req.url === '/api/atera') {
  try {
    const body = await readJson(req);
    console.log('[Atera] Incoming request payload:', body);

    const aData = await createAteraTicket(body);

    return sendJsonResponse(res, 200, aData);
  } catch (err) {
    console.error('[Atera] Exception:', err);

    return sendJsonResponse(res, err.status || 500, {
      error: 'Atera proxy error',
      message: err.message,
      details: err.details || null
    });
  }
}

    // Image upload endpoint removed (Jimp no longer used)
    if (req.method === 'POST' && req.url === '/api/upload-image') {
      return sendJsonResponse(res, 501, { error: 'Image upload service disabled' });
    }

    // Document upload for KB
    if (req.method === 'POST' && req.url === '/api/upload-doc') {
      const body = await readJson(req);
      const { filename = `doc-${Date.now()}.txt`, data } = body || {};
      if (!data) return sendJsonResponse(res, 400, { error: 'Missing file data' });
      ensureKbDir(); const buffer = Buffer.from(data, 'base64'); const outPath = path.join(KB_DIR, `${Date.now()}-${filename}`); fs.writeFileSync(outPath, buffer);
      try { const text = buffer.toString('utf8'); KNOWLEDGE.push({ filename: path.basename(outPath), text }); } catch (e) {}
      return sendJsonResponse(res, 200, { success: true, path: `/data/kb/${path.basename(outPath)}` });
    }

    // List KB files
    if (req.method === 'GET' && req.url === '/api/kb') {
      ensureKbDir(); return sendJsonResponse(res, 200, { files: KNOWLEDGE.map(k => k.filename) });
    }

    // Get KB file content
    if (req.method === 'GET' && req.url.startsWith('/api/kb/')) {
      const parts = req.url.split('/'); const fname = decodeURIComponent(parts.slice(3).join('/')); const p = path.join(KB_DIR, fname);
      if (!fs.existsSync(p)) return sendJsonResponse(res, 404, { error: 'not_found' });
      const content = fs.readFileSync(p, 'utf8'); res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(content);
    }

    return false; 
  } catch (err) {
    console.error('handleApi fatal error', err);
    sendJsonResponse(res, 500, { error: 'server_error', details: String(err) });
    return true;
  }
}

const server = http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Debugging: allow posting an outbound activity to a conversation using app credentials
  if (req.method === 'POST' && req.url === '/debug/post') {
    try {
      const body = await readJson(req).catch(() => ({}));
      const convoUrl = body.url;
      const messageText = body.message || 'debug message';
      if (!convoUrl) return sendJsonResponse(res, 400, { error: 'missing url in body' });
      const { MicrosoftAppCredentials } = require('botframework-connector');
      const appId = (process.env.MICROSOFT_APP_ID || '').trim();
      const appPass = (process.env.MICROSOFT_APP_PASSWORD || '').trim();
      if (!appId || !appPass) return sendJsonResponse(res, 500, { error: 'missing MICROSOFT_APP_ID or MICROSOFT_APP_PASSWORD' });
      const creds = new MicrosoftAppCredentials(appId, appPass);
      const tokenObj = await creds.getToken().catch(e => { throw e; });
      const token = (tokenObj && (tokenObj.accessToken || tokenObj.token || tokenObj)) || null;
      console.log('/debug/post will call', convoUrl, 'with token?', !!token);
      const fetchRes = await fetch(convoUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ type: 'message', text: messageText }) });
      const text = await fetchRes.text().catch(() => '');
      const headersObj = {};
      try { fetchRes.headers.forEach((v,k) => { headersObj[k] = v; }); } catch(e) { /* ignore */ }
      return sendJsonResponse(res, fetchRes.status, { status: fetchRes.status, body: text, headers: headersObj, token_preview: token ? token.slice(0, 40) + '...' : null });
    } catch (err) {
      console.error('/debug/post failed', err);
      return sendJsonResponse(res, 500, { error: String(err) });
    }
  }


  // Teams messages endpoint
  if (req.url === '/api/messages' && req.method === 'POST') {
    if (!teamsAdapter || !teamsBotHandler) {
      console.error('Teams /api/messages: adapter not initialized', {
        teamsAdapter: !!teamsAdapter,
        teamsBotHandler: !!teamsBotHandler,
        MICROSOFT_APP_ID: process.env.MICROSOFT_APP_ID ? 'âœ“ set' : 'âœ— missing',
        MICROSOFT_APP_PASSWORD: process.env.MICROSOFT_APP_PASSWORD ? 'âœ“ set' : 'âœ— missing'
      });
      return sendJsonResponse(res, 503, {
        error: 'Teams bot not configured',
        details: 'Missing MICROSOFT_APP_ID or MICROSOFT_APP_PASSWORD in environment'
      });
    }
    try {
      const authHeader = req.headers.authorization || '';
      const jwtPayload = (authHeader.startsWith('Bearer ') && authHeader.split(' ')[1]) ? decodeJwtPayload(authHeader.split(' ')[1]) : null;
      console.log('Teams /api/messages request received', {
        authorization: !!req.headers.authorization,
        authSummary: jwtPayload ? { iss: jwtPayload.iss, aud: jwtPayload.aud, appid: jwtPayload.appid || jwtPayload.azp, exp: jwtPayload.exp } : 'no bearer token',
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent']
      });
      if (!res.status) {
        res.status = function (code) {
          this.statusCode = code;
          return this;
        };
      }
      if (!res.send) {
        res.send = function (body) {
          if (body !== undefined && body !== null) {
            if (typeof body === 'object' && !Buffer.isBuffer(body)) {
              if (!this.getHeader('Content-Type')) this.setHeader('Content-Type', 'application/json');
              body = JSON.stringify(body);
            }
            this.write(body);
          }
          return this;
        };
      }
      // Read the incoming activity first so we can trust its serviceUrl before processing
      try {
        const activity = await readJson(req).catch(() => null);
        if (activity && activity.serviceUrl) {
          try {
            const { MicrosoftAppCredentials } = require('botframework-connector');
            MicrosoftAppCredentials.trustServiceUrl(activity.serviceUrl);
          } catch (e) { console.warn('Failed to trust incoming serviceUrl:', e); }
        }
        if (!activity) {
          console.error('Teams /api/messages: invalid or empty activity body');
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid activity payload');
          return;
        }
        // Attach parsed body so adapter.parseRequest will use it instead of re-reading the stream
        try { req.body = activity; } catch (e) { /* ignore */ }
        return teamsAdapter.processActivity(req, res, async (context) => {
          await teamsBotHandler.run(context);
        });
      } catch (innerErr) {
        console.error('Error processing Teams activity:', innerErr);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Teams processing error');
        return;
      }
    } catch (e) {
      console.error('Teams adapter processing failed:', {
        message: e?.message || String(e),
        name: e?.name,
        statusCode: e?.statusCode || e?.status || null,
        stack: e?.stack
      });
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Teams processing error');
      return;
    }
  }

  if (req.url === '/api/messages' && req.method === 'GET') {
    console.log('Teams /api/messages: received GET request, returning method_not_allowed');
    return sendJsonResponse(res, 405, {
      error: 'method_not_allowed',
      message: 'This endpoint accepts POST requests from Microsoft Teams only.'
    });
  }

  const handled = await handleApi(req, res);
  if (handled !== false) return;

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname.endsWith('.html') || pathname.endsWith('.js') || pathname.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  // API Routes for guest sessions
  if (pathname === '/api/guest-sessions' && req.method === 'POST') {
    try {
      const guestData = await parseRequestBody(req);
      const newSession = {
        id: 'GS-' + Date.now(),
        ...guestData,
        email: guestData.email || null,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        approved: false
      };
      
      let guestRecord = null;
      try {
        const existingGuest = await db.getGuestByRoom(guestData.room);
        if (!existingGuest) {
          guestRecord = await db.createGuest(guestData.name, guestData.room, guestData.email || null, 'en');
          console.log(` Guest added to database: ${guestRecord.name} (Room ${guestRecord.roomNumber || guestRecord.room_number})`);
        } else {
          guestRecord = existingGuest;
          if (guestData.email && !existingGuest.email) {
            await db.updateGuest(existingGuest.id, { email: guestData.email });
            guestRecord.email = guestData.email;
            console.log(` Updated guest email for existing guest: ${existingGuest.name}`);
          }
          console.log(` Guest already exists in database: ${existingGuest.name} (Room ${existingGuest.room_number})`);
        }
      } catch (dbError) {
        console.error(' Error adding guest to database:', dbError);
      }
      
      guestSessions.push(newSession);
      saveGuestSessions();
      
      console.log(` New guest session created: ${newSession.name} (${newSession.room})`);
      sendJsonResponse(res, 201, { success: true, sessionId: newSession.id, session: newSession, guest: guestRecord });
      return;
    } catch (error) {
      console.error(' Error creating guest session:', error);
      sendJsonResponse(res, 400, { success: false, error: 'Invalid request data' });
      return;
    }
  }

  if (pathname === '/api/guest-sessions' && req.method === 'GET') {
    sendJsonResponse(res, 200, { success: true, sessions: guestSessions });
    return;
  }

  if (pathname.startsWith('/api/guest-sessions/') && pathname.endsWith('/approve') && req.method === 'POST') {
    const sessionId = pathname.split('/')[3];
    const session = guestSessions.find(s => s.id === sessionId);
    
    if (session) {
      const skipApproval = process.env.SKIP_APPROVAL === "true";
      if (skipApproval) {
        sendJsonResponse(res, 200, { success: true, session: { ...session, status: 'approved', approved: true } });
        return;
      }
      
      session.status = 'approved';
      session.approved = true;
      session.approvedAt = new Date().toISOString();
      saveGuestSessions();
      
      sendJsonResponse(res, 200, { success: true, session });
      return;
    } else {
      sendJsonResponse(res, 404, { success: false, error: 'Session not found' });
      return;
    }
  }

  if (pathname.startsWith('/api/guest-sessions/') && pathname.endsWith('/status') && req.method === 'GET') {
    const sessionId = pathname.split('/')[3];
    const session = guestSessions.find(s => s.id === sessionId);
    
    if (session) {
      const skipApproval = process.env.SKIP_APPROVAL === "true";
      if (skipApproval) {
        sendJsonResponse(res, 200, { success: true, status: 'approved', approved: true });
        return;
      }
      sendJsonResponse(res, 200, { success: true, status: session.status, approved: session.approved });
      return;
    } else {
      sendJsonResponse(res, 404, { success: false, error: 'Session not found' });
      return;
    }
  }

  if (pathname === '/api/guest-sessions/clear' && req.method === 'POST') {
    guestSessions = [];
    saveGuestSessions();
    sendJsonResponse(res, 200, { success: true, message: 'All guest sessions cleared' });
    return;
  }

  // Request logging API endpoints
  if (req.method === 'POST' && req.url === '/api/requests') {
    try {
      const body = await parseRequestBody(req);
      let guest = null;
      if (body.name && body.room) {
        guest = await db.getGuestByRoom(body.room);
        if (!guest) {
          guest = await db.createGuest(body.name, body.room, body.email || null, body.lang || 'en');
        } else if (body.email && !guest.email) {
          await db.updateGuest(guest.id, { email: body.email });
          guest.email = body.email;
        }
      }
      
      const items = readJsonSafe(REQUESTS_FILE);
      const id = Date.now().toString();
      const entry = {
        id,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
        sessionId: body.sessionId || null,
        name: body.name || 'Guest',
        room: body.room || 'TBD',
        email: body.email || null,
        text: (body.text || '').slice(0, 1000),
        category: body.category || 'General IT Support',
        priority: body.priority || 'P4',
        serviceLot: body.serviceLot || 'Lot 1 - Helpdesk / Service Desk',
        slaDeadline: body.slaDeadline || null,
        lang: body.lang || null
      };
      items.push(entry);
      writeJsonSafe(REQUESTS_FILE, items);
      
      if (guest) {
        const requestType = body.requestType || body.category || body.serviceLot || 'general';
        await db.createRequest(guest.id, requestType, body.text, entry.status, id);
      }
      
      return sendJsonResponse(res, 200, { success: true, id, entry });
    } catch (e) {
      console.error('POST /api/requests failed', e);
      return sendJsonResponse(res, 500, { success: false, error: 'server_error' });
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/api/requests')) {
    const items = readJsonSafe(REQUESTS_FILE);
    const url = new URL(req.url, 'http://x');
    const status = url.searchParams.get('status');
    const list = status ? items.filter(r => r.status === status) : items;
    return sendJsonResponse(res, 200, { success: true, requests: list });
  }

  if (req.method === 'PATCH' && req.url.startsWith('/api/requests/')) {
    const id = req.url.split('/').pop();
    const items = readJsonSafe(REQUESTS_FILE);
    const i = items.findIndex(r => r.id === id);
    if (i >= 0) {
      const body = await parseRequestBody(req);
      const updatedStatus = body.status || items[i].status;
      items[i] = { ...items[i], status: updatedStatus, updatedAt: new Date().toISOString() };
      writeJsonSafe(REQUESTS_FILE, items);
      try {
        await db.updateRequestStatus(id, updatedStatus);
      } catch (dbError) {
        console.error(` Failed to update request ${id} status in DB:`, dbError);
      }
      return sendJsonResponse(res, 200, { success: true, entry: items[i] });
    }
    return sendJsonResponse(res, 404, { success: false, error: 'not_found' });
  }

  // Database API endpoints
  if (req.method === 'GET' && req.url === '/api/db/guests') {
    try {
      const guests = await db.getAllGuests();
      return sendJsonResponse(res, 200, { success: true, guests });
    } catch (e) {
      return sendJsonResponse(res, 500, { success: false, error: 'server_error' });
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/api/db/guests/room/')) {
    try {
      const room = decodeURIComponent(req.url.split('/').pop());
      const guest = await db.getGuestByRoom(room);
      if (!guest) {
        return sendJsonResponse(res, 404, { success: false, error: 'not_found' });
      }
      const requests = await db.getRequests(guest.id);
      const conversations = await db.getConversationHistory(guest.id, 20);
      return sendJsonResponse(res, 200, { success: true, guest, requests, conversations });
    } catch (e) {
      return sendJsonResponse(res, 500, { success: false, error: 'server_error' });
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/api/db/guests/')) {
    try {
      const guestId = req.url.split('/').pop();
      const guest = await db.getGuestWithRequests(guestId);
      if (guest) {
        return sendJsonResponse(res, 200, { success: true, guest });
      }
      return sendJsonResponse(res, 404, { success: false, error: 'not_found' });
    } catch (e) {
      return sendJsonResponse(res, 500, { success: false, error: 'server_error' });
    }
  }

  if (req.method === 'POST' && req.url === '/api/db/conversations') {
    try {
      const body = await parseRequestBody(req);
      const { guestId, message, response } = body;
      if (!guestId || !message || !response) {
        return sendJsonResponse(res, 400, { success: false, error: 'missing_fields' });
      }
      const conversation = await db.logConversation(guestId, message, response);
      return sendJsonResponse(res, 200, { success: true, conversation });
    } catch (e) {
      return sendJsonResponse(res, 500, { success: false, error: 'server_error' });
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/api/db/conversations/')) {
    try {
      const guestId = req.url.split('/').pop();
      const conversations = await db.getConversationHistory(guestId);
      return sendJsonResponse(res, 200, { success: true, conversations });
    } catch (e) {
      return sendJsonResponse(res, 500, { success: false, error: 'server_error' });
    }
  }

  if (req.method === 'GET' && req.url === '/api/db/requests') {
    try {
      const requests = await db.getAllRequests();
      return sendJsonResponse(res, 200, { success: true, requests });
    } catch (e) {
      return sendJsonResponse(res, 500, { success: false, error: 'server_error' });
    }
  }

  if (req.method === 'GET' && req.url === '/api/db/conversations') {
    try {
      const conversations = await db.getAllConversations();
      return sendJsonResponse(res, 200, { success: true, conversations });
    } catch (e) {
      return sendJsonResponse(res, 500, { success: false, error: 'server_error' });
    }
  }

  if (req.method === 'GET' && req.url === '/api/db/stats') {
    try {
      const stats = await db.getDatabaseStats();
      return sendJsonResponse(res, 200, { success: true, stats });
    } catch (e) {
      return sendJsonResponse(res, 500, { success: false, error: 'server_error' });
    }
  }

  // Handle static files
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('This server is running backend API services only');
    return;
  }

  let filePath;
  if (!pathname.includes('.') && pathname.startsWith('/')) {
    filePath = path.join(PUBLIC_DIR, pathname + '.html');
  } else {
    filePath = path.join(PUBLIC_DIR, pathname);
  }
  
  const extname = path.extname(filePath);
  let contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, async () => {
  console.log(` Server running at http://localhost:${PORT}`);

  try {
    // Initialize database
    await db.init();
    console.log('âœ… Database initialized successfully');
  } catch (error) {
    console.error('âŒ Failed to initialize database:', error);
    process.exit(1);
  }
});
