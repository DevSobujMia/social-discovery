/**
 * Seed 5 US/UK "Ava" women travel profiles with local photos.
 * Usage: node scripts/seed-ava-profiles.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const day = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
};

const avaProfiles = [
  {
    email: 'ava.brooks.travel@example.com',
    displayName: 'Ava',
    gender: 'female',
    country: 'United States',
    city: 'Austin',
    bio: 'Austin-based designer heading to Dubai soon. Love quiet cafes, rooftop sunsets, and meeting locals who know the city beyond the tourist map.',
    interests: ['Cafes', 'Design', 'Photography', 'Walking', 'Travel'],
    birthDate: new Date('2000-04-18'),
    lookingFor: 'local_guide',
    photo: '/api/uploads/profiles/ava-brooks.png',
    trip: {
      country: 'United Arab Emirates',
      city: 'Dubai',
      fromDate: day(5),
      toDate: day(16),
      note: 'First time in Dubai — looking for a local guide for Marina and old town walks.',
      photoUrl: '/api/uploads/profiles/ava-brooks.png',
    },
  },
  {
    email: 'ava.miller.travel@example.com',
    displayName: 'Ava Miller',
    gender: 'female',
    country: 'United Kingdom',
    city: 'Manchester',
    bio: 'From Manchester, planning a short UAE trip. Prefer genuine company over loud nights — brunch, museums, and easy conversation.',
    interests: ['Brunch', 'Museums', 'Coffee', 'Travel', 'Art'],
    birthDate: new Date('1999-08-03'),
    lookingFor: 'travel_partner',
    photo: '/api/uploads/profiles/ava-miller.png',
    trip: {
      country: 'United Arab Emirates',
      city: 'Abu Dhabi',
      fromDate: day(8),
      toDate: day(18),
      note: 'Abu Dhabi soon — Louvre, Corniche, and a calm travel partner for the evenings.',
      photoUrl: '/api/uploads/profiles/ava-miller.png',
    },
  },
  {
    email: 'ava.smith.travel@example.com',
    displayName: 'Ava Smith',
    gender: 'female',
    country: 'United States',
    city: 'Boston',
    bio: 'Boston creative flying to Dubai for work and a few free days. Looking for someone to explore with — markets, food, and city walks.',
    interests: ['Food', 'Markets', 'Yoga', 'Photography', 'Travel'],
    birthDate: new Date('1998-01-22'),
    lookingFor: 'travel_partner',
    photo: '/api/uploads/profiles/ava-smith.png',
    trip: {
      country: 'United Arab Emirates',
      city: 'Dubai',
      fromDate: day(3),
      toDate: day(12),
      note: 'Work trip to Dubai with free evenings — open to a travel partner for dinner and walks.',
      photoUrl: '/api/uploads/profiles/ava-smith.png',
    },
  },
  {
    email: 'ava.collins.travel@example.com',
    displayName: 'Ava Collins',
    gender: 'female',
    country: 'United Kingdom',
    city: 'Edinburgh',
    bio: 'Edinburgh-based, heading to Riyadh soon. Want a local who can show the quieter side of the city — culture, coffee, and honest conversation.',
    interests: ['Coffee', 'Culture', 'Walking', 'Books', 'Travel'],
    birthDate: new Date('1997-06-11'),
    lookingFor: 'local_guide',
    photo: '/api/uploads/profiles/ava-collins.png',
    trip: {
      country: 'Saudi Arabia',
      city: 'Riyadh',
      fromDate: day(6),
      toDate: day(15),
      note: 'Riyadh soon — looking for a local guide for culture spots and good coffee.',
      photoUrl: '/api/uploads/profiles/ava-collins.png',
    },
  },
  {
    email: 'ava.bennett.travel@example.com',
    displayName: 'Ava Bennett',
    gender: 'female',
    country: 'United States',
    city: 'Seattle',
    bio: 'Seattle local planning Dubai days off after meetings. Friendly, low-drama, and happiest exploring with good company.',
    interests: ['Hiking', 'Coffee', 'Music', 'Food', 'Travel'],
    birthDate: new Date('1995-11-29'),
    lookingFor: 'friendship',
    photo: '/api/uploads/profiles/ava-bennett.png',
    trip: {
      country: 'United Arab Emirates',
      city: 'Dubai',
      fromDate: day(10),
      toDate: day(20),
      note: 'Dubai for meetings plus free days — open to friendship and easy city exploring.',
      photoUrl: '/api/uploads/profiles/ava-bennett.png',
    },
  },
];

async function main() {
  console.log('🌱 Seeding Ava US/UK travel profiles...');

  const admin =
    (await prisma.staffAccount.findFirst({ where: { role: 'admin' } })) ||
    (await prisma.staffAccount.findFirst());
  if (!admin) {
    throw new Error('No staff account found. Run scripts/seed.mjs first.');
  }

  const userPasswordHash = await bcrypt.hash('Travel@123456', 10);

  // Clear auto-filled guest bios so customers can write their own.
  const cleared = await prisma.profile.updateMany({
    where: { bio: 'Inbound Ad Lead' },
    data: { bio: null },
  });
  if (cleared.count) {
    console.log(`🧹 Cleared "Inbound Ad Lead" bio on ${cleared.count} profile(s)`);
  }

  for (const u of avaProfiles) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        profileOwnerType: 'staff_assisted',
        createdByStaffId: admin.id,
        lastActiveAt: new Date(),
        status: 'active',
      },
      create: {
        email: u.email,
        passwordHash: userPasswordHash,
        signupStage: 'active',
        status: 'active',
        profileOwnerType: 'staff_assisted',
        createdByStaffId: admin.id,
        lastActiveAt: new Date(),
        profile: {
          create: {
            displayName: u.displayName,
            gender: u.gender,
            country: u.country,
            city: u.city,
            bio: u.bio,
            interests: u.interests,
            lookingFor: u.lookingFor,
            dateOfBirth: u.birthDate,
            isVerified: true,
            isVisible: true,
            profileCompleteness: 95,
            photos: {
              create: [
                {
                  filePath: u.photo,
                  isPrimary: true,
                  sortOrder: 0,
                  uploadedBy: 'staff',
                  uploadedByStaffId: admin.id,
                },
              ],
            },
          },
        },
      },
    });

    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      include: { photos: true, travelPlans: true },
    });
    if (!profile) continue;

    // Never overwrite curated real photos or live trip plans on re-seed.
    if (profile.photos.length === 0) {
      await prisma.profilePhoto.create({
        data: {
          profileId: profile.id,
          filePath: u.photo,
          isPrimary: true,
          sortOrder: 0,
          uploadedBy: 'staff',
          uploadedByStaffId: admin.id,
        },
      });
    }

    if (profile.travelPlans.length === 0) {
      await prisma.travelPlan.create({
        data: {
          profileId: profile.id,
          country: u.trip.country,
          city: u.trip.city,
          fromDate: u.trip.fromDate,
          toDate: u.trip.toDate,
          note: u.trip.note,
          photoUrl: u.trip.photoUrl,
          isActive: true,
        },
      });
    }

    console.log(`✅ ${u.displayName} · ${u.city}, ${u.country} · age ~${2026 - u.birthDate.getFullYear()}`);
  }

  console.log(`🎉 Seeded ${avaProfiles.length} Ava profiles`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
