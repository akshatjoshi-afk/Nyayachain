import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with users, cases, and assignments...');

  const investigatorHash = await bcrypt.hash('password123', 10);
  const adminHash = await bcrypt.hash('adminpass', 10);

  // 1. Seed Users
  const investigator = await prisma.user.upsert({
    where: { username: 'investigator1' },
    update: {},
    create: {
      username: 'investigator1',
      passwordHash: investigatorHash,
      role: 'INVESTIGATOR',
    },
  });

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  // 2. Seed Cases
  const case1 = await prisma.case.upsert({
    where: { caseNumber: 'FIR-2026-045' },
    update: {},
    create: {
      caseNumber: 'FIR-2026-045',
      title: 'Cyber Heist Investigation',
    },
  });

  const case2 = await prisma.case.upsert({
    where: { caseNumber: 'FIR-2026-046' },
    update: {},
    create: {
      caseNumber: 'FIR-2026-046',
      title: 'Corporate Fraud Audit',
    },
  });

  // 3. Seed Case Assignment (investigator1 assigned ONLY to case1)
  await prisma.caseAssignment.upsert({
    where: {
      caseId_userId: {
        caseId: case1.id,
        userId: investigator.id,
      },
    },
    update: {},
    create: {
      caseId: case1.id,
      userId: investigator.id,
    },
  });

  console.log('✅ Seed complete!');
  console.log(`   - Users: investigator1 (INVESTIGATOR), admin (ADMIN)`);
  console.log(`   - Case 1: ${case1.caseNumber} - "${case1.title}" (Assigned: investigator1)`);
  console.log(`   - Case 2: ${case2.caseNumber} - "${case2.title}" (Assigned: none / Admin only)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
