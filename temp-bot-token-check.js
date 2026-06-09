const path = require('path');
const dotenv = require('dotenv');
const { MicrosoftAppCredentials } = require('botframework-connector');

dotenv.config({ path: path.join(process.cwd(), '.env') });

const appId = process.env.MICROSOFT_APP_ID;
const appPass = process.env.MICROSOFT_APP_PASSWORD;
console.log('AppId=', appId);
console.log('AppPass=', appPass ? appPass.slice(0, 10) + '...' : null);

(async () => {
  try {
    const creds = new MicrosoftAppCredentials(appId, appPass);
    const token = await creds.getToken();
    console.log('TOKEN OK', token && token.accessToken ? token.accessToken.slice(0, 50) + '...' : 'no accessToken');
  } catch (e) {
    console.error('TOKEN ERROR', e.message || e.toString());
    if (e.response) {
      console.error('STATUS', e.response.statusCode);
      console.error('BODY', JSON.stringify(e.response.body));
    }
    process.exit(1);
  }
})();
