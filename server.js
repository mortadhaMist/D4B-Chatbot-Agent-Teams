const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const dotenv = require('dotenv');
const crypto = require('crypto');
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

const diagnosticJobs = [];
const pendingDiagnostics = new Map();
const pendingMaterielLookup = new Map();
const registeredAgents = new Map();
const lastDiagnosticDeviceByConversation = new Map();

const pendingAdminAuth = new Map();
const adminUnlockedUntil = new Map();

const ADMIN_UNLOCK_TTL_MS = 10 * 60 * 1000;

const ADMIN_PROTECTED_TYPES = new Set([
  // Existing protected actions
  'flush_dns',
  'clean_print_queue',
  'temp_cleanup_light',
  'install_chrome',
  'install_teams',
  'find_switch_port',

  // Existing admin diagnostics
  'defender_security',
  'security_audit',
  'storage_management',
  'remote_access',
  'bitlocker_status',
  'repair_windows_image',

  // New medium-risk repair actions
  'renew_ip',
  'restart_network_adapter',
  'network_stack_reset',
  'restart_print_spooler',
  'windows_update_scan',
  'windows_update_repair',
  'sfc_scan',
  'dism_restorehealth',
  'gpupdate_force',
  'clear_teams_cache',
  'clear_browser_cache',

  // New high-risk repair actions
  'restart_computer'
]);

function normalizeDeviceId(deviceId) {
  return String(deviceId || '').trim().toUpperCase();
}

function touchAgentDevice(deviceId, extra = {}) {
  const id = normalizeDeviceId(deviceId);
  if (!id) return null;

  const existing = registeredAgents.get(id) || {};

  const device = {
    ...existing,
    ...extra,
    deviceId: id,
    firstSeenAt: existing.firstSeenAt || new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };

  registeredAgents.set(id, device);
  return device;
}

function getOnlineDevices(maxAgeMs = 90000) {
  const now = Date.now();

  return Array.from(registeredAgents.values()).filter(device => {
    const lastSeen = Date.parse(device.lastSeenAt || '');
    return Number.isFinite(lastSeen) && now - lastSeen <= maxAgeMs;
  });
}

function formatOnlineDevicesList() {
  const devices = getOnlineDevices();

  if (!devices.length) {
    return 'Aucun agent PC connecté pour le moment.';
  }

  return devices
    .map(device => {
      const username = device.username ? ` — utilisateur ${device.username}` : '';
      const ip = device.ip ? ` — IP ${device.ip}` : '';
      const state = device.state ? ` — état ${device.state}` : '';

      return `- ${device.deviceId}${username}${ip}${state} — vu à ${device.lastSeenAt}`;
    })
    .join('\n');
}

function extractDeviceIdFromText(text) {
  const raw = String(text || '').trim();

  const patterns = [
    /\bsur\s+([a-zA-Z0-9._-]{3,})/i,
    /\bpc\s+([a-zA-Z0-9._-]{3,})/i,
    /\bposte\s+([a-zA-Z0-9._-]{3,})/i,
    /\bdevice\s+([a-zA-Z0-9._-]{3,})/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match && match[1]) {
      return normalizeDeviceId(match[1]);
    }
  }

  return null;
}
function findDeviceByIdOrIp(value) {
  const target = String(value || '').trim().toUpperCase();

  if (!target) return null;

  for (const device of registeredAgents.values()) {
    const deviceId = String(device.deviceId || '').toUpperCase();
    const hostname = String(device.hostname || '').toUpperCase();
    const ip = String(device.ip || '').toUpperCase();
    const ips = Array.isArray(device.ips)
      ? device.ips.map(x => String(x).toUpperCase())
      : [];

    if (
      deviceId === target ||
      hostname === target ||
      ip === target ||
      ips.includes(target)
    ) {
      return device;
    }
  }

  return null;
}
function getDiagnosticRequest(text) {
  const normalized = normalizeTextForIntent(text);
if (
  normalized.includes('speedtest') ||
  normalized.includes('test debit') ||
  normalized.includes('test internet') ||
  normalized.includes('vitesse internet')
) {
  return {
    type: 'speedtest_cli',
    label: 'test de débit Internet'
  };
}

if (
  normalized.includes('flush dns') ||
  normalized.includes('vider dns') ||
  normalized.includes('cache dns') ||
  normalized.includes('probleme dns cache')
) {
  return {
    type: 'flush_dns',
    label: 'nettoyage du cache DNS'
  };
}

if (
  normalized.includes('nettoyer file impression') ||
  normalized.includes('vider file impression') ||
  normalized.includes('print queue') ||
  normalized.includes('file imprimante bloquee')
) {
  return {
    type: 'clean_print_queue',
    label: 'nettoyage de la file impression'
  };
}

if (
  normalized.includes('port switch') ||
  normalized.includes('lldp') ||
  normalized.includes('switch port') ||
  normalized.includes('trouver port reseau')
) {
  return {
    type: 'find_switch_port',
    label: 'détection du port switch'
  };
}

if (
  normalized.includes('nettoyage temporaire') ||
  normalized.includes('nettoyer fichiers temporaires') ||
  normalized.includes('cleanup temp') ||
  normalized.includes('liberer espace')
) {
  return {
    type: 'temp_cleanup_light',
    label: 'nettoyage temporaire léger'
  };
}

if (
  normalized.includes('installer chrome') ||
  normalized.includes('installation chrome') ||
  normalized.includes('google chrome')
) {
  return {
    type: 'install_chrome',
    label: 'installation Google Chrome'
  };
}

if (
  normalized.includes('installer teams') ||
  normalized.includes('installation teams') ||
  normalized.includes('microsoft teams')
) {
  return {
    type: 'install_teams',
    label: 'installation Microsoft Teams'
  };
}
  if (
    normalized.includes('diagnostic reseau avance') ||
    normalized.includes('diagnostic avance reseau') ||
    normalized.includes('test reseau avance') ||
    normalized.includes('network advanced') ||
    normalized.includes('diagnostic network advanced')
  ) {
    return {
      type: 'network_advanced',
      label: 'diagnostic réseau avancé'
    };
  }

  if (
    normalized.includes('diagnostic reseau') ||
    normalized.includes('test reseau') ||
    normalized.includes('tester reseau') ||
    normalized.includes('probleme internet') ||
    normalized.includes('wifi') ||
    normalized.includes('connexion')
  ) {
    return {
      type: 'network_basic',
      label: 'diagnostic réseau'
    };
  }

  if (
    normalized.includes('diagnostic imprimante') ||
    normalized.includes('probleme imprimante') ||
    normalized.includes('impression')
  ) {
    return {
      type: 'printer_basic',
      label: 'diagnostic imprimante'
    };
  }

  if (
    normalized.includes('diagnostic sante') ||
    normalized.includes('sante systeme') ||
    normalized.includes('system health') ||
    normalized.includes('diagnostic performance') ||
    normalized.includes('pc lent') ||
    normalized.includes('ordinateur lent')
  ) {
    return {
      type: 'system_health',
      label: 'diagnostic santé système'
    };
  }

  if (
    normalized.includes('diagnostic stockage') ||
    normalized.includes('stockage') ||
    normalized.includes('disque') ||
    normalized.includes('espace disque') ||
    normalized.includes('storage')
  ) {
    return {
      type: 'storage_management',
      label: 'diagnostic stockage'
    };
  }

  if (
    normalized.includes('audit securite') ||
    normalized.includes('diagnostic securite') ||
    normalized.includes('security audit') ||
    normalized.includes('audit pc')
  ) {
    return {
      type: 'security_audit',
      label: 'audit sécurité'
    };
  }

  if (
    normalized.includes('diagnostic pc') ||
    normalized.includes('diagnostic systeme') ||
    normalized.includes('system info') ||
    normalized.includes('info pc')
  ) {
    return {
      type: 'system_basic',
      label: 'diagnostic système'
    };
  }
  if (
    normalized.includes('diagnostic wifi') ||
    normalized.includes('diagnostic wi-fi') ||
    normalized.includes('probleme wifi') ||
    normalized.includes('probleme wi-fi') ||
    normalized.includes('wifi diagnostics')
  ) {
    return {
      type: 'wifi_diagnostics',
      label: 'diagnostic Wi-Fi'
    };
  }

  if (
    normalized.includes('diagnostic dns') ||
    normalized.includes('probleme dns') ||
    normalized.includes('resolution dns') ||
    normalized.includes('dns diagnostics')
  ) {
    return {
      type: 'dns_diagnostics',
      label: 'diagnostic DNS'
    };
  }

  if (
    normalized.includes('diagnostic domaine') ||
    normalized.includes('probleme domaine') ||
    normalized.includes('active directory') ||
    normalized.includes('gpresult') ||
    normalized.includes('gpo') ||
    normalized.includes('domain diagnostics')
  ) {
    return {
      type: 'domain_diagnostics',
      label: 'diagnostic domaine / Active Directory'
    };
  }

  if (
    normalized.includes('windows update') ||
    normalized.includes('mise a jour windows') ||
    normalized.includes('diagnostic mise a jour') ||
    normalized.includes('update windows')
  ) {
    return {
      type: 'windows_update',
      label: 'diagnostic Windows Update'
    };
  }

  if (
    normalized.includes('performance') ||
    normalized.includes('pc lent') ||
    normalized.includes('ordinateur lent') ||
    normalized.includes('cpu') ||
    normalized.includes('memoire') ||
    normalized.includes('ram')
  ) {
    return {
      type: 'performance_diagnostics',
      label: 'diagnostic performance'
    };
  }

  if (
    normalized.includes('demarrage') ||
    normalized.includes('startup') ||
    normalized.includes('programmes au demarrage') ||
    normalized.includes('diagnostic startup')
  ) {
    return {
      type: 'startup_diagnostics',
      label: 'diagnostic démarrage'
    };
  }

  if (
    normalized.includes('diagnostic services') ||
    normalized.includes('services windows') ||
    normalized.includes('service arrete') ||
    normalized.includes('services automatiques')
  ) {
    return {
      type: 'service_diagnostics',
      label: 'diagnostic services Windows'
    };
  }

  if (
    normalized.includes('session utilisateur') ||
    normalized.includes('diagnostic utilisateur') ||
    normalized.includes('compte utilisateur') ||
    normalized.includes('user session')
  ) {
    return {
      type: 'user_session',
      label: 'diagnostic session utilisateur'
    };
  }

  if (
    normalized.includes('defender') ||
    normalized.includes('antivirus') ||
    normalized.includes('protection windows') ||
    normalized.includes('windows security')
  ) {
    return {
      type: 'defender_security',
      label: 'diagnostic Microsoft Defender'
    };
  }

  if (
    normalized.includes('remote access') ||
    normalized.includes('acces distant') ||
    normalized.includes('bureau a distance') ||
    normalized.includes('rdp') ||
    normalized.includes('winrm')
  ) {
    return {
      type: 'remote_access',
      label: 'diagnostic accès distant'
    };
  }

  if (
    normalized.includes('crash application') ||
    normalized.includes('application plante') ||
    normalized.includes('application crash') ||
    normalized.includes('logs application') ||
    normalized.includes('journal application')
  ) {
    return {
      type: 'app_crash_logs',
      label: 'diagnostic erreurs application'
    };
  }

if (
  normalized.includes('diagnostic batterie') ||
  normalized.includes('sante batterie') ||
  normalized.includes('battery health')
) {
  return {
    type: 'battery_health',
    label: 'diagnostic batterie'
  };
}

if (
  normalized.includes('diagnostic bitlocker') ||
  normalized.includes('statut bitlocker') ||
  normalized.includes('bitlocker')
) {
  return {
    type: 'bitlocker_status',
    label: 'diagnostic BitLocker'
  };
}

if (
  normalized.includes('diagnostic disque') ||
  normalized.includes('sante disque') ||
  normalized.includes('disk health') ||
  normalized.includes('smart disk')
) {
  return {
    type: 'disk_health',
    label: 'diagnostic santé disque'
  };
}

if (
  normalized.includes('applications installees') ||
  normalized.includes('liste applications') ||
  normalized.includes('installed apps')
) {
  return {
    type: 'installed_apps',
    label: 'inventaire des applications installées'
  };
}

if (
  normalized.includes('diagnostic proxy') ||
  normalized.includes('proxy diagnostics')
) {
  return {
    type: 'proxy_diagnostics',
    label: 'diagnostic proxy'
  };
}

if (
  normalized.includes('diagnostic vpn') ||
  normalized.includes('vpn diagnostics')
) {
  return {
    type: 'vpn_diagnostics',
    label: 'diagnostic VPN'
  };
}

if (
  normalized.includes('diagnostic office') ||
  normalized.includes('diagnostic teams') ||
  normalized.includes('diagnostic outlook') ||
  normalized.includes('office diagnostics')
) {
  return {
    type: 'office_diagnostics',
    label: 'diagnostic Office / Teams / Outlook'
  };
}

if (
  normalized.includes('resume journaux evenements') ||
  normalized.includes('journaux evenements') ||
  normalized.includes('eventlog summary')
) {
  return {
    type: 'eventlog_summary',
    label: 'résumé des journaux d’événements'
  };
}
if (
  normalized.includes('renouveler ip') ||
  normalized.includes('renew ip') ||
  normalized.includes('ipconfig renew')
) {
  return {
    type: 'renew_ip',
    label: 'renouvellement de l’adresse IP'
  };
}

if (
  normalized.includes('redemarrer carte reseau') ||
  normalized.includes('restart network adapter') ||
  normalized.includes('reset carte reseau')
) {
  return {
    type: 'restart_network_adapter',
    label: 'redémarrage de la carte réseau'
  };
}

if (
  normalized.includes('reset reseau complet') ||
  normalized.includes('reset network') ||
  normalized.includes('reinitialiser reseau')
) {
  return {
    type: 'network_stack_reset',
    label: 'réinitialisation complète du réseau'
  };
}

if (
  normalized.includes('redemarrer spooler') ||
  normalized.includes('restart spooler') ||
  normalized.includes('redemarrer service impression')
) {
  return {
    type: 'restart_print_spooler',
    label: 'redémarrage du spouleur d’impression'
  };
}

if (
  normalized.includes('scan windows update') ||
  normalized.includes('lancer scan windows update') ||
  normalized.includes('chercher mises a jour')
) {
  return {
    type: 'windows_update_scan',
    label: 'scan Windows Update'
  };
}

if (
  normalized.includes('reparer windows update') ||
  normalized.includes('reset windows update') ||
  normalized.includes('windows update repair')
) {
  return {
    type: 'windows_update_repair',
    label: 'réparation Windows Update'
  };
}

if (
  normalized.includes('sfc scan') ||
  normalized.includes('lancer sfc') ||
  normalized.includes('sfc scannow')
) {
  return {
    type: 'sfc_scan',
    label: 'scan SFC Windows'
  };
}

if (
  normalized.includes('dism scan') ||
  normalized.includes('lancer dism') ||
  normalized.includes('dism restorehealth')
) {
  return {
    type: 'dism_restorehealth',
    label: 'réparation DISM Windows'
  };
}

if (
  normalized.includes('forcer gpupdate') ||
  normalized.includes('gpupdate') ||
  normalized.includes('maj strategie groupe')
) {
  return {
    type: 'gpupdate_force',
    label: 'mise à jour des stratégies de groupe'
  };
}

if (
  normalized.includes('redemarrer teams') ||
  normalized.includes('restart teams')
) {
  return {
    type: 'restart_teams',
    label: 'redémarrage Microsoft Teams'
  };
}

if (
  normalized.includes('vider cache teams') ||
  normalized.includes('nettoyer cache teams') ||
  normalized.includes('clear teams cache')
) {
  return {
    type: 'clear_teams_cache',
    label: 'nettoyage du cache Microsoft Teams'
  };
}

if (
  normalized.includes('redemarrer outlook') ||
  normalized.includes('restart outlook')
) {
  return {
    type: 'restart_outlook',
    label: 'redémarrage Microsoft Outlook'
  };
}

if (
  normalized.includes('reparer navigateur') ||
  normalized.includes('nettoyer cache navigateur') ||
  normalized.includes('clear browser cache')
) {
  return {
    type: 'clear_browser_cache',
    label: 'nettoyage cache navigateur'
  };
}

if (
  normalized.includes('redemarrer pc') ||
  normalized.includes('restart pc') ||
  normalized.includes('reboot pc')
) {
  return {
    type: 'restart_computer',
    label: 'redémarrage du poste'
  };
}
  return null;
}

function isYesConfirmation(text) {
  const normalized = normalizeTextForIntent(text);
  return /^(oui|yes|ok|confirme|je confirme|lance|lancer)$/i.test(normalized);
}

function isHighRiskDiagnostic(type) {
  return new Set([
    'restart_computer',
    'network_stack_reset',
    'windows_update_repair',
    'dism_restorehealth'
  ]).has(String(type || ''));
}

function isStrongAdminConfirmation(text) {
  return normalizeTextForIntent(text) === 'confirmer action admin';
}

function isAdminProtectedDiagnostic(type) {
  return ADMIN_PROTECTED_TYPES.has(String(type || ''));
}

function isAdminUnlocked(teamsConversationKey) {
  const expiresAt = adminUnlockedUntil.get(teamsConversationKey);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function unlockAdminForConversation(teamsConversationKey) {
  adminUnlockedUntil.set(teamsConversationKey, Date.now() + ADMIN_UNLOCK_TTL_MS);
}

function secureCompareStrings(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function isValidSupportAdminPassword(text) {
  const expected = process.env.SUPPORT_ADMIN_PASSWORD;

  if (!expected) {
    console.warn('SUPPORT_ADMIN_PASSWORD is missing on server.');
    return false;
  }

  return secureCompareStrings(String(text || '').trim(), expected);
}

function createDiagnosticJob(deviceId, type, requestedBy, conversationReference = null) {
  const job = {
    id: `JOB-${Date.now()}`,
    deviceId,
    type,
    requestedBy,
    conversationReference,
    status: 'pending',
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    resultSentToTeams: false
  };

  diagnosticJobs.push(job);
  return job;
}

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
    `Déclencheur utilisateur: ${triggerText || 'ticket'}`
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

function isMaterielHistoryRequest(text) {
  const normalized = normalizeTextForIntent(text);

  return (
    normalized.includes('historique materiel') ||
    normalized.includes('historique matériel') ||
    normalized.includes('historique imei') ||
    normalized.includes('materiel imei') ||
    normalized.includes('matériel imei') ||
    normalized.includes('getmateriel') ||
    normalized.includes('get materiel') ||
    normalized.includes('information materiel') ||
    normalized.includes('info materiel') ||
    normalized.includes('garantie imei') ||
    normalized.includes('serie imei') ||
    normalized.includes('numero de serie') ||
    normalized.includes('numéro de série')
  );
}

function extractImeiFromText(text) {
  const raw = String(text || '').trim();

  // IMEI is usually 15 digits, but some serials can be alphanumeric.
  const imeiMatch = raw.match(/\b\d{14,17}\b/);
  if (imeiMatch) return imeiMatch[0];

  const serialMatch = raw.match(/\b[A-Z0-9][A-Z0-9._-]{5,40}\b/i);
  if (serialMatch) return serialMatch[0];

  return null;
}

function formatMaterielPrompt() {
  return `Tapez le numéro de série [IMEI] pour avoir l’historique.`;
}

async function getMaterielByImei(imei) {
  const baseUrl = process.env.D4B_MATERIEL_API_URL || 'https://d4brestapi.com/V1/ticket/getMateriel';

  const url = new URL(baseUrl);

  // If your API expects a different parameter name, change "imei" here.
 url.searchParams.set('IMEI', imei);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: process.env.D4B_MATERIEL_AUTHORIZATION || '',
      AuthKey: process.env.D4B_MATERIEL_AUTHKEY || '',
      Accept: 'application/json'
    }
  });

  const contentType = response.headers.get('content-type') || '';
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`API matériel ${response.status}: ${bodyText.slice(0, 500)}`);
  }

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(bodyText);
    } catch {
      return { raw: bodyText };
    }
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return { raw: bodyText };
  }
}

function cleanMaterielValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'Non disponible';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value).trim();
}

function formatMaterielHistoryForTeams(imei, data) {
  const payload = data?.data || data?.materiel || data?.result || data;

  if (!payload) {
    return [
      `📦 Historique matériel`,
      ``,
      `IMEI / Numéro de série : ${imei}`,
      ``,
      `Aucune information matériel trouvée pour ce numéro.`
    ].join('\n');
  }

  if (Array.isArray(payload)) {
    if (!payload.length) {
      return [
        `📦 Historique matériel`,
        ``,
        `IMEI / Numéro de série : ${imei}`,
        ``,
        `Aucun historique trouvé.`
      ].join('\n');
    }

    return [
      `📦 Historique matériel`,
      ``,
      `IMEI / Numéro de série : ${imei}`,
      `Éléments trouvés : ${payload.length}`,
      ``,
      payload.slice(0, 5).map((item, index) => {
        return [
          `${index + 1}. Élément matériel`,
          ...Object.entries(item).slice(0, 12).map(([key, value]) => {
            return `- ${key} : ${cleanMaterielValue(value)}`;
          })
        ].join('\n');
      }).join('\n\n')
    ].join('\n').slice(0, 7000);
  }

  return [
    `📦 Historique matériel`,
    ``,
    `IMEI / Numéro de série : ${imei}`,
    ``,
    `📋 Informations`,
    ...Object.entries(payload).slice(0, 20).map(([key, value]) => {
      return `- ${key} : ${cleanMaterielValue(value)}`;
    })
  ].join('\n').slice(0, 7000);
}

function appendTechnicienPromptOnce(replyText) {
  const ticketPrompt = '🎫 Pour créer un ticket, écrivez « ticket ».';
  const materielPrompt = '📦 Pour consulter l’historique matériel, écrivez « historique matériel », puis tapez le numéro de série [IMEI].';

  const cleaned = String(replyText || '')
    .replace(/🎫\s*Pour créer un ticket, écrivez « ticket »\.?/gi, '')
    .replace(/📦\s*Pour consulter l’historique matériel, écrivez « historique matériel », puis tapez le numéro de série \[IMEI\]\.?/gi, '')
    .trim();

  return `${cleaned}\n\n\u200B\n\n${ticketPrompt}\n${materielPrompt}`;
}
let teamsAdapter = null;
let teamsBotHandler = null;
try {
const { BotFrameworkAdapter, TeamsActivityHandler, TeamsInfo, TurnContext } = require('botbuilder');  
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
await context.sendActivity(`Erreur interne du bot : ${error?.message || String(error)}`);      } catch (sendError) {
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
const pendingMateriel = pendingMaterielLookup.get(teamsConversationKey);

if (pendingMateriel) {
  const imei = extractImeiFromText(text);

  if (!imei) {
    await context.sendActivity(
      `${formatMaterielPrompt()}\n\nExemple : 356789123456789`
    );
    await next();
    return;
  }

  try {
    await context.sendActivity(`Recherche de l’historique matériel pour : ${imei}...`);

    const materielData = await getMaterielByImei(imei);
    const replyText = formatMaterielHistoryForTeams(imei, materielData);

    pendingMaterielLookup.delete(teamsConversationKey);
    saveTeamsConversationTurn(teamsConversationKey, text, replyText);

    await context.sendActivity(replyText);
  } catch (error) {
    console.error('Materiel API lookup failed:', error);

    pendingMaterielLookup.delete(teamsConversationKey);

    await context.sendActivity(
      `Impossible de récupérer l’historique matériel pour ${imei}.\n\n` +
      `Erreur technique : ${error.message || error}`
    );
  }

  await next();
  return;
}

if (isMaterielHistoryRequest(text)) {
  const imei = extractImeiFromText(text);

  if (imei) {
    try {
      await context.sendActivity(`Recherche de l’historique matériel pour : ${imei}...`);

      const materielData = await getMaterielByImei(imei);
      const replyText = formatMaterielHistoryForTeams(imei, materielData);

      saveTeamsConversationTurn(teamsConversationKey, text, replyText);
      await context.sendActivity(replyText);
    } catch (error) {
      console.error('Materiel API lookup failed:', error);

      await context.sendActivity(
        `Impossible de récupérer l’historique matériel pour ${imei}.\n\n` +
        `Erreur technique : ${error.message || error}`
      );
    }

    await next();
    return;
  }

  pendingMaterielLookup.set(teamsConversationKey, {
    requestedAt: new Date().toISOString(),
    requestedByName: userName,
    requestedByEmail: userEmail
  });

  const replyText = formatMaterielPrompt();

  saveTeamsConversationTurn(teamsConversationKey, text, replyText);
  await context.sendActivity(replyText);

  await next();
  return;
}
// Message d'accueil seulement au début si l'utilisateur dit juste bonjour
// Message d'accueil quand l'utilisateur dit juste bonjour
if (isGreetingOnly(text)) {
  const welcomeParts = [
    `Bonjour ! Je suis là pour vous aider avec tout problème ou question lié au support IT pour les équipes D4B (réseau, Wi-Fi, matériel, imprimantes, authentification, etc.)`,

    `Voici ce que je peux faire pour vous :`,

    `Vous dépanner — décrivez-moi ce qui ne va pas, et je vais essayer de résoudre le problème avec vous directement.`,

    `Pour commencer, dites-moi ce qui ne va pas 👇`,

    `🎫 Pour créer un ticket, écrivez « ticket ».`

    `🎫 Pour créer un ticket, écrivez « ticket ».`,

    
`📦 Pour consulter l’historique matériel, écrivez « historique matériel », puis tapez le numéro de série [IMEI].`
  ];

  const welcomeText = welcomeParts.join('\n\n');

  saveTeamsConversationTurn(teamsConversationKey, text, welcomeText);

  for (const part of welcomeParts) {
    await context.sendActivity(part);
  }

  await next();
  return;
}

const pendingAdminRequest = pendingAdminAuth.get(teamsConversationKey);

if (pendingAdminRequest) {
  if (pendingAdminRequest.expiresAt < Date.now()) {
    pendingAdminAuth.delete(teamsConversationKey);

    await context.sendActivity(
      `La demande d’autorisation admin a expiré.\n\n` +
      `Relancez la commande si nécessaire.`
    );

    await next();
    return;
  }

  if (!isValidSupportAdminPassword(text)) {
    pendingAdminAuth.delete(teamsConversationKey);

    await context.sendActivity(
      `Mot de passe admin incorrect.\n\n` +
      `La commande admin n’a pas été lancée.`
    );

    await next();
    return;
  }

  pendingAdminAuth.delete(teamsConversationKey);
  unlockAdminForConversation(teamsConversationKey);

  pendingDiagnostics.set(teamsConversationKey, {
    ...pendingAdminRequest.diagnosticRequest,
    deviceId: pendingAdminRequest.targetDeviceId
  });

  await context.sendActivity(
    `Mot de passe admin validé.\n\n` +
    `Je peux lancer un ${pendingAdminRequest.diagnosticRequest.label} sur le poste ${pendingAdminRequest.targetDeviceId}.\n\n` +
    `Confirmez-vous ? Répondez "oui".`
  );

  await next();
  return;
}

const pendingDiagnostic = pendingDiagnostics.get(teamsConversationKey);

if (
  pendingDiagnostic &&
  (
    isYesConfirmation(text) ||
    (isHighRiskDiagnostic(pendingDiagnostic.type) && isStrongAdminConfirmation(text))
  )
) {
  const deviceId = pendingDiagnostic.deviceId;

const conversationReference = TurnContext.getConversationReference(context.activity);
if (isHighRiskDiagnostic(pendingDiagnostic.type) && !isStrongAdminConfirmation(text)) {
  await context.sendActivity(
    `Cette action est sensible.\n\n` +
    `Action : ${pendingDiagnostic.label}\n` +
    `Poste : ${pendingDiagnostic.deviceId}\n\n` +
    `Pour confirmer, écrivez exactement :\n\n` +
    `CONFIRMER ACTION ADMIN`
  );

  await next();
  return;
}
const job = createDiagnosticJob(
  deviceId,
  pendingDiagnostic.type,
  userEmail || userName,
  conversationReference
);

  pendingDiagnostics.delete(teamsConversationKey);
  lastDiagnosticDeviceByConversation.set(teamsConversationKey, deviceId);

const replyText =
  `Diagnostic lancé sur le poste : ${deviceId}\n\n` +
  `Type : ${pendingDiagnostic.label}\n` +
  `ID du job : ${job.id}\n\n` +
  `Je vous enverrai automatiquement le résultat dès que l’agent aura terminé.`;

  saveTeamsConversationTurn(teamsConversationKey, text, replyText);
  await context.sendActivity(replyText);
  await next();
  return;
}

if (normalizeTextForIntent(text).includes('resultat diagnostic')) {
  const requestedDeviceId = extractDeviceIdFromText(text);
  const deviceId =
    requestedDeviceId ||
    lastDiagnosticDeviceByConversation.get(teamsConversationKey);

  if (!deviceId) {
    await context.sendActivity(
      `Je ne sais pas encore pour quel poste lire le résultat.\n\n` +
      `Écrivez par exemple : résultat diagnostic sur TN-D4B-PC2GWP08\n\n` +
      `Postes connectés :\n${formatOnlineDevicesList()}`
    );

    await next();
    return;
  }

  const latestUrl = `http://127.0.0.1:${PORT}/api/diagnostics/latest?deviceId=${encodeURIComponent(deviceId)}`;

  try {
    const resultRes = await fetch(latestUrl);
    const resultData = await resultRes.json();

    if (!resultData.job) {
      await context.sendActivity('Aucun diagnostic trouvé pour le moment.');
    } else if (resultData.job.status !== 'completed') {
      await context.sendActivity(`Le diagnostic est encore en cours. Statut : ${resultData.job.status}`);
    } else {
const formattedResult = formatDiagnosticResultForTeams(resultData.job.result);
await context.sendActivity(formattedResult);
    }
  } catch (err) {
    await context.sendActivity(`Impossible de lire le résultat du diagnostic : ${err.message || err}`);
  }

  await next();
  return;
}

const diagnosticRequest = getDiagnosticRequest(text);

if (diagnosticRequest) {
  const requestedDeviceId = extractDeviceIdFromText(text);
  const onlineDevices = getOnlineDevices();

const requestedDevice = requestedDeviceId
  ? findDeviceByIdOrIp(requestedDeviceId)
  : null;

const normalizedTeamsName = normalizeIdentity(userName);
const normalizedTeamsEmailPrefix = normalizeIdentity(String(userEmail || '').split('@')[0]);

const userDeviceByUsername = onlineDevices.find(device => {
  const deviceUsername = normalizeIdentity(device.username);
  const deviceWindowsUsername = normalizeIdentity(device.windowsUsername);

  return (
    deviceUsername === normalizedTeamsName ||
    deviceWindowsUsername === normalizedTeamsName ||
    normalizedTeamsName.includes(deviceUsername) ||
    deviceUsername.includes(normalizedTeamsName) ||
    deviceUsername === normalizedTeamsEmailPrefix ||
    deviceWindowsUsername === normalizedTeamsEmailPrefix
  );
});

const userDevice = !requestedDevice
  ? (userDeviceByUsername || findDeviceForTeamsUser(userEmail, userName))
  : null;

const targetDeviceId =
  requestedDevice?.deviceId ||
  userDevice?.deviceId ||
  (onlineDevices.length === 1 ? onlineDevices[0].deviceId : null);

  if (!targetDeviceId) {
    await context.sendActivity(
`Je ne sais pas encore sur quel PC lancer ce diagnostic.\n\n` +
`Utilisateur Teams détecté : ${userName || 'Non détecté'}\n` +
`Email Teams détecté : ${userEmail || 'Non détecté'}\n\n` +
`Postes connectés :\n${formatOnlineDevicesList()}\n\n` +
`Vous pouvez écrire par exemple : diagnostic wifi sur TN-D4B-PC2GWP08`
    );

    await next();
    return;
  }

if (
  isAdminProtectedDiagnostic(diagnosticRequest.type) &&
  !isAdminUnlocked(teamsConversationKey)
) {
  pendingAdminAuth.set(teamsConversationKey, {
    diagnosticRequest,
    targetDeviceId,
    expiresAt: Date.now() + 2 * 60 * 1000
  });

  await context.sendActivity(
    `Cette commande nécessite une autorisation admin.\n\n` +
    `Commande : ${diagnosticRequest.label}\n` +
    `Poste : ${targetDeviceId}\n\n` +
    `Veuillez saisir le mot de passe admin support pour continuer.\n\n` +
    `Si le mot de passe est incorrect, la commande ne sera pas lancée.`
  );

  await next();
  return;
}

  pendingDiagnostics.set(teamsConversationKey, {
    ...diagnosticRequest,
    deviceId: targetDeviceId
  });

  await context.sendActivity(
    `Je vais lancer un ${diagnosticRequest.label} sur le poste ${targetDeviceId}.\n\n` +
    `Confirmez-vous ? Répondez "oui".`
  );

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

function extractLine(text, patterns) {
  const lines = String(text || '').split(/\r?\n/);

  for (const pattern of patterns) {
    const found = lines.find(line =>
      normalizeTextForIntent(line).includes(normalizeTextForIntent(pattern))
    );

    if (found) {
      return found.replace(/\s+/g, ' ').trim();
    }
  }

  return null;
}

function commandResult(result, commandStartsWith) {
  return (result?.results || []).find(r =>
    String(r.command || '').toLowerCase().startsWith(commandStartsWith.toLowerCase())
  );
}

function isPingOk(stdout) {
  const text = normalizeTextForIntent(stdout);

  return (
    text.includes('perdus = 0') ||
    text.includes('lost = 0') ||
    text.includes('0% loss') ||
    text.includes('0% de perte')
  );
}

function isNslookupOk(stdout) {
  const text = normalizeTextForIntent(stdout);

  return (
    text.includes('name:') ||
    text.includes('nom:') ||
    text.includes('addresses:') ||
    text.includes('adresses:')
  );
}

function cleanIpconfigValue(line) {
  if (!line) return 'Non détecté';

  const parts = String(line).split(':');
  return parts.length > 1 ? parts.slice(1).join(':').trim() : line.trim();
}

function findCommand(result, search) {
  return (result?.results || []).find(r =>
    String(r.command || '').toLowerCase().includes(String(search || '').toLowerCase())
  );
}

function cleanDiagnosticText(text, max = 1200) {
  const cleaned = String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned) return 'Non disponible';
  return cleaned.length > max ? cleaned.slice(0, max) + '\n...' : cleaned;
}

function firstMatchingLine(text, keywords) {
  const normalizedKeywords = keywords.map(k => normalizeTextForIntent(k));
  const lines = String(text || '').split(/\r?\n/);

  return lines.find(line => {
    const normalizedLine = normalizeTextForIntent(line);
    return normalizedKeywords.some(k => normalizedLine.includes(k));
  }) || null;
}

function commandOk(item) {
  if (!item) return false;
  if (item.error) return false;
  if (String(item.stderr || '').trim()) return false;
  return true;
}

function commandStatusIcon(item) {
  if (!item) return '⚪ Non disponible';
  if (item.error) return '🔴 Erreur';
  if (String(item.stderr || '').trim()) return '🟠 Avertissement';
  return '🟢 OK';
}

function extractAfterColon(line) {
  if (!line) return 'Non détecté';
  const parts = String(line).split(':');
  return parts.length > 1 ? parts.slice(1).join(':').trim() : String(line).trim();
}
function extractNetshValue(text, label) {
  const normalizedLabel = normalizeTextForIntent(label);
  const lines = String(text || '').split(/\r?\n/);

  const line = lines.find(l =>
    normalizeTextForIntent(l).startsWith(normalizedLabel)
  );

  if (!line) return 'Non détecté';

  const parts = line.split(':');
  return parts.length > 1 ? parts.slice(1).join(':').trim() : line.trim();
}

function extractWifiProfiles(text) {
  const lines = String(text || '').split(/\r?\n/);

  return lines
    .filter(line => normalizeTextForIntent(line).includes('profil tous les utilisateurs'))
    .map(line => {
      const parts = line.split(':');
      return parts.length > 1 ? parts.slice(1).join(':').trim() : line.trim();
    })
    .filter(Boolean);
}

function extractDnsLines(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);

  return lines
    .filter(line =>
      normalizeTextForIntent(line).includes('ethernet') ||
      normalizeTextForIntent(line).includes('wi-fi') ||
      normalizeTextForIntent(line).includes('wifi')
    )
    .slice(0, 8);
}
function removeRawCommandNoise(text) {
  const value = String(text || '').trim();

  if (!value) return '';

  if (/^Command failed:/i.test(value)) {
    return '';
  }

  if (value.includes('powershell -NoProfile')) {
    return '';
  }

  return cleanDiagnosticText(value, 700);
}
function formatRepairActionResult(result, title, successMessage, warningMessage = null) {
  const outputs = result.results || [];

  const failed = outputs.filter(item =>
    item.error ||
    String(item.stderr || '').trim()
  );

  const skipped = outputs.filter(item => item.skipped);

  const lines = outputs.map((item, index) => {
    const outputText = item.stdout
      ? cleanDiagnosticText(item.stdout, 700)
      : null;

const stderrText = item.stderr
  ? removeRawCommandNoise(item.stderr)
  : null;

const errorText = item.error
  ? removeRawCommandNoise(item.error)
  : null;

    return [
      `${index + 1}. ${item.label || 'Action'}`,
      `   Statut : ${commandStatusIcon(item)}`,
      item.skipped ? `   Ignoré : droits administrateur requis` : null,
      outputText ? `   Sortie : ${outputText}` : null,
      stderrText ? `   Erreur : ${stderrText}` : null,
      errorText ? `   Erreur : ${errorText}` : null
    ].filter(Boolean).join('\n');
  });

  const conclusion = [];

  if (skipped.length) {
    conclusion.push('Une ou plusieurs actions ont été ignorées car l’agent ne tourne pas en administrateur.');
  }

  if (failed.length) {
    conclusion.push(warningMessage || 'Une ou plusieurs actions ont retourné une erreur. Vérifier le détail ci-dessus.');
  } else {
    conclusion.push(successMessage || 'Action exécutée avec succès.');
  }

  return [
    formatDiagnosticHeader(result, title),
    ``,
    `🛠️ Actions exécutées`,
    lines.length ? lines.join('\n\n') : '- Aucune sortie disponible',
    ``,
    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}

function formatDiagnosticHeader(result, title) {
  return [
    `✅ ${title}`,
    ``,
    `💻 Poste`,
    `- Nom du poste : ${result.hostname || 'Non détecté'}`,
    `- Utilisateur : ${result.username || 'Non détecté'}`,
    `- Type : ${result.type || 'Non défini'}`,
    `- Date : ${result.completedAt || 'Non disponible'}`
  ].join('\n');
}

function formatNetworkBasicResult(result) {
  const ipconfig = findCommand(result, 'ipconfig');
  const pingDns = findCommand(result, 'ping 8.8.8.8');
  const pingGoogle = findCommand(result, 'ping google.com');
  const nslookup = findCommand(result, 'nslookup');

  const ipText = ipconfig?.stdout || '';

  const ipv4Line = firstMatchingLine(ipText, ['Adresse IPv4', 'IPv4 Address']);
  const gatewayLine = firstMatchingLine(ipText, ['Passerelle par défaut', 'Default Gateway']);
  const dhcpLine = firstMatchingLine(ipText, ['Serveur DHCP', 'DHCP Server']);
  const dnsLine = firstMatchingLine(ipText, ['Serveurs DNS', 'DNS Servers']);
  const adapterLine = firstMatchingLine(ipText, ['Description']);

  const pingDnsOk = pingDns ? isPingOk(pingDns.stdout) : false;
  const pingGoogleOk = pingGoogle ? isPingOk(pingGoogle.stdout) : false;
  const dnsOk = nslookup ? isNslookupOk(nslookup.stdout) : false;

  const hasIp = !!ipv4Line;
  const hasGateway = !!gatewayLine;

  const conclusion = [];

  if (hasIp && hasGateway) {
    conclusion.push('Le poste possède une adresse IP et une passerelle.');
  } else {
    conclusion.push('Adresse IP ou passerelle non détectée : vérifier la connexion réseau.');
  }

  if (pingDnsOk && pingGoogleOk && dnsOk) {
    conclusion.push('Connexion Internet et résolution DNS fonctionnelles.');
  } else if (pingDnsOk && !dnsOk) {
    conclusion.push('Internet répond, mais la résolution DNS semble problématique.');
  } else if (!pingDnsOk) {
    conclusion.push('Le poste ne répond pas correctement au test Internet vers 8.8.8.8.');
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic réseau terminé'),
    ``,
    `🌐 Configuration réseau`,
    `- Carte détectée : ${extractAfterColon(adapterLine)}`,
    `- Adresse IPv4 : ${extractAfterColon(ipv4Line)}`,
    `- Passerelle : ${extractAfterColon(gatewayLine)}`,
    `- DHCP : ${extractAfterColon(dhcpLine)}`,
    `- DNS : ${extractAfterColon(dnsLine)}`,
    ``,
    `📡 Tests de connectivité`,
    `- Ping 8.8.8.8 : ${pingDnsOk ? '🟢 OK' : '🔴 KO ou non disponible'}`,
    `- Ping google.com : ${pingGoogleOk ? '🟢 OK' : '🔴 KO ou non disponible'}`,
    `- Résolution DNS : ${dnsOk ? '🟢 OK' : '🔴 KO ou non disponible'}`,
    ``,
    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n');
}

function formatNetworkAdvancedResult(result) {
  const testNet = findCommand(result, 'Test-NetConnection');
  const ipAddress = findCommand(result, 'Get-NetIPAddress');
  const routes = findCommand(result, 'Get-NetRoute');
  const adapters = findCommand(result, 'Get-NetAdapter');

  const testText = testNet?.stdout || '';
  const testNormalized = normalizeTextForIntent(testText);

  const connectivityOk =
    testNormalized.includes('pingsucceeded') ||
    testNormalized.includes('tcptestsucceeded') ||
    testNormalized.includes('true');

  return [
    formatDiagnosticHeader(result, 'Diagnostic réseau avancé terminé'),
    ``,
    `🧪 Connectivité avancée`,
    `- Test-NetConnection : ${commandStatusIcon(testNet)}`,
    `- Résultat : ${connectivityOk ? '🟢 Connectivité détectée' : '🟠 À vérifier'}`,
    ``,
    `🌐 Adresses IP`,
    cleanDiagnosticText(ipAddress?.stdout || ipAddress?.stderr || ipAddress?.error, 1200),
    ``,
    `🛣️ Route par défaut`,
    cleanDiagnosticText(routes?.stdout || routes?.stderr || routes?.error, 1200),
    ``,
    `🔌 Cartes réseau actives`,
    cleanDiagnosticText(adapters?.stdout || adapters?.stderr || adapters?.error, 1200),
    ``,
    `🧾 Conclusion`,
    connectivityOk
      ? '- Le réseau avancé semble opérationnel. Vérifier les routes et cartes actives si le problème persiste.'
      : '- La connectivité avancée n’est pas confirmée. Vérifier passerelle, câble/Wi-Fi, VLAN ou filtrage réseau.'
  ].join('\n').slice(0, 7000);
}
function formatWifiDiagnosticsResult(result) {
  const interfaces = findCommand(result, 'netsh wlan show interfaces');
  const profiles = findCommand(result, 'netsh wlan show profiles');
  const adapter = findCommand(result, 'Get-NetAdapter');
  const dns = findCommand(result, 'Get-DnsClientServerAddress');

  const interfaceText = interfaces?.stdout || '';
  const profilesText = profiles?.stdout || '';
  const adapterText = adapter?.stdout || '';
  const dnsText = dns?.stdout || '';

  const wifiName = extractNetshValue(interfaceText, 'Nom');
  const description = extractNetshValue(interfaceText, 'Description');
  const state = extractNetshValue(interfaceText, 'État');
  const radio = extractNetshValue(interfaceText, 'Statut de la radio');
  const mac = extractNetshValue(interfaceText, 'Adresse physique');

  const savedProfiles = extractWifiProfiles(profilesText);

  const isDisconnected =
    normalizeTextForIntent(interfaceText).includes('deconnecte') ||
    normalizeTextForIntent(adapterText).includes('disconnected');

  const adapterStatus = isDisconnected ? 'Déconnecté' : 'Connecté ou actif';
  const dnsLines = extractDnsLines(dnsText);

  const conclusion = [];

  if (isDisconnected) {
    conclusion.push('La carte Wi-Fi est détectée mais actuellement déconnectée.');
  } else {
    conclusion.push('La carte Wi-Fi semble active ou connectée.');
  }

  if (savedProfiles.length) {
    conclusion.push(`${savedProfiles.length} profil(s) Wi-Fi enregistré(s) trouvé(s).`);
  } else {
    conclusion.push('Aucun profil Wi-Fi utilisateur détecté.');
  }

  if (normalizeTextForIntent(interfaceText).includes('materiel active') || normalizeTextForIntent(interfaceText).includes('logiciel active')) {
    conclusion.push('La radio Wi-Fi semble activée côté matériel/logiciel.');
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic Wi-Fi terminé'),
    ``,
    `📶 Interface Wi-Fi`,
    `- Nom : ${wifiName}`,
    `- Description : ${description}`,
    `- Adresse MAC : ${mac}`,
    `- État : ${state}`,
    `- Radio : ${radio}`,
    `- Statut adaptateur : ${adapterStatus}`,
    ``,
    `📡 Profils Wi-Fi enregistrés`,
    savedProfiles.length
      ? savedProfiles.map(profile => `- ${profile}`).join('\n')
      : '- Aucun profil détecté',
    ``,
    `🌐 DNS détectés`,
    dnsLines.length
      ? dnsLines.map(line => `- ${line}`).join('\n')
      : '- Non détecté',
    ``,
    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}
function formatPrinterBasicResult(result) {
  const printers = findCommand(result, 'Get-Printer');
  const spooler = findCommand(result, 'Get-Service Spooler');

  const spoolerText = normalizeTextForIntent(spooler?.stdout || '');
  const spoolerRunning =
    spoolerText.includes('running') ||
    spoolerText.includes('en cours');

  return [
    formatDiagnosticHeader(result, 'Diagnostic imprimante terminé'),
    ``,
    `🖨️ Imprimantes détectées`,
    cleanDiagnosticText(printers?.stdout || printers?.stderr || printers?.error, 1800),
    ``,
    `⚙️ Spouleur d’impression`,
    `- Statut commande : ${commandStatusIcon(spooler)}`,
    `- Spouleur : ${spoolerRunning ? '🟢 En cours' : '🔴 À vérifier'}`,
    ``,
    cleanDiagnosticText(spooler?.stdout || spooler?.stderr || spooler?.error, 800),
    ``,
    `🧾 Conclusion`,
    spoolerRunning
      ? '- Le spouleur d’impression semble actif. Vérifier ensuite l’imprimante par défaut, le pilote et la file d’attente.'
      : '- Le spouleur d’impression semble arrêté ou non lisible. Redémarrer le service Spouleur d’impression.'
  ].join('\n').slice(0, 7000);
}

function formatSystemBasicResult(result) {
  const hostname = findCommand(result, 'hostname');
  const whoami = findCommand(result, 'whoami');

  const systemJsonCommand =
    findCommand(result, 'Win32_OperatingSystem') ||
    findCommand(result, 'Get-CimInstance') ||
    findCommand(result, 'ConvertTo-Json');

  let systemInfo = null;

  try {
    const raw = String(systemJsonCommand?.stdout || '').trim();
    systemInfo = raw ? JSON.parse(raw) : null;
  } catch {
    systemInfo = null;
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic système terminé'),
    ``,
    `🖥️ Identité`,
    `- Hostname : ${cleanDiagnosticText(hostname?.stdout, 200)}`,
    `- Session : ${cleanDiagnosticText(whoami?.stdout, 200)}`,
    `- Exécuté en administrateur : ${result.isAdmin ? 'Oui' : 'Non'}`,
    ``,
    `🧩 Informations système`,
    `- OS : ${systemInfo?.OsName || 'Non détecté'}`,
    `- Version : ${systemInfo?.OsVersion || 'Non détecté'}`,
    `- Build : ${systemInfo?.BuildNumber || 'Non détecté'}`,
    `- Fabricant : ${systemInfo?.Manufacturer || 'Non détecté'}`,
    `- Modèle : ${systemInfo?.Model || 'Non détecté'}`,
    `- Dernier démarrage : ${systemInfo?.LastBootUpTime || 'Non détecté'}`,
    `- Mémoire : ${systemInfo?.TotalMemoryGB ? `${systemInfo.TotalMemoryGB} Go` : 'Non détecté'}`,
    `- BIOS : ${systemInfo?.BiosManufacturer || 'Non détecté'}`,
    `- Numéro de série : ${systemInfo?.SerialNumber || 'Non détecté'}`,
    ``,
    `🧾 Conclusion`,
    '- Informations système récupérées via WMI/CIM. Ces données peuvent être utilisées pour identifier le poste ou préparer une escalade technique.'
  ].join('\n').slice(0, 7000);
}

function extractPowershellFields(text) {
  const fields = {};
  const lines = String(text || '').replace(/\r/g, '').split('\n');

  for (const line of lines) {
    const match = line.match(/^\s*([^:]+)\s*:\s*(.*)$/);
    if (match) {
      fields[match[1].trim()] = match[2].trim();
    }
  }

  return fields;
}

function parseWindowsEvents(text, maxEvents = 5) {
  const raw = String(text || '').replace(/\r/g, '');
  const chunks = raw
    .split(/\n\s*\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const events = [];

  for (const chunk of chunks) {
    const fields = extractPowershellFields(chunk);

    if (fields.TimeCreated || fields.ProviderName || fields.Id || fields.Message) {
      events.push({
        time: fields.TimeCreated || 'Non détecté',
        provider: fields.ProviderName || 'Non détecté',
        id: fields.Id || 'Non détecté',
        message: fields.Message || 'Message non disponible'
      });
    }
  }

  return events.slice(0, maxEvents);
}

function parseSimpleTable(text, maxRows = 8) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)
    .filter(line => !/^[-\s]+$/.test(line));

  if (lines.length <= 2) return [];

  // Skip header line.
  return lines.slice(1, maxRows + 1);
}

function truncateLine(text, max = 180) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '...' : clean;
}

function formatSystemHealthResult(result) {
  const computerInfo = findCommand(result, 'Get-ComputerInfo');
  const events = findCommand(result, 'Get-WinEvent');
  const processes = findCommand(result, 'Get-Process');
  const services = findCommand(result, 'Get-Service');

  const machine = extractPowershellFields(computerInfo?.stdout || '');
  const eventList = parseWindowsEvents(events?.stdout || '', 5);
  const processRows = parseSimpleTable(processes?.stdout || '', 5);
  const serviceRows = parseSimpleTable(services?.stdout || '', 8);

  const hasErrors = eventList.length > 0;
  const hasStoppedServices = serviceRows.length > 0;

  const conclusion = [];

  if (hasErrors) {
    conclusion.push(`${eventList.length} erreur(s) système récente(s) détectée(s).`);
  } else {
    conclusion.push('Aucune erreur système récente détectée dans la sortie récupérée.');
  }

  if (hasStoppedServices) {
    conclusion.push(`${serviceRows.length} service(s) automatique(s) arrêté(s) à vérifier.`);
  } else {
    conclusion.push('Aucun service automatique arrêté visible.');
  }

  if (processRows.length) {
    conclusion.push('Les processus les plus consommateurs CPU ont été listés pour analyse.');
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic santé système terminé'),
    ``,
    `🖥️ Informations machine`,
    `- OS : ${machine.OsName || 'Non détecté'}`,
    `- Version : ${machine.OsVersion || 'Non détecté'}`,
    `- Modèle : ${machine.CsModel || 'Non détecté'}`,
    `- BIOS : ${machine.BiosManufacturer || 'Non détecté'}`,
    `- Exécuté en administrateur : ${result.isAdmin ? 'Oui' : 'Non'}`,
    ``,
    `🚨 Dernières erreurs système`,
    eventList.length
      ? eventList.map((event, index) => {
          return [
            `${index + 1}. ${event.provider} — ID ${event.id}`,
            `   Date : ${event.time}`,
            `   Message : ${truncateLine(event.message, 220)}`
          ].join('\n');
        }).join('\n\n')
      : '- Aucune erreur détectée',
    ``,
    `⚙️ Processus les plus consommateurs CPU`,
    processRows.length
      ? processRows.map(row => `- ${truncateLine(row, 160)}`).join('\n')
      : '- Non détecté',
    ``,
    `🧰 Services automatiques arrêtés`,
    serviceRows.length
      ? serviceRows.map(row => `- ${truncateLine(row, 170)}`).join('\n')
      : '- Aucun service automatique arrêté détecté',
    ``,
    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}

function formatBool(value) {
  if (value === true || String(value).toLowerCase() === 'true') return 'Oui';
  if (value === false || String(value).toLowerCase() === 'false') return 'Non';
  return 'Non détecté';
}

function severityLabel(value) {
  const severity = Number(value);

  if (severity >= 5) return 'Critique';
  if (severity >= 4) return 'Élevée';
  if (severity >= 2) return 'Moyenne';
  if (severity >= 1) return 'Faible';

  return 'Non détecté';
}

function formatDefenderSecurityResult(result) {
  const statusCommand = findCommand(result, 'Get-MpComputerStatus');
  const threatsCommand = findCommand(result, 'Get-MpThreat');
  const firewallCommand = findCommand(result, 'Get-NetFirewallProfile');

  const defenderStatus = safeJsonParseAny(statusCommand?.stdout);
  const threats = asArray(safeJsonParseAny(threatsCommand?.stdout));
  const firewallProfiles = asArray(safeJsonParseAny(firewallCommand?.stdout));

  const skippedAdminCommands = (result.results || []).filter(item => item.skipped || item.requiresAdmin && item.error);

  const conclusion = [];

  if (skippedAdminCommands.length) {
    conclusion.push('Certaines vérifications Defender ont été ignorées car l’agent ne tourne pas en administrateur.');
  }

  if (defenderStatus) {
    if (defenderStatus.RealTimeProtectionEnabled === true) {
      conclusion.push('La protection en temps réel Microsoft Defender est activée.');
    } else {
      conclusion.push('La protection en temps réel Microsoft Defender semble désactivée ou non détectée.');
    }

    if (defenderStatus.DefenderSignaturesOutOfDate === true) {
      conclusion.push('Les signatures Defender semblent obsolètes.');
    }
  }

  if (threats.length) {
    conclusion.push(`${threats.length} menace(s) Defender détectée(s).`);
  } else {
    conclusion.push('Aucune menace Defender détectée dans la sortie récupérée.');
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic sécurité Defender terminé'),
    ``,
    `🛡️ Microsoft Defender`,
    defenderStatus
      ? [
          `- Service Defender actif : ${formatBool(defenderStatus.AMServiceEnabled)}`,
          `- Antivirus activé : ${formatBool(defenderStatus.AntivirusEnabled)}`,
          `- Protection temps réel : ${formatBool(defenderStatus.RealTimeProtectionEnabled)}`,
          `- Antispyware activé : ${formatBool(defenderStatus.AntispywareEnabled)}`,
          `- Âge dernier scan complet : ${defenderStatus.FullScanAge ?? 'Non détecté'}`,
          `- Âge dernier scan rapide : ${defenderStatus.QuickScanAge ?? 'Non détecté'}`,
          `- Signatures obsolètes : ${formatBool(defenderStatus.DefenderSignaturesOutOfDate)}`,
          `- Dernière signature antivirus : ${defenderStatus.AntivirusSignatureLastUpdated || 'Non détecté'}`,
          `- Dernière signature antispyware : ${defenderStatus.AntispywareSignatureLastUpdated || 'Non détecté'}`
        ].join('\n')
      : [
          `- Statut : Non détecté`,
          `- Raison possible : agent non lancé en administrateur ou module Defender inaccessible`
        ].join('\n'),
    ``,
    `🚨 Menaces détectées`,
    threats.length
      ? threats.slice(0, 8).map(threat => {
          return `- ${threat.ThreatName || 'Menace inconnue'} — sévérité ${severityLabel(threat.SeverityID)}${threat.Resources ? ` — ${truncateLine(String(threat.Resources), 160)}` : ''}`;
        }).join('\n')
      : '- Aucune menace détectée',
    ``,
    `🧱 Pare-feu Windows`,
    firewallProfiles.length
      ? firewallProfiles.map(profile => {
          return `- ${profile.Name || 'Profil'} : activé ${formatBool(profile.Enabled)}, entrant ${profile.DefaultInboundAction || 'N/A'}, sortant ${profile.DefaultOutboundAction || 'N/A'}`;
        }).join('\n')
      : '- Profils pare-feu non détectés',
    ``,
    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}
function safeJsonParseArray(text) {
  try {
    const raw = String(text || '').trim();
    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return [parsed];

    return [];
  } catch {
    return [];
  }
}
function safeJsonParseAny(text) {
  try {
    const raw = String(text || '').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function truncateLine(text, max = 180) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '...' : clean;
}


function formatUserSessionResult(result) {
  const whoami = findCommand(result, 'whoami');
  const queryUser = findCommand(result, 'query user');
  const localUsers = findCommand(result, 'Get-LocalUser');
  const adminMembers = findCommand(result, 'Get-LocalGroupMember');

  const sessionName = cleanDiagnosticText(whoami?.stdout, 200) || 'Non détecté';

  const queryOutput =
    cleanDiagnosticText(queryUser?.stdout, 1200) ||
    cleanDiagnosticText(queryUser?.stderr, 1200) ||
    'Non détecté';

  const users = safeJsonParseArray(localUsers?.stdout);
  const admins = safeJsonParseArray(adminMembers?.stdout);

  const enabledUsers = users.filter(user => user.Enabled === true);
  const disabledUsers = users.filter(user => user.Enabled === false);

  return [
    formatDiagnosticHeader(result, 'Diagnostic session utilisateur terminé'),
    ``,
    `👤 Session active`,
    `- Utilisateur courant : ${sessionName}`,
    `- Poste : ${result.hostname || result.deviceId || 'Non détecté'}`,
    `- Exécuté en administrateur : ${result.isAdmin ? 'Oui' : 'Non'}`,
    ``,
    `🖥️ Session Windows`,
    queryOutput
      .split('\n')
      .map(line => `- ${line.trim()}`)
      .filter(line => line !== '-')
      .join('\n'),
    ``,
    `👥 Comptes locaux`,
    users.length
      ? [
          `- Comptes activés : ${enabledUsers.length || 0}`,
          `- Comptes désactivés : ${disabledUsers.length || 0}`,
          ``,
          ...users.map(user => {
            return `- ${user.Name || 'Inconnu'} : ${user.Enabled ? 'Activé' : 'Désactivé'}${user.LastLogon ? `, dernière connexion ${user.LastLogon}` : ''}`;
          })
        ].join('\n')
      : '- Aucun compte local détecté',
    ``,
    `🛡️ Administrateurs locaux`,
    admins.length
      ? admins.map(member => {
          return `- ${member.Name || 'Inconnu'}${member.ObjectClass ? ` (${member.ObjectClass})` : ''}${member.PrincipalSource ? ` — ${member.PrincipalSource}` : ''}`;
        }).join('\n')
      : '- Aucun membre administrateur local détecté ou accès refusé',
    ``,
    `🧾 Conclusion`,
    users.length
      ? '- Les informations de session et comptes locaux ont été récupérées.'
      : '- Les informations utilisateur sont partielles. Vérifier les droits ou la langue système si nécessaire.'
  ].join('\n').slice(0, 7000);
}
function formatStorageManagementResult(result) {
  const volumes = findCommand(result, 'Get-Volume');
  const disks = findCommand(result, 'Get-PhysicalDisk');
  const repair = findCommand(result, 'Repair-Volume');

  const repairOk = commandOk(repair);

  return [
    formatDiagnosticHeader(result, 'Diagnostic stockage terminé'),
    ``,
    `💽 Volumes`,
    cleanDiagnosticText(volumes?.stdout || volumes?.stderr || volumes?.error, 1600),
    ``,
    `🧱 Disques physiques`,
    cleanDiagnosticText(disks?.stdout || disks?.stderr || disks?.error, 1600),
    ``,
    `🛠️ Scan du volume C:`,
    `- Statut : ${commandStatusIcon(repair)}`,
    cleanDiagnosticText(repair?.stdout || repair?.stderr || repair?.error, 1000),
    ``,
    `🧾 Conclusion`,
    repairOk
      ? '- Le scan stockage a été exécuté. Vérifier les colonnes HealthStatus et OperationalStatus pour confirmer l’état disque.'
      : '- Le scan stockage a retourné une erreur ou nécessite les droits administrateur. Relancer l’agent en administrateur si nécessaire.'
  ].join('\n').slice(0, 7000);
}

function formatSecurityAuditResult(result) {
  const users = findCommand(result, 'Get-LocalUser');
  const tasks = findCommand(result, 'Get-ScheduledTask');
  const firewall = findCommand(result, 'Get-NetFirewallRule');

  return [
    formatDiagnosticHeader(result, 'Audit sécurité terminé'),
    ``,
    `👤 Utilisateurs locaux activés`,
    cleanDiagnosticText(users?.stdout || users?.stderr || users?.error, 1400),
    ``,
    `📅 Tâches planifiées actives`,
    cleanDiagnosticText(tasks?.stdout || tasks?.stderr || tasks?.error, 1800),
    ``,
    `🧱 Règles pare-feu activées`,
    cleanDiagnosticText(firewall?.stdout || firewall?.stderr || firewall?.error, 1800),
    ``,
    `🧾 Conclusion`,
    `- Audit sécurité récupéré.`,
    `- Vérifier les comptes locaux inconnus, les tâches planifiées suspectes et les règles pare-feu inhabituelles.`,
    `- Ce diagnostic peut contenir des informations sensibles : à partager uniquement avec un technicien autorisé.`
  ].join('\n').slice(0, 7000);
}
function safeJsonParseAny(text) {
  try {
    const raw = String(text || '').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function serviceStatusLabel(service) {
  if (!service) return 'Non détecté';

  const status = String(service.Status || '').toLowerCase();

  if (status === 'running') return '🟢 En cours';
  if (status === 'stopped') return '🔴 Arrêté';

  return service.Status || 'Non détecté';
}

function formatRemoteAccessResult(result) {
  const servicesCommand = findCommand(result, 'Get-Service TermService');
  const wsmanCommand = findCommand(result, 'Test-WSMan');
  const firewallCommand = findCommand(result, 'Get-NetFirewallRule');

  const services = asArray(safeJsonParseAny(servicesCommand?.stdout));
  const wsman = safeJsonParseAny(wsmanCommand?.stdout);
  const firewallRules = asArray(safeJsonParseAny(firewallCommand?.stdout));

  const termService = services.find(s => s.Name === 'TermService');
  const remoteRegistry = services.find(s => s.Name === 'RemoteRegistry');
  const winrm = services.find(s => s.Name === 'WinRM');

  const rdpFirewallEnabled = firewallRules.some(rule =>
    String(rule.Enabled).toLowerCase() === 'true' ||
    String(rule.Enabled).toLowerCase() === 'enabled'
  );

  const wsmanAvailable = wsman && wsman.Available !== false && !wsman.Error;

  const conclusion = [];

  if (!termService || String(termService.Status).toLowerCase() !== 'running') {
    conclusion.push('Le service Bureau à distance n’est pas en cours d’exécution.');
  } else {
    conclusion.push('Le service Bureau à distance est actif.');
  }

  if (!wsmanAvailable) {
    conclusion.push('WinRM / PowerShell Remoting n’est pas disponible actuellement.');
  } else {
    conclusion.push('WinRM / PowerShell Remoting répond correctement.');
  }

  if (!rdpFirewallEnabled) {
    conclusion.push('Aucune règle pare-feu Bureau à distance active détectée.');
  } else {
    conclusion.push('Des règles pare-feu Bureau à distance actives sont détectées.');
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic accès distant terminé'),
    ``,
    `🖥️ Services d’accès distant`,
    `- Bureau à distance / TermService : ${serviceStatusLabel(termService)} — démarrage ${termService?.StartType || 'Non détecté'}`,
    `- Registre distant / RemoteRegistry : ${serviceStatusLabel(remoteRegistry)} — démarrage ${remoteRegistry?.StartType || 'Non détecté'}`,
    `- WinRM : ${serviceStatusLabel(winrm)} — démarrage ${winrm?.StartType || 'Non détecté'}`,
    ``,
    `🔌 WinRM / PowerShell Remoting`,
    wsmanAvailable
      ? [
          `- Statut : 🟢 Disponible`,
          `- Vendor : ${wsman.ProductVendor || 'Non détecté'}`,
          `- Version : ${wsman.ProductVersion || 'Non détecté'}`,
          `- Protocole : ${wsman.ProtocolVersion || 'Non détecté'}`
        ].join('\n')
      : [
          `- Statut : 🔴 Indisponible`,
          `- Erreur : ${truncateLine(wsman?.Error || wsmanCommand?.stderr || 'Non détecté', 350)}`
        ].join('\n'),
    ``,
    `🧱 Pare-feu Bureau à distance`,
    firewallRules.length
      ? firewallRules.slice(0, 8).map(rule => {
          return `- ${rule.DisplayName || 'Règle inconnue'} : ${rule.Enabled ? 'activée' : 'désactivée'} / ${rule.Direction || 'N/A'} / ${rule.Action || 'N/A'}`;
        }).join('\n')
      : '- Aucune règle Bureau à distance détectée',
    ``,
    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}

function extractRegexValue(text, regex, fallback = 'Non détecté') {
  const match = String(text || '').match(regex);
  return match && match[1] ? match[1].trim() : fallback;
}

function formatSpeedtestResult(result) {
  const speedtest = findCommand(result, 'speedtest');

  const output = String(speedtest?.stdout || speedtest?.stderr || speedtest?.error || '');

  const server = extractRegexValue(output, /Server:\s*(.+?)(?:\s+\(id:|\n|$)/i);
  const isp = extractRegexValue(output, /ISP:\s*(.+?)(?:\n|$)/i);

  const idleLatency = extractRegexValue(output, /Idle Latency:\s*([\d.,]+\s*ms)/i);
  const download = extractRegexValue(output, /Download:\s*([\d.,]+\s*Mbps)/i);
  const upload = extractRegexValue(output, /Upload:\s*([\d.,]+\s*Mbps)/i);
  const packetLoss = extractRegexValue(output, /Packet Loss:\s*([\d.,]+%)/i);
  const resultUrl = extractRegexValue(output, /Result URL:\s*(https?:\/\/\S+)/i);

  const conclusion = [];

  const downloadNumber = Number(String(download).replace(',', '.').replace(/[^\d.]/g, ''));
  const uploadNumber = Number(String(upload).replace(',', '.').replace(/[^\d.]/g, ''));
  const latencyNumber = Number(String(idleLatency).replace(',', '.').replace(/[^\d.]/g, ''));

  if (Number.isFinite(downloadNumber) && downloadNumber >= 50) {
    conclusion.push('Le débit descendant est bon.');
  } else if (Number.isFinite(downloadNumber)) {
    conclusion.push('Le débit descendant est faible ou moyen : à vérifier selon le besoin utilisateur.');
  }

  if (Number.isFinite(uploadNumber) && uploadNumber >= 20) {
    conclusion.push('Le débit montant est bon.');
  } else if (Number.isFinite(uploadNumber)) {
    conclusion.push('Le débit montant est faible ou moyen : à vérifier selon le besoin utilisateur.');
  }

  if (Number.isFinite(latencyNumber) && latencyNumber <= 30) {
    conclusion.push('La latence est faible, la connexion semble réactive.');
  } else if (Number.isFinite(latencyNumber)) {
    conclusion.push('La latence est élevée : possible lenteur réseau ou Wi-Fi.');
  }

  if (packetLoss === '0.0%' || packetLoss === '0%') {
    conclusion.push('Aucune perte de paquets détectée.');
  }

  if (!conclusion.length) {
    conclusion.push('Le test de débit a été exécuté. Vérifier les valeurs de débit, latence et perte de paquets.');
  }

  return [
    formatDiagnosticHeader(result, 'Test de débit Internet terminé'),
    ``,
    `🌍 Connexion Internet`,
    `- Fournisseur : ${isp}`,
    `- Serveur de test : ${server}`,
    ``,
    `📊 Résultats Speedtest`,
    `- Débit descendant : ${download}`,
    `- Débit montant : ${upload}`,
    `- Latence : ${idleLatency}`,
    `- Perte de paquets : ${packetLoss}`,
    ``,
    `🔗 Résultat Ookla`,
    resultUrl !== 'Non détecté' ? `- ${resultUrl}` : '- Non détecté',
    ``,
    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}
function batteryStatusLabel(value) {
  const code = Number(value);

  const labels = {
    1: 'Déchargement',
    2: 'Branchée / en charge ou secteur',
    3: 'Chargée complètement',
    4: 'Batterie faible',
    5: 'Batterie critique',
    6: 'En charge',
    7: 'En charge - capacité élevée',
    8: 'En charge - capacité faible',
    9: 'En charge - critique',
    10: 'Inconnu',
    11: 'Partiellement chargée'
  };

  return labels[code] || `Code ${value || 'inconnu'}`;
}

function formatBatteryRuntime(value) {
  const minutes = Number(value);

  if (!Number.isFinite(minutes)) return 'Non détecté';

  // Windows sometimes returns 71582788 when runtime is unknown.
  if (minutes > 100000) return 'Non estimé par Windows';

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (hours <= 0) return `${remainingMinutes} min`;

  return `${hours} h ${remainingMinutes} min`;
}

function formatBatteryHealthResult(result) {
  const batteryCommand = findCommand(result, 'Win32_Battery');
  const reportCommand = findCommand(result, 'batteryreport');

  const battery = safeJsonParseAny(batteryCommand?.stdout);
  const reportOutput = String(reportCommand?.stdout || reportCommand?.stderr || reportCommand?.error || '');

  const reportPath =
    extractRegexValue(reportOutput, /(C:\\[^\r\n]+battery-report\.html)/i) ||
    'Non détecté';

  const hasBattery = !!battery;

  const charge = hasBattery
    ? `${battery.EstimatedChargeRemaining ?? 'Non détecté'}%`
    : 'Non détecté';

  const status = hasBattery
    ? batteryStatusLabel(battery.BatteryStatus)
    : 'Non détecté';

  const runtime = hasBattery
    ? formatBatteryRuntime(battery.EstimatedRunTime)
    : 'Non détecté';

  const conclusion = [];

  if (!hasBattery) {
    conclusion.push('Aucune batterie détectée. Le poste est probablement un PC fixe ou les informations batterie ne sont pas accessibles.');
  } else {
    const chargeNumber = Number(battery.EstimatedChargeRemaining);

    if (Number.isFinite(chargeNumber) && chargeNumber >= 80) {
      conclusion.push('Le niveau de batterie est bon.');
    } else if (Number.isFinite(chargeNumber) && chargeNumber >= 30) {
      conclusion.push('Le niveau de batterie est moyen.');
    } else if (Number.isFinite(chargeNumber)) {
      conclusion.push('Le niveau de batterie est faible : brancher le chargeur ou vérifier l’état de la batterie.');
    }

    conclusion.push(`État Windows de la batterie : ${status}.`);
  }

  if (reportPath !== 'Non détecté') {
    conclusion.push('Un rapport batterie HTML a été généré localement sur le poste.');
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic batterie terminé'),
    ``,
    `🔋 Batterie`,
    `- Nom : ${battery?.Name || 'Non détecté'}`,
    `- Niveau estimé : ${charge}`,
    `- État : ${status}`,
    `- Autonomie estimée : ${runtime}`,
    ``,
    `📄 Rapport batterie`,
    `- Statut : ${commandStatusIcon(reportCommand)}`,
    `- Chemin local : ${reportPath}`,
    ``,
    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}
function windowsServiceStatusLabel(status) {
  const value = String(status || '').toLowerCase();

  if (value === 'running') return '🟢 En cours';
  if (value === 'stopped') return '🔴 Arrêté';
  if (value === 'paused') return '🟠 En pause';

  return status || 'Non détecté';
}

function windowsServiceStartTypeLabel(startType) {
  const value = String(startType || '').toLowerCase();

  if (value === 'automatic') return 'Automatique';
  if (value === 'manual') return 'Manuel';
  if (value === 'disabled') return 'Désactivé';

  return startType || 'Non détecté';
}

function formatWindowsDate(value) {
  if (!value) return 'Non détecté';

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('fr-FR');
}

function formatWindowsUpdateResult(result) {
  const servicesCommand = findCommand(result, 'Get-Service wuauserv');
  const hotfixCommand = findCommand(result, 'Get-HotFix');
  const scanCommand = findCommand(result, 'UsoClient StartScan');

  const services = asArray(safeJsonParseAny(servicesCommand?.stdout));
  const hotfixes = asArray(safeJsonParseAny(hotfixCommand?.stdout));

  const wuauserv = services.find(service => service.Name === 'wuauserv');
  const bits = services.find(service => service.Name === 'bits');
  const cryptsvc = services.find(service => service.Name === 'cryptsvc');

  const scanOutput = cleanDiagnosticText(
    scanCommand?.stdout || scanCommand?.stderr || scanCommand?.error,
    500
  );

  const conclusion = [];

  if (wuauserv && String(wuauserv.Status).toLowerCase() === 'running') {
    conclusion.push('Le service Windows Update est en cours d’exécution.');
  } else {
    conclusion.push('Le service Windows Update n’est pas en cours d’exécution ou n’a pas été détecté.');
  }

  if (bits && String(bits.Status).toLowerCase() !== 'running') {
    conclusion.push('Le service BITS est arrêté. Ce n’est pas toujours bloquant, mais il peut impacter le téléchargement des mises à jour.');
  }

  if (cryptsvc && String(cryptsvc.Status).toLowerCase() === 'running') {
    conclusion.push('Le service Cryptographic Services est actif.');
  }

  if (hotfixes.length) {
    conclusion.push(`${hotfixes.length} correctif(s) récent(s) trouvé(s).`);
  } else {
    conclusion.push('Aucun correctif récent détecté dans la sortie récupérée.');
  }

  if (scanCommand && !scanCommand.error) {
    conclusion.push('Un scan Windows Update a été déclenché.');
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic Windows Update terminé'),
    ``,

    `🔄 Services Windows Update`,
    services.length
      ? services.map(service => {
          return `- ${service.Name || 'Service'} : ${windowsServiceStatusLabel(service.Status)} / démarrage ${windowsServiceStartTypeLabel(service.StartType)}`;
        }).join('\n')
      : '- Services non détectés',
    ``,

    `📦 Derniers correctifs installés`,
    hotfixes.length
      ? hotfixes.slice(0, 10).map(hotfix => {
          return `- ${hotfix.HotFixID || 'KB inconnue'} — ${hotfix.Description || 'Description non détectée'} — installé le ${formatWindowsDate(hotfix.InstalledOn)}`;
        }).join('\n')
      : '- Aucun correctif détecté',
    ``,

    `🔍 Scan Windows Update`,
    `- Statut : ${commandStatusIcon(scanCommand)}`,
    `- Résultat : ${scanOutput}`,
    ``,

    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}
function removeRawCommandNoise(text) {
  const value = String(text || '').trim();

  if (!value) return '';

  // Hide Node.js exec messages that include the entire PowerShell command.
  if (/^Command failed:/i.test(value)) {
    return '';
  }

  return cleanDiagnosticText(value, 1200);
}

function formatSwitchPortResult(result) {
  const command = findCommand(result, 'PSDiscoveryProtocol') || (result.results || [])[0];

  const stdout = cleanDiagnosticText(command?.stdout, 2000);
  const stderr = removeRawCommandNoise(command?.stderr);
  const error = removeRawCommandNoise(command?.error);

  const parsed = safeJsonParseAny(command?.stdout);
  const entries = asArray(parsed).filter(Boolean);

  const isFoundFalse =
    parsed &&
    typeof parsed === 'object' &&
    parsed.found === false;

  const cleanReason =
    parsed?.error ||
    parsed?.message ||
    stderr ||
    error ||
    '';

  const lines = [
    formatDiagnosticHeader(result, 'Recherche port switch terminée'),
    ``,
    `🔌 Découverte réseau LLDP/CDP`,
    `- Statut : ${entries.length ? '🟢 OK' : '🟠 Non détecté'}`
  ];

  if (entries.length) {
    lines.push(`- Équipement(s) détecté(s) : ${entries.length}`);
    lines.push(``);
    lines.push(`📍 Informations détectées`);

    entries.slice(0, 5).forEach((item, index) => {
      lines.push(
        [
          `${index + 1}. Switch / voisin réseau`,
          `   Nom : ${item.Device || item.DeviceName || item.SystemName || item.ChassisId || 'Non détecté'}`,
          `   Port : ${item.Port || item.PortId || item.Interface || item.InterfaceName || 'Non détecté'}`,
          `   Description : ${item.PortDescription || item.Description || 'Non détecté'}`,
          `   VLAN : ${item.Vlan || item.VlanId || 'Non détecté'}`
        ].join('\n')
      );
    });

    lines.push(``);
    lines.push(`🧾 Conclusion`);
    lines.push(`- Le poste reçoit des informations LLDP/CDP.`);
    lines.push(`- Le port switch peut être identifié avec les informations ci-dessus.`);

    return lines.join('\n').slice(0, 7000);
  }

  lines.push(`- Équipement détecté : Non`);
  lines.push(``);

  lines.push(`🧾 Conclusion`);

  if (isFoundFalse && cleanReason) {
    lines.push(`- ${cleanReason}`);
  } else {
    lines.push(`- Aucun voisin LLDP/CDP détecté.`);
  }

  lines.push(`- Causes possibles : LLDP/CDP désactivé sur le switch, droits insuffisants, capture réseau bloquée, module PowerShell manquant, ou politique de sécurité restrictive.`);

  // Only show technical details if they are readable and not raw command noise.
  const technicalDetails = [];

  if (stdout && !isFoundFalse && !stdout.includes('powershell -NoProfile')) {
    technicalDetails.push(`Sortie : ${stdout}`);
  }

  if (stderr) {
    technicalDetails.push(`Erreur : ${stderr}`);
  }

  if (error) {
    technicalDetails.push(`Erreur commande : ${error}`);
  }

  if (technicalDetails.length) {
    lines.push(``);
    lines.push(`🛠️ Détail technique`);
    lines.push(technicalDetails.join('\n'));
  }

  return lines.join('\n').slice(0, 7000);
}

function formatOfficeProcessName(name) {
  const value = String(name || '').toLowerCase();

  if (value === 'ms-teams' || value === 'teams') return 'Microsoft Teams';
  if (value === 'outlook') return 'Microsoft Outlook';
  if (value === 'winword') return 'Microsoft Word';
  if (value === 'excel') return 'Microsoft Excel';
  if (value === 'powerpnt') return 'Microsoft PowerPoint';

  return name || 'Application inconnue';
}

function formatOfficeDate(value) {
  if (!value) return 'Non détecté';

  const raw = String(value);

  const microsoftJsonDate = raw.match(/\/Date\((\d+)\)\//);
  if (microsoftJsonDate) {
    const date = new Date(Number(microsoftJsonDate[1]));
    if (Number.isFinite(date.getTime())) {
      return date.toLocaleString('fr-FR');
    }
  }

  const date = new Date(value);
  if (Number.isFinite(date.getTime())) {
    return date.toLocaleString('fr-FR');
  }

  return raw;
}

function formatOfficeChannel(channel) {
  const value = String(channel || '');

  if (!value) return 'Non détecté';

  if (value.includes('492350f6-3a01-4f97-b9c0-c7c6ddf67d60')) {
    return 'Canal actuel / Current Channel';
  }

  if (value.includes('55336b82-a18d-4dd6-b5f6-9e5095c314a6')) {
    return 'Canal mensuel entreprise';
  }

  if (value.includes('7ffbc6bf-bc32-4f92-8982-f9dd17fd3114')) {
    return 'Canal semi-annuel entreprise';
  }

  return value;
}

function formatOfficeDiagnosticsResult(result) {
  const processCommand = findCommand(result, 'Get-Process');
  const configCommand = findCommand(result, 'ClickToRun');

  const processes = asArray(safeJsonParseAny(processCommand?.stdout));
  const config = safeJsonParseAny(configCommand?.stdout) || {};

  const officeApps = processes.map(item => {
    return {
      name: formatOfficeProcessName(item.Name),
      pid: item.Id || 'Non détecté',
      cpu: Number.isFinite(Number(item.CPU)) ? Number(item.CPU).toFixed(2) : '0.00',
      startTime: formatOfficeDate(item.StartTime)
    };
  });

  const hasTeams = officeApps.some(app => app.name === 'Microsoft Teams');
  const hasOfficeConfig = !!config.VersionToReport || !!config.ProductReleaseIds;

  const conclusion = [];

  if (officeApps.length) {
    conclusion.push(`${officeApps.length} processus Office/Teams détecté(s) en cours d’exécution.`);
  } else {
    conclusion.push('Aucun processus Office/Teams actif détecté au moment du diagnostic.');
  }

  if (hasTeams) {
    conclusion.push('Microsoft Teams est actuellement lancé.');
  }

  if (hasOfficeConfig) {
    conclusion.push('La configuration Microsoft Office Click-to-Run a été détectée.');
  } else {
    conclusion.push('La configuration Office Click-to-Run n’a pas été détectée. Office peut être absent ou installé différemment.');
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic Office / Teams terminé'),
    ``,

    `🧩 Applications détectées`,
    officeApps.length
      ? officeApps.map(app => {
          return `- ${app.name} — PID ${app.pid} — CPU ${app.cpu} — démarré le ${app.startTime}`;
        }).join('\n')
      : '- Aucune application Office/Teams active détectée',
    ``,

    `🏢 Configuration Microsoft Office`,
    `- Produits : ${config.ProductReleaseIds || 'Non détecté'}`,
    `- Version : ${config.VersionToReport || 'Non détecté'}`,
    `- Canal de mise à jour : ${formatOfficeChannel(config.UpdateChannel)}`,
    ``,

    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}

function formatProxyDiagnosticsResult(result) {
  const winHttpCommand = findCommand(result, 'netsh winhttp show proxy');
  const userProxyCommand = findCommand(result, 'Internet Settings');

  const winHttpOutput = cleanDiagnosticText(winHttpCommand?.stdout, 1200);
  const userProxy = safeJsonParseAny(userProxyCommand?.stdout) || {};

  const proxyEnabled = Number(userProxy.ProxyEnable) === 1;
  const proxyServer = userProxy.ProxyServer || 'Non configuré';
  const autoConfigUrl = userProxy.AutoConfigURL || 'Non configuré';

  const winHttpDirect =
    /accès direct|direct access|no proxy/i.test(winHttpOutput);

  const conclusion = [];

  if (winHttpDirect) {
    conclusion.push('Le proxy WinHTTP est en accès direct, donc aucun proxy système WinHTTP n’est configuré.');
  } else {
    conclusion.push('Un proxy WinHTTP semble être configuré ou la sortie doit être vérifiée.');
  }

  if (!proxyEnabled && !userProxy.ProxyServer && !userProxy.AutoConfigURL) {
    conclusion.push('Aucun proxy utilisateur Windows n’est activé.');
  } else if (proxyEnabled) {
    conclusion.push('Un proxy utilisateur est activé dans les paramètres Windows.');
  }

  if (userProxy.AutoConfigURL) {
    conclusion.push('Un script de configuration automatique proxy PAC est configuré.');
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic proxy terminé'),
    ``,

    `🌐 Proxy WinHTTP`,
    `- Statut : ${commandStatusIcon(winHttpCommand)}`,
    `- Mode : ${winHttpDirect ? 'Accès direct, sans proxy' : 'Proxy détecté ou sortie à vérifier'}`,
    ``,

    `👤 Proxy utilisateur Windows`,
    `- Proxy activé : ${proxyEnabled ? 'Oui' : 'Non'}`,
    `- Serveur proxy : ${proxyServer}`,
    `- Script automatique PAC : ${autoConfigUrl}`,
    ``,

    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}

function formatMicrosoftJsonDate(value) {
  if (!value) return 'Non détecté';

  const raw = String(value);
  const match = raw.match(/\/Date\((\d+)\)\//);

  if (match) {
    const date = new Date(Number(match[1]));
    if (Number.isFinite(date.getTime())) {
      return date.toLocaleString('fr-FR');
    }
  }

  const date = new Date(value);
  if (Number.isFinite(date.getTime())) {
    return date.toLocaleString('fr-FR');
  }

  return raw;
}

function eventLevelIcon(level) {
  const value = String(level || '').toLowerCase();

  if (value.includes('critique') || value.includes('critical')) return '🔴 Critique';
  if (value.includes('erreur') || value.includes('error')) return '🔴 Erreur';
  if (value.includes('avertissement') || value.includes('warning')) return '🟠 Avertissement';

  return level || 'Non détecté';
}

function shortenEventMessage(message, max = 220) {
  const clean = cleanDiagnosticText(message, max + 50)
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= max) return clean;

  return `${clean.slice(0, max).trim()}...`;
}

function summarizeEvents(events) {
  const grouped = new Map();

  for (const event of events) {
    const key = [
      event.ProviderName || 'Unknown',
      event.Id || 'Unknown',
      event.LevelDisplayName || 'Unknown'
    ].join('|');

    if (!grouped.has(key)) {
      grouped.set(key, {
        provider: event.ProviderName || 'Non détecté',
        id: event.Id || 'Non détecté',
        level: event.LevelDisplayName || 'Non détecté',
        count: 0,
        latest: event.TimeCreated,
        message: event.Message || ''
      });
    }

    const item = grouped.get(key);
    item.count += 1;

    const currentDate = new Date(String(item.latest).replace(/\/Date\((\d+)\)\//, '$1'));
    const eventDate = new Date(String(event.TimeCreated).replace(/\/Date\((\d+)\)\//, '$1'));

    if (Number.isFinite(eventDate.getTime()) && (!Number.isFinite(currentDate.getTime()) || eventDate > currentDate)) {
      item.latest = event.TimeCreated;
      item.message = event.Message || item.message;
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function formatEventGroup(title, events) {
  if (!events.length) {
    return [
      title,
      '- Aucun événement critique, erreur ou avertissement détecté.'
    ].join('\n');
  }

  const summary = summarizeEvents(events);

  return [
    title,
    summary.map(item => {
      return [
        `- ${eventLevelIcon(item.level)} — ${item.provider} — ID ${item.id}`,
        `  Occurrences : ${item.count}`,
        `  Dernier événement : ${formatMicrosoftJsonDate(item.latest)}`,
        `  Message : ${shortenEventMessage(item.message)}`
      ].join('\n');
    }).join('\n\n')
  ].join('\n');
}

function formatEventLogSummaryResult(result) {
  const systemCommand = findCommand(result, "LogName='System'") || findCommand(result, 'LogName=System');
  const appCommand = findCommand(result, "LogName='Application'") || findCommand(result, 'LogName=Application');

  const systemEvents = asArray(safeJsonParseAny(systemCommand?.stdout));
  const appEvents = asArray(safeJsonParseAny(appCommand?.stdout));

  const totalEvents = systemEvents.length + appEvents.length;
  const errorEvents = [...systemEvents, ...appEvents].filter(event => {
    const level = String(event.LevelDisplayName || '').toLowerCase();
    return level.includes('erreur') || level.includes('error') || level.includes('critique') || level.includes('critical');
  });

  const warningEvents = [...systemEvents, ...appEvents].filter(event => {
    const level = String(event.LevelDisplayName || '').toLowerCase();
    return level.includes('avertissement') || level.includes('warning');
  });

  const conclusion = [];

  if (totalEvents === 0) {
    conclusion.push('Aucun événement système ou application important détecté dans la limite analysée.');
  } else {
    conclusion.push(`${totalEvents} événement(s) important(s) détecté(s) dans les journaux Système et Application.`);
  }

  if (errorEvents.length) {
    conclusion.push(`${errorEvents.length} erreur(s) détectée(s). Vérifier les événements récurrents ci-dessus.`);
  }

  if (warningEvents.length) {
    conclusion.push(`${warningEvents.length} avertissement(s) détecté(s).`);
  }

  const kernelPowerEvents = systemEvents.filter(event =>
    String(event.ProviderName || '').toLowerCase().includes('kernel-processor-power')
  );

  if (kernelPowerEvents.length) {
    conclusion.push('Des avertissements Kernel-Processor-Power sont présents. Cela peut être lié à une limitation CPU par le firmware, BIOS, alimentation ou gestion d’énergie.');
  }

  const perflibEvents = appEvents.filter(event =>
    String(event.ProviderName || '').toLowerCase().includes('perflib')
  );

  if (perflibEvents.length) {
    conclusion.push('Des erreurs Perflib sont présentes. Elles concernent souvent des compteurs de performance Windows et ne sont pas toujours bloquantes.');
  }

  return [
    formatDiagnosticHeader(result, 'Résumé des journaux Windows terminé'),
    ``,

    `📊 Vue globale`,
    `- Événements analysés : ${totalEvents}`,
    `- Erreurs : ${errorEvents.length}`,
    `- Avertissements : ${warningEvents.length}`,
    ``,

    formatEventGroup('🖥️ Journal Système', systemEvents),
    ``,

    formatEventGroup('📦 Journal Application', appEvents),
    ``,

    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}
function formatStorageGb(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return 'Non détecté';

  return `${number.toFixed(2)} Go`;
}

function formatTempCleanupLightResult(result) {
  const command = findCommand(result, 'BeforeFreeGB') || findCommand(result, 'Clear-RecycleBin') || (result.results || [])[0];

  const data = safeJsonParseAny(command?.stdout) || {};

  const beforeFree = Number(data.BeforeFreeGB);
  const afterFree = Number(data.AfterFreeGB);
  const freed = Number(data.FreedGB);

  const hasValidData =
    Number.isFinite(beforeFree) ||
    Number.isFinite(afterFree) ||
    Number.isFinite(freed);

  const conclusion = [];

  if (Number.isFinite(freed) && freed > 1) {
    conclusion.push(`Nettoyage efficace : environ ${formatStorageGb(freed)} libérés.`);
  } else if (Number.isFinite(freed) && freed > 0) {
    conclusion.push(`Nettoyage léger effectué : environ ${formatStorageGb(freed)} libérés.`);
  } else if (Number.isFinite(freed)) {
    conclusion.push('Nettoyage terminé, mais aucun espace significatif n’a été libéré.');
  } else {
    conclusion.push('Nettoyage terminé, mais l’espace libéré n’a pas pu être calculé.');
  }

  conclusion.push('Les fichiers temporaires utilisateur, le dossier Temp Windows et la corbeille ont été nettoyés si accessibles.');

  return [
    formatDiagnosticHeader(result, 'Nettoyage temporaire terminé'),
    ``,

    `🧹 Nettoyage effectué`,
    `- Statut : ${commandStatusIcon(command)}`,
    `- Fichiers temporaires utilisateur : nettoyés si accessibles`,
    `- Fichiers temporaires Windows : nettoyés si accessibles`,
    `- Corbeille : vidée si accessible`,
    ``,

    `💾 Espace disque C:`,
    hasValidData
      ? [
          `- Avant nettoyage : ${formatStorageGb(beforeFree)}`,
          `- Après nettoyage : ${formatStorageGb(afterFree)}`,
          `- Espace libéré : ${formatStorageGb(freed)}`
        ].join('\n')
      : '- Données disque non disponibles',
    ``,

    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}
function bitlockerVolumeStatusLabel(value) {
  const code = Number(value);

  const labels = {
    0: 'Entièrement déchiffré',
    1: 'Entièrement chiffré',
    2: 'Chiffrement en cours',
    3: 'Déchiffrement en cours',
    4: 'Chiffrement suspendu',
    5: 'Déchiffrement suspendu',
    6: 'Chiffrement en attente',
    7: 'Déchiffrement en attente'
  };

  return labels[code] || `Code ${value}`;
}

function bitlockerProtectionStatusLabel(value) {
  const code = Number(value);

  const labels = {
    0: 'Protection désactivée',
    1: 'Protection activée',
    2: 'Protection inconnue'
  };

  return labels[code] || `Code ${value}`;
}

function formatBitlockerStatusResult(result) {
  const command =
    findCommand(result, 'Get-BitLockerVolume') ||
    (result.results || [])[0];

  const volumes = asArray(safeJsonParseAny(command?.stdout));

  const encryptedVolumes = volumes.filter(volume =>
    Number(volume.EncryptionPercentage) > 0 ||
    Number(volume.ProtectionStatus) === 1
  );

  const unprotectedVolumes = volumes.filter(volume =>
    Number(volume.ProtectionStatus) === 0
  );

  const conclusion = [];

  if (!volumes.length) {
    conclusion.push('Aucun volume BitLocker détecté ou les informations BitLocker ne sont pas accessibles.');
  } else if (encryptedVolumes.length === 0) {
    conclusion.push('Aucun volume chiffré par BitLocker n’a été détecté.');
  } else {
    conclusion.push(`${encryptedVolumes.length} volume(s) semblent chiffrés ou protégés par BitLocker.`);
  }

  if (unprotectedVolumes.length) {
    conclusion.push(`${unprotectedVolumes.length} volume(s) ont la protection BitLocker désactivée.`);
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic BitLocker terminé'),
    ``,

    `🔐 État BitLocker`,
    `- Statut commande : ${commandStatusIcon(command)}`,
    ``,

    volumes.length
      ? volumes.map(volume => {
          return [
            `💽 Volume ${volume.MountPoint || 'Non détecté'}`,
            `- État du volume : ${bitlockerVolumeStatusLabel(volume.VolumeStatus)}`,
            `- Protection : ${bitlockerProtectionStatusLabel(volume.ProtectionStatus)}`,
            `- Chiffrement : ${volume.EncryptionPercentage ?? 0}%`
          ].join('\n');
        }).join('\n\n')
      : `- Aucun volume détecté`,
    ``,

    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}

function formatVpnStatus(value) {
  const text = String(value || '').trim();

  if (!text) return 'Non détecté';

  const lower = text.toLowerCase();

  if (lower === 'connected') return 'Connecté';
  if (lower === 'disconnected') return 'Déconnecté';
  if (lower === 'connecting') return 'Connexion en cours';

  return text;
}

function formatVpnDiagnosticsResult(result) {
  const vpnConnectionCommand =
    findCommand(result, 'Get-VpnConnection') ||
    (result.results || [])[0];

  const vpnAdapterCommand =
    findCommand(result, 'Get-NetAdapter') ||
    (result.results || [])[1];

  const vpnConnections = asArray(safeJsonParseAny(vpnConnectionCommand?.stdout));
  const vpnAdapters = asArray(safeJsonParseAny(vpnAdapterCommand?.stdout));

  const conclusion = [];

  if (!vpnConnections.length) {
    conclusion.push('Aucun profil VPN Windows natif n’a été détecté.');
  } else {
    conclusion.push(`${vpnConnections.length} profil(s) VPN Windows détecté(s).`);
  }

  if (!vpnAdapters.length) {
    conclusion.push('Aucune carte réseau VPN/TAP/TUN connue n’a été détectée.');
  } else {
    conclusion.push(`${vpnAdapters.length} adaptateur(s) VPN détecté(s).`);
  }

  if (!vpnConnections.length && !vpnAdapters.length) {
    conclusion.push('Le poste ne semble pas utiliser de VPN au moment du diagnostic.');
  }

  return [
    formatDiagnosticHeader(result, 'Diagnostic VPN terminé'),
    ``,

    `🔐 Profils VPN Windows`,
    `- Statut commande : ${commandStatusIcon(vpnConnectionCommand)}`,
    vpnConnections.length
      ? vpnConnections.map(vpn => {
          return [
            `- ${vpn.Name || 'VPN sans nom'}`,
            `  Serveur : ${vpn.ServerAddress || 'Non détecté'}`,
            `  Statut : ${formatVpnStatus(vpn.ConnectionStatus)}`,
            `  Type tunnel : ${vpn.TunnelType || 'Non détecté'}`,
            `  Authentification : ${vpn.AuthenticationMethod || 'Non détecté'}`
          ].join('\n');
        }).join('\n')
      : `- Aucun profil VPN détecté`,
    ``,

    `🌐 Adaptateurs VPN détectés`,
    `- Statut commande : ${commandStatusIcon(vpnAdapterCommand)}`,
    vpnAdapters.length
      ? vpnAdapters.map(adapter => {
          return [
            `- ${adapter.Name || 'Adaptateur sans nom'}`,
            `  Description : ${adapter.InterfaceDescription || 'Non détecté'}`,
            `  Statut : ${adapter.Status || 'Non détecté'}`,
            `  Vitesse : ${adapter.LinkSpeed || 'Non détecté'}`
          ].join('\n');
        }).join('\n')
      : `- Aucun adaptateur VPN/TAP/TUN détecté`,
    ``,

    `🧾 Conclusion`,
    conclusion.map(x => `- ${x}`).join('\n')
  ].join('\n').slice(0, 7000);
}

function formatDiagnosticResultForTeams(result) {
  if (!result) {
    return 'Aucun résultat de diagnostic disponible.';
  }

  switch (result.type) {
    case 'network_basic':
      return formatNetworkBasicResult(result);
      
case 'vpn_diagnostics':
  return formatVpnDiagnosticsResult(result);

case 'bitlocker_status':
  return formatBitlockerStatusResult(result);

case 'temp_cleanup_light':
  return formatTempCleanupLightResult(result);

case 'eventlog_summary':
  return formatEventLogSummaryResult(result);

case 'proxy_diagnostics':
  return formatProxyDiagnosticsResult(result);

case 'office_diagnostics':
  return formatOfficeDiagnosticsResult(result);

case 'find_switch_port':
  return formatSwitchPortResult(result);

case 'windows_update':
  return formatWindowsUpdateResult(result);

case 'battery_health':
  return formatBatteryHealthResult(result);

case 'speedtest_cli':
  return formatSpeedtestResult(result);

case 'renew_ip':
  return formatRepairActionResult(
    result,
    'Renouvellement IP terminé',
    'L’adresse IP a été renouvelée et le cache DNS a été vidé.'
  );

case 'restart_network_adapter':
  return formatRepairActionResult(
    result,
    'Redémarrage carte réseau terminé',
    'La carte réseau active a été redémarrée.'
  );

case 'network_stack_reset':
  return formatRepairActionResult(
    result,
    'Réinitialisation réseau terminée',
    'La pile réseau a été réinitialisée. Un redémarrage du poste peut être nécessaire.'
  );

case 'restart_print_spooler':
  return formatRepairActionResult(
    result,
    'Redémarrage spouleur terminé',
    'Le spouleur d’impression a été redémarré.'
  );

case 'windows_update_scan':
  return formatRepairActionResult(
    result,
    'Scan Windows Update lancé',
    'Le scan Windows Update a été déclenché.'
  );

case 'windows_update_repair':
  return formatRepairActionResult(
    result,
    'Réparation Windows Update terminée',
    'Les composants Windows Update ont été réinitialisés.'
  );

case 'sfc_scan':
  return formatRepairActionResult(
    result,
    'Scan SFC terminé',
    'Le scan SFC a été exécuté. Vérifier la sortie pour savoir si des fichiers ont été réparés.'
  );

case 'dism_restorehealth':
  return formatRepairActionResult(
    result,
    'Réparation DISM terminée',
    'DISM RestoreHealth a été exécuté.'
  );

case 'gpupdate_force':
  return formatRepairActionResult(
    result,
    'Mise à jour GPO terminée',
    'Les stratégies de groupe ont été mises à jour.'
  );

case 'restart_teams':
  return formatRepairActionResult(
    result,
    'Redémarrage Teams terminé',
    'Microsoft Teams a été fermé ou redémarré.'
  );

case 'clear_teams_cache':
  return formatRepairActionResult(
    result,
    'Nettoyage cache Teams terminé',
    'Le cache Microsoft Teams a été nettoyé.'
  );

case 'restart_outlook':
  return formatRepairActionResult(
    result,
    'Redémarrage Outlook terminé',
    'Microsoft Outlook a été fermé. L’utilisateur peut le relancer.'
  );

case 'clear_browser_cache':
  return formatRepairActionResult(
    result,
    'Nettoyage cache navigateur terminé',
    'Les caches Chrome/Edge ont été nettoyés si présents.'
  );

case 'restart_computer':
  return formatRepairActionResult(
    result,
    'Redémarrage poste planifié',
    'Le redémarrage du poste a été planifié avec un délai de 60 secondes.'
  );

case 'defender_security':
  return formatDefenderSecurityResult(result);

case 'remote_access':
  return formatRemoteAccessResult(result);

case 'wifi_diagnostics':
  return formatWifiDiagnosticsResult(result);

case 'user_session':
  return formatUserSessionResult(result);

    case 'network_advanced':
      return formatNetworkAdvancedResult(result);

    case 'printer_basic':
      return formatPrinterBasicResult(result);

    case 'system_basic':
      return formatSystemBasicResult(result);

    case 'system_health':
      return formatSystemHealthResult(result);

    case 'storage_management':
      return formatStorageManagementResult(result);

    case 'security_audit':
      return formatSecurityAuditResult(result);

    default:
      return [
        formatDiagnosticHeader(result, 'Diagnostic terminé'),
        ``,
        `📋 Résultats`,
        ...(result.results || []).map(item => {
          return [
            `Commande : ${item.command}`,
            `Statut : ${commandStatusIcon(item)}`,
            cleanDiagnosticText(item.stdout || item.stderr || item.error, 1000)
          ].join('\n');
        })
      ].join('\n\n').slice(0, 7000);
  }
}

async function sendDiagnosticResultToTeams(job) {
  if (!job || !job.conversationReference || !job.result || !teamsAdapter) {
    return false;
  }

  if (job.resultSentToTeams) {
    return true;
  }

  try {
    try {
      const { MicrosoftAppCredentials } = require('botframework-connector');

      if (job.conversationReference.serviceUrl) {
        MicrosoftAppCredentials.trustServiceUrl(job.conversationReference.serviceUrl);
      }
    } catch (trustError) {
      console.warn('Could not trust Teams serviceUrl:', trustError?.message || trustError);
    }

    const formattedResult = formatDiagnosticResultForTeams(job.result);

    await teamsAdapter.continueConversation(job.conversationReference, async (turnContext) => {
      await turnContext.sendActivity(formattedResult);
    });

    job.resultSentToTeams = true;
    job.resultSentAt = new Date().toISOString();

    return true;
  } catch (err) {
    console.error('Failed to send diagnostic result to Teams:', err);
    return false;
  }
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
function normalizeIdentity(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^azuread\\/, '')
    .replace(/^domain\\/, '')
    .replace(/[^a-z0-9]/g, '');
}

function identityWords(value) {
  return String(value || '')
    .trim()
    .replace(/^azuread\\/i, '')
    .replace(/^domain\\/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(x => x.trim())
    .filter(x => x.length >= 2);
}

function identitiesLookSame(a, b) {
  const compactA = normalizeIdentity(a);
  const compactB = normalizeIdentity(b);

  if (!compactA || !compactB) return false;

  if (compactA === compactB) return true;
  if (compactA.includes(compactB)) return true;
  if (compactB.includes(compactA)) return true;

  const wordsA = identityWords(a);
  const wordsB = identityWords(b);

  if (!wordsA.length || !wordsB.length) return false;

  const hits = wordsA.filter(wordA =>
    wordsB.some(wordB =>
      wordA === wordB ||
      wordA.includes(wordB) ||
      wordB.includes(wordA)
    )
  );

  return hits.length >= 2;
}

function findDeviceForTeamsUser(userEmail, userName) {
  const onlineDevices = getOnlineDevices();

  const emailPrefix = String(userEmail || '').split('@')[0];

  const candidates = [
    userName,
    userEmail,
    emailPrefix
  ].filter(Boolean);

  const matches = onlineDevices.filter(device => {
    const deviceValues = [
      device.username,
      device.windowsUsername,
      device.hostname,
      device.deviceId
    ].filter(Boolean);

    return candidates.some(candidate =>
      deviceValues.some(deviceValue =>
        identitiesLookSame(candidate, deviceValue)
      )
    );
  });

  console.log('Device auto-match debug:', {
    userEmail,
    userName,
    candidates,
    onlineDevices: onlineDevices.map(device => ({
      deviceId: device.deviceId,
      username: device.username,
      hostname: device.hostname,
      ip: device.ip
    })),
    matches: matches.map(device => device.deviceId)
  });

  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

function findDeviceForTeamsUser(userEmail, userName) {
  const onlineDevices = getOnlineDevices();

  const emailPrefix = String(userEmail || '').split('@')[0];
  const candidates = [
    normalizeIdentity(userName),
    normalizeIdentity(emailPrefix),
    normalizeIdentity(userEmail)
  ].filter(Boolean);

  const matches = onlineDevices.filter(device => {
    const deviceUsername = normalizeIdentity(device.username);
    const deviceHostname = normalizeIdentity(device.hostname);
    const deviceId = normalizeIdentity(device.deviceId);

    return candidates.some(candidate =>
      candidate &&
      (
        deviceUsername === candidate ||
        deviceUsername.includes(candidate) ||
        candidate.includes(deviceUsername) ||
        deviceHostname === candidate ||
        deviceId === candidate
      )
    );
  });

  if (matches.length === 1) {
    return matches[0];
  }

  return null;
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
// PC agent: get next diagnostic job
if (req.method === 'GET' && req.url.startsWith('/api/agent/jobs')) {
  try {
    const token = req.headers['x-agent-token'];

    if (!process.env.AGENT_TOKEN || token !== process.env.AGENT_TOKEN) {
      return sendJsonResponse(res, 401, { error: 'unauthorized_agent' });
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    const deviceId = url.searchParams.get('deviceId');
    const hostname = url.searchParams.get('hostname');
    const ip = url.searchParams.get('ip');
    const username = url.searchParams.get('username');

    if (!deviceId) {
      return sendJsonResponse(res, 400, { error: 'missing_deviceId' });
    }

    const normalizedDeviceId = normalizeDeviceId(deviceId);

    touchAgentDevice(normalizedDeviceId, {
      state: 'polling',
      ip: ip || null,
      ips: ip ? [ip] : [],
      username: username || null,
      hostname: hostname || normalizedDeviceId
    });

    const job = diagnosticJobs.find(j =>
      normalizeDeviceId(j.deviceId) === normalizedDeviceId &&
      j.status === 'pending'
    );

    if (!job) {
      return sendJsonResponse(res, 200, { job: null });
    }

    job.status = 'running';
    job.startedAt = new Date().toISOString();

    return sendJsonResponse(res, 200, { job });
  } catch (err) {
    console.error('/api/agent/jobs failed:', err);
    return sendJsonResponse(res, 500, {
      error: 'agent_jobs_failed',
      message: err.message || String(err)
    });
  }
}

// PC agent: send diagnostic result
if (req.method === 'POST' && req.url === '/api/agent/jobs/result') {
  const token = req.headers['x-agent-token'];

  if (!process.env.AGENT_TOKEN || token !== process.env.AGENT_TOKEN) {
    return sendJsonResponse(res, 401, { error: 'unauthorized_agent' });
  }

  const body = await readJson(req);
  const job = diagnosticJobs.find(j => j.id === body.jobId);

  if (!job) {
    return sendJsonResponse(res, 404, { error: 'job_not_found' });
  }

job.status = 'completed';
job.result = body.result;
job.completedAt = new Date().toISOString();

touchAgentDevice(job.deviceId, {
  state: 'completed',
  lastJobId: job.id,
  lastResultAt: job.completedAt
});

const sentToTeams = await sendDiagnosticResultToTeams(job);

return sendJsonResponse(res, 200, {
  success: true,
  sentToTeams
});
}

// Agent devices list
if (req.method === 'GET' && req.url.startsWith('/api/agent/devices')) {
  return sendJsonResponse(res, 200, {
    devices: getOnlineDevices()
  });
}
// Teams: get latest diagnostic result
if (req.method === 'GET' && req.url.startsWith('/api/diagnostics/latest')) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
const deviceId = normalizeDeviceId(url.searchParams.get('deviceId'));

  const jobs = diagnosticJobs
  .filter(j => normalizeDeviceId(j.deviceId) === deviceId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return sendJsonResponse(res, 200, {
    job: jobs[0] || null
  });
}
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
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY, X-Agent-Token');

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
