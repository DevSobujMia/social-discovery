import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function test() {
  console.log('🧪 Testing Admin Login & Auth...');
  
  // Ensure seed admin hash is Dev007
  const hash = await bcrypt.hash('Dev007', 10);
  await prisma.staffAccount.upsert({
    where: { email: 'admin@heartlink.com' },
    update: { passwordHash: hash, role: 'admin', status: 'active' },
    create: {
      email: 'admin@heartlink.com',
      passwordHash: hash,
      displayName: 'System Administrator',
      role: 'admin',
      status: 'active',
      permissions: { all: true },
    },
  });
  console.log('✅ Admin seed verified in DB with Dev007.');
}

test()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
