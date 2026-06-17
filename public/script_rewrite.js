
// === D4B IT Support Assistant ===
// Enhanced chatbot with a French-only user experience for D4B IT support

// --- APPROVAL GATE ---
// --- flags ---
window.SERVICE_LOGGING = true;   // turn off if anything looks weird
window.EMERGENCY_LOGGING = false; // leave OFF for now

// Version banner
console.log(' D4B Chatbot v2.2 - Request Logging Enabled');

// Gate all sends until approved
window.__D4B_APPROVED__ = false;

// Flip this when approval arrives (from chat.html script after polling success):
window.d4bMarkApproved = function() {
  window.__D4B_APPROVED__ = true;
};

// Service request detection utilities
function norm(s) { 
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''); 
}

const IT_CRITICAL = /\b(system down|systÃ¨me down|caisse bloquÃ©e|caisse en panne|paiement refusÃ©|paiement impossible|transaction refusÃ©e|rÃ©seau coupÃ©|connexion perdue|wifi down|internet down|Ã©lectricitÃ©|alimentation|power outage|panne Ã©lectrique|incident critique|incident de sÃ©curitÃ©|danger|fumÃ©e|gaz)\b/i;

const IT_SERVICE_KEYWORDS = /\b(incident|probl[eÃ¨]me|aide|support|panne|caisse|pos|aloha|ncr|red biscuit|r[eÃ©]seau|wifi|internet|connexion|imprimante|printer|[Ã©e]cran|terminal|logiciel|software|mdp|login|authentification|paiement|ticket|promotion|promo|menu|gestion du menu|configuration|badge|identifiant)\b/i;

const HARD = /\b(urgent|urgence|critique|bloqu[eÃ©]|bloqu[eÃ©]e|down|panne|incident|caisse bloqu[eÃ©]e|caisse en panne|paiement refus[eÃ©]|paiement impossible|transaction refus[eÃ©]|r[eÃ©]seau coup[eÃ©]|connexion perdue|wifi down|internet down|[Ã©e]lectricit[eÃ©]|alimentation|power outage|panne [Ã©e]lectrique)\b/i;
const INTENT = /\b(incident|probl[eÃ¨]me|support|aide|panne|caisse|pos|aloha|ncr|red biscuit|r[eÃ©]seau|wifi|internet|connexion|imprimante|printer|terminal|login|mot de passe|paiement|promo|promotion|menu)\b/i;

// Expose to window as globals to prevent ReferenceError in older cached contexts
try {
  window.HARD = HARD;
  window.INTENT = INTENT;
} catch (e) {
  // ignore (e.g., Node.js environment)
}

const SYSTEM_LOTS = [
  { lot: 'Lot 2 - Gestion Menu D4B', match: /\b(gestion du menu|mise Ã  jour du menu|promotion|promo|menu)\b/i },
  { lot: 'Lot 3 - Support POS', match: /\b(pos|terminal|kds|kitchen display|tpv|caisse|logiciel|application)\b/i },
  { lot: 'Lot 1 - Helpdesk / Service Desk', match: /\b(r[eÃ©]seau|wifi|internet|connexion|imprimante|terminal|[Ã©e]lectricit[eÃ©]|alimentation|incident|panne|support|aide|probl[eÃ¨]me)\b/i }
];

function parseD4BOrder(message) {
  return null; // no food ordering support in IT ticketing mode
}

function isServicey(text) { 
  const t = norm(text); 
  return IT_SERVICE_KEYWORDS.test(t) || IT_CRITICAL.test(t); 
}

// Legacy function for backward compatibility
function looksLikeServiceRequest(text) {
  return isServicey(text);
}

// Request confirmation messages for IT support requests
const CONFIRM_MESSAGES = {
  P1: {
    FR: "Votre incident critique a Ã©tÃ© enregistrÃ© avec la prioritÃ© P1. Notre Ã©quipe support IT interviendra sous 2 heures."
  },
  P2: {
    FR: "Votre demande urgente a Ã©tÃ© enregistrÃ©e avec la prioritÃ© P2. Nous y rÃ©pondrons sous 24 heures."
  },
  P3: {
    FR: "Votre demande a Ã©tÃ© enregistrÃ©e avec la prioritÃ© P3. Elle sera traitÃ©e sous 72 heures."
  },
  P4: {
    FR: "Votre demande a Ã©tÃ© enregistrÃ©e avec la prioritÃ© P4. Elle sera programmÃ©e sous 7 jours."
  },
  default: {
    FR: "Votre demande a Ã©tÃ© enregistrÃ©e. Notre Ã©quipe de support vous recontactera sous peu."
  }
};

function getConfirmationMessage(text, summary = {}) {
  const lang = 'FR';
  const priority = summary.priority || 'default';
  const serviceLot = summary.serviceLot || 'Lot 1 - Helpdesk / Service Desk';
  const deadline = summary.slaDeadline ? ` Date limite : ${summary.slaDeadline}` : '';

  if (CONFIRM_MESSAGES[priority]) {
    return `${CONFIRM_MESSAGES[priority].FR} ${serviceLot}.${deadline}`.trim();
  }
  return `${CONFIRM_MESSAGES.default.FR} ${serviceLot}.${deadline}`.trim();
}

function getServiceSpecificResponse(text) {
  const lang = 'FR';
  const lowerText = text.toLowerCase();

  const responses = {
    FR: {
      network: "Je comprends qu'il s'agit d'un incident réseau ou de connectivité. Je le transférerai à l'équipe infrastructure IT.",
      aloha: "This looks like an Aloha/POS incident. I will route it to the Menu Management Aloha team.",
      redbiscuit: "This appears to be a menu management issue for Red Biscuit. I will forward it to the appropriate support lot.",
      default: "I have logged your IT support request and will route it to the correct team."
    },
    FR: {
      network: "Je comprends qu'il s'agit d'un incident rÃ©seau ou de connectivitÃ©. Je le transfÃ©rerai Ã  l'Ã©quipe infrastructure IT.",
      aloha: "Il semble s'agir d'un incident Aloha/POS. Je l'orienterai vers le lot Menu Management Aloha.",
      redbiscuit: "Ceci semble Ãªtre un problÃ¨me de gestion menu Red Biscuit. Je le transmettrai au bon lot de support.",
      default: "J'ai bien enregistrÃ© votre demande de support IT et je la dirige vers l'Ã©quipe appropriÃ©e."
    },
    AR: {
      network: "Ø£ÙÙ‡Ù… Ø£Ù† Ù‡Ø°Ø§ Ø­Ø§Ø¯Ø« Ø´Ø¨ÙƒØ© Ø£Ùˆ Ø§ØªØµØ§Ù„. Ø³Ø£Ù‚ÙˆÙ… Ø¨ØªÙˆØ¬ÙŠÙ‡Ù‡ Ø¥Ù„Ù‰ ÙØ±ÙŠÙ‚ Ø§Ù„Ø¨Ù†ÙŠØ© Ø§Ù„ØªØ­ØªÙŠØ© Ø§Ù„ØªÙ‚Ù†ÙŠØ©.",
      aloha: "ÙŠØ¨Ø¯Ùˆ Ø£Ù† Ù‡Ø°Ø§ Ø­Ø§Ø¯Ø« Aloha/POS. Ø³Ø£ÙˆØ¬Ù‡Ù‡ Ø¥Ù„Ù‰ ÙØ±ÙŠÙ‚ Ø¯Ø¹Ù… Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Aloha.",
      redbiscuit: "ÙŠØ¨Ø¯Ùˆ Ø£Ù† Ù‡Ø°Ù‡ Ù…Ø´ÙƒÙ„Ø© ÙÙŠ Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Red Biscuit. Ø³Ø£Ø­ÙˆÙ„Ù‡Ø§ Ø¥Ù„Ù‰ Ø§Ù„ÙØ±ÙŠÙ‚ Ø§Ù„Ù…Ù†Ø§Ø³Ø¨.",
      default: "ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø·Ù„Ø¨ Ø§Ù„Ø¯Ø¹Ù… Ø§Ù„ÙÙ†ÙŠ Ø§Ù„Ø®Ø§Øµ Ø¨Ùƒ ÙˆØ³Ø£ÙˆØ¬Ù‡Ù‡ Ø¥Ù„Ù‰ Ø§Ù„ÙØ±ÙŠÙ‚ Ø§Ù„Ù…Ù†Ø§Ø³Ø¨."
    }
  };

  if (/\b(r[eÃ©]seau|wifi|internet|connexion)\b/.test(lowerText)) return responses[lang].network;
  if (/\b(aloha|ncr|pos|caisse|terminal|kds|tpv)\b/.test(lowerText)) return responses[lang].aloha;
  if (/\b(red biscuit|menu|promotion|promo|gestion du menu)\b/.test(lowerText)) return responses[lang].redbiscuit;
  return responses[lang].default;
}

function calculateSlaDeadline(priority) {
  const now = new Date();
  const hoursByPriority = { P1: 2, P2: 24, P3: 72, P4: 168 };
  const hours = hoursByPriority[priority] || 168;
  const deadline = new Date(now.getTime() + hours * 60 * 60 * 1000);
  return deadline.toISOString();
}

// --- TROUBLESHOOTING FLOWS ---
const TROUBLESHOOT_FLOWS = {
  'Menu Management Aloha': {
    EN: [
      "Please restart the POS terminal by powering it off for 30 seconds and then powering it back on. Did that fix the issue?",
      "Please check the network cable and Wiâ€‘Fi indicator on the terminal. Is the network connected?",
      "If the POS still fails to process payments, try logging out and logging back into the POS application. Did that resolve it?"
    ],
    FR: [
      "Veuillez redÃ©marrer le terminal POS en l'Ã©teignant pendant 30 secondes, puis en le rallumant. Cela a-t-il rÃ©solu le problÃ¨me ?",
      "Veuillez vÃ©rifier le cÃ¢ble rÃ©seau et l'indicateur Wi-Fi du terminal. Le rÃ©seau est-il connectÃ© ?",
      "Si le POS ne traite toujours pas les paiements, essayez de vous dÃ©connecter et de vous reconnecter Ã  l'application POS. Cela a-t-il rÃ©solu le problÃ¨me ?"
    ]
  },
  'Menu Management Red Biscuit': {
    EN: [
      "Verify that the Red Biscuit feed service is running on the content server. Can you confirm service status?",
      "Try re-publishing the menu item in Red Biscuit and wait 2 minutes for sync. Did the item appear?",
      "If sync still fails, please capture the error message shown in the Red Biscuit admin and paste it here."
    ],
    FR: [
      "VÃ©rifiez que le service de flux Red Biscuit fonctionne sur le serveur de contenu. Pouvez-vous confirmer l'Ã©tat du service ?",
      "Essayez de republier l'Ã©lÃ©ment de menu dans Red Biscuit et attendez 2 minutes pour la synchronisation. L'Ã©lÃ©ment a-t-il apparu ?",
      "Si la synchronisation Ã©choue toujours, veuillez capturer le message d'erreur affichÃ© dans l'administration Red Biscuit et le coller ici."
    ]
  },
  'Technical Issue': {
    EN: [
      "Please check that the restaurant network (router) shows an internet connection. Can you see other websites from a store PC?",
      "If the network is down, reboot the router and check the WAN/Internet LED. Did that restore connectivity?",
      "If the issue persists, note the router model and WAN status and I'll create a ticket for the network team."
    ],
    FR: [
      "Veuillez vÃ©rifier que le rÃ©seau du restaurant (routeur) affiche une connexion Internet. Pouvez-vous voir d'autres sites Web Ã  partir d'un PC du magasin ?",
      "Si le rÃ©seau est hors ligne, redÃ©marrez le routeur et vÃ©rifiez la LED WAN/Internet. Cela a-t-il rÃ©tabli la connectivitÃ© ?",
      "Si le problÃ¨me persiste, notez le modÃ¨le du routeur et l'Ã©tat WAN et je crÃ©erai un ticket pour l'Ã©quipe rÃ©seau."
    ]
  },
  'General IT Support': {
    EN: [
      "Please describe the exact error and which device/model is affected (POS, printer, display). Can you provide that?",
      "Try rebooting the affected device. Did the problem go away after reboot?",
      "If not resolved, gather device logs or screenshots and I'll open a ticket for escalation."
    ],
    FR: [
      "Veuillez dÃ©crire l'erreur exacte et quel appareil/modÃ¨le est affectÃ© (POS, imprimante, Ã©cran). Pouvez-vous le fournir ?",
      "Essayez de redÃ©marrer l'appareil affectÃ©. Le problÃ¨me a-t-il disparu aprÃ¨s le redÃ©marrage ?",
      "Si non rÃ©solu, recueillez les journaux ou les captures d'Ã©cran de l'appareil et j'ouvrirai un ticket d'escalade."
    ]
  }
};

function getTroubleshootDiagnosisText(category, lang = 'EN') {
  const map = {
    'Menu Management Aloha': {
      EN: "This looks like a POS terminal issue affecting the cashier or payment flow.",
      FR: "Il semble s'agir d'un problÃ¨me de terminal POS affectant la caisse ou le paiement."
    },
    'Menu Management Red Biscuit': {
      EN: "This looks like a Red Biscuit content sync issue.",
      FR: "Il semble s'agir d'un problÃ¨me de synchronisation Red Biscuit."
    },
    'Technical Issue': {
      EN: "This looks like a network or connectivity issue in the restaurant.",
      FR: "Il semble s'agir d'un problÃ¨me de rÃ©seau ou de connectivitÃ© au restaurant."
    },
    'General IT Support': {
      EN: "This looks like a general IT incident that needs step-by-step troubleshooting.",
      FR: "Il semble s'agir d'un incident informatique gÃ©nÃ©ral nÃ©cessitant un dÃ©pannage Ã©tape par Ã©tape."
    }
  };
  const entry = map[category] || map['General IT Support'];
  return entry[lang] || entry.EN;
}

async function runTroubleshootFlow(msg, forcedCategory = null) {
  try {
    const cls = forcedCategory ? { category: forcedCategory } : summarizeRequest(msg);
    const category = cls.category || 'General IT Support';
    guest.intentMemory = guest.intentMemory || {};
    guest.intentMemory.troubleshoot = guest.intentMemory.troubleshoot || {};
    const key = category;
    const flowObj = TROUBLESHOOT_FLOWS[key] || TROUBLESHOOT_FLOWS['General IT Support'];
    
    // Determine which language to use
    const lang = (guest.lang || 'EN').toUpperCase();
    const stepsArray = flowObj[lang] || flowObj.EN || flowObj;
    
    // Handle old format (array) vs new format (object with EN/FR)
    const steps = Array.isArray(stepsArray) ? stepsArray : stepsArray;
    
    const state = guest.intentMemory.troubleshoot[key] || { step: 0 };
  if (!state.priority || !state.serviceLot || !state.category) {
    state.category = category;
    state.details = cls.details || msg;
    state.priority = cls.priority || 'P4';
    state.serviceLot = cls.serviceLot || 'Lot 1 - Helpdesk / Service Desk';
    state.slaDeadline = cls.slaDeadline || calculateSlaDeadline(state.priority);
    guest.intentMemory.troubleshoot[key] = state;
    saveGuestState();
  }

    // If there are still steps left, return next step and increment
    if (state.step < steps.length) {
      const isFirstStep = state.step === 0;
      const next = steps[state.step];
      state.step += 1;
      guest.intentMemory.troubleshoot[key] = state;
      saveGuestState();
      if (isFirstStep) {
        const diagnosis = getTroubleshootDiagnosisText(key, lang);
        return { step: `${diagnosis} ${next}`, done: false, category };
      }
      return { step: next, done: false, category };
    }

    // All steps exhausted -> signal escalation
    return { step: null, done: true, category };
  } catch (e) {
    console.warn('Troubleshoot flow failed', e);
    return { step: null, done: true, category: 'General IT Support' };
  }
}

// Client-side proxy to request Atera ticket creation via server
async function openAteraTicket(payload) {
  try {
    console.log('[Atera] Ticket payload:', payload);
    const res = await fetch('/api/atera', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('[Atera] Response status:', res.status);
    console.log('[Atera] Response data:', data);
    if (!res.ok) throw new Error(data?.error || data?.message || 'Atera proxy failure');
    return data;
  } catch (e) {
    console.error('[Atera] openAteraTicket failed:', e);
    return null;
  }
}

function buildAteraRequestPayload(summary, msg, finalName, finalRoom, sessionData) {
  const requestText = summary.details ? `${summary.category} - ${summary.details}` : `${summary.category} - ${msg}`;
  return {
    sessionId: sessionData.id || window.currentSessionId || null,
    name: finalName || sessionData.name || window.guest?.name || 'Guest',
    room: finalRoom || sessionData.room || window.guest?.room || 'TBD',
    email: sessionData.email || window.guest?.email || null,
    text: requestText,
    priority: summary.priority,
    serviceLot: summary.serviceLot,
    slaDeadline: summary.slaDeadline,
    category: summary.category,
    lang: sessionData.language || (navigator.language || '').slice(0, 2) || null
  };
}

async function queryAteraTicketsForWeb() {
  const sessionData = JSON.parse(localStorage.getItem('D4B_CURRENT_SESSION') || '{}');
  const guestInfo = getBestGuestInfo();
  const email = guestInfo?.email || sessionData.email || window.guest?.email || null;

  if (!email) {
    return askByLang(
      'Veuillez vous inscrire et fournir une adresse email pour que je puisse vÃ©rifier vos tickets.',
      'Veuillez vous inscrire et fournir une adresse email pour que je puisse vÃ©rifier vos tickets.',
      'ÙŠØ±Ø¬Ù‰ Ø§Ù„ØªØ³Ø¬ÙŠÙ„ ÙˆØªÙ‚Ø¯ÙŠÙ… Ø¨Ø±ÙŠØ¯ Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ Ø­ØªÙ‰ Ø£ØªÙ…ÙƒÙ† Ù…Ù† Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ØªØ°Ø§ÙƒØ±Ùƒ.'
    );
  }

  try {
    const res = await fetch(`/api/atera?endUserEmail=${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      console.error('Atera ticket lookup failed', res.status);
      return askByLang(
        'Impossible de rÃ©cupÃ©rer vos tickets pour le moment. RÃ©essayez plus tard.',
        'Impossible de rÃ©cupÃ©rer vos tickets pour le moment. RÃ©essayez plus tard.',
        'ÙŠØªØ¹Ø°Ø± Ø§Ø³ØªØ±Ø¯Ø§Ø¯ Ø§Ù„ØªØ°Ø§ÙƒØ± Ø§Ù„Ø®Ø§ØµØ© Ø¨Ùƒ Ø§Ù„Ø¢Ù†. ÙŠØ±Ø¬Ù‰ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù…Ø±Ø© Ø£Ø®Ø±Ù‰ Ù„Ø§Ø­Ù‚Ù‹Ø§.'
      );
    }

    const data = await res.json();
    const tickets = Array.isArray(data) ? data : (data.tickets || data.data || []);

    if (!tickets || tickets.length === 0) {
      return askByLang(
        'Aucun ticket trouvÃ© pour cette adresse email.',
        'Aucun ticket trouvÃ© pour cette adresse email.',
        'Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø£ÙŠ ØªØ°Ø§ÙƒØ± Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ.'
      );
    }

    const lines = tickets.slice(0, 10).map(ticket => {
      const id = ticket.id || ticket.ticketId || ticket.TicketID || ticket.TicketId || ticket.number || ticket.ticketNumber || 'N/A';
      const status = ticket.status || ticket.TicketStatus || ticket.State || ticket.state || 'Inconnu';
      const title = ticket.TicketTitle || ticket.title || ticket.subject || ticket.summary || ticket.description || 'Sans objet';
      const created = ticket.createdAt || ticket.created_on || ticket.CreatedOn || ticket.CreatedAt || ticket.created || '';
      return `â€¢ [${status}] ${title} (ID: ${id}${created ? ' â€” ' + created : ''})`;
    });

    return `<b>Vos tickets Atera :</b>\n${lines.join('\n')}`;
  } catch (err) {
    console.error('Atera ticket lookup error:', err);
    return askByLang(
      'Erreur lors de la recherche de vos tickets. Veuillez rÃ©essayer plus tard.',
      'Erreur lors de la recherche de vos tickets. Veuillez rÃ©essayer plus tard.',
      'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† ØªØ°Ø§ÙƒØ±Ùƒ. ÙŠØ±Ø¬Ù‰ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù…Ø±Ø© Ø£Ø®Ø±Ù‰ Ù„Ø§Ø­Ù‚Ù‹Ø§.'
    );
  }
}

async function logServiceRequest({ sessionId, name, room, text, priority = 'P4', serviceLot = 'Lot 1 - Helpdesk / Service Desk', slaDeadline = null, category = 'General IT Support', lang = null }) {
  if (!window.SERVICE_LOGGING) return null;

  const payload = { sessionId, name, room, text, priority, serviceLot, slaDeadline, category, lang };
  console.log('[REQ-LOG] POST payload', payload);

  try {
    const res = await fetch(`${window.location.origin}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('[REQ-LOG] POST result', res.status, res.statusText);
    
    // Return confirmation message if logging was successful
    if (res.ok) {
      return getConfirmationMessage(text, { priority, serviceLot, slaDeadline });
    }
  } catch (e) { 
    console.warn('logServiceRequest failed', e); 
  }
  
  return null;
}

// Function to sync guest state from session data
function syncGuestStateFromSession() {
  const sessionData = JSON.parse(localStorage.getItem('D4B_CURRENT_SESSION') || '{}');
  if (sessionData.name && sessionData.room) {
    console.log(`[SYNC] Syncing guest state from session: ${sessionData.name} (${sessionData.room})`);
    guest.name = sessionData.name;
    guest.room = sessionData.room;
    guest.memory.name = sessionData.name;
    guest.memory.room = sessionData.room;
    guest.guestInfoConfirmed = true;
    saveGuestState();
    return true;
  }
  return false;
}

// --- SYSTEM PROMPT ---
// French system prompt (preferred when guest.lang === 'FR')
const SYSTEM_PROMPT_FR = `Vous Ãªtes l'assistant support IT de Digital4Business. RÃ©pondez en franÃ§ais; aidez les Ã©quipes de D4B, France, Tunisie et Maurice pour la classification des incidents, l'orientation vers le bon lot (Lot 1 Helpdesk, Lot 2 Red Biscuit, Lot 3 Aloha) et l'estimation des SLA (P1 Ã  P4).

Utilisez cette typologie comme rÃ©fÃ©rence pour catÃ©goriser les incidents :
- CRITIQUE / P1 : incidents bloquants comme fermeture de restaurant, terminaux ou caisse indisponibles, panne rÃ©seau, ou toute situation empÃªchant le service.
- URGENT / P2 : incidents dÃ©gradants mais partiellement opÃ©rationnels comme erreurs d'imprimante, Ã©checs de connexion, rÃ©seau intermittent, problÃ¨mes KDS, synchronisation du menu ou erreur de caisse.
- MOYEN / P3 : incidents BackOffice ou administratifs tels que rapports, configuration, formation, support d'application non urgent ou surveillance.
- FAIBLE / P4 : demandes mineures, questions de documentation, conseils gÃ©nÃ©raux ou requÃªtes non critiques pour le service.

Pour les incidents P1, P2, P3 et P4, tentez d'abord un dÃ©pannage guidÃ© et aidez l'utilisateur Ã  rÃ©soudre le problÃ¨me. N'ouvrez un ticket Atera que si le problÃ¨me persiste aprÃ¨s ces Ã©tapes ou si l'utilisateur confirme qu'il n'est pas rÃ©solu.


Ne rÃ©pondez pas aux questions qui ne sont pas liÃ©es aux problÃ¨mes IT. Si l'utilisateur pose une question non liÃ©e, expliquez poliment que vous ne traitez que les incidents de support IT en restaurant et demandez-lui de dÃ©crire son problÃ¨me.

Si l'utilisateur rÃ©pond par un simple 'oui' pendant le dÃ©pannage, n'interprÃ©tez pas cela comme une rÃ©solution du problÃ¨me tant qu'il n'indique pas explicitement que c'est rÃ©solu.

Concentrez-vous sur l'identification du lot appropriÃ©, la prioritÃ© (P1 critique Ã  P4 faible), et fournissez des Ã©tapes de dÃ©pannage concises avant d'ouvrir un ticket. Utilisez un ton professionnel, clair et courtois. Ne pas utiliser de markdown ou d'emojis.`;


// --- BEHAVIOR CONFIGURATION ---
const ASK_INFO_ONCE = true;
const REPEAT_INFO_REQUEST = false;
const ENABLE_URGENCY_CLASSIFICATION = true;
const MAX_INFO_REQUESTS = 2;
const NATURAL_CONVERSATION = true;

// --- CORE STATE ---
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const FOLLOWUP_TIMEOUT_MS = 5 * 60 * 1000;

const guest = {
  name: null,
  room: null,
  lang: "EN",
  guestInfoConfirmed: false,
  guestInfoConfirmedOnce: false,
  pendingRequest: null,
  waitingForInfo: false,
  sessionMemory: {},
  processedRequests: [],
  
  // Session tracking
  sessionId: null,
  sessionStart: null,
  lastRequestTime: null,
  requestHistory: [],
  totalRequests: 0,
  fulfilledRequests: 0,
  activeSession: false,
  
  // Sanitization flags
  lastConfirmedName: null,
  lastConfirmedRoom: null,
  
  // Intent memory
  pastRequests: [],
  intentMemory: {},
  
  // Conversation flow
  lastIntent: null,
  lastMessage: null,
  contextAwareMode: false,
  
  // Info request tracking
  infoRequestRefused: false,
  infoRequestCount: 0,
  
  // Enhanced memory system
  memory: {
    name: null,
    room: null,
    symptoms: null,
    preferences: {},
    lastRequest: null,
    requestHistory: []
  }
};

// --- UTILITY FUNCTIONS ---
function sanitizeNameInput(rawName) {
  if (!rawName) return null;
  let name = String(rawName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name || null;
}

function extractGuestInfo(message) {
  if (!message) return { name: null, room: null, confidence: 0 };

  const text = String(message).trim();

  // name + table (robust)
  // Examples matched:
  // "slim 995", "SLIM, 995", "name slim table 995", "je m'appelle slim, table 995"
  // "table 998 name DALI", "table 998 nom DALI"
  const combos = [
    /^(?:my\s+name\s+is|je\s*m'?appelle|c['']est|nom|name)\s+(.+?)[,\s]+(?:room|chambre|table|ØºØ±ÙØ©)?\s*(\d{3,4})$/i,
    /^(.+?)[,\s]+(?:room|chambre|table|ØºØ±ÙØ©)\s*(\d{3,4})$/i,
    /^([a-zA-Z\u00C0-\u017F\u0600-\u06FF\s]+)\s+(\d{3,4})$/u,
    /^(?:room|chambre|table|ØºØ±ÙØ©)\s*(\d{3,4})[,\s]+(?:name|nom)\s+(.+)$/i,
    /^(?:room|chambre|table|ØºØ±ÙØ©)\s*(\d{3,4})[,\s]+(.+)$/i
  ];
  for (const re of combos) {
    const m = text.match(re);
    if (m) {
      let rawName, room;
      
      // Handle different pattern orders
      if (m[1] && m[2]) {
        // Check if first group is name or room
        if (/^\d{3,4}$/.test(m[1])) {
          // First group is room, second is name
          room = sanitizeRoomInput(m[1]);
          rawName = m[2].replace(/^(?:name|nom)\s+/i, "").trim();
        } else {
          // First group is name, second is room
          rawName = m[1].replace(/^(?:my\s+name\s+is|je\s*m'?appelle|c['']est|nom|name)\s+/i, "").trim();
          room = sanitizeRoomInput(m[2]);
        }
      }
      
      const name = sanitizeNameInput(rawName);
      if (name && room) return { name, room, confidence: 0.95 };
    }
  }

  // name only
  const nameOnly = text.match(/^(?:my\s+name\s+is|je\s*m'?appelle|c['']est|nom|name)\s+(.+)$/i);
  if (nameOnly) {
    const name = sanitizeNameInput(nameOnly[1]);
    if (name) return { name, room: null, confidence: 0.9 };
  }

  // table only
  const roomOnly = text.match(/^(?:room|chambre|table|ØºØ±ÙØ©)\s*(\d{3,4})$/i);
  if (roomOnly) {
    const room = sanitizeRoomInput(roomOnly[1]);
    if (room) return { name: null, room, confidence: 0.9 };
  }

  // Simple table number (just the number)
  const simpleRoom = text.match(/^(\d{3,4})$/);
  if (simpleRoom) {
    const room = sanitizeRoomInput(simpleRoom[1]);
    if (room) return { name: null, room, confidence: 0.8 };
  }

  // Simple name (just the name) - More restrictive
  // Only match if it looks like a proper name (not a phrase)
  const simpleName = text.match(/^([A-Z][a-z\u00C0-\u017F\u0600-\u06FF]+(?:\s+[A-Z][a-z\u00C0-\u017F\u0600-\u06FF]+)*)$/u);
  if (simpleName) {
    const name = sanitizeNameInput(simpleName[1]);
    if (name && isValidName(name)) {
      console.log(`[NER-FIX] Accepted simple name: "${name}"`);
      return { name, room: null, confidence: 0.8 };
    } else {
      console.log(`[NER-FIX] Rejected simple name: "${name}" - failed validation`);
    }
  }

  return { name: null, room: null, confidence: 0 };
}

function sanitizeRoomInput(rawRoom) {
  if (!rawRoom) return null;
  let room = String(rawRoom).replace(/[oO]/g, '0').replace(/[^0-9]/g, '');
  if (room.length > 3) room = room.slice(-3);
  return room || null;
}

function isValidName(name) {
  if (!name || name.length < 2 || name.length > 30) return false;
  
  const lowerName = name.toLowerCase().trim();
  
  // Blacklist of common phrases that should never be treated as names
  const nameBlacklist = [
    // Common greetings
    'hello', 'hi', 'hey', 'bonjour', 'salut', 'ciao', 'hola',
    // Common responses
    'yes', 'no', 'ok', 'okay', 'sure', 'maybe', 'perhaps',
    // Questions
    'what', 'how', 'why', 'when', 'where', 'who', 'which',
    // Common phrases
    'how are you', 'how are u', 'what is', 'what\'s', 'i need', 'i want',
    'please', 'thank you', 'thanks', 'goodbye', 'bye', 'see you',
    // Numbers and common words
    'one', 'two', 'three', 'first', 'second', 'third',
    // Service-related words
    'pillow', 'towel', 'water', 'food', 'help', 'service', 'room',
    // Common expressions
    'fine', 'good', 'bad', 'great', 'nice', 'ok', 'alright', 'well',
    'really', 'very', 'much', 'many', 'some', 'any', 'all', 'none'
  ];
  
  // Check if the name contains any blacklisted phrases
  for (const blacklisted of nameBlacklist) {
    if (lowerName.includes(blacklisted)) {
      console.log(`[NER-FIX] Rejected name "${name}" - contains blacklisted phrase: "${blacklisted}"`);
      return false;
    }
  }
  
  // Check for common patterns that indicate it's not a name
  if (/^(how|what|why|when|where|who|which)\b/i.test(lowerName)) return false;
  if (/\b(need|want|have|get|give|bring|send|call|help)\b/i.test(lowerName)) return false;
  if (/^\d+$/.test(lowerName)) return false; // Pure numbers
  
  return true;
}

function isValidRoom(room) {
  return room && /^\d{3,4}$/.test(room);
}

function hasCompleteGuestInfo() {
  return Boolean(guest?.name && guest?.room && guest?.guestInfoConfirmed === true);
}

function lockGuestInfo() {
  guest.guestInfoConfirmed = true;
  guest.guestInfoConfirmedOnce = true;
  guest.infoRequestCount = 0;
  guest.infoRequestRefused = false;
  guest.lastConfirmedAt = Date.now();
  saveGuestState();
}

function updateGuestInfo(name, room) {
  let showConfirmation = false;
  
  console.log(` [GUEST-INFO] Updating: name=${name}, room=${room}`);
  console.log(` [GUEST-INFO] Current: name=${guest.name}, room=${guest.room}`);
  
  if (name && name !== guest.name) {
    guest.name = name;
    guest.memory.name = name; // Update memory
    console.log(` [GUEST-INFO] Updated name to: ${name}`);
    showConfirmation = true;
  }
  
  if (room && room !== guest.room) {
    guest.room = room;
    guest.memory.room = room; // Update memory
    console.log(` [GUEST-INFO] Updated room to: ${room}`);
    showConfirmation = true;
  }
  
  // If we now have both name and room, lock the info
  if (guest.name && guest.room) {
    console.log(` [GUEST-INFO] Locking complete info: ${guest.name} in room ${guest.room}`);
    lockGuestInfo();
  }
  
  return { showConfirmation };
}

function addToMemory(key, value) {
  guest.memory[key] = value;
  console.log(` [MEMORY] Added ${key}: ${value}`);
  saveGuestState();
}

function getFromMemory(key) {
  const value = guest.memory[key];
  console.log(` [MEMORY] Retrieved ${key}: ${value}`);
  return value;
}

// Helper function to get the best available guest information from stored data
function getBestGuestInfo() {
  const result = {
    name: null,
    room: null,
    nameSource: null,
    roomSource: null
  };
  
  // First, try to sync with window.guest if it exists (from chat.html)
  if (window.guest && window.guest.name) {
    result.name = window.guest.name;
    result.nameSource = 'window';
    console.log(`[GUEST-INFO] Using window.guest name: ${result.name} (source: ${result.nameSource})`);
  }
  
  if (window.guest && window.guest.room) {
    result.room = window.guest.room;
    result.roomSource = 'window';
    console.log(`[GUEST-INFO] Using window.guest room: ${result.room} (source: ${result.roomSource})`);
  }
  
  // Use stored guest info (secondary source)
  if (!result.name && guest.name) {
    result.name = guest.name;
    result.nameSource = 'memory';
    console.log(`[GUEST-INFO] Using stored name: ${result.name} (source: ${result.nameSource})`);
  }
  
  if (!result.room && guest.room) {
    result.room = guest.room;
    result.roomSource = 'memory';
    console.log(`[GUEST-INFO] Using stored room: ${result.room} (source: ${result.roomSource})`);
  }
  
  // Fallback to session data if memory is empty
  if (!result.name) {
    const sessionData = JSON.parse(localStorage.getItem('D4B_CURRENT_SESSION') || '{}');
    if (sessionData.name) {
      result.name = sessionData.name;
      result.nameSource = 'session';
      console.log(`[GUEST-INFO] Using session name: ${result.name} (source: ${result.nameSource})`);
    }
  }
  
  if (!result.room) {
    const sessionData = JSON.parse(localStorage.getItem('D4B_CURRENT_SESSION') || '{}');
    if (sessionData.room) {
      result.room = sessionData.room;
      result.roomSource = 'session';
      console.log(`[GUEST-INFO] Using session room: ${result.room} (source: ${result.roomSource})`);
    }
  }
  
  console.log(`[GUEST-INFO] Final guest info - name: ${result.name} (${result.nameSource}), room: ${result.room} (${result.roomSource})`);
  return result;
}

function addRequestToHistory(request) {
  guest.memory.requestHistory.push({
    request: request,
    timestamp: new Date().toISOString(),
    type: 'service_request'
  });
  guest.memory.lastRequest = request;
  saveGuestState();
}

function getRequestHistory() {
  return guest.memory.requestHistory;
}

function missingGuestFields() {
  const missing = [];
  if (!guest?.name) missing.push("name");
  if (!guest?.room) missing.push("room");
  return missing;
}

function isGuestSessionExpired() {
  try {
    const last = guest.lastRequestTime ? new Date(guest.lastRequestTime).getTime() : null;
    if (!last) return false;
    return Date.now() - last > SESSION_TIMEOUT_MS;
  } catch (_) {
    return false;
  }
}

// --- INFO REQUEST MANAGEMENT ---
function isInfoRefusal(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  const refusalPatterns = [
    /no\b/, /non\b/, /later/, /aprÃ¨s/, /not now/, /pas maintenant/,
    /don't want/, /ne veux pas/, /refuse/, /refuser/, /skip/, /passer/,
    /maybe later/, /peut-Ãªtre plus tard/, /not yet/, /pas encore/,
    /i don't want to/, /je ne veux pas/, /not right now/, /pas maintenant/
  ];
  return refusalPatterns.some((p) => p.test(lower));
}

function shouldAskForInfo() {
  if (hasCompleteGuestInfo()) return false;
  if (guest.infoRequestRefused && !REPEAT_INFO_REQUEST) return false;
  if (guest.infoRequestCount >= MAX_INFO_REQUESTS) return false;
  return true;
}

function incrementInfoRequestCount() {
  guest.infoRequestCount++;
  console.log(` Info request count: ${guest.infoRequestCount}/${MAX_INFO_REQUESTS}`);
}

// --- LANGUAGE DETECTION ---
function detectLanguage(text) {
  return "FR";
}

function askByLang(english, french, arabic) {
  return french;
}

// --- INTENT CLASSIFICATION ---
function classifyIntent(message) {
  const lowerMessage = message.toLowerCase();
  const greetingPatterns = [/bonjour/, /hello/, /salut/, /hi/, /Ù…Ø±Ø­Ø¨Ø§/, /Ø£Ù‡Ù„Ø§/];
  if (greetingPatterns.some(pattern => pattern.test(lowerMessage))) {
    return { type: "greeting", urgency: "normal" };
  }

  const thanksPatterns = [/merci/, /thanks/, /thank you/, /Ø´ÙƒØ±Ø§/, /Ø´ÙƒØ±Ø§Ù‹/];
  if (thanksPatterns.some(pattern => pattern.test(lowerMessage))) {
    return { type: "confirmation", urgency: "normal" };
  }

  const identityPatterns = [/my name is/, /je m'appelle/, /c'est/, /nom/, /name/, /restaurant/, /code restaurant/, /code site/, /code magasin/];
  if (identityPatterns.some(pattern => pattern.test(lowerMessage))) {
    return { type: "name_room", urgency: "normal" };
  }

  const incidentPatterns = [/incident|panne|probl[eÃ¨]me|support|aide|help|urgent|urgence|erreur|bug|caisse|pos|aloha|ncr|rÃ©seau|wifi|internet|connexion|imprimante|terminal|ticket|login|mot de passe|paiement/];
  if (incidentPatterns.some(pattern => pattern.test(lowerMessage))) {
    return { type: "incident", urgency: IT_CRITICAL.test(lowerMessage) ? "high" : "normal" };
  }

  return { type: "request", urgency: "normal" };
}

// --- REQUEST CLASSIFICATION ---
function classifyRequest(message) {
  const lowerMessage = message.toLowerCase();

  if (IT_CRITICAL.test(lowerMessage)) {
    return { category: "Critical Incident", urgency: "high", escalation: true };
  }
  if (/\b(aloha|ncr|pos|caisse|terminal|kds|tpv)\b/.test(lowerMessage)) {
    return { category: "Menu Management Aloha", urgency: "high", serviceLot: "Lot 3 - Menu Management Aloha" };
  }
  if (/\b(red biscuit|gestion du menu|mise Ã  jour du menu|promotion|promo|menu)\b/.test(lowerMessage)) {
    return { category: "Menu Management Red Biscuit", urgency: "normal", serviceLot: "Lot 2 - Menu Management Red Biscuit" };
  }
  if (/\b(r[eÃ©]seau|wifi|internet|connexion|imprimante|printer|[Ã©e]cran|terminal|logiciel|software|mot de passe|login|authentification|paiement)\b/.test(lowerMessage)) {
    return { category: "Technical Issue", urgency: "normal", serviceLot: "Lot 1 - Helpdesk / Service Desk" };
  }

  return { category: "General IT Support", urgency: "normal", serviceLot: "Lot 1 - Helpdesk / Service Desk" };
}

function isServiceRequest(msg) {
  const lower = msg.toLowerCase();
  return /incident|panne|probl[eÃ¨]me|support|aide|help|urgent|urgence|erreur|bug|ticket|caisse|pos|aloha|ncr|red biscuit|rÃ©seau|wifi|internet|connexion|imprimante|terminal|login|mot de passe|paiement/.test(lower);
}

function summarizeRequest(msg) {
  const normalizedMsg = norm(msg);
  let category = "General IT Support";
  let serviceLot = "Lot 1 - Helpdesk / Service Desk";
  let details = msg.trim();
  let priority = "P4";

  if (/\b(system down|syst[eÃ¨]me down|caisse bloqu[eÃ©]e|caisse en panne|paiement refus[eÃ©]|paiement impossible|transaction refus[eÃ©]|r[eÃ©]seau coup[eÃ©]|connexion perdue|wifi down|internet down|[Ã©e]lectricit[eÃ©]|alimentation|panne [Ã©e]lectrique|incident critique|incident de s[eÃ©]curit[eÃ©]|danger|fum[eÃ©]e|gaz|serveur|coupure de courant|Ã©cran noir|Ã©cran blanc|tactile figÃ©|non d[eÃ©]marre|d[eÃ©]marrage impossible|erreur critique|bloqu[eÃ©]|fig[eÃ©])\b/.test(normalizedMsg)) {
    priority = "P1";
  } else if (/\b(erreur|bug|login|mot de passe|authentification|imprimante|printer|kds|terminal|pos|ncr|aloha|paiement|tpe|tactile|mise Ã  jour|sync|synchronisation|promo|promotion|mise en ligne|connexion perdue|pas d'affichage|Ã©cran figÃ©|erreur gÃ©nÃ©rale|message d'erreur|timeout|Ã©chec|echec|d[Ã©e]marrage|non r[eÃ©]pond|interruption)\b/.test(normalizedMsg)) {
    priority = "P2";
  } else if (/\b(configuration|acc[eÃ¨]s|acc[eÃ¨]s demande|rapport|report|formation|documentation|demande d'information|infos|information|question|param[eÃ¨]trage|utilisation)\b/.test(normalizedMsg)) {
    priority = "P3";
  }

  if (/\b(aloha|ncr|pos|caisse|terminal|kds|tpv)\b/.test(normalizedMsg)) {
    category = "Menu Management Aloha";
    serviceLot = "Lot 3 - Menu Management Aloha";
  } else if (/\b(red biscuit|gestion du menu|mise Ã  jour du menu|promotion|promo|menu|redbiscuit|rb)\b/.test(normalizedMsg)) {
    category = "Menu Management Red Biscuit";
    serviceLot = "Lot 2 - Menu Management Red Biscuit";
  } else if (/\b([Ã©e]cran|affichage|pas d'affichage|no display|Ã©cran noir|Ã©cran blanc|tactile figÃ©|ecran figÃ©|Ã©teint|ne s'allume plus|ordinateur|pc|portable|bureau windows|serveur|tablette|borne|speaker box|cÃ¢blage|cable|Ã©cran client|menu board)\b/.test(normalizedMsg)) {
    category = "General IT Support";
    serviceLot = "Lot 1 - Helpdesk / Service Desk";
  } else if (/\b(r[eÃ©]seau|wifi|internet|connexion|routeur|switch|lan|wan|imprimante|printer|logiciel|software|mot de passe|login|authentification|paiement|voip|tÃ©lÃ©phonie|monitoring|garou|pulse|deliverect|kvm)\b/.test(normalizedMsg)) {
    category = "Technical Issue";
    serviceLot = "Lot 1 - Helpdesk / Service Desk";
  }

  if (/\b(screen black|[Ã©e]cran noir|pas d'affichage|no display|Ã©cran blanc)\b/.test(normalizedMsg)) {
    priority = "P1";
  }

  if (priority === "P4" && /\b(help|aide|info|information|demande|question)\b/.test(normalizedMsg)) {
    category = "General IT Support";
    serviceLot = "Lot 1 - Helpdesk / Service Desk";
  }

  const slaDeadline = calculateSlaDeadline(priority);
  return { category, details, priority, serviceLot, slaDeadline };
}

function getCurrentTroubleshootState() {
  const tsMemory = guest.intentMemory && guest.intentMemory.troubleshoot ? guest.intentMemory.troubleshoot : {};
  const keys = Object.keys(tsMemory);
  if (!keys.length) return null;

  const ordered = keys
    .map(category => ({ category, state: tsMemory[category] }))
    .sort((a, b) => (b.state.step || 0) - (a.state.step || 0));

  return ordered[0];
}

function isTicketCreationIntent(msg) {
  return /\b(open a ticket|create ticket|ticket now|ticket please|ticket urgent|ticket urgente|ouvrir(?: le| un)? ticket|ouvre(?:r|) ticket|cr[eé]e(?:r|) (?:le|un)? ticket|cr[eé]er(?: un| le)? ticket|faire un ticket|ouvrir un dossier|rien n'a fonctionn[eé]|rien ne fonctionne|toujours pas|pas r[eé]solu|ça ne fonctionne pas|ca ne fonctionne pas|aucune solution|toujours en panne)\b/i.test(msg);
}

// --- FAQ HANDLING ---
async function findFAQAnswer(text) {
  try {
    const lowerText = text.toLowerCase().trim();
    
    // Load FAQ data
    const response = await fetch('../data/restaurant-faq.json');
    if (!response.ok) {
      console.log(" Could not load FAQ data");
      return null;
    }
    
    const faqData = await response.json();
    
    // Search for matching FAQ with improved algorithm
    let bestMatch = null;
    let bestScore = 0;
    
    for (const faq of faqData) {
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
        console.log(` FAQ candidate: "${faq.question}" (score: ${matchScore}, exact: ${exactMatches})`);
      }
    }
    
    if (bestMatch) {
      console.log(` Best FAQ match: "${bestMatch.question}" (final score: ${bestScore})`);
      return bestMatch.answer;
    }
    
    // No good FAQ match found
    console.log(` No FAQ match for: "${text}"`);
    return null;
    
  } catch (error) {
    console.log(" Error loading FAQ data:", error);
    return null;
  }
}

function handleFAQRequest(text, category, details) {
  const lowerText = text.toLowerCase();
  
  // Menu/order/promotions are not supported in this IT-support chatbot.
  if (/menu|bucket|chicken|wing|tender|burger|combo|menu|order|promo|promotion/.test(lowerText)) {
    return "Ce chatbot fournit un support IT pour D4B. Pour les questions liÃ©es au menu, aux promotions ou aux commandes, veuillez utiliser les canaux clients appropriÃ©s.";
  }
  
  // General information
  return "Je serais ravi de vous aider avec cela ! Laissez-moi vÃ©rifier nos informations pour vous.";
}

// --- EMPATHY RESPONSES ---
function respondWithEmpathy(message, classification) {
  const lowerMessage = message.toLowerCase();
  const hasInfo = guest.name && guest.room;
  const isEmergency = classification && classification.escalation;
  const isHighUrgency = classification && classification.urgency === "high";
  
  // Emergency responses
  if (isEmergency || isHighUrgency) {
    const emergencyKeywords = ["doctor", "emergency", "urgent", "can't breathe", "injured", "hospital", "accident", "choking", "sick", "ill", "blood", "burn", "ambulance", "pain", "hurt", "fever", "nausea", "dizzy", "fainting", "unconscious", "bleeding", "broken", "fracture", "heart attack", "stroke", "seizure", "allergic reaction", "anaphylaxis", "poisoning", "overdose"];
    
    const hasEmergencyKeyword = emergencyKeywords.some(keyword => lowerMessage.includes(keyword));
    
    if (hasEmergencyKeyword) {
      if (hasInfo) {
        return askByLang(
          " I'm so sorry to hear that. I've marked this as urgent and will notify our team right away. A member of our staff will be there in just a few minutes. Please stay calm, we're here to help.",
          " Je suis vraiment dÃ©solÃ© d'apprendre cela. J'ai marquÃ© votre demande comme urgente et je vais notifier notre Ã©quipe immÃ©diatement. Un membre de notre personnel sera lÃ  dans quelques minutes. Restez calme, nous sommes lÃ  pour vous aider.",
          " Ø£Ù†Ø§ Ø¢Ø³Ù Ø¬Ø¯Ø§Ù‹ Ù„Ø³Ù…Ø§Ø¹ Ù‡Ø°Ø§. Ù„Ù‚Ø¯ ÙˆØ¶Ø¹Øª Ø·Ù„Ø¨Ùƒ ÙƒØ£ÙˆÙ„ÙˆÙŠØ© Ø¹Ø§Ù„ÙŠØ© ÙˆØ³Ø£Ù‚ÙˆÙ… Ø¨Ø¥Ø®Ø·Ø§Ø± ÙØ±ÙŠÙ‚Ù†Ø§ ÙÙˆØ±Ø§Ù‹. Ø³ÙŠÙƒÙˆÙ† Ø£Ø­Ø¯ Ù…ÙˆØ¸ÙÙŠÙ†Ø§ Ù‡Ù†Ø§Ùƒ ÙÙŠ ØºØ¶ÙˆÙ† Ø¯Ù‚Ø§Ø¦Ù‚ Ù‚Ù„ÙŠÙ„Ø©. Ø§Ø¨Ù‚ Ù‡Ø§Ø¯Ø¦Ø§Ù‹ØŒ Ù†Ø­Ù† Ù‡Ù†Ø§ Ù„Ù…Ø³Ø§Ø¹Ø¯ØªÙƒ."
        );
      } else {
        return askByLang(
          " I'm so sorry to hear that. Could you please give me your name and table number immediately so I can send help right away?",
          " Je suis vraiment dÃ©solÃ© d'apprendre cela. Pourriez-vous me donner votre nom et numÃ©ro de table immÃ©diatement pour que je puisse envoyer de l'aide ?",
          " Ø£Ù†Ø§ Ø¢Ø³Ù Ø¬Ø¯Ø§Ù‹ Ù„Ø³Ù…Ø§Ø¹ Ù‡Ø°Ø§. Ù‡Ù„ ÙŠÙ…ÙƒÙ†Ùƒ Ø¥Ø¹Ø·Ø§Ø¦ÙŠ Ø§Ø³Ù…Ùƒ ÙˆØ±Ù‚Ù… Ø·Ø§ÙˆÙ„ØªÙƒ ÙÙˆØ±Ø§Ù‹ Ø­ØªÙ‰ Ø£ØªÙ…ÙƒÙ† Ù…Ù† Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯Ø©ØŸ"
        );
      }
    }
  }
  
  // Discomfort/inconvenience responses
  const discomfortKeywords = ["broken", "not working", "leaking", "flooding", "no hot water", "no electricity", "no wifi", "cold", "hot", "noise", "smell", "dirty", "mess", "problem", "issue", "trouble"];
  const hasDiscomfortKeyword = discomfortKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (hasDiscomfortKeyword) {
    if (hasInfo) {
      return askByLang(
        "I completely understand how inconvenient this must be. I'll make sure this is taken care of quickly.",
        "Je comprends parfaitement Ã  quel point cela doit Ãªtre gÃªnant. Je vais m'assurer que cela soit pris en charge rapidement.",
        "Ø£ÙÙ‡Ù… ØªÙ…Ø§Ù…Ø§Ù‹ Ù…Ø¯Ù‰ Ø§Ù„Ø¥Ø²Ø¹Ø§Ø¬ Ø§Ù„Ø°ÙŠ ÙŠØ³Ø¨Ø¨Ù‡ Ù‡Ø°Ø§. Ø³Ø£ØªØ£ÙƒØ¯ Ù…Ù† Ù…Ø¹Ø§Ù„Ø¬ØªÙ‡ Ø¨Ø³Ø±Ø¹Ø©."
      );
    } else {
      return askByLang(
        "I completely understand how inconvenient this must be. Could you please give me your name and table number so I can take care of this quickly?",
        "Je comprends parfaitement Ã  quel point cela doit Ãªtre gÃªnant. Pourriez-vous me donner votre nom et numÃ©ro de table pour que je puisse m'en occuper rapidement ?",
        "Ø£ÙÙ‡Ù… ØªÙ…Ø§Ù…Ø§Ù‹ Ù…Ø¯Ù‰ Ø§Ù„Ø¥Ø²Ø¹Ø§Ø¬ Ø§Ù„Ø°ÙŠ ÙŠØ³Ø¨Ø¨Ù‡ Ù‡Ø°Ø§. Ù‡Ù„ ÙŠÙ…ÙƒÙ†Ùƒ Ø¥Ø¹Ø·Ø§Ø¦ÙŠ Ø§Ø³Ù…Ùƒ ÙˆØ±Ù‚Ù… Ø·Ø§ÙˆÙ„ØªÙƒ Ø­ØªÙ‰ Ø£ØªÙ…ÙƒÙ† Ù…Ù† Ù…Ø¹Ø§Ù„Ø¬ØªÙ‡ Ø¨Ø³Ø±Ø¹Ø©ØŸ"
      );
    }
  }
  
  // General polite responses
  if (hasInfo) {
    return askByLang(
      "Perfect! I'll take care of this right away. ðŸ˜Š",
      "Parfait ! Je vais m'occuper de cela immÃ©diatement. ðŸ˜Š",
      "Ù…Ù…ØªØ§Ø²! Ø³Ø£Ù‚ÙˆÙ… Ø¨Ø§Ù„Ø§Ù‡ØªÙ…Ø§Ù… Ø¨Ù‡Ø°Ø§ ÙÙˆØ±Ø§Ù‹. ðŸ˜Š"
    );
  } else {
    return askByLang(
      "Of course, I can take care of this. Could you please give me your name and table number?",
      "Bien sÃ»r, je peux m'occuper de cela. Pourriez-vous me donner votre nom et numÃ©ro de table, s'il vous plaÃ®t ?",
      "Ø¨Ø§Ù„Ø·Ø¨Ø¹ØŒ ÙŠÙ…ÙƒÙ†Ù†ÙŠ Ø§Ù„Ø§Ù‡ØªÙ…Ø§Ù… Ø¨Ù‡Ø°Ø§. Ù‡Ù„ ÙŠÙ…ÙƒÙ†Ùƒ Ø¥Ø¹Ø·Ø§Ø¦ÙŠ Ø§Ø³Ù…Ùƒ ÙˆØ±Ù‚Ù… Ø·Ø§ÙˆÙ„ØªÙƒ Ù…Ù† ÙØ¶Ù„ÙƒØŸ"
    );
  }
}

// Enhanced response system with varied templates and intent follow-up
function getVariedResponse(type, context = {}) {
  const responses = {
    missingInfo: {
      EN: [
        "Hmm, I don't see your table number right now â€” mind sharing it again, just in case? ðŸ˜Š",
        "Could you remind me of your name and table number? I want to make sure I get this right!",
        "I'd love to help! Just need your name and table number to get started."
      ],
      FR: [
        "Hmm, je ne vois pas votre table pour le moment â€” pouvez-vous me la rappeler, au cas oÃ¹ ? ðŸ˜Š",
        "Pourriez-vous me rappeler votre nom et numÃ©ro de table ? Je veux m'assurer de bien faire les choses !",
        "J'aimerais vous aider ! J'ai juste besoin de votre nom et numÃ©ro de table pour commencer."
      ],
      AR: [
        "Ù‡Ù…Ù…ØŒ Ù„Ø§ Ø£Ø±Ù‰ Ø·Ø§ÙˆÙ„ØªÙƒ Ø§Ù„Ø¢Ù† â€” Ù‡Ù„ ÙŠÙ…ÙƒÙ†Ùƒ ØªØ°ÙƒÙŠØ±ÙŠ Ø¨Ù‡Ø§ØŒ ÙÙ‚Ø· ÙÙŠ Ø­Ø§Ù„Ø©ØŸ ðŸ˜Š",
        "Ù‡Ù„ ÙŠÙ…ÙƒÙ†Ùƒ ØªØ°ÙƒÙŠØ±ÙŠ Ø¨Ø§Ø³Ù…Ùƒ ÙˆØ±Ù‚Ù… Ø·Ø§ÙˆÙ„ØªÙƒØŸ Ø£Ø±ÙŠØ¯ Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø£Ù†Ù†ÙŠ Ø£ÙØ¹Ù„ Ø§Ù„Ø´ÙŠØ¡ Ø§Ù„ØµØ­ÙŠØ­!",
        "Ø£ÙˆØ¯ Ù…Ø³Ø§Ø¹Ø¯ØªÙƒ! Ø£Ø­ØªØ§Ø¬ ÙÙ‚Ø· Ø§Ø³Ù…Ùƒ ÙˆØ±Ù‚Ù… Ø·Ø§ÙˆÙ„ØªÙƒ Ù„Ù„Ø¨Ø¯Ø¡."
      ]
    },
    sick: {
      EN: [
        "I'm sorry to hear you're not feeling well. Would you like me to arrange emergency assistance or contact our staff?",
        "That's no good! Should I arrange for medical help or get you some water and pain relief?",
        "I hope you feel better soon! Would you like me to notify the restaurant team for medical assistance?"
      ],
      FR: [
        "Je suis dÃ©solÃ© d'apprendre que vous ne vous sentez pas bien. Voulez-vous que je demande une aide mÃ©dicale ou que je contacte notre Ã©quipe ?",
        "Ce n'est pas bon ! Dois-je organiser une aide mÃ©dicale ou vous apporter de l'eau et des analgÃ©siques ?",
        "J'espÃ¨re que vous vous sentirez mieux bientÃ´t ! Voulez-vous que je prÃ©vienne l'Ã©quipe du restaurant pour une aide mÃ©dicale ?"
      ],
      AR: [
        "Ø£Ù†Ø§ Ø¢Ø³Ù Ù„Ø³Ù…Ø§Ø¹ Ø£Ù†Ùƒ Ù„Ø§ ØªØ´Ø¹Ø± Ø¨Ø§Ù„Ø±Ø§Ø­Ø©. Ù‡Ù„ ØªØ±ÙŠØ¯ Ù…Ù†ÙŠ ØªØ±ØªÙŠØ¨ Ù…Ø³Ø§Ø¹Ø¯Ø© Ø·Ø¨ÙŠØ© Ø£Ùˆ Ø¥Ø¨Ù„Ø§Øº ÙØ±ÙŠÙ‚Ù†Ø§ØŸ",
        "Ù‡Ø°Ø§ Ù„ÙŠØ³ Ø¬ÙŠØ¯Ø§Ù‹! Ù‡Ù„ ÙŠØ¬Ø¨ Ø¹Ù„ÙŠ ØªØ±ØªÙŠØ¨ Ù…Ø³Ø§Ø¹Ø¯Ø© Ø·Ø¨ÙŠØ© Ø£Ùˆ Ø¥Ø­Ø¶Ø§Ø± Ù…Ø§Ø¡ ÙˆÙ…Ø³ÙƒÙ†Ø§Øª Ù„ÙƒØŸ",
        "Ø£ØªÙ…Ù†Ù‰ Ø£Ù† ØªØ´Ø¹Ø± Ø¨ØªØ­Ø³Ù† Ù‚Ø±ÙŠØ¨Ø§Ù‹! Ù‡Ù„ ØªØ±ÙŠØ¯ Ù…Ù†ÙŠ Ø¥Ø¨Ù„Ø§Øº ÙØ±ÙŠÙ‚ Ø§Ù„Ù…Ø·Ø¹Ù… Ù„Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ù…Ø³Ø§Ø¹Ø¯Ø© Ø·Ø¨ÙŠØ©ØŸ"
      ]
    },
    hungry: {
        EN: [
          "This chatbot handles IT support for D4B staff. For food orders or menu questions please use the restaurant ordering channels.",
          "I can help with IT incidents, not with orders. Tell me about the technical issue you're facing."
        ],
        FR: [
          "Ce chatbot gÃ¨re le support IT pour le personnel D4B. Pour les commandes ou questions de menu, utilisez les canaux de commande du restaurant.",
          "Je peux aider pour des incidents IT, pas pour les commandes. Parlez-moi du problÃ¨me technique que vous rencontrez."
        ],
        AR: [
          "Ù‡Ø°Ù‡ Ø§Ù„Ø¯Ø±Ø¯Ø´Ø© Ø®Ø§ØµØ© Ø¨Ø¯Ø¹Ù… ØªÙƒÙ†ÙˆÙ„ÙˆØ¬ÙŠØ§ Ø§Ù„Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ù„Ù…ÙˆØ¸ÙÙŠ D4B. Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø·Ø¹Ø§Ù… Ø£Ùˆ Ø£Ø³Ø¦Ù„Ø© Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© ÙŠØ±Ø¬Ù‰ Ø§Ø³ØªØ®Ø¯Ø§Ù… Ù‚Ù†ÙˆØ§Øª Ø§Ù„Ø·Ù„Ø¨ ÙÙŠ Ø§Ù„Ù…Ø·Ø¹Ù….",
          "ÙŠÙ…ÙƒÙ†Ù†ÙŠ Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯Ø© ÙÙŠ Ø§Ù„Ø­ÙˆØ§Ø¯Ø« Ø§Ù„ØªÙ‚Ù†ÙŠØ©ØŒ ÙˆÙ„ÙŠØ³ ÙÙŠ Ø§Ù„Ø·Ù„Ø¨Ø§Øª. Ø£Ø®Ø¨Ø±Ù†ÙŠ Ø¹Ù† Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ø§Ù„ØªÙ‚Ù†ÙŠØ© Ø§Ù„ØªÙŠ ØªÙˆØ§Ø¬Ù‡Ù‡Ø§."
        ]
    },
    menu: {
        EN: [
          "Menu and ordering are not supported here. This assistant focuses on IT support for D4B staff.",
          "For menu details or promotions please use D4B customer channels or the restaurant POS."
        ],
        FR: [
          "Le menu et les commandes ne sont pas pris en charge ici. Cet assistant se concentre sur le support IT pour le personnel D4B.",
          "Pour les dÃ©tails du menu ou les promotions, utilisez les canaux clients D4B ou le POS du restaurant."
        ],
        AR: [
          "Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© ÙˆØ§Ù„Ø·Ù„Ø¨Ø§Øª ØºÙŠØ± Ù…Ø¯Ø¹ÙˆÙ…Ø© Ù‡Ù†Ø§. Ù‡Ø°Ø§ Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯ Ù…Ø®ØµØµ Ù„Ø¯Ø¹Ù… ØªÙƒÙ†ÙˆÙ„ÙˆØ¬ÙŠØ§ Ø§Ù„Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ù„Ù…ÙˆØ¸ÙÙŠ D4B.",
          "Ù„Ù…Ø¹Ø±ÙØ© ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø£Ùˆ Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ø³ØªØ®Ø¯Ù… Ù‚Ù†ÙˆØ§Øª Ø®Ø¯Ù…Ø© Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ Ù„Ø¯Ù‰ D4B Ø£Ùˆ Ù†Ø¸Ø§Ù… Ù†Ù‚Ø§Ø· Ø§Ù„Ø¨ÙŠØ¹ Ø¨Ø§Ù„Ù…Ø·Ø¹Ù…."
        ]
    },
    order: {
        EN: [
          "Ordering is not handled by this assistant. Please use the D4B ordering channels or speak with restaurant staff for food orders.",
          "This assistant handles IT incidents. Describe the technical issue you're facing and I'll log a ticket."
        ],
        FR: [
          "Les commandes ne sont pas gÃ©rÃ©es par cet assistant. Veuillez utiliser les canaux de commande D4B ou parler au personnel du restaurant pour passer une commande.",
          "Cet assistant gÃ¨re les incidents IT. DÃ©crivez le problÃ¨me technique rencontrÃ© et je crÃ©erai un ticket."
        ],
        AR: [
          "Ø§Ù„Ø·Ù„Ø¨Ø§Øª ØºÙŠØ± Ù…ÙØ¹Ø§Ù„Ø¬Ø© Ù…Ù† Ù‚Ø¨Ù„ Ù‡Ø°Ø§ Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯. ÙŠØ±Ø¬Ù‰ Ø§Ø³ØªØ®Ø¯Ø§Ù… Ù‚Ù†ÙˆØ§Øª Ø·Ù„Ø¨Ø§Øª D4B Ø£Ùˆ Ø§Ù„ØªØ­Ø¯Ø« Ø¥Ù„Ù‰ Ù…ÙˆØ¸ÙÙŠ Ø§Ù„Ù…Ø·Ø¹Ù… Ù„ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø·Ù„Ø¨.",
          "Ù‡Ø°Ø§ Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯ ÙŠØªØ¹Ø§Ù…Ù„ Ù…Ø¹ Ø­ÙˆØ§Ø¯Ø« ØªÙƒÙ†ÙˆÙ„ÙˆØ¬ÙŠØ§ Ø§Ù„Ù…Ø¹Ù„ÙˆÙ…Ø§Øª. ØµÙ Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ø§Ù„ØªÙ‚Ù†ÙŠØ© Ø§Ù„ØªÙŠ ØªÙˆØ§Ø¬Ù‡Ù‡Ø§ ÙˆØ³Ø£Ø³Ø¬Ù„ ØªØ°ÙƒØ±Ø©."
        ]
    }
  };
  
  const lang = context.lang || 'FR';
  const langKey = 'FR';
  const typeResponses = responses[type]?.[langKey] || responses[type]?.FR || [];
  
  if (typeResponses.length === 0) return null;
  
  // Return a random response from the available options
  return typeResponses[Math.floor(Math.random() * typeResponses.length)];
}

function getD4BMenuText() {
  return "Le menu et les commandes ne sont pas pris en charge ici. Cet assistant fournit uniquement un support IT pour D4B.";
}

function getD4BPromoText() {
  return "Les promotions et les offres ne sont pas prises en charge ici. Cet assistant fournit uniquement un support IT pour D4B.";
}

function detectIntentAndFollowUp(message) {
  const lowerMessage = norm(message);
  
  // Medical intent
  if (/\b(sick|ill|pain|hurt|fever|nausea|dizzy|headache|stomach|ache)\b/.test(lowerMessage)) {
    return getVariedResponse('sick', { lang: detectLanguage(message) });
  }
  
  // Explicit order with item detection
  const order = parseD4BOrder(message);
  if (order) {
    const lang = detectLanguage(message);
    const responses = {
      EN: `Got it. I have ${order.quantity} ${order.label} on your request. Your order will be sent to the restaurant staff for processing.`,
      FR: `TrÃ¨s bien. J'ai notÃ© ${order.quantity} ${order.label} dans votre demande. Votre commande sera envoyÃ©e au personnel du restaurant pour traitement.`,
      AR: `Ø­Ø³Ù†Ø§Ù‹. Ù„Ù‚Ø¯ Ø³Ø¬Ù„Øª ${order.quantity} ${order.label} ÙÙŠ Ø·Ù„Ø¨Ùƒ. Ø³ÙŠØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø·Ù„Ø¨Ùƒ Ø¥Ù„Ù‰ Ø·Ø§Ù‚Ù… Ø§Ù„Ù…Ø·Ø¹Ù… Ù„Ù„Ù…Ø¹Ø§Ù„Ø¬Ø©.`
    };
    return responses[lang] || responses.EN;
  }

  // Menu/order/promotions are not supported in the IT-support chatbot â€” respond with guidance
  if (/\b(menu|voir le menu|show me the menu|menu items|what's on the menu|what is on the menu|what do you have|promo|promos|promotion|promotions|order|commande|suivi|suivi de commande)\b/.test(lowerMessage)) {
    return "Ce chatbot fournit un support IT pour D4B. Pour les questions liÃ©es au menu, aux promotions ou aux commandes, veuillez utiliser les canaux clients appropriÃ©s.";
  }
  
  // Hunger intent
  if (/\b(hungry|food|eat|meal|restaurant|dinner|lunch|breakfast)\b/.test(lowerMessage)) {
    return getVariedResponse('hungry', { lang: detectLanguage(message) });
  }
  
  // Missing info intent
  if (!guest.name || !guest.room) {
    return getVariedResponse('missingInfo', { lang: detectLanguage(message) });
  }
  
  return null;
}

function handleMemoryBasedQuestions(message) {
  const lowerMessage = norm(message);
  const detectedLang = detectLanguage(message);
  const lang = detectedLang === 'FR' ? 'FR' : detectedLang === 'AR' ? 'AR' : 'EN';
  
  // Table number questions
  if (/\b(what.*room|my room|room number|chambre|ØºØ±ÙØ©|room\s+\d+|table number|my table|table\s+\d+)\b/.test(lowerMessage)) {
    const room = getFromMemory('room') || guest.room;
    if (room) {
      return askByLang(
        `Your table number is ${room}.`,
        `Votre numÃ©ro de table est ${room}.`,
        `Ø±Ù‚Ù… Ø·Ø§ÙˆÙ„ØªÙƒ Ù‡Ùˆ ${room}.`
      );
    } else {
      return getVariedResponse('missingInfo', { lang });
    }
  }
  
  // Name questions
  if (/\b(what.*name|my name|who am i|mon nom|Ø§Ø³Ù…ÙŠ|name\s+[a-zA-Z]+)\b/.test(lowerMessage)) {
    const name = getFromMemory('name') || guest.name;
    if (name) {
      return askByLang(
        `Your name is ${name}.`,
        `Votre nom est ${name}.`,
        `Ø§Ø³Ù…Ùƒ Ù‡Ùˆ ${name}.`
      );
    } else {
      return getVariedResponse('missingInfo', { lang });
    }
  }
  
  // Request history questions
  if (/\b(what.*asked|my requests|request history|past requests|demandes|Ø·Ù„Ø¨Ø§ØªÙŠ)\b/.test(lowerMessage)) {
    const history = getRequestHistory();
    if (history.length > 0) {
      const recentRequests = history.slice(-3).map(req => req.request).join(', ');
      return askByLang(
        `Your recent requests include: ${recentRequests}.`,
        `Vos demandes rÃ©centes incluent : ${recentRequests}.`,
        `Ø·Ù„Ø¨Ø§ØªÙƒ Ø§Ù„Ø£Ø®ÙŠØ±Ø© ØªØ´Ù…Ù„: ${recentRequests}.`
      );
    } else {
      return askByLang(
        "You haven't made any requests yet.",
        "Vous n'avez pas encore fait de demandes.",
        "Ù„Ù… ØªÙ‚Ù… Ø¨Ø£ÙŠ Ø·Ù„Ø¨Ø§Øª Ø¨Ø¹Ø¯."
      );
    }
  }
  
  // Last request questions
  if (/\b(last request|previous request|derniÃ¨re demande|Ø¢Ø®Ø± Ø·Ù„Ø¨)\b/.test(lowerMessage)) {
    const lastRequest = getFromMemory('lastRequest');
    if (lastRequest) {
      return askByLang(
        `Your last request was: ${lastRequest}.`,
        `Votre derniÃ¨re demande Ã©tait : ${lastRequest}.`,
        `Ø·Ù„Ø¨Ùƒ Ø§Ù„Ø£Ø®ÙŠØ± ÙƒØ§Ù†: ${lastRequest}.`
      );
    } else {
      return askByLang(
        "You haven't made any requests yet.",
        "Vous n'avez pas encore fait de demandes.",
        "Ù„Ù… ØªÙ‚Ù… Ø¨Ø£ÙŠ Ø·Ù„Ø¨Ø§Øª Ø¨Ø¹Ø¯."
      );
    }
  }
  
  return null;
}

// --- STATE MANAGEMENT ---
function saveGuestState() {
  try {
    const stateToSave = {
      name: guest.name,
      room: guest.room,
      sessionId: guest.sessionId,
      sessionStart: guest.sessionStart,
      lastRequestTime: guest.lastRequestTime,
      totalRequests: guest.totalRequests,
      fulfilledRequests: guest.fulfilledRequests,
      requestHistory: guest.requestHistory,
      activeSession: guest.activeSession,
      guestInfoConfirmedOnce: guest.guestInfoConfirmedOnce,
      lastConfirmedName: guest.lastConfirmedName,
      lastConfirmedRoom: guest.lastConfirmedRoom,
      pastRequests: guest.pastRequests,
      intentMemory: guest.intentMemory,
      lastIntent: guest.lastIntent,
      lastMessage: guest.lastMessage,
      contextAwareMode: guest.contextAwareMode,
      infoRequestRefused: guest.infoRequestRefused,
      infoRequestCount: guest.infoRequestCount,
      memory: guest.memory // Save the memory object
    };
    localStorage.setItem("D4B_guest_session", JSON.stringify(stateToSave));
    console.log(" Saved guest state:", stateToSave);
  } catch (error) {
    console.error(" Error saving guest state:", error);
  }
}

function loadGuestState() {
  try {
    const savedState = localStorage.getItem("D4B_guest_session");
    if (savedState) {
      const parsed = JSON.parse(savedState);
      Object.assign(guest, parsed);
      
      // Ensure memory object exists
      if (!guest.memory) {
        guest.memory = {
          name: null,
          room: null,
          symptoms: null,
          preferences: {},
          lastRequest: null,
          requestHistory: []
        };
      }
      
      if (guest.name && guest.room) {
        guest.guestInfoConfirmed = true;
        guest.lastConfirmedName = guest.name;
        guest.lastConfirmedRoom = guest.room;
        // Also update memory with current values
        guest.memory.name = guest.name;
        guest.memory.room = guest.room;
      }
      
      console.log(" Loaded persistent guest state:", { 
        name: guest.name, 
        room: guest.room, 
        confirmed: guest.guestInfoConfirmed,
        sessionId: guest.sessionId,
        memory: guest.memory
      });
    }
  } catch (error) {
    console.error(" Error loading guest state:", error);
  }
}

function resetGuestState() {
  Object.assign(guest, {
    name: null,
    room: null,
    lang: "EN",
    guestInfoConfirmed: false,
    guestInfoConfirmedOnce: false,
    pendingRequest: null,
    waitingForInfo: false,
    sessionMemory: {},
    processedRequests: [],
    sessionId: null,
    sessionStart: null,
    lastRequestTime: null,
    requestHistory: [],
    totalRequests: 0,
    fulfilledRequests: 0,
    activeSession: false,
    lastConfirmedName: null,
    lastConfirmedRoom: null,
    pastRequests: [],
    intentMemory: {},
    lastIntent: null,
    lastMessage: null,
    contextAwareMode: false,
    infoRequestRefused: false,
    infoRequestCount: 0,
    memory: {
      name: null,
      room: null,
      symptoms: null,
      preferences: {},
      lastRequest: null,
      requestHistory: []
    }
  });
  
  localStorage.removeItem("D4B_guest_session");
  console.log(" Guest state reset");
}

function initializeGuestState() {
  resetGuestState();
  console.log(" D4B France Bot initialized with fresh guest state:", {
    name: guest.name,
    room: guest.room,
    confirmed: guest.guestInfoConfirmed,
    activeSession: guest.activeSession,
    lang: guest.lang
  });
}

// --- REQUEST LOGGING ---
function LogGuestRequest(logInput) {
  try {
    const logEntry = {
      id: "REQ-" + Date.now(),
      timestamp: new Date().toISOString(),
      ...logInput
    };
    
    // Save to localStorage
    const existingLogs = JSON.parse(localStorage.getItem("D4B_logs") || "[]");
    existingLogs.push(logEntry);
    localStorage.setItem("D4B_logs", JSON.stringify(existingLogs));
    
    console.log(" LogGuestRequest successful:", logEntry);
    return { success: true, message: "Request logged successfully" };
  } catch (error) {
    console.error(" LogGuestRequest failed:", error);
    return { success: false, error: error.message };
  }
}

function ensureRequestLogging(originalMessage, requestType, urgency = "normal") {
  const classification = classifyRequest(originalMessage);
  const category = classification?.category;
  const details = requestType || originalMessage;

  if (!guest.name || !isValidRoom(guest.room)) {
    return {
      success: false,
      error: "missing_info",
      message: askByLang(
        "Could you please provide your name and restaurant code?",
        "Pouvez-vous fournir votre nom et le code restaurant ?",
        "Ù‡Ù„ ÙŠÙ…ÙƒÙ†Ùƒ ØªÙ‚Ø¯ÙŠÙ… Ø§Ø³Ù…Ùƒ ÙˆØ±Ù…Ø² Ø§Ù„Ù…Ø·Ø¹Ù…ØŸ"
      )
    };
  }

  const logInput = {
    name: guest.name,
    room: String(guest.room),
    category: category,
    details: details,
    request: details,
    language: detectLanguage(originalMessage),
    urgency: urgency,
    original: originalMessage
  };
  
  const logResult = LogGuestRequest(logInput);
  
  // Provide better confirmation messages
  if (urgency === "high") {
    return { 
      success: true, 
      message: askByLang(
        ` Your urgent request for '${details}' has been logged and will be delivered to table ${guest.room} immediately.`,
        ` Votre demande urgente pour '${details}' a Ã©tÃ© enregistrÃ©e et sera livrÃ©e Ã  votre table ${guest.room} immÃ©diatement.`,
        ` ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø·Ù„Ø¨Ùƒ Ø§Ù„Ø¹Ø§Ø¬Ù„ Ù„Ù€ '${details}' ÙˆØ³ÙŠØªÙ… ØªØ³Ù„ÙŠÙ…Ù‡ Ø¥Ù„Ù‰ Ø·Ø§ÙˆÙ„ØªÙƒ ${guest.room} ÙÙˆØ±Ø§Ù‹.`
      )
    };
  } else {
    return { 
      success: true, 
      message: askByLang(
        ` Your request for '${details}' has been logged and will be delivered to table ${guest.room}.`,
        ` Votre demande pour '${details}' a Ã©tÃ© enregistrÃ©e et sera livrÃ©e Ã  votre table ${guest.room}.`,
        ` ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø·Ù„Ø¨Ùƒ Ù„Ù€ '${details}' ÙˆØ³ÙŠØªÙ… ØªØ³Ù„ÙŠÙ…Ù‡ Ø¥Ù„Ù‰ Ø·Ø§ÙˆÙ„ØªÙƒ ${guest.room}.`
      )
    };
  }
}

// --- MAIN HANDLER ---
async function processSingleIntent(text) {
  console.log(" Processing:", text);
  
  // 1) First: try to capture identity from any message
  const info = extractGuestInfo(text);
  console.log(" Extracted info:", info);
  
  if (info.confidence >= 0.8) {
    const changed = updateGuestInfo(info.name, info.room).showConfirmation;
    if (changed) {
      // If we were waiting on ID for a saved request, fulfill it now
      if (guest.pendingRequest && hasCompleteGuestInfo()) {
        const { original, details, category, priority, serviceLot, slaDeadline } = guest.pendingRequest;
        guest.pendingRequest = null;
        const payloadDetails = `${category} - ${details}`;
        const r = await logServiceRequest({
          sessionId: window.currentSessionId || null,
          name: guest.name,
          room: guest.room,
          text: payloadDetails,
          priority,
          serviceLot,
          slaDeadline,
          category,
          lang: guest.lang
        });
        return r || askByLang(
          "Your IT support request has been logged and will be processed by the correct team.",
          "Votre demande de support IT a Ã©tÃ© enregistrÃ©e et sera traitÃ©e par l'Ã©quipe appropriÃ©e.",
          "ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø·Ù„Ø¨ Ø¯Ø¹Ù… ØªÙ‚Ù†ÙŠØ© Ø§Ù„Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ø®Ø§Øµ Ø¨Ùƒ ÙˆØ³ÙŠØªÙ… Ù…Ø¹Ø§Ù„Ø¬ØªÙ‡ Ù…Ù† Ù‚Ø¨Ù„ Ø§Ù„ÙØ±ÙŠÙ‚ Ø§Ù„Ù…Ù†Ø§Ø³Ø¨."
        );
      }
      // Otherwise just acknowledge and keep it light
      return askByLang(
        `Thanks ${guest.name}. Noted `,
        `Merci ${guest.name}. C'est notÃ© `,
        `Ø´ÙƒØ±Ø§Ù‹ ${guest.name}. ØªÙ… Ø§Ù„ØªØ­Ø¯ÙŠØ« `
      );
    }
  }

  const isService = isServiceRequest(text);
  console.log("ðŸ”§ Is service request:", isService);

  if (isService) {
    const faqAnswer = await findFAQAnswer(text);
    if (faqAnswer) {
      console.log(" Service-related FAQ answer found:", faqAnswer);
      return faqAnswer;
    }

    const { category, details, priority, serviceLot, slaDeadline } = summarizeRequest(text);
    console.log(" Request category:", category, "details:", details, "priority:", priority, "serviceLot:", serviceLot);
    
    if (hasCompleteGuestInfo()) {
      const payloadDetails = `${category} - ${details}`;
      const r = await logServiceRequest({
        sessionId: window.currentSessionId || null,
        name: guest.name,
        room: guest.room,
        text: payloadDetails,
        priority,
        serviceLot,
        slaDeadline,
        category,
        lang: guest.lang
      });
      return r || askByLang(
        "Your IT support request has been logged and will be processed by the correct team.",
        "Votre demande de support IT a Ã©tÃ© enregistrÃ©e et sera traitÃ©e par l'Ã©quipe appropriÃ©e.",
        "ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø·Ù„Ø¨ Ø¯Ø¹Ù… ØªÙ‚Ù†ÙŠØ© Ø§Ù„Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ø®Ø§Øµ Ø¨Ùƒ ÙˆØ³ÙŠØªÙ… Ù…Ø¹Ø§Ù„Ø¬ØªÙ‡ Ù…Ù† Ù‚Ø¨Ù„ Ø§Ù„ÙØ±ÙŠÙ‚ Ø§Ù„Ù…Ù†Ø§Ø³Ø¨."
      );
    }
    // No identity yet â†’ save pending request and ask once for both fields
    guest.pendingRequest = { original: text, category, details, priority, serviceLot, slaDeadline };
    return askByLang(
      "Of course. May I have your name and restaurant code to open the ticket?",
      "Bien sÃ»r. Puis-je avoir votre nom et le code restaurant pour ouvrir le ticket ?",
      "Ø¨ÙƒÙ„ Ø³Ø±ÙˆØ±. Ù‡Ù„ ÙŠÙ…ÙƒÙ†Ù†ÙŠ Ø§Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ø§Ø³Ù…Ùƒ ÙˆØ±Ù…Ø² Ø§Ù„Ù…Ø·Ø¹Ù… Ù„ÙØªØ­ Ø§Ù„ØªØ°ÙƒØ±Ø©ØŸ"
    );
  }

  // Not a service request, do not answer unrelated questions.
  return askByLang(
    "I only handle restaurant IT support issues. Please describe your incident or problem so I can help.",
    "Je ne traite que les problÃ¨mes de support IT en restaurant. Veuillez dÃ©crire votre incident ou problÃ¨me afin que je puisse vous aider.",
    "Ø£Ù†Ø§ Ø£ØªØ¹Ø§Ù…Ù„ ÙÙ‚Ø· Ù…Ø¹ Ù…Ø´ÙƒÙ„Ø§Øª Ø¯Ø¹Ù… ØªÙ‚Ù†ÙŠØ© Ø§Ù„Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ù„Ù„Ù…Ø·Ø¹Ù…. ÙŠØ±Ø¬Ù‰ ÙˆØµÙ Ø§Ù„Ø­Ø§Ø¯Ø« Ø£Ùˆ Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ø­ØªÙ‰ Ø£ØªÙ…ÙƒÙ† Ù…Ù† Ù…Ø³Ø§Ø¹Ø¯ØªÙƒ."
  );
}

// --- SIMPLIFIED GPT RESPONSE FOR TESTING ---
async function getGPTResponse(userMessage, systemPrompt) {
  return getGPTResponse_Direct(window.__D4B_HISTORY__); // reuse your direct-call helper
}

async function handleUserInput(text) {
  console.log(" OLD handleUserInput called - this should not happen in testing mode!");
  
  // TEMPORARILY DISABLE ALL COMPLEX LOGIC
  // Force guest to be confirmed and approved
  guest.guestInfoConfirmed = true;
  
  // Simple direct response - bypass all approval/logging/emergency detection
  const response = await getGPTResponse(text, SYSTEM_PROMPT_FR);
  return response || "Please configure your Mistral API key to use the chat.";
}

// --- DEBUG FUNCTIONS ---
function testLogging() {
  console.log(" Testing logging functionality...");
  const testResult = LogGuestRequest({
    name: "Test User",
    room: "123",
    category: "Test",
    details: "Test request",
    language: "EN",
    urgency: "normal",
    original: "Test message"
  });
  console.log("Test result:", testResult);
}

function testCompleteLogging() {
  console.log("ðŸ§ª Testing complete logging flow...");
  guest.name = "Test User";
  guest.room = "123";
  const result = ensureRequestLogging("I need a towel", "towel", "normal");
  console.log("Complete test result:", result);
}

function clearAllLogs() {
  localStorage.removeItem("D4B_logs");
  console.log("ðŸ—‘ï¸ All logs cleared");
}

function forceClearAllLogs() {
  localStorage.removeItem("D4B_logs");
  localStorage.removeItem("D4B_guest_session");
  resetGuestState();
  console.log(" Force cleared all logs and state");
}

// ====== LOOP KILLERS (TEST MODE) ======
window.__D4B_TEST_LOCK__ = window.__D4B_TEST_LOCK__ || { isProcessing:false };
window.__D4B_HISTORY__ = window.__D4B_HISTORY__ || [
  { role: "system", content: SYSTEM_PROMPT_FR }
];

// 1) Deduplicate input binding (prevents double send on submit+keydown)
(function bindOnce(){
  if (window.__D4BInputBound) return;
  window.__D4BInputBound = true;
  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input");
  if (form) {
    form.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const text = (input?.value || "").trim();
      if (input) input.value = "";
      await handleUserMessage_QAOnly(text);
    });
  }
  // If there's an onkeydown listener elsewhere, neuter Enter-to-send duplicates:
  if (input) {
    input.addEventListener("keydown", (e)=>{
      if (e.key === "Enter") e.stopPropagation();
    });
  }
})();

// 2) Safe renderer that ignores generic fallbacks injected by old code
function displayResponse_STRICT(text) {
  // Use the existing addMessage function if available
  if (typeof addMessage === 'function') {
    addMessage(text, false);
  } else {
    (window.displayResponse || ((t)=>console.log("BOT:", t)))(text);
  }
}

// 3) Force pure Q&A route every turn. No classifiers, no menus, no logs.
async function handleUserMessage_QAOnly(userMessage) {
  // In your send handler (handleUserMessage_QAOnly), add at the top:
  if (!window.__D4B_APPROVED__) {
    return " Please wait â€” your profile is pending approval.";
  }

  const lock = window.__D4B_TEST_LOCK__;
  if (lock.isProcessing) {
    console.log(" Request blocked - already processing");
    return;
  }
  const msg = (userMessage || "").trim();
  if (!msg) return;

  // Initialize confirmation message
  let confirmationMessage = null;

  console.log(" QA Mode - Processing:", msg);

  try {
    lock.isProcessing = true;

    // Sync guest state from session data if needed
    syncGuestStateFromSession();

    // Get guest info from stored data (guest info is set when approved, no need to extract)
    const guestInfo = getBestGuestInfo();
    const { name: finalName, room: finalRoom, nameSource, roomSource } = guestInfo;

    // Force QA-mode to French to ensure system prompt is in French
    guest.lang = 'FR';

    // If a troubleshooting flow is active, treat this message as a follow-up
    const tsMemory = guest.intentMemory && guest.intentMemory.troubleshoot ? guest.intentMemory.troubleshoot : {};
    const activeCategory = Object.keys(tsMemory).find(k => {
      const s = tsMemory[k];
      const flowObj = TROUBLESHOOT_FLOWS[k] || TROUBLESHOOT_FLOWS['General IT Support'];
      const stepsArray = Array.isArray(flowObj) ? flowObj : (flowObj.EN || flowObj); // Handle both formats
      return s && typeof s.step === 'number' && s.step > 0 && s.step <= stepsArray.length;
    });
    const ticketIntent = isTicketCreationIntent(msg);

    if (activeCategory) {
      const lower = (msg || '').toLowerCase();
      const normLower = lower.normalize ? lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : lower;
      const explicitFixed = /(fixed|resolved|resolu|regle|reglÃ©|ca marche|c'est resolu|cest resolu|fonctionne|a fonctionne|a marche|a marche|a marche)/i;
      const genericYes = /(yes|y|oui|si|ok|d'accord|bien)/i;
      const no = /(no|n|non|not yet|pas encore|nope)/i;
      const unresolvedResponse = /\b(rien n'a fonctionn[eé]|rien ne fonctionne|toujours pas|pas r[eé]solu|ca ne fonctionne pas|ça ne fonctionne pas|toujours en panne|aucune solution)\b/i;
      const awaiting = !!(tsMemory[activeCategory] && tsMemory[activeCategory].awaitingConfirmation);
      const lastAssistant = [...(window.__D4B_HISTORY__ || [])].reverse().find(m => m.role === 'assistant');
      const lastText = lastAssistant?.content || '';
      const lastTextNorm = lastText.normalize ? lastText.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'') : lastText;
      const confirmationAsked = awaiting || /veuillez me dire si le probleme est resolu|did that fix the issue|did that fix the problem|reply with 'yes, fixed' or 'no'|repondez par 'oui, resolu' ou 'non'/i.test(lastTextNorm.toLowerCase());
      const ticketConfirmationAsked = /le probleme persiste|le problÃ¨me persiste|does the issue still persist|does it still persist|still persist|open a ticket|ouvrir un ticket/i.test(lastTextNorm.toLowerCase());
      const shouldCreateTicket = ticketIntent || unresolvedResponse.test(normLower) || (genericYes.test(normLower) && ticketConfirmationAsked);

      if (!genericYes.test(normLower) && !no.test(normLower) && !explicitFixed.test(normLower) && !ticketIntent && !unresolvedResponse.test(normLower) && msg.length > 5) {
        try {
          const state = tsMemory[activeCategory] || {};
          const newDetails = state.details ? `${state.details}; ${msg}` : msg;
          if (newDetails !== state.details) {
            state.details = newDetails;
            guest.intentMemory.troubleshoot[activeCategory] = state;
            saveGuestState();
          }
        } catch (e) {
          console.warn('Could not append troubleshoot details:', e);
        }
      }

      if (explicitFixed.test(normLower)) {
        // User explicitly confirms the issue is fixed
        delete guest.intentMemory.troubleshoot[activeCategory];
        saveGuestState();
        return askByLang(
          "Thanks â€” glad it's fixed. I closed the troubleshooting flow.",
          "Merci â€” ravi que ce soit rÃ©solu. J'ai fermÃ© le flux de dÃ©pannage.",
          "ØªÙ… Ø§Ù„Ø­Ù„ØŒ Ø´ÙƒØ±Ù‹Ø§."
        );
      }

      if (shouldCreateTicket) {
        const sessionData = JSON.parse(localStorage.getItem('D4B_CURRENT_SESSION') || '{}');
        const state = tsMemory[activeCategory] || {};
        const priority = state.priority || 'P3';
        const serviceLot = state.serviceLot || activeCategory;
        const slaDeadline = state.slaDeadline || calculateSlaDeadline(priority);
        const requestText = state.details ? `${activeCategory} - ${state.details}` : `${activeCategory} - ${msg}`;
        const requestPayload = {
          sessionId: sessionData.id || window.currentSessionId || null,
          name: finalName || sessionData.name || window.guest?.name || 'Guest',
          room: finalRoom || sessionData.room || window.guest?.room || 'TBD',
          email: sessionData.email || window.guest?.email || null,
          text: requestText,
          priority,
          serviceLot,
          slaDeadline,
          category: activeCategory,
          lang: sessionData.language || (navigator.language || '').slice(0, 2) || null
        };
        const aRes = await openAteraTicket(requestPayload);
        if (aRes && (aRes.ticketId || aRes.id || aRes.ActionID)) {
          const ticketId = aRes.ticketId || aRes.id || aRes.ActionID;
          delete guest.intentMemory.troubleshoot[activeCategory];
          saveGuestState();
          return `${getConfirmationMessage(msg, { priority: requestPayload.priority, serviceLot: requestPayload.serviceLot, slaDeadline: requestPayload.slaDeadline })} Ticket opened: ${ticketId}`;
        }
        delete guest.intentMemory.troubleshoot[activeCategory];
        saveGuestState();
        return getConfirmationMessage(msg);
      }

      if (confirmationAsked) {
        // Treat as explicit fixed
        delete guest.intentMemory.troubleshoot[activeCategory];
        saveGuestState();
        return askByLang(
          "Thanks â€” glad it's fixed. I closed the troubleshooting flow.",
          "Merci â€” ravi que ce soit rÃ©solu. J'ai fermÃ© le flux de dÃ©pannage.",
          "ØªÙ… Ø§Ù„Ø­Ù„ØŒ Ø´ÙƒØ±Ù‹Ø§."
        );
      }

      // Otherwise ask for explicit confirmation before closing the troubleshooting flow
      // Mark the troubleshooting state as awaiting explicit confirmation so a simple 'oui' can close it next turn
      try {
        if (!guest.intentMemory) guest.intentMemory = {};
        if (!guest.intentMemory.troubleshoot) guest.intentMemory.troubleshoot = {};
        if (!guest.intentMemory.troubleshoot[activeCategory]) guest.intentMemory.troubleshoot[activeCategory] = {};
        guest.intentMemory.troubleshoot[activeCategory].awaitingConfirmation = true;
        saveGuestState();
      } catch (e) {
        console.warn('Could not mark awaitingConfirmation:', e);
      }
      return askByLang(
        "Please tell me whether the problem is fixed or if you still need help. Reply with 'yes, fixed' or 'no'.",
        "Veuillez me dire si le problÃ¨me est rÃ©solu ou si vous avez encore besoin d'aide. RÃ©pondez par 'oui, rÃ©solu' ou 'non'.",
        "Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø¥Ø®Ø¨Ø§Ø±ÙŠ Ù…Ø§ Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ù‚Ø¯ ØªÙ… Ø­Ù„Ù‡Ø§ Ø£Ù… Ø£Ù†Ùƒ Ù…Ø§ Ø²Ù„Øª Ø¨Ø­Ø§Ø¬Ø© Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯Ø©. Ø£Ø¬Ø¨ Ø¨Ù†Ø¹Ù…ØŒ ØªÙ… Ø§Ù„Ø­Ù„ Ø£Ùˆ Ù„Ø§."
      );

      if (no.test(normLower)) {
        const ticketConfirmationAsked = /le probleme persiste|le problÃ¨me persiste|does the issue still persist|does it still persist|still persist|open a ticket|ouvrir un ticket/i.test(lastTextNorm.toLowerCase());
        if (ticketConfirmationAsked) {
          delete guest.intentMemory.troubleshoot[activeCategory];
          saveGuestState();
          return askByLang(
            "Thank you. I will assume the issue is resolved and close the diagnostics flow.",
            "Merci. Je considÃ¨re le problÃ¨me comme rÃ©solu et je clÃ´ture le flux de diagnostic.",
            "Ø´ÙƒØ±Ø§Ù‹. Ø³Ø£Ø¹ØªØ¨Ø± Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ù…Ø­Ù„ÙˆÙ„Ø© ÙˆØ£ØºÙ„Ù‚ ØªØ¯ÙÙ‚ Ø§Ù„ØªØ´Ø®ÙŠØµ."
          );
        }

        // Advance to next troubleshooting step for the same category
        const next = await runTroubleshootFlow('', activeCategory);
        if (next && !next.done && next.step) {
          return next.step;
        }

        // If done, ask for final confirmation before opening a ticket
        const state = tsMemory[activeCategory] || {};
        if (!state.awaitingFinalConfirmation) {
          try {
            if (!guest.intentMemory) guest.intentMemory = {};
            if (!guest.intentMemory.troubleshoot) guest.intentMemory.troubleshoot = {};
            if (!guest.intentMemory.troubleshoot[activeCategory]) guest.intentMemory.troubleshoot[activeCategory] = {};
            guest.intentMemory.troubleshoot[activeCategory].awaitingFinalConfirmation = true;
            saveGuestState();
          } catch (e) {
            console.warn('Could not mark awaitingFinalConfirmation:', e);
          }
          return askByLang(
            "I have finished the troubleshooting steps. Does the issue still persist? Reply yes to open a ticket or no if it is resolved.",
            "J'ai terminÃ© les Ã©tapes de dÃ©pannage. Le problÃ¨me persiste-t-il toujours ? RÃ©pondez oui pour ouvrir un ticket ou non si le problÃ¨me est rÃ©solu.",
            "Ù„Ù‚Ø¯ Ø£ÙƒÙ…Ù„Øª Ø®Ø·ÙˆØ§Øª Ø§Ø³ØªÙƒØ´Ø§Ù Ø§Ù„Ø£Ø®Ø·Ø§Ø¡. Ù‡Ù„ Ù„Ø§ ØªØ²Ø§Ù„ Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ù‚Ø§Ø¦Ù…Ø©ØŸ Ø£Ø¬Ø¨ Ø¨Ù†Ø¹Ù… Ù„ÙØªØ­ ØªØ°ÙƒØ±Ø© Ø£Ùˆ Ù„Ø§ Ø¥Ø°Ø§ ØªÙ… Ø­Ù„ Ø§Ù„Ù…Ø´ÙƒÙ„Ø©."
          );
        }

        // If final confirmation was already requested, proceed to ticket creation
        const sessionData = JSON.parse(localStorage.getItem('D4B_CURRENT_SESSION') || '{}');
        const priority = state.priority || 'P3';
        const serviceLot = state.serviceLot || activeCategory;
        const slaDeadline = state.slaDeadline || calculateSlaDeadline(priority);
        const requestText = state.details ? `${activeCategory} - ${state.details}` : `${activeCategory} - ${msg}`;
        const requestPayload = {
          sessionId: sessionData.id || window.currentSessionId || null,
          name: finalName || sessionData.name || window.guest?.name || 'Guest',
          room: finalRoom || sessionData.room || window.guest?.room || 'TBD',
          email: sessionData.email || window.guest?.email || null,
          text: requestText,
          priority,
          serviceLot,
          slaDeadline,
          category: activeCategory,
          lang: sessionData.language || (navigator.language || '').slice(0, 2) || null
        };
        const aRes = await openAteraTicket(requestPayload);
        if (aRes && (aRes.ticketId || aRes.id || aRes.ActionID)) {
          const ticketId = aRes.ticketId || aRes.id || aRes.ActionID;
          delete guest.intentMemory.troubleshoot[activeCategory];
          saveGuestState();
          return `${getConfirmationMessage(msg, { priority: requestPayload.priority, serviceLot: requestPayload.serviceLot, slaDeadline: requestPayload.slaDeadline })} Ticket opened: ${ticketId}`;
        }

        delete guest.intentMemory.troubleshoot[activeCategory];
        saveGuestState();
        return getConfirmationMessage(msg);
      }

      // If the user message was not a clear yes/no reply and the assistant did not ask a fix confirmation,
      // allow normal message handling instead of forcing a yes/no follow-up.
      if (confirmationAsked) {
        return askByLang(
          "Did that fix the issue? Please answer yes or no.",
          "Cela a-t-il rÃ©solu le problÃ¨me ? Veuillez rÃ©pondre par oui ou non.",
          "Ù‡Ù„ ØªÙ… Ø­Ù„ Ø§Ù„Ù…Ø´ÙƒÙ„Ø©ØŸ Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø§Ù„Ø¥Ø¬Ø§Ø¨Ø© Ø¨Ù†Ø¹Ù… Ø£Ùˆ Ù„Ø§."
        );
      }

      // If this is not a confirmation reply, continue normal processing.
      console.log('Not a yes/no follow-up; continuing normal QA flow.');
    }

    if (!activeCategory && ticketIntent) {
      const sessionData = JSON.parse(localStorage.getItem('D4B_CURRENT_SESSION') || '{}');
      const summary = summarizeRequest(msg);
      const requestPayload = buildAteraRequestPayload(summary, msg, finalName, finalRoom, sessionData);
      const aRes = await openAteraTicket(requestPayload);
      if (aRes && (aRes.ticketId || aRes.id || aRes.ActionID)) {
        const ticketId = aRes.ticketId || aRes.id || aRes.ActionID;
        return `Ticket créé : ${ticketId}`;
      }
      return askByLang(
        "Je n'ai pas pu créer le ticket. Veuillez réessayer ou préciser le problème.",
        "Je n'ai pas pu créer le ticket. Veuillez réessayer ou préciser le problème.",
        "Ù…Ø¹Ù„ÙŠØ´Ø©: Ù„Ø³ØªØ·Ø§Ø¹ Ø¹Ù„Ù‰ Ø£Ù†Ù‡ Ù„ÙŠØ³ Ø¨Ø§Ù„Ø¥Ù…ÙŠÙ‡Ø§Ù† ÙŠÙ†Ø´Ø¡ Ø§Ù„ØªØ°ÙƒØ±.",
      );
    }

    const serviceRequest = isServicey(msg);

    // Log request if it looks like one (non-blocking) - NOW WITH FALLBACK GUEST INFO
    if (window.__D4B_APPROVED__ && window.SERVICE_LOGGING && serviceRequest) {
      // Debounce duplicates
      const now = Date.now();
      if (window.__lastReqText === msg && (now - (window.__lastReqAt || 0) < 7000)) {
        console.log('[REQ-LOG] Skipping duplicate request:', msg);
        return;
      }
      window.__lastReqText = msg;
      window.__lastReqAt = now;
      
      // Get session context from localStorage
      const sessionData = JSON.parse(localStorage.getItem('D4B_CURRENT_SESSION') || '{}');
      const { category, details, priority, serviceLot, slaDeadline } = summarizeRequest(msg);
      const order = parseD4BOrder(msg);
      const requestText = order ? order.message : (details || msg);
      
      // Add to memory and request history
      addRequestToHistory(requestText);
      addToMemory('lastRequest', requestText);
      
      // Telemetry logging
      const normalizedMsg = norm(msg);
      if (HARD.test(normalizedMsg)) {
        console.log('[REQ-LOG] matched HARD:', msg);
      } else if (INTENT.test(normalizedMsg)) {
        console.log('[REQ-LOG] matched INTENT:', msg);
      }
      
      // Use fallback guest info for request logging
      const requestPayload = {
        sessionId: sessionData.id || window.currentSessionId || null,
        name: finalName || sessionData.name || window.guest?.name || 'Guest',
        room: finalRoom || sessionData.room || window.guest?.room || 'TBD',
        email: sessionData.email || window.guest?.email || null,
        text: requestText,
        priority,
        serviceLot,
        slaDeadline,
        category,
        lang: sessionData.language || (navigator.language || '').slice(0, 2) || null
      };
      
      console.info('[REQ-LOG] payload with fallback:', { 
        ...requestPayload, 
        nameSource, 
        roomSource 
      });
      
      confirmationMessage = await logServiceRequest(requestPayload);
      
      // Log confirmation type
      if (confirmationMessage) {
        console.log('[REQ-LOG] confirmation used');
      }
    }

    // If this was an IT service request, attempt guided troubleshooting first
    if (serviceRequest) {
      try {
        const ts = await runTroubleshootFlow(msg);
        if (ts && !ts.done && ts.step) {
          return ts.step; // return next troubleshooting instruction
        }

        if (ts && ts.done) {
          const state = guest.intentMemory.troubleshoot[ts.category] || {};
          if (!state.awaitingFinalConfirmation) {
            state.awaitingFinalConfirmation = true;
            guest.intentMemory.troubleshoot[ts.category] = state;
            saveGuestState();
            return askByLang(
              "J'ai terminÃ© les Ã©tapes de dÃ©pannage. Le problÃ¨me persiste-t-il toujours ? RÃ©pondez par oui pour ouvrir un ticket ou par non si le problÃ¨me est rÃ©solu.",
              "J'ai terminÃ© les Ã©tapes de dÃ©pannage. Le problÃ¨me persiste-t-il toujours ? RÃ©pondez par oui pour ouvrir un ticket ou par non si le problÃ¨me est rÃ©solu.",
              "Ù„Ù‚Ø¯ Ø£ÙƒÙ…Ù„Øª Ø®Ø·ÙˆØ§Øª Ø§Ø³ØªÙƒØ´Ø§Ù Ø§Ù„Ø£Ø®Ø·Ø§Ø¡. Ù‡Ù„ Ù„Ø§ ØªØ²Ø§Ù„ Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ù‚Ø§Ø¦Ù…Ø©ØŸ Ø£Ø¬Ø¨ Ø¨Ù†Ø¹Ù… Ù„ÙØªØ­ ØªØ°ÙƒØ±Ø© Ø£Ùˆ Ù„Ø§ Ø¥Ø°Ø§ ØªÙ… Ø­Ù„ Ø§Ù„Ù…Ø´ÙƒÙ„Ø©."
            );
          }
        }
      } catch (e) {
        console.warn('Troubleshoot/escalation failed', e);
      }

      // Fallback confirmation if no troubleshooting step is returned
      return confirmationMessage || getConfirmationMessage(msg);
    }

    // Ticket status query support (Atera lookup)
    const ticketCheckRegex = /\b(\/tickets|mes tickets|statut ticket|statut des tickets|ticket status|mes demandes)\b/i;
    if (ticketCheckRegex.test(msg)) {
      return await queryAteraTicketsForWeb();
    }

    // Check for memory-based questions first
    const memoryResponse = handleMemoryBasedQuestions(msg);
    if (memoryResponse) {
      return memoryResponse;
    }

    // Check for intent follow-up
    const intentResponse = detectIntentAndFollowUp(msg);
    if (intentResponse) {
      return intentResponse;
    }

    // Append user message
    window.__D4B_HISTORY__.push({ role: "user", content: msg });
    console.log(" History length:", window.__D4B_HISTORY__.length);

    // Call GPT (your existing function or the inline one below)
    const reply = await getGPTResponse_Direct(window.__D4B_HISTORY__);
    console.log(" Mistral Response:", reply);

    let out = (reply || "").trim() || askByLang(
      "I can help with IT support for D4B. Please describe the technical issue you're facing.",
      "Je peux vous aider avec le support IT D4B. DÃ©crivez le problÃ¨me technique que vous rencontrez.",
      "Ø£Ù†Ø§ Ù‡Ù†Ø§ Ù„Ø¯Ø¹Ù… ØªÙƒÙ†ÙˆÙ„ÙˆØ¬ÙŠØ§ Ø§Ù„Ù…Ø¹Ù„ÙˆÙ…Ø§Øª ÙÙŠ D4B. ØµÙ Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ø§Ù„ØªÙ‚Ù†ÙŠØ© Ø§Ù„ØªÙŠ ØªÙˆØ§Ø¬Ù‡Ù‡Ø§."
    );
    
    // If this was a service request and the response seems generic, replace with confirmation
    if (isServicey(msg)) {
      const lowerReply = out.toLowerCase();
      const genericPhrases = ['please contact', 'contact store', 'call restaurant', 'contact the restaurant', 'restaurant staff'];
      const isGeneric = genericPhrases.some(phrase => lowerReply.includes(phrase));
      
      if (isGeneric) {
        // Replace generic response with confirmation message
        out = confirmationMessage || getConfirmationMessage(msg);
      }
    }
    
    // Belt & suspenders: ensure medical/critical incidents get a P1 confirmation
    const isMedical = /\b(doctor|medecin|mÃ©decin|clinic|pharmacy|first aid|urgent|emergency)\b/.test(norm(msg));
    if (isMedical && !confirmationMessage) {
      const detectedLang = detectLanguage(msg);
      out = getConfirmationMessage(msg, { priority: 'P1', serviceLot: 'Lot 1 - Helpdesk / Service Desk', slaDeadline: calculateSlaDeadline('P1') });
    }
    
    // Final fallback for any service request without confirmation
    if (!confirmationMessage && isServicey(msg)) {
      out = getConfirmationMessage(msg);
    }
    
    // Save assistant message for context
    window.__D4B_HISTORY__.push({ role: "assistant", content: out });

    console.log(" QA Mode - Returning:", out);
    return out; // Return the response instead of calling displayResponse directly

  } catch (err) {
    console.error("GPT error:", err);
    return "Petit souci rÃ©seauâ€¦ rÃ©essayez dans un instant.";
  } finally {
    lock.isProcessing = false;
  }
}

// 4) Minimal GPT call (uses server proxy)
async function getGPTResponse_Direct(history){
  try {
    // Get guest info for conversation logging
    const sessionData = JSON.parse(localStorage.getItem('D4B_CURRENT_SESSION') || '{}');
    const guestInfo = getBestGuestInfo();
    // Build messages and ensure system prompt matches guest language preference
    const messages = Array.isArray(history) ? history.slice() : [];
    const prefLang = (guest.lang || sessionData.language || '').toUpperCase();
    // Ensure a system prompt is present
    if (messages.length === 0 || messages[0].role !== 'system') {
      messages.unshift({ role: 'system', content: SYSTEM_PROMPT_FR });
    } else {
      messages[0].content = SYSTEM_PROMPT_FR;
    }

    const requestBody = {
      model: 'mistral-medium-latest',
      messages,
      temperature: 0.4,
      sessionId: sessionData.id || window.currentSessionId || null,
      guestInfo: {
        name: guestInfo.name || sessionData.name || window.guest?.name,
        room: guestInfo.room || sessionData.room || window.guest?.room
      }
    };
    
    console.log(' Sending chat request with guest info:', {
      sessionId: requestBody.sessionId,
      guestName: requestBody.guestInfo.name,
      guestRoom: requestBody.guestInfo.room
    });
    
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Proxy error:', data);
      return "DÃ©solÃ©, petit souci serveur. RÃ©essayez.";
    }
    return data?.choices?.[0]?.message?.content ?? "Je n'ai pas compris, reformulez svp.";
  } catch (e) {
    console.error('Fetch /api/chat failed:', e);
    return "ProblÃ¨me rÃ©seau. Retentez dans un instant.";
  }
}

// 5) Neutralize overwriters that commonly cause loops (if they exist)
["renderMainMenu","showHelpBanner","renderQuickActions","displayGenericHelper"]
  .forEach(fn => {
    if (typeof window[fn] === "function") {
      const original = window[fn];
      window[fn] = function() {
        // In QA test mode, do nothing (prevents overwriting real answers)
        console.debug(` Suppressed ${fn} during QA testing.`);
        return; // original(); // <-- re-enable later if you want
      };
    }
  });

// 5.5) AGGRESSIVE LOOP KILLER - Override old functions completely
(function aggressiveOverride() {
  // Override the old handleUserInput to prevent it from being called
  const originalHandleUserInput = window.handleUserInput;
  window.handleUserInput = function(text) {
    console.log(" OLD handleUserInput BLOCKED - using QA system instead");
    // Call the new QA system instead
    return handleUserMessage_QAOnly(text);
  };
  
  // Override any other potential interference
  if (typeof window.processSingleIntent === "function") {
    const originalProcessSingleIntent = window.processSingleIntent;
    window.processSingleIntent = function(text) {
      console.log(" OLD processSingleIntent BLOCKED - using QA system instead");
      return handleUserMessage_QAOnly(text);
    };
  }
  
  console.log(" Aggressive loop killer activated");
})();

// 6) Kill periodic UI timers that re-inject generic blocks
for (const k in window) {
  if (/setInterval|setTimeout/.test(k)) continue; // don't nuke browser APIs
}
// If you know IDs of timers, clear them here, e.g.:
// clearInterval(window.__menuTick); clearTimeout(window.__helpBannerDelay);

// 7) Test function for console debugging
window.testQAFlow = async function() {
  console.log(" Testing QA flow...");
  
  // Reset conversation but keep system prompt
  window.__D4B_HISTORY__ = [window.__D4B_HISTORY__[0]];
  
  // Test three messages
  const test1 = await handleUserMessage_QAOnly("can I order a bucket meal?");
  console.log("Test 1 (order):", test1);
  
  const test2 = await handleUserMessage_QAOnly("et les promos D4B?");
  console.log("Test 2 (promotions):", test2);
  
  const test3 = await handleUserMessage_QAOnly("do you offer delivery?");
  console.log("Test 3 (delivery):", test3);
  
  console.log(" QA flow test complete!");
};

// 8) Startup verification
(function verifyLoopKiller() {
  console.log(" Loop Killer Status Check:");
  console.log("  - __D4B_TEST_LOCK__:", !!window.__D4B_TEST_LOCK__);
  console.log("  - __D4B_HISTORY__:", !!window.__D4B_HISTORY__);
  console.log("  - handleUserMessage_QAOnly:", typeof window.handleUserMessage_QAOnly);
  console.log("  - getGPTResponse_Direct:", typeof window.getGPTResponse_Direct);
  console.log("  - SYSTEM_PROMPT_FR:", !!window.SYSTEM_PROMPT_FR);
  console.log(" Loop Killer System Ready!");
  console.log(" TESTING MODE: All messages will go through QA system only");
  console.log(" Old system functions are completely disabled");
})();





