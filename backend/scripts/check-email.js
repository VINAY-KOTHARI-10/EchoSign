// Sends one test email so you can see, before users hit it, whether login codes and reset links will arrive.
//   npm run check:email -- you@example.com
// It reports the real reason when it fails (missing key, sender not verified in Brevo, and so on).
require('dotenv').config();
const EmailService = require('../src/Services/emailService');

(async () => {
  const to = process.argv[2];
  if (!to) { console.error('Usage: npm run check:email -- you@example.com'); process.exit(1); }
  console.log('BREVO_API_KEY:', process.env.BREVO_API_KEY ? 'set' : 'MISSING (nothing can be emailed)');
  console.log('EMAIL_FROM   :', process.env.EMAIL_FROM || 'MISSING (falls back to noreply@echosign.app, which Brevo will reject unless verified)');
  if (!EmailService.isConfigured()) process.exit(2);
  try { await EmailService.sendTest(to); console.log('Sent. Check the inbox (and spam) of ' + to); }
  catch (e) { console.error('Failed. The server log above has the reason from Brevo.'); process.exit(3); }
})();
