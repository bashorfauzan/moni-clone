require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const res = await prisma.account.findMany();
    console.log("Account count:", res.length);
    console.log("First account:", res[0]);
  } catch (e) {
    console.error("Error fetching accounts:", e);
  }
}
main().finally(() => prisma.$disconnect());
