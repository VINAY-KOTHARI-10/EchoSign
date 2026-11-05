// Usage: npm run make-admin -- user@example.com
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

(async () => {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run make-admin -- <email>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({ where: { email: email.toLowerCase() }, data: { role: 'ADMIN' } });
    console.log(`${user.email} is now an ADMIN`);
  } catch (err) {
    console.error(err.code === 'P2025' ? `No user found with email ${email}` : err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
