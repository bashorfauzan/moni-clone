const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.$executeRawUnsafe(`NOTIFY pgrst, 'reload schema'`);
  console.log("Supabase schema cache reloaded!");
}
main().catch(console.error).finally(() => prisma.$disconnect());
