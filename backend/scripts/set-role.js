// Usage: npm run set-role -- user@example.com TEACHER
//        roles: USER (member) | TEACHER | ADMIN
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const ROLES = ['USER', 'TEACHER', 'ADMIN'];

(async () => {
  const [email, roleArg] = process.argv.slice(2);
  const role = String(roleArg || '').toUpperCase();
  if (!email || !ROLES.includes(role)) {
    console.error('Usage: npm run set-role -- <email> <USER|TEACHER|ADMIN>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({ where: { email: email.toLowerCase() }, data: { role } });
    console.log(`${user.email} is now ${role}`);
  } catch (err) {
    console.error(err.code === 'P2025' ? `No user found with email ${email}` : err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
