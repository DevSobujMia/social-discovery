/**
 * Restore curated profile photos from uploads/profiles after a .pgdata wipe.
 * Seed rows come back with Unsplash URLs; local files usually still exist on disk.
 *
 * Usage: node scripts/restore-local-profile-photos.mjs
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const UPLOAD_DIR = path.resolve('uploads/profiles');

/** Best-effort map: seed email → local filename still on disk */
const PHOTO_BY_EMAIL = {
  'alexander.wright.travel@example.com': 'm_alex_cafe_0876fcda-5312-4b94-af55-b1131f80286e.jpg',
  'liam.chen.travel@example.com': 'm_liam_park_b7ab04fd-f97b-47ab-b9e5-60fa91d938d7.jpg',
  'marcus.vance.travel@example.com': 'm_marcus_bridge_e06bdc1e-a827-413f-a2e2-c697ff85016b.jpg',
  'daniel.kim.travel@example.com': 'm_daniel_library_773fdff4-88a3-4f25-8e85-480886c5e180.jpg',
  'lucas.silva.travel@example.com': 'm_lucas_coastal_750a9480-228e-452e-99a5-dd4afcccf591.jpg',
  'julian.rossi.travel@example.com': 'm_julian_gallery_7f52c47e-be08-4b14-8322-254aaab82cc2.jpg',
  'emma.walker.travel@example.com': 'w_blonde_mirror_63fefa87-5295-4fda-819d-534145fb0a60.png',
  'sophie.martin.travel@example.com': 'w_blonde_bookstore_0315588a-f3ab-4045-b89d-9c16b0675dcd.jpg',
  'isabella.rossi.travel@example.com': 'w_brunette_cafe_4b99c9a7-0bef-44cd-be26-3231ed4b81a8.png',
  'olivia.chen.travel@example.com': 'w_blonde_street_eb7cd076-c2de-4c55-ba5f-1c4c23de8b14.jpg',
  'chloe.anderson.travel@example.com': 'w_brunette_dinner_38dcc320-bad4-4f74-9c0b-a5403febecb7.png',
  'amelia.berg.travel@example.com': '16ca3052-480b-4d07-81f2-9e14c4799ff1.jpg',
};

async function setPrimaryPhoto(profileId, filePath, staffId) {
  const primary = await prisma.profilePhoto.findFirst({
    where: { profileId, isPrimary: true },
  });
  if (primary) {
    await prisma.profilePhoto.update({
      where: { id: primary.id },
      data: { filePath },
    });
  } else {
    await prisma.profilePhoto.create({
      data: {
        profileId,
        filePath,
        isPrimary: true,
        sortOrder: 0,
        uploadedBy: 'staff',
        uploadedByStaffId: staffId,
      },
    });
  }

  // Keep active trip card in sync when it still points at Unsplash / empty.
  await prisma.travelPlan.updateMany({
    where: {
      profileId,
      isActive: true,
      OR: [{ photoUrl: null }, { photoUrl: { startsWith: 'https://images.unsplash.com' } }],
    },
    data: { photoUrl: filePath },
  });
}

async function main() {
  const admin = await prisma.staffAccount.findFirst({ where: { role: 'admin' } });
  let restored = 0;
  let missingFile = 0;
  let missingUser = 0;

  for (const [email, filename] of Object.entries(PHOTO_BY_EMAIL)) {
    const abs = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(abs)) {
      console.log(`⚠️  file missing: ${filename}`);
      missingFile++;
      continue;
    }
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (!user?.profile) {
      console.log(`⚠️  no user/profile for ${email}`);
      missingUser++;
      continue;
    }
    const filePath = `/api/uploads/profiles/${filename}`;
    await setPrimaryPhoto(user.profile.id, filePath, admin?.id || null);
    console.log(`✅ ${user.profile.displayName} ← ${filename}`);
    restored++;
  }

  console.log(
    `\nDone. restored=${restored} missingFile=${missingFile} missingUser=${missingUser}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
