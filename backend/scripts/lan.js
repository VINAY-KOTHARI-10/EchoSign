// Starts EchoSign for the local network, over HTTPS, so phones and laptops on the same hotspot or Wi-Fi can open it and use
// Sign Meet. Browsers only allow the camera on https addresses (or localhost), which is why a certificate is needed.
//
//   npm --prefix backend run lan          create the certificate if needed, build the app if needed, start the server
//   npm --prefix backend run lan -- --cert    only create the certificate
//
// The certificate is self-signed and lives in backend/certs (never committed). Each device shows a warning the first
// time; that is expected for a private network. The server still needs its databases (see backend/.env).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const certDir = path.join(__dirname, '..', 'certs');
const keyFile = path.join(certDir, 'lan-key.pem');
const certFile = path.join(certDir, 'lan-cert.pem');

const lanAddresses = () => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);

function makeCert() {
  fs.mkdirSync(certDir, { recursive: true });
  const ips = ['127.0.0.1', ...lanAddresses()];
  const san = ['DNS:localhost', ...ips.map((ip) => `IP:${ip}`)].join(',');
  // Use our own small config file: a computer can have an OPENSSL_CONF that points somewhere that does not exist
  // (some database installers set one), which would make OpenSSL fail before it starts.
  const conf = path.join(certDir, 'openssl-lan.cnf');
  fs.writeFileSync(conf, ['[req]', 'distinguished_name = dn', 'x509_extensions = ext', 'prompt = no', '[dn]', 'CN = EchoSign local network',
    '[ext]', `subjectAltName = ${san}`, 'basicConstraints = CA:FALSE', 'keyUsage = digitalSignature, keyEncipherment', 'extendedKeyUsage = serverAuth', ''].join('\n'));
  const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-config', conf, '-keyout', keyFile, '-out', certFile, '-days', '825'],
    { stdio: 'inherit', env: { ...process.env, OPENSSL_CONF: conf } });
  if (r.error || r.status !== 0) {
    console.error('\nCould not create the certificate. OpenSSL is needed (it comes with Git for Windows, macOS and most Linux).');
    console.error('You can also create key.pem / cert.pem yourself and set HTTPS_KEY_FILE and HTTPS_CERT_FILE in backend/.env.');
    process.exit(1);
  }
  console.log(`Certificate created for: ${ips.join(', ')}`);
}

if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) makeCert();
if (process.argv.includes('--cert')) process.exit(0);

const dist = path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html');
if (!fs.existsSync(dist)) {
  console.log('Building the app first (one time)...');
  const b = spawnSync('npm', ['--prefix', path.join(__dirname, '..', '..', 'frontend'), 'run', 'build'], { stdio: 'inherit', shell: true });
  if (b.status !== 0) process.exit(b.status || 1);
}

const port = process.env.PORT || 5000;
console.log('\nOpen EchoSign on any device on this hotspot / network:');
lanAddresses().forEach((ip) => console.log(`   https://${ip}:${port}`));
console.log(`   https://localhost:${port}   (this computer)`);
console.log('\nThe first time, the browser warns about the certificate: choose Advanced, then Continue.\n');

const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port), HTTPS_KEY_FILE: keyFile, HTTPS_CERT_FILE: certFile, FRONTEND_URL: process.env.FRONTEND_URL || `https://localhost:${port}` },
});
child.on('exit', (code) => process.exit(code || 0));
