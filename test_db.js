require('dotenv').config({ path: 'server/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  try {
    const res = await prisma.account.findMany();
    console.log("Found:", res.length);
  } catch (e) {
    console.error("Error:", e.message);
  }
}
main().finally(() => prisma.$disconnect());
