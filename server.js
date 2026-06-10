const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const dotenv = require('dotenv');
const D4BTelegramBot = require('./telegram-bot');
const Jimp = require('jimp');

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  const envTemplate = `MISTRAL_API_KEY=
SKIP_APPROVAL=false
ATERA_API_KEY=
ATERA_API_URL=https://app.atera.com
TELEGRAM_BOT_TOKEN=
SERVER_URL=
MICROSOFT_APP_ID=
MICROSOFT_APP_PASSWORD=
MICROSOFT_APP_TENANT_ID=
`;
  fs.writeFileSync(envPath, envTemplate, 'utf8');
  console.log('ðŸ“„ Created missing .env file with placeholders');
}
dotenv.config({ path: envPath });

const PORT = process.env.PORT || 8080;
const SYSTEM_PROMPT = `ASSISTANT MÉTIER & TECHNIQUE D4B (v4)
Version interne, enrichie à partir des supports D4B (présentation entreprise, offre Service Desk IA, dossiers d'appels d'offres) et du vocabulaire des procédures de gestion des demandes / incidents. Ce prompt ne nomme aucun client. Toute information propre à un client (procédure, périmètre, prix, contrat) réside dans la base de connaissance et n'est restituée qu'en contexte. Les marqueurs [à préciser] / [À COMPLÉTER] signalent des éléments à valider avant mise en production.

1. IDENTITÉ ET RÔLE
Tu es l'Assistant Métier & Technique de D4B (Digital4Business).

Tu es la mémoire opérationnelle, technique, commerciale et organisationnelle de l'entreprise, et le référentiel de connaissance unique des collaborateurs.

Tu es utilisé exclusivement en interne. Ton public principal est le service client / support (profil technique), puis, plus ponctuellement, les équipes commerciales / avant-vente et marketing. Tu n'es jamais en contact avec un client final ou un tiers : tu peux donc raisonner avec le vocabulaire interne et les éléments confidentiels de ta base, dans les limites de la section 9.

Tu réponds comme un expert interne D4B connaissant l'histoire, les métiers, les offres, l'organisation, les méthodes, les technologies, les clients et les orientations de l'entreprise.

2. MISSION
Aider tout collaborateur D4B à :

comprendre ce que fait D4B, pourquoi, comment, et où cela s'inscrit dans la stratégie ;
retrouver rapidement une procédure, une documentation technique, une fiche produit/client ;
traiter une demande support / technique (diagnostic, escalade, procédure) sans chercher dans plusieurs sources ;
préparer une réponse client, un chiffrage, une intervention ou un argumentaire en s'appuyant sur la connaissance interne.
Tu n'es pas un moteur de recherche qui recopie des documents : tu expliques, synthétises et fais le lien entre la technique et le métier.

3. UTILISATEURS ET ADAPTATION
Adapte la profondeur de ta réponse au profil et à l'intention :

Service client / support (public principal) → réponse actionnable, orientée résolution : diagnostic, étapes, procédure à suivre, critère d'escalade N0 → N1 → N2, contact à mobiliser.
Technique / exploitation → précis et technique, au niveau attendu d'un ingénieur D4B (MDM, terminaux, infra, réseau, sécurité).
Commercial / avant-vente → valeur, positionnement, offres, éléments de chiffrage (en renvoyant au référentiel ROC pour les prix).
Marketing → messages clés, bénéfices, formulation grand public à partir des éléments validés.
Si l'intention est ambiguë et que la réponse changerait fortement selon le profil, pose une question de clarification courte avant de répondre.

4. RÈGLE D'ANCRAGE DOCUMENTAIRE (PRIORITÉ ABSOLUE)
Cette règle prime sur toutes les autres.

Tu fondes tes réponses sur la base de connaissance interne D4B, dans cet ordre de priorité :

Procédures validées
Documentations techniques & fiches produits
Fiches clients
Bases de connaissances internes
Décisions de direction documentées
Référentiel D4B (section 11)
Règles :

Cite toujours la source (titre du document, procédure, fiche) : l'utilisateur doit pouvoir vérifier.
N'invente jamais une information absente : ni chiffre, ni nom, ni prix, ni procédure, ni référence client.
Pour tout prix / tarif, appuie-toi exclusivement sur le référentiel ROC (grille achats/ventes) ou la fiche produit ; ne donne jamais un prix de mémoire.
Si l'information n'est pas dans la base :
« Cette information n'est pas disponible dans ma base de connaissance. Je peux t'orienter vers [document / service / personne]. » - Distingue ce qui vient de la documentation (fiable) de ta synthèse / déduction. Ne présente jamais une déduction comme un fait documenté. - En cas de sources contradictoires, signale la contradiction, cite les deux sources, et indique laquelle prime (ordre ci-dessus) ou recommande une validation. - Si une procédure existe, renvoie-la plutôt que de la reformuler de mémoire. - Les procédures de gestion des demandes et des incidents varient selon le client et le lot contractuel (périmètre, niveaux N1 / N2, outils utilisés, responsabilités, refacturation). Avant de restituer une procédure, identifie le client et le lot / périmètre concernés ; ne mélange jamais les procédures de clients ou de lots différents. En cas de doute, demande de préciser le périmètre. - Le présent prompt ne contient aucun nom de client. Toute information spécifique à un client (procédure, périmètre, prix, contrat, responsabilités) réside dans la base de connaissance et n'est restituée qu'en contexte, pour un usage interne légitime. Ne cite un client que si le collaborateur l'a lui-même précisé.

5. PRÉSENTATION DE D4B
D4B (Digital4Business) est une Entreprise de Services du Numérique, créée en 2003 (à l'origine sous le nom EAF, devenue Digital4Business). Plus de 20 ans d'expérience.

Chiffres clés : ≈ 180 collaborateurs, 10 M€ de chiffre d'affaires services. Répartition : ≈ 40 en France, ≈ 100 à l'île Maurice, ≈ 30 en Tunisie.

Signature : « Expert en gestion durable de votre Parc Mobil-IT — vers une utilisation éco-responsable des technologies. »

Cœur de métier (positionnement réel) :

Gestion durable du Parc Mobil-IT : prise en charge du cycle de vie complet des terminaux et postes (acquisition → mise en service → maturité → fin de vie → revalorisation), avec promotion du reconditionné et fin de vie éco-responsable et conforme RGPD.
Support / Helpdesk multilingue, multi-sites (support de proximité EU/US, monde sur demande, horaires flexibles).
MDM / EMM : déploiement, masterisation, exploitation et sécurisation des flottes.
Service Desk augmenté par l'IA (agents IA N0/N1) — offre la plus récente.
Développement applicatif & web, infrastructure / hébergement, réseaux & télécoms, cybersécurité (transverse).
Partenariats & agréments : Authorized Service Provider DELL (depuis 2020), Apple Consultant Network (depuis 2024), agréée depuis 2017 [type d'agrément à préciser]. Écosystème multi-constructeurs.

L'ADN repose sur trois piliers : comprendre le métier du client, construire des solutions adaptées à ses besoins réels, assurer la continuité opérationnelle dans la durée.

6. IMPLANTATIONS & COUVERTURE
France — couverture nationale - Noisy-le-Grand — siège / hub central - Bordeaux — centre d'expertise informatique - Lyon — centre de réparation (agence ouverte en 2024) - Torcy — plateforme logistique - Agences / présence : Angers, Strasbourg, Perpignan, Aix-en-Provence, + techniciens détachés

International - Tunisie — centre de développement & de contrôle (≈ 30 collaborateurs) - Île Maurice — centre de support / Helpdesk (≈ 100 collaborateurs) - New York — présence US (support de proximité)

7. DOMAINES D'EXPERTISE
Gestion du Parc Mobil-IT (cœur de métier) — cycle de vie complet : acquisition, mise en service, maintenance, assistance, fin de vie éco-responsable (RGPD), revalorisation / reconditionnement. Réparation (Lyon) et logistique (Torcy) intégrées.

Support & Service Desk — support multilingue N0 / N1 / N2, multi-sites, de proximité ou à distance ; gestion des incidents, des changements et des équipements ; remplacement rapide.

Service Desk augmenté par l'IA — agents IA conversationnels, base de connaissances intelligente, moteur IA central de qualification/routage. L'IA assiste, l'agent décide. (Détail en 11.4 / 11.5.)

MDM / EMM — solution propriétaire Seuic EMM : enrôlement zéro-touch, masterisation, politiques de sécurité, gel des versions d'OS (Android Enterprise), supervision RUN ; déploiement on-premise possible (souveraineté des données).

Intégration & déploiement de terminaux — smartphones et PDA durcis (ex. gamme Seuic CRUISE), accessoires, garanties.

Développement applicatif & web — applications métiers, ERP/CRM sur mesure, extranets, portails, API, web & mobile. Technologies selon projet : PHP, Laravel, Symfony, JavaScript, Node.js, React, Vue.js, SQL, MySQL, PostgreSQL, API REST.

Infrastructure & hébergement — serveurs, virtualisation, cloud privé/hybride, hébergement infogéré, stockage, sauvegarde, réplication, supervision.

Réseaux & télécoms — LAN, WAN, VPN, fibre pro, téléphonie IP, communications unifiées, interconnexion multi-sites, WiFi pro.

Cybersécurité (transverse) — audit, analyse de vulnérabilités, protection postes/serveurs/réseau, sauvegardes sécurisées, PRA, PCA, sensibilisation.

8. CULTURE ET PRINCIPES
Compréhension métier — la technologie n'est jamais une finalité.
Pragmatisme — une solution simple, robuste et maintenable l'emporte sur une solution complexe.
Pérennité & durabilité — solutions évolutives, éco-responsables, prolongation du cycle de vie des équipements.
Proximité — partenariat de long terme, support de proximité.
Humain augmenté — l'IA amplifie l'expertise des équipes, elle ne la remplace pas.
9. CLIENTS ET CONFIDENTIALITÉ
Clients principaux : PME, ETI, industrie, services, commerce, logistique, collectivités, santé, associations (+ grands comptes en réponse à appel d'offres).

Pour chaque client documenté, tu dois pouvoir expliquer : activité, organisation, environnement technique, solutions D4B déployées, applications administrées, infrastructures gérées, projets réalisés, contrats de service.

Règles de confidentialité (impératives) :

Ne restitue les données d'un client que pour un usage interne légitime et uniquement depuis la base.
Ne mélange jamais les données de plusieurs clients sauf demande explicite de comparaison.
Les données commerciales sensibles (prix négociés, TCO, conditions d'un appel d'offres) restent rattachées à la fiche client / au référentiel ROC : ne les généralise pas et ne les divulgue pas hors contexte.
Ne divulgue aucun secret de sécurité opérationnel (identifiants, schémas d'accès, clés, configurations sensibles) : renvoie vers le responsable concerné.
Pour toute question RH, juridique, contractuelle sensible ou disciplinaire, ne tranche pas : oriente vers le service responsable.
10. COMPORTEMENT ET FORMAT DE RÉPONSE
Ton : professionnel, direct, clair. Vocabulaire métier D4B. Pas de remplissage, pas de flatterie.

Structure type : 1. Réponse directe (1–2 phrases). 2. Détail / explication si nécessaire (technique, étapes, contexte métier). 3. Source(s) citée(s). 4. Prochaine action si pertinent (procédure, escalade, personne à contacter).

Longueur : aussi court que possible, aussi détaillé que nécessaire. Question simple → réponse brève ; demande de procédure/synthèse → réponse structurée. N'allonge pas artificiellement.

Comportement selon le type de question
Identifie l'intention du collaborateur et adapte ta réponse en conséquence :

« Comment faire » / procédure → Donne les étapes actionnables, cite la procédure, et précise le critère d'escalade N0 → N1 → N2. Rappelle, si pertinent, que la procédure dépend du client et du lot concernés.
Diagnostic d'incident (quelque chose ne fonctionne plus) → Propose une démarche de diagnostic, les causes probables, et le moment où escalader. Ne promets aucun délai de résolution non documenté.
Demande utilisateur (création, modification, attribution, retrait, cession de ligne ou d'équipement) → Rappelle le circuit de traitement, les pré-requis, l'outil et le responsable selon le périmètre. Distingue bien demande (nouveau besoin) et incident (dysfonctionnement).
Technique (terminal, MDM, infrastructure, réseau, sécurité) → Réponds au niveau attendu d'un ingénieur, en t'appuyant sur la fiche produit ou la documentation technique ; signale les points à confirmer côté constructeur.
Prix / chiffrage → Renvoie exclusivement au référentiel ROC ou à la fiche produit. N'invente jamais un prix ; si l'information manque, oriente vers le ROC.
Commercial / avant-vente → Mets en avant la valeur, les offres et les différenciateurs, en restant factuel ; renvoie au ROC pour tout tarif.
Marketing / communication → Reformule les messages clés et les bénéfices à partir d'éléments validés ; signale ce qui doit être validé avant toute diffusion externe.
Périmètre / responsabilités / « qui fait quoi » → Désambiguïse d'abord le client et le lot, puis décris les responsabilités (niveaux N1/N2, outils, refacturation).
Hors périmètre (RH, juridique, contractuel sensible, sécurité opérationnelle) → Ne tranche pas ; oriente vers le service ou la personne responsable.
Information absente de la base → Dis-le explicitement et propose une orientation. N'invente pas.
11. RÉFÉRENTIEL D4B
11.1 Historique (repères validés ; noms d'acquisitions à compléter)
2003 — Création de l'entreprise (sous le nom EAF).
2007 — Partenariat [nom à préciser].
2011 — Acquisition [nom à préciser].
2013 — Création du centre de support à l'île Maurice ; EAF devient Digital4Business (D4B) [année du changement de nom à confirmer].
2016 — [événement / acquisition à préciser].
2017 — Acquisition [nom à préciser] ; agréée depuis 2017 [type d'agrément à préciser].
2020 — Création du centre de développement & de contrôle (Tunisie) ; Authorized Service Provider DELL.
2024 — Acquisition(s) [noms à préciser] ; ouverture de l'agence de Lyon ; entrée dans l'Apple Consultant Network.
11.2 Vision
Axes lisibles dans les supports : gestion durable et éco-responsable des technologies, expérience utilisateur de bout en bout, humain augmenté par l'IA. [À COMPLÉTER — formulation officielle de la vision de la direction et des associés.]

11.3 Évolution des métiers
Gestion & cycle de vie du Parc Mobil-IT → support / helpdesk multilingue multi-sites → infrastructure & cloud → MDM / EMM (Seuic EMM) → cybersécurité → Service Desk augmenté par l'IA. [À COMPLÉTER — préciser les jalons et le « pourquoi » de chaque virage.]

11.4 Catalogue des offres
Parc Mobil-IT — cycle de vie complet : acquisition, mise en service, maintenance, assistance, fin de vie RGPD, revalorisation / reconditionné.

Support & Service Desk : support multilingue N0/N1/N2, multi-sites, de proximité ou à distance, 24/7 selon contrat.

Service Desk augmenté par l'IA — 3 offres : - IA Support N0 — agents IA conversationnels + base de connaissances intelligente ; autonomie utilisateur maximale, réduction des sollicitations simples. - IA Support N1 — copilote IA pour les agents : qualification, résumés intelligents, suggestions de solutions. - Service Desk augmenté — solution complète N0 + N1 avec gouvernance IA, accompagnement au changement, pilotage et amélioration continue. - Bénéfices types annoncés : temps de résolution courant ÷ 3, support 24/7, jusqu'à ~60 % des sollicitations courantes résolues en autonomie (N0). - Canaux : Chat IA, Teams, Portail IT (self-service), Email / Téléphone — convergeant vers un service desk unifié, traçable. - Cas d'usage N0 : réinitialisation accès / mot de passe / MFA ; VPN / Wi-Fi / connectivité ; messagerie & collaboration ; demandes standard (logiciels, droits, équipements).

MDM / EMM (Seuic EMM) : masterisation, enrôlement zéro-touch, politiques de sécurité, supervision RUN, on-premise possible, gestion du cycle de vie (déploiement → exploitation → fin de vie).

Intégration de terminaux : smartphones & PDA durcis, accessoires, garanties et garantie casse.

Développement applicatif & web · Infrastructure & hébergement · Réseaux & télécoms · Cybersécurité (PRA/PCA).

11.5 Architecture type des solutions D4B
Service Desk unifié (IA) : canaux multiples (Chat IA, Teams, Portail IT, Email/Tél.) → moteur IA central (analyse, routage, enrichissement du ticket) → résolution N0 (self-service / agents IA + base de connaissances) ou escalade N1 (humain avec dossier enrichi) → N2 (expertise). L'information est capturée une fois, réutilisée partout : l'utilisateur ne répète jamais son problème.

Parc Mobil-IT : Installation → Maintenance → Assistance, sur un cycle de vie prolongé (Acquisition → Mise en service → Maturité → Fin de vie → Revalorisation).

11.6 Méthodologie de déploiement (Service Desk IA)
Cadrage & diagnostic — analyse de l'existant, parcours, irritants, quick wins.
Déploiement pilote — périmètre restreint, objectifs clairs, validation terrain.
Enrichissement progressif — extension du périmètre, des cas d'usage, des intégrations.
Mesure & ajustements — suivi des KPI, optimisation continue.
11.7 Glossaire D4B
ESN — Entreprise de Services du Numérique.
Parc Mobil-IT — ensemble des terminaux mobiles et postes gérés par D4B sur leur cycle de vie.
Infogérance — exploitation et maintenance externalisées, totales ou partielles, du SI d'un client.
Service Desk / Helpdesk — point d'entrée unique des demandes et incidents des utilisateurs.
N0 / N1 / N2 — niveaux de support : N0 self-service / IA ; N1 support qualifié ; N2 expertise.
MDM / EMM — Mobile Device Management / Enterprise Mobility Management : gestion centralisée des flottes de terminaux.
Seuic EMM — solution MDM/EMM propriétaire D4B (déploiement on-premise possible, souveraineté des données).
PDA durci — terminal professionnel renforcé (ex. IP68, résistant aux chutes) pour usage intensif type scan.
CRUISE2 / CRUISE3 — gamme de PDA durcis Seuic intégrés par D4B (CRUISE2 en 4G, CRUISE3 en 5G).
AER — Android Enterprise Recommended : programme garantissant maîtrise et longévité des terminaux Android pro.
Zéro-touch — enrôlement automatisé d'un terminal, sans intervention manuelle.
Hot-swap — remplacement de batterie sans extinction ni perte de session du terminal.
TCO — Total Cost of Ownership : coût total de possession sur la durée d'usage.
ROC — référentiel de prix D4B (grille achats / ventes), source de référence pour les tarifs terminaux et accessoires [développement de l'acronyme à confirmer en interne].
RMM — Remote Monitoring and Management : supervision et gestion à distance du parc.
MFA — authentification multifacteur.
RUN — phase d'exploitation / maintien en condition opérationnelle d'un service en production.
Incident vs Demande — un incident est un dysfonctionnement à rétablir (ticket d'incident) ; une demande est un nouveau besoin utilisateur à traiter (création / modification / attribution / retrait / cession de ligne ou d'équipement). Les deux suivent des circuits de traitement distincts.
Gestparc — outil interne D4B de gestion des demandes et des incidents.
SAV Standard — envoi en centre SAV constructeur dans le cadre de la garantie (panne hors casse / oxydation, pendant la période de garantie).
Réparation — réparation d'une panne ou d'un incident matériel hors garantie constructeur (après garantie, casse, oxydation légère…).
Reconditionnement — tests et remise à neuf d'un terminal selon le niveau défini avec le client.
Wipe — effacement, à distance ou en local, des données d'un terminal (réinitialisation en « mode usine »).
PRA — Plan de Reprise d'Activité (redémarrage du SI après sinistre).
PCA — Plan de Continuité d'Activité (continuité de service pendant un incident).
RGPD — règlement européen sur la protection des données personnelles.
[Ajouter les autres acronymes et termes maison.]
12. OBJECTIF FINAL
Être la référence de connaissance unique permettant à tout collaborateur D4B — en priorité au service client et aux équipes techniques — de comprendre l'entreprise, ses métiers, ses clients, ses solutions, ses infrastructures, ses procédures et ses choix techniques, en s'appuyant toujours sur la base de connaissance, et jamais sur l'invention.

13. EXEMPLES DE COMPORTEMENT
Demande support (public principal)

Utilisateur : Un utilisateur n'arrive plus à se connecter au VPN, que dois-je vérifier en N0 ? Bon comportement : étapes de diagnostic N0 (connectivité, MFA, profil MDM…), citation de la procédure VPN, et critère d'escalade vers N1 si non résolu.

Question prix

Utilisateur : Combien coûte un puits de charge mono pour CRUISE2 ? Bon comportement : « D'après le référentiel ROC / la fiche accessoire : [valeur]. » — et si absent : orienter vers le ROC, sans inventer de prix.

Information absente

Utilisateur : Quel est le résultat net 2024 de D4B ? Bon comportement : « Cette information n'est pas disponible dans ma base. Pour les données financières, adresse-toi à [service/personne]. »

Sources contradictoires

Bon comportement : « Deux sources divergent sur le standard Wi-Fi d'un terminal de la shortlist. À confirmer sur la fiche constructeur avant de communiquer. »

Hors périmètre / sensible

Utilisateur : Rédige l'avertissement disciplinaire d'un collègue. Bon comportement : refuser poliment et orienter vers les RH.
`;

let teamsAdapter = null;
let teamsBotHandler = null;
try {
  const { BotFrameworkAdapter, TeamsActivityHandler } = require('botbuilder');
  
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

      const text = (context.activity && context.activity.text) ? context.activity.text : '';
      const userName = context.activity.from?.name || 'TeamsUser';
      // Forward user message to existing chat proxy
      try {
        const proxyUrl = process.env.CHAT_PROXY_URL || `http://127.0.0.1:${PORT}/api/chat`;
        const resp = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: text }],
            sessionId: `teams-${context.activity.from?.id || Date.now()}`,
            guestInfo: { name: userName }
          })
        });

        const contentType = resp.headers.get('content-type') || '';
        let data = null;
        if (!resp.ok) {
          const bodyText = await resp.text().catch(() => 'Unable to read response body');
          console.error('Teams->chat proxy returned error', { status: resp.status, statusText: resp.statusText, bodyText });
          throw new Error(`Chat proxy returned ${resp.status}`);
        }

        if (contentType.includes('application/json')) {
          data = await resp.json();
        } else {
          const bodyText = await resp.text().catch(() => 'Unable to read non-JSON response body');
          console.error('Teams->chat proxy returned non-JSON response', { contentType, bodyText });
          throw new Error('Invalid chat proxy response');
        }

        const reply = data?.choices?.[0]?.message?.content || data?.error || 'No response from assistant';
        await context.sendActivity(reply);
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

let telegramBot = null;

// Import database
const DatabaseClass = require('./database');
const db = new DatabaseClass();

const PUBLIC_DIR = './public';
const DATA_DIR = path.join(__dirname, 'data');
const GUEST_SESSIONS_FILE = path.join(DATA_DIR, 'guest_sessions.json');
const REQUESTS_FILE = path.join(DATA_DIR, 'requests.json');
const KB_DIR = path.join(DATA_DIR, 'kb');

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
// Load knowledge index from data/kb
loadKnowledgeIndex();
// Watch KB directory for changes and reload index (debounced)
try {
  let kbReloadTimer = null;
  if (fs.existsSync(KB_DIR)) {
    fs.watch(KB_DIR, { persistent: false }, (eventType, filename) => {
      if (kbReloadTimer) clearTimeout(kbReloadTimer);
      kbReloadTimer = setTimeout(() => {
        console.log('KB directory changed, reloading index...');
        loadKnowledgeIndex();
      }, 500);
    });
  }
} catch (e) {
  console.warn('Failed to watch KB directory:', e);
}

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

async function handleApi(req, res) {
  try {
    // Chat proxy
    if (req.method === 'POST' && req.url === '/api/chat') {
      if (!process.env.MISTRAL_API_KEY) return sendJsonResponse(res, 500, { error: 'Missing MISTRAL_API_KEY on server' });
      const { messages = [], model, temperature = 0.4, sessionId, guestInfo, responseFormat } = await readJson(req).catch(e => ({}));
      const modelName = model && model.toLowerCase().startsWith('mistral') ? model : 'mistral-medium-latest';

      // Attach KB snippets
      const lastUser = Array.isArray(messages) ? [...messages].reverse().find(m => m.role === 'user') : null;
      const userText = lastUser ? (typeof lastUser.content === 'string' ? lastUser.content : JSON.stringify(lastUser.content)) : '';
      const snippets = lastUser ? searchKnowledge(userText, 3) : '';

      // Determine if we should force the D4B troubleshooting template (French)
      let format = responseFormat || null;
      const lower = String(userText || '').toLowerCase();
      if (!format && (lower.includes('bsod') || lower.includes('Ã©cran bleu') || lower.includes('blue screen'))) format = 'D4B_troubleshoot_fr';

      const outgoing = [];
      if (snippets) outgoing.push({ role: 'system', content: `Relevant knowledge:\n${snippets}` });

      // If requested, instruct the assistant to reply using the D4B-friendly French troubleshooting template
      if (format === 'D4B_troubleshoot_fr') {
        const guide = `RÃ©pondez en franÃ§ais en utilisant exactement le format suivant (ne rajoutez pas d'autres sections) :\n\n**Classification :**\n- PrioritÃ© : P1 / P2 / ...\n- Lot : Nom du lot\n\n**Ã‰tapes de dÃ©pannage (suivre dans l'ordre)**\n1. Titre de l'Ã©tape :\n- Action : description claire et courte\n- VÃ©rifier : question binaire ou instruction prÃ©cise\n- Question Ã  renvoyer : une question courte que l'utilisateur doit rÃ©pondre\n\n( rÃ©pÃ©tez pour chaque Ã©tape )\n\n**Si les Ã©tapes ciâ€‘dessus Ã©chouent**\n- Action : instructions pour ouvrir un ticket ou escalade\n\n**Contournements temporaires**\n- Liste courte des contournements\n\n**Checklist rapide Ã  renvoyer (copier/coller)**\n- [ ] Item 1 - rÃ©sultat : (Oui / Non / autre)\n- [ ] Item 2 - rÃ©sultat : ...\n\n**Question pour l'utilisateur :**\nUne question claire demandant l'Ã©tat actuel et toute info (codes d'erreur, photo).`;
        outgoing.push({ role: 'system', content: guide });
      }

      // Append the original conversation messages
      for (const m of messages) outgoing.push(m);

      const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}` },
        body: JSON.stringify({ model: modelName, messages: outgoing, temperature })
      });
      const data = await resp.json().catch(() => ({}));

      // optional DB logging
      if (resp.ok && guestInfo && Array.isArray(messages) && messages.length >= 1) {
        try {
          const guest = await db.getGuestByRoom(guestInfo.room).catch(() => null);
          if (guest) await db.logConversation(guest.id, messages[messages.length - 1].content, data.choices?.[0]?.message?.content || '');
        } catch (e) { console.warn('Conversation log failed', e); }
      }

      return res.writeHead(resp.ok ? 200 : (resp.status || 500), { 'Content-Type': 'application/json' }), res.end(JSON.stringify(data));
    }

    // Atera ticket proxy
    if (req.method === 'POST' && req.url === '/api/atera') {
      try {
        if (!process.env.ATERA_API_KEY || !process.env.ATERA_API_URL) return sendJsonResponse(res, 500, { error: 'Missing ATERA_API_KEY or ATERA_API_URL on server' });
        const body = await readJson(req);
        console.log('[Atera] Incoming request payload:', body);
        const ateraUrl = process.env.ATERA_API_URL.toLowerCase().includes('/api/v3/tickets') ? process.env.ATERA_API_URL : new URL('/api/v3/tickets', process.env.ATERA_API_URL).toString();
        console.log('[Atera] Forwarding request to:', ateraUrl);
        const problemLabel = body.category ? body.category : 'problÃ¨me';
        const subjectName = body.name || 'demandeur inconnu';
        const subjectRoom = body.room || 'Restaurant inconnu';
        const ateraSubject = `${subjectRoom} - ${problemLabel} - ${subjectName}`;
        const descriptionLines = [
          `Nom: ${body.name || 'Unknown'}`,
          `Restaurant: ${body.room || 'Unknown'}`,
          `Email: ${body.email || 'Unknown'}`,
          `CatÃ©gorie: ${body.category || 'problÃ¨me'}`,
          `PrioritÃ©: ${body.priority || 'P3'}`,
          `Service Lot: ${body.serviceLot || 'Lot 1 - Helpdesk / Service Desk'}`,
          `Session ID: ${body.sessionId || 'N/A'}`,
          '',
          `${body.text || 'No additional details provided'}`
        ];
        
        const priorityMap = { P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' };
        const ateraPriority = priorityMap[body.priority] || 'Medium';
        
        const ateraPayload = {
          TicketTitle: ateraSubject,
          Description: descriptionLines.join('\n'),
          TicketPriority: ateraPriority
        };
        
        if (body.email) {
          ateraPayload.EndUserEmail = body.email;
          const nameParts = (body.name || 'Guest').split(' ');
          ateraPayload.EndUserFirstName = nameParts[0] || 'Guest';
          ateraPayload.EndUserLastName = nameParts.slice(1).join(' ') || 'User';
        }
        console.log('[Atera] Forwarding payload:', ateraPayload);
        const aRes = await fetch(ateraUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-API-KEY': process.env.ATERA_API_KEY },
          body: JSON.stringify(ateraPayload)
        });
        const text = await aRes.text();
        let aData;
        try {
          aData = JSON.parse(text);
        } catch (err) {
          console.warn('[Atera] Failed to parse response as JSON:', text);
          aData = { text, rawText: text };
        }
        console.log('[Atera] Response status:', aRes.status);
        console.log('[Atera] Response body:', aData);
        try {
          const store = readJsonSafe(REQUESTS_FILE);
          store.push({ id: `ATERA-${Date.now()}`, timestamp: new Date().toISOString(), ticket: aData?.id || aData?.ticketId || null, payload: body });
          writeJsonSafe(REQUESTS_FILE, store);
        } catch (e) {
          console.warn('Failed to persist Atera request locally', e);
        }
        if (!aRes.ok) {
          return sendJsonResponse(res, aRes.status, { error: aData?.error || aData?.message || aData?.text || 'Unknown Atera error', details: aData });
        }
        return res.writeHead(200, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(aData));
      } catch (err) {
        console.error('[Atera] Exception:', err);
        return sendJsonResponse(res, 500, { error: 'Atera proxy error', message: err.message });
      }
    }

    // Image upload + enhanced analysis
    if (req.method === 'POST' && req.url === '/api/upload-image') {
      const body = await readJson(req);
      const { filename = `img-${Date.now()}.jpg`, data } = body || {};
      if (!data) return sendJsonResponse(res, 400, { error: 'Missing image data' });

      const uploadsDir = path.join(__dirname, 'public', 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const buffer = Buffer.from(data, 'base64');
      const baseName = `${Date.now()}-${filename}`;
      const outPath = path.join(uploadsDir, baseName);
      fs.writeFileSync(outPath, buffer);

      const result = { success: true, url: `/uploads/${baseName}`, filename: baseName };

      try {
        const img = await Jimp.read(buffer);
        result.width = img.bitmap.width;
        result.height = img.bitmap.height;
        result.mime = img.getMIME ? img.getMIME() : null;
        try {
          const avg = img.clone().resize(1, 1);
          const hex = avg.getPixelColor(0, 0);
          const rgba = Jimp.intToRGBA(hex);
          result.dominantColor = { r: rgba.r, g: rgba.g, b: rgba.b };
          result.dominantColorHex = ((rgba.r << 16) + (rgba.g << 8) + rgba.b).toString(16).padStart(6, '0');
        } catch (e) {
          result.dominantColorError = String(e);
        }

        result.aspectRatio = (img.bitmap.width / Math.max(1, img.bitmap.height)).toFixed(2);
        result.orientation = img.bitmap.width >= img.bitmap.height ? 'landscape' : 'portrait';

        try {
          const thumb = img.clone().resize(240, Jimp.AUTO);
          const thumbName = `thumb-${baseName}`;
          const thumbPath = path.join(uploadsDir, thumbName);
          await thumb.quality(70).writeAsync(thumbPath);
          result.thumbnail = `/uploads/${thumbName}`;
        } catch (e) {
          result.thumbnailError = String(e);
        }

        try {
          const { createWorker } = require('tesseract.js');
          const worker = createWorker({ logger: m => {} });
          await worker.load();
          try { await worker.loadLanguage('eng'); await worker.initialize('eng'); }
          catch (e) {}
          const { data: ocrData } = await worker.recognize(buffer).catch(e => ({ data: { text: '' } }));
          result.ocrText = (ocrData && ocrData.text) ? String(ocrData.text).trim() : '';
          await worker.terminate();
        } catch (e) {
          result.ocrError = String(e);
        }

        if (process.env.GOOGLE_VISION_API_KEY) {
          try {
            const gReq = {
              requests: [
                { image: { content: buffer.toString('base64') }, features: [{ type: 'LABEL_DETECTION', maxResults: 10 }, { type: 'TEXT_DETECTION', maxResults: 5 }] }
              ]
            };
            const gv = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq)
            });
            const gvJson = await gv.json().catch(() => ({}));
            const r0 = gvJson.responses && gvJson.responses[0] ? gvJson.responses[0] : {};
            if (r0.labelAnnotations) result.labels = r0.labelAnnotations.map(l => ({ description: l.description, score: l.score }));
            if (r0.textAnnotations && r0.textAnnotations[0]) result.googleText = r0.textAnnotations[0].description;
            result.googleVisionRaw = r0;
          } catch (e) {
            result.googleVisionError = String(e);
          }
        }

        const pieces = [];
        pieces.push(`Size: ${result.width}x${result.height}`);
        if (result.dominantColor) pieces.push(`Dominant color: rgb(${result.dominantColor.r},${result.dominantColor.g},${result.dominantColor.b})`);
        if (result.ocrText && result.ocrText.length) pieces.push(`Contains text (${Math.min(200, result.ocrText.length)} chars): "${result.ocrText.slice(0,200).replace(/\n/g,' ')}${result.ocrText.length>200? '...' : ''}"`);
        if (result.labels && result.labels.length) pieces.push(`Labels: ${result.labels.slice(0,4).map(l=>l.description).join(', ')}`);
        result.analysis = pieces.join(' | ');

        if (process.env.MISTRAL_API_KEY) {
          try {
            const modelName = 'mistral-medium-latest';
            const promptSystem = `You are an assistant that judges whether an image is related to a user's question or context. Respond concisely. Return a short JSON object with keys: related (true/false), confidence (0-1), reason (short), summary (one-sentence), actions (array of suggested next actions).`;
            const payload = {
              model: modelName,
              messages: [
                { role: 'system', content: promptSystem },
                { role: 'user', content: `Image metadata and OCR/text:\n${JSON.stringify({ filename: baseName, width: result.width, height: result.height, dominantColorHex: result.dominantColorHex, ocrText: result.ocrText || '', labels: result.labels || [] }, null, 2)}` }
              ],
              temperature: 0.2
            };

            const mResp = await fetch('https://api.mistral.ai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}` }, body: JSON.stringify(payload) });
            const mJson = await mResp.json().catch(() => ({}));
            result.mistralRaw = mJson;
            const mText = mJson?.choices?.[0]?.message?.content || (typeof mJson === 'string' ? mJson : JSON.stringify(mJson));
            result.mistralText = mText;
            try {
              result.mistral = JSON.parse(mText);
            } catch (e) {
              const jsStart = mText.indexOf('{');
              const jsEnd = mText.lastIndexOf('}');
              if (jsStart >= 0 && jsEnd > jsStart) {
                try { result.mistral = JSON.parse(mText.slice(jsStart, jsEnd + 1)); } catch (ee) { result.mistralParseError = String(ee); }
              } else {
                result.mistralParseError = 'No JSON found in response';
              }
            }
          } catch (e) {
            result.mistralError = String(e);
          }
        }
      } catch (e) {
        console.warn('Image analysis failed:', e);
        result.analysisError = String(e);
      }

      return sendJsonResponse(res, 200, result);
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

  // Telegram webhook endpoint
  if (req.url === '/webhook') {
    if (req.method === 'GET') {
      return sendJsonResponse(res, 200, { status: 'Webhook endpoint active', bot_available: !!telegramBot });
    }

    if (req.method === 'POST') {
      try {
        const update = await readJson(req);
        if (!telegramBot) {
          return sendJsonResponse(res, 500, { error: 'Telegram bot not initialized' });
        }
        telegramBot.processUpdate(update);
        return sendJsonResponse(res, 200, { status: 'Webhook processed', bot_available: true });
      } catch (error) {
        console.error('âŒ Telegram webhook error:', error);
        return sendJsonResponse(res, 400, { error: 'Invalid webhook payload', details: String(error) });
      }
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
  let filePath;
  if (pathname === '/') {
    filePath = path.join(PUBLIC_DIR, '/chat.html');
  } else if (!pathname.includes('.') && pathname.startsWith('/')) {
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

async function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('âš ï¸ TELEGRAM_BOT_TOKEN not set; Telegram bot disabled.');
    return;
  }

  const serverUrl = process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  telegramBot = new D4BTelegramBot(token, serverUrl);
  if (telegramBot.useWebhook) {
    await telegramBot.setupWebhook();
  }
}

server.listen(PORT, async () => {
  console.log(` Server running at http://localhost:${PORT}`);
  console.log(` Main chat: http://localhost:${PORT}/chat.html`);
  console.log(` Staff logs: http://localhost:${PORT}/log.html`);
  console.log(` Database viewer: http://localhost:${PORT}/database.html`);
  console.log(` Staff dashboard: http://localhost:${PORT}/dashboard-simple.html`);

  try {
    // Initialize database
    await db.init();
    console.log('âœ… Database initialized successfully');
  } catch (error) {
    console.error('âŒ Failed to initialize database:', error);
    process.exit(1);
  }

  try {
    await initTelegramBot();
  } catch (error) {
    console.error('âŒ Failed to initialize Telegram bot:', error);
  }
});
