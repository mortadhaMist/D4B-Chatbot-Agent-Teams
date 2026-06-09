const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { MicrosoftAppCredentials } = require('botframework-connector');

async function run() {
  const appId = process.env.MICROSOFT_APP_ID;
  const appPassword = process.env.MICROSOFT_APP_PASSWORD;
  if (!appId || !appPassword) {
    console.error('Missing MICROSOFT_APP_ID or MICROSOFT_APP_PASSWORD in .env');
    process.exit(2);
  }
  try {
    const creds = new MicrosoftAppCredentials(appId, appPassword);
    const tokenRes = await creds.getToken();
    const token = typeof tokenRes === 'string' ? tokenRes : (tokenRes && tokenRes.accessToken ? tokenRes.accessToken : null);
    if (!token) {
      console.error('No token returned');
      process.exit(3);
    }
    const part = token.split('.')[1] || '';
    const s = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
    const claims = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    console.log('Connector token claims:', JSON.stringify(claims, null, 2));
  } catch (e) {
    console.error('Failed to get token:', e && e.message ? e.message : e);
    if (e && e.response) console.error('Response:', e.response);
    process.exit(4);
  }
}

run();
