#!/bin/sh
set -e

echo "==> Running Prisma migrations..."
npx prisma db push --skip-generate || echo "WARNING: db push failed, continuing..."

echo "==> Checking if seed is needed..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.staffAccount.count().then(count => {
  prisma.\$disconnect();
  if (count === 0) {
    console.log('NEEDS_SEED');
  } else {
    console.log('SEEDED');
  }
}).catch(() => { prisma.\$disconnect(); console.log('NEEDS_SEED'); });
" | grep -q NEEDS_SEED && node scripts/seed.mjs || echo "==> Already seeded, skipping."

echo "==> Starting Next.js server on port 8080..."
exec node server.js
