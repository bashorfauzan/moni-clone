import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const OWNERS = {
  BASHOR: '34f4cac7-4990-4998-9f4c-988c13e649cd', // Bashor Fauzan
  NOVAN: '005f36fc-fdc1-44c4-8bc9-441e2fc8c0d5',  // Novan Visia
  NISWA: '1f485f6a-2d8b-4eba-a889-997680b1eb51',  // Niswa
};

const BANK_ACCOUNTS = [
  { name: 'BNI Bashor', accountNumber: '0356-3004-86', ownerId: OWNERS.BASHOR },
  { name: 'BNI Novan', accountNumber: '1351-2558-72', ownerId: OWNERS.NOVAN },
  { name: 'BCA S Bashor', accountNumber: '053-0030-634', ownerId: OWNERS.BASHOR },
  { name: 'BCA S Novan', accountNumber: '053-1031-193', ownerId: OWNERS.NOVAN },
  { name: 'BCA S Niswa', accountNumber: '053-0067-412', ownerId: OWNERS.NISWA },
  { name: 'BSI Novan', accountNumber: '731-9632-527', ownerId: OWNERS.NOVAN },
  { name: 'BRI Bashor', accountNumber: '7900-01-009621-53-3', ownerId: OWNERS.BASHOR },
  { name: 'BCA Bashor', accountNumber: '315-195-6406', ownerId: OWNERS.BASHOR },
  { name: 'BSI Bashor', accountNumber: '5272-3098-00', ownerId: OWNERS.BASHOR },
];

const RDN_ACCOUNTS = [
  { name: 'RHB S Sekuritas', accountNumber: '001-0466-167', ownerId: OWNERS.BASHOR },
  { name: 'RHB K Bashor Sekuritas', accountNumber: '992-8503-442', ownerId: OWNERS.BASHOR },
  { name: 'RHB K Novan Sekuritas', accountNumber: '994-0290-012', ownerId: OWNERS.NOVAN },
  { name: 'BRI Sekuritas', accountNumber: '0671-01-481612-50-0', ownerId: OWNERS.BASHOR },
  { name: 'Sinarmas Sekuritas', accountNumber: '001-7335-871', ownerId: OWNERS.BASHOR },
  { name: 'Philip Sekuritas', accountNumber: '001-0469-328', ownerId: OWNERS.BASHOR },
  { name: 'Stockbit Sekuritas', accountNumber: '1110-4977-9994', ownerId: OWNERS.BASHOR },
  { name: 'Ciptadana Sekuritas', accountNumber: '495-3379-620', ownerId: OWNERS.BASHOR },
  { name: 'Ajaib Sekuritas', accountNumber: '990-0698-965', ownerId: OWNERS.BASHOR },
  { name: 'Semesta Indovest Sekuritas', accountNumber: '540-2420-987', ownerId: OWNERS.BASHOR },
];

async function main() {
  console.log('Inserting accounts...');

  for (const acc of BANK_ACCOUNTS) {
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        name: acc.name,
        type: 'Bank',
        accountNumber: acc.accountNumber,
        balance: 0,
        ownerId: acc.ownerId,
      }
    });
  }

  for (const acc of RDN_ACCOUNTS) {
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        name: acc.name,
        type: 'RDN',
        accountNumber: acc.accountNumber,
        balance: 0,
        ownerId: acc.ownerId,
      }
    });
  }

  console.log('Done!');
}

main().finally(() => prisma.$disconnect());
