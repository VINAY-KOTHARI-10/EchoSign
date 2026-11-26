// Same rules as the server (backend/src/utils/passwordPolicy.js), so people see what is wrong before they submit.
const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', 'iloveyou1', 'letmein123', 'welcome123', 'admin123', 'abc12345', '11111111', '00000000', 'echosign', 'echosign123']);

export function passwordChecks(password = '', email = '') {
  const local = String(email).split('@')[0].toLowerCase();
  return [
    { id: 'len', label: '8+ characters', ok: password.length >= 8 },
    { id: 'mix', label: 'Letter + number', ok: /[A-Za-z]/.test(password) && /\d/.test(password) },
    { id: 'common', label: 'Not common', ok: password.length > 0 && !COMMON.has(password.toLowerCase()) },
    { id: 'email', label: 'No email name', ok: !(local.length >= 4 && password.toLowerCase().includes(local)) },
  ];
}

export function passwordStrength(password = '', email = '') {
  const checks = passwordChecks(password, email);
  const valid = checks.every((c) => c.ok);
  let score = 0;
  if (valid) {
    score = 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
  }
  const level = valid ? Math.min(score + 1, 4) : 1; // bars lit: 1 weak, 2 fair, 3 good, 4 strong
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return { valid, score, level, label: password ? labels[level] : '', checks };
}
