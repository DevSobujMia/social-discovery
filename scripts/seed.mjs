import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Create Super Admin
  const adminPasswordHash = await bcrypt.hash('Admin@123456', 10);
  const admin = await prisma.staffAccount.upsert({
    where: { email: 'admin@heartlink.com' },
    update: { passwordHash: adminPasswordHash, role: 'admin', status: 'active' },
    create: {
      email: 'admin@heartlink.com',
      passwordHash: adminPasswordHash,
      displayName: 'System Administrator',
      role: 'admin',
      status: 'active',
      permissions: { all: true },
    },
  });
  console.log('✅ Admin account seeded:', admin.email);

  // 2. Create Matchmaking Agents
  const agentPasswordHash = await bcrypt.hash('Agent@123456', 10);
  const agentSarah = await prisma.staffAccount.upsert({
    where: { email: 'sarah@heartlink.com' },
    update: { passwordHash: agentPasswordHash, role: 'agent', status: 'active' },
    create: {
      email: 'sarah@heartlink.com',
      passwordHash: agentPasswordHash,
      displayName: 'Sarah Jenkins (Matchmaker)',
      role: 'agent',
      status: 'active',
      createdById: admin.id,
      permissions: { can_chat: true, can_view_assigned: true },
    },
  });

  const agentAlex = await prisma.staffAccount.upsert({
    where: { email: 'alex@heartlink.com' },
    update: { passwordHash: agentPasswordHash, role: 'agent', status: 'active' },
    create: {
      email: 'alex@heartlink.com',
      passwordHash: agentPasswordHash,
      displayName: 'Alex Carter (Relationship Coach)',
      role: 'agent',
      status: 'active',
      createdById: admin.id,
      permissions: { can_chat: true, can_view_assigned: true },
    },
  });
  console.log('✅ Agents seeded:', agentSarah.email, agentAlex.email);

  // 3. Create Ad Campaigns with Agent Routing
  const campaign1 = await prisma.campaign.upsert({
    where: { utmCampaign: 'fb_global_match_2026' },
    update: {},
    create: {
      name: 'Facebook Global Match Launch 2026',
      platform: 'facebook',
      utmSource: 'facebook',
      utmMedium: 'cpc',
      utmCampaign: 'fb_global_match_2026',
      status: 'active',
      createdById: admin.id,
      routes: {
        create: {
          agentId: agentSarah.id,
          createdById: admin.id,
          isActive: true,
        },
      },
    },
  });

  const campaign2 = await prisma.campaign.upsert({
    where: { utmCampaign: 'ig_lifestyle_discovery' },
    update: {},
    create: {
      name: 'Instagram Lifestyle Discovery Ads',
      platform: 'instagram',
      utmSource: 'instagram',
      utmMedium: 'social_paid',
      utmCampaign: 'ig_lifestyle_discovery',
      status: 'active',
      createdById: admin.id,
      routes: {
        create: {
          agentId: agentAlex.id,
          createdById: admin.id,
          isActive: true,
        },
      },
    },
  });
  console.log('✅ Ad campaigns & routing seeded:', campaign1.utmCampaign, campaign2.utmCampaign);

  // 4. Create Diverse Mock Discovery Profiles
  const mockUsers = [
    {
      email: 'elena.rostova@example.com',
      displayName: 'Elena Rostova',
      gender: 'female',
      country: 'United Kingdom',
      city: 'London',
      bio: 'Architect, passionate watercolor painter, and avid globe-trotter. Seeking genuine intellectual sparks and someone who loves weekend gallery walks and espresso.',
      interests: ['Architecture', 'Art', 'Travel', 'Coffee', 'Design'],
      lookingFor: 'life_partner',
      birthDate: new Date('1997-04-12'),
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
    },
    {
      email: 'daniel.kim@example.com',
      displayName: 'Daniel Kim',
      gender: 'male',
      country: 'United States',
      city: 'San Francisco',
      bio: 'Biomedical researcher by day, jazz pianist by night. I value deep conversations, empathy, and weekend hiking trips along the coast.',
      interests: ['Piano', 'Hiking', 'Science', 'Jazz', 'Cooking'],
      lookingFor: 'relationship',
      birthDate: new Date('1994-09-23'),
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=80',
    },
    {
      email: 'aisha.rahman@example.com',
      displayName: 'Aisha Rahman',
      gender: 'female',
      country: 'Bangladesh',
      city: 'Dhaka',
      bio: 'Tech entrepreneur & literature enthusiast. Looking for someone grounded, ambitious, and with a kind heart. Love tea sessions, classic books, and stargazing.',
      interests: ['Literature', 'Startups', 'Tea', 'Philosophy', 'Photography'],
      lookingFor: 'life_partner',
      birthDate: new Date('1998-11-05'),
      photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&auto=format&fit=crop&q=80',
    },
    {
      email: 'marcus.vance@example.com',
      displayName: 'Marcus Vance',
      gender: 'male',
      country: 'Canada',
      city: 'Vancouver',
      bio: 'Landscape photographer and wilderness guide. Looking for a partner who isn’t afraid of a mountain breeze, good campfires, and spontaneous road trips.',
      interests: ['Photography', 'Wilderness', 'Camping', 'Fitness', 'Cinema'],
      lookingFor: 'dating',
      birthDate: new Date('1993-02-18'),
      photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&auto=format&fit=crop&q=80',
    },
    {
      email: 'sophia.martinez@example.com',
      displayName: 'Sophia Martinez',
      gender: 'female',
      country: 'Spain',
      city: 'Barcelona',
      bio: 'Culinary stylist and botanical illustrator. Food is my love language. Looking for meaningful connection, laughter, and shared travel adventures.',
      interests: ['Gastronomy', 'Illustration', 'Sailing', 'Wine', 'Yoga'],
      lookingFor: 'relationship',
      birthDate: new Date('1996-07-30'),
      photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&auto=format&fit=crop&q=80',
    },
    {
      email: 'liam.chen@example.com',
      displayName: 'Liam Chen',
      gender: 'male',
      country: 'Australia',
      city: 'Sydney',
      bio: 'Fintech product lead & surfer. Enthusiastic about sustainable living, beach sunrises, and great storytelling podcasts.',
      interests: ['Surfing', 'Tech', 'Sustainability', 'Fitness', 'Podcasts'],
      lookingFor: 'relationship',
      birthDate: new Date('1995-12-14'),
      photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&auto=format&fit=crop&q=80',
    },
    {
      email: 'maya.lin@example.com',
      displayName: 'Maya Lin',
      gender: 'female',
      country: 'United States',
      city: 'New York',
      bio: 'Contemporary gallery curator & boutique travel writer. Looking for a partner who values deep culture, creative ambition, and spontaneous weekends in Paris or Kyoto.',
      interests: ['Art History', 'Boutique Travel', 'Gastronomy', 'Architecture', 'Writing'],
      lookingFor: 'life_partner',
      birthDate: new Date('1995-05-18'),
      photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80',
      profileOwnerType: 'staff_assisted',
      requirements: {
        ageRangeMin: 28,
        ageRangeMax: 40,
        preferredGender: 'male',
        preferredCountries: ['United States', 'United Kingdom', 'Canada'],
        relationshipIntention: 'life_partner',
        travelDestination: 'Europe & Japan',
        interests: ['Art', 'Culture', 'Travel', 'Fine Dining'],
        additionalNotes: 'Authorized Heartlink matchmaking staff to assist in communication and curate high-compatibility introductions.'
      }
    },
  ];

  const userPasswordHash = await bcrypt.hash('User@123456', 10);

  for (const u of mockUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        profileOwnerType: u.profileOwnerType || 'self',
        createdByStaffId: u.profileOwnerType === 'staff_assisted' ? admin.id : undefined,
      },
      create: {
        email: u.email,
        passwordHash: userPasswordHash,
        signupStage: 'active',
        status: 'active',
        profileOwnerType: u.profileOwnerType || 'self',
        createdByStaffId: u.profileOwnerType === 'staff_assisted' ? admin.id : null,
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
                  uploadedBy: u.profileOwnerType === 'staff_assisted' ? 'staff' : 'user',
                  uploadedByStaffId: u.profileOwnerType === 'staff_assisted' ? admin.id : null,
                },
              ],
            },
          },
        },
      },
    });

    if (u.requirements) {
      await prisma.customerRequirements.upsert({
        where: { userId: user.id },
        update: {
          ...u.requirements,
          createdById: admin.id,
        },
        create: {
          userId: user.id,
          ...u.requirements,
          createdById: admin.id,
        },
      });
    }

    // Auto-assign Elena and Aisha to agents to demonstrate CRM workflows
    if (u.displayName === 'Elena Rostova') {
      await prisma.agentAssignment.upsert({
        where: { id: `assign-${user.id}` },
        update: {},
        create: {
          id: `assign-${user.id}`,
          userId: user.id,
          agentId: agentSarah.id,
          assignedBy: admin.id,
          status: 'active',
          notes: 'High-intent international lead from Facebook UK campaign.',
        },
      });
    } else if (u.displayName === 'Aisha Rahman') {
      await prisma.agentAssignment.upsert({
        where: { id: `assign-${user.id}` },
        update: {},
        create: {
          id: `assign-${user.id}`,
          userId: user.id,
          agentId: agentAlex.id,
          assignedBy: admin.id,
          status: 'active',
          notes: 'High-profile entrepreneur lead looking for life partner.',
        },
      });
    }
  }

  console.log(`✅ Seeded ${mockUsers.length} rich discover profiles with agent assignments`);

  // 5. Seed a demo conversation between Daniel and Elena
  const daniel = await prisma.user.findUnique({ where: { email: 'daniel.kim@example.com' } });
  const elena = await prisma.user.findUnique({ where: { email: 'elena.rostova@example.com' } });

  if (daniel && elena) {
    const match = await prisma.match.upsert({
      where: {
        userAId_userBId: {
          userAId: daniel.id < elena.id ? daniel.id : elena.id,
          userBId: daniel.id < elena.id ? elena.id : daniel.id,
        },
      },
      update: {},
      create: {
        userAId: daniel.id < elena.id ? daniel.id : elena.id,
        userBId: daniel.id < elena.id ? elena.id : daniel.id,
        status: 'active',
      },
    });

    const conversation = await prisma.conversation.upsert({
      where: { matchId: match.id },
      update: {},
      create: {
        matchId: match.id,
        type: 'direct',
        status: 'active',
        lastMessageAt: new Date(),
        lastMessagePreview: 'I really enjoyed your gallery photos! The watercolor work is stunning.',
        participants: {
          create: [
            { userId: daniel.id, unreadCount: 0 },
            { userId: elena.id, unreadCount: 1 },
          ],
        },
        messages: {
          create: [
            {
              senderUserId: daniel.id,
              content: 'Hi Elena! Great to connect with someone who appreciates both art and quiet coffee spots.',
              status: 'read',
              contentType: 'text',
            },
            {
              senderUserId: elena.id,
              content: 'Hi Daniel! Thank you, that means a lot. What kind of music do you find yourself playing most on piano?',
              status: 'read',
              contentType: 'text',
            },
            {
              senderUserId: daniel.id,
              content: 'I really enjoyed your gallery photos! The watercolor work is stunning.',
              status: 'delivered',
              contentType: 'text',
            },
          ],
        },
      },
    });
    console.log('✅ Demo conversation seeded with messages:', conversation.id);
  }

  // Hide the original Western demo profiles from public discovery — Phase 1
  // ads only show travellers heading to the Gulf.
  await prisma.profile.updateMany({
    where: {
      user: {
        email: { in: mockUsers.map((u) => u.email) },
      },
    },
    data: { isVisible: false },
  });

  // ---------------------------------------------------------------
  // Curated travel profiles — Europe & America homes, Gulf trips.
  // Meta ads target Indian/Pakistani expats IN Dubai (configured in
  // Ads Manager). Profile home countries are never India/Pakistan.
  // Travel copy is soft: "Traveling soon", not fixed hard dates.
  // ---------------------------------------------------------------
  const day = (offset) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d;
  };

  const gulfCampaign = await prisma.campaign.upsert({
    where: { utmCampaign: 'fb_gulf_dubai_in_expat' },
    update: {
      status: 'active',
      name: 'Dubai ads → IN/PK expats · EU/US travellers',
    },
    create: {
      name: 'Dubai ads → IN/PK expats · EU/US travellers',
      platform: 'facebook',
      utmSource: 'facebook',
      utmMedium: 'cpc',
      utmCampaign: 'fb_gulf_dubai_in_expat',
      status: 'active',
      createdById: admin.id,
      routes: {
        create: {
          agentId: agentSarah.id,
          createdById: admin.id,
          isActive: true,
        },
      },
    },
  });

  await prisma.campaign.upsert({
    where: { utmCampaign: 'fb_gulf_dubai_pk_expat' },
    update: {
      status: 'active',
      name: 'Dubai ads → PK expats · EU/US travellers',
    },
    create: {
      name: 'Dubai ads → PK expats · EU/US travellers',
      platform: 'facebook',
      utmSource: 'facebook',
      utmMedium: 'cpc',
      utmCampaign: 'fb_gulf_dubai_pk_expat',
      status: 'active',
      createdById: admin.id,
      routes: {
        create: {
          agentId: agentAlex.id,
          createdById: admin.id,
          isActive: true,
        },
      },
    },
  });

  await prisma.campaign.upsert({
    where: { utmCampaign: 'fb_gulf_riyadh_in_expat' },
    update: {
      status: 'active',
      name: 'Riyadh ads → IN expats · EU/US travellers',
    },
    create: {
      name: 'Riyadh ads → IN expats · EU/US travellers',
      platform: 'facebook',
      utmSource: 'facebook',
      utmMedium: 'cpc',
      utmCampaign: 'fb_gulf_riyadh_in_expat',
      status: 'active',
      createdById: admin.id,
      routes: {
        create: {
          agentId: agentSarah.id,
          createdById: admin.id,
          isActive: true,
        },
      },
    },
  });
  console.log('✅ Gulf campaigns seeded:', gulfCampaign.utmCampaign);

  const gulfProfiles = [
    {
      email: 'emma.walker.travel@example.com',
      displayName: 'Emma',
      gender: 'female',
      country: 'United Kingdom',
      city: 'London',
      bio: 'Flying to Dubai soon and I would rather not do every evening alone. Looking for someone local who knows the quieter side of the city.',
      interests: ['Cafes', 'Beach walks', 'Photography', 'Food', 'Art'],
      birthDate: new Date('1998-03-14'),
      photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&auto=format&fit=crop&q=80',
      trip: {
        country: 'United Arab Emirates',
        city: 'Dubai',
        fromDate: day(3),
        toDate: day(14),
        note: 'Traveling soon to Dubai. Good company after sunset.',
      },
    },
    {
      email: 'sophie.martin.travel@example.com',
      displayName: 'Sophie',
      gender: 'female',
      country: 'France',
      city: 'Paris',
      bio: 'Planning a Dubai trip soon. Want someone who actually lives there — not another tourist — for dinner and a walk.',
      interests: ['Brunch', 'Design', 'Museums', 'Travel', 'Wine'],
      birthDate: new Date('2000-07-22'),
      photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=800&auto=format&fit=crop&q=80',
      trip: {
        country: 'United Arab Emirates',
        city: 'Dubai',
        fromDate: day(7),
        toDate: day(16),
        note: 'Traveling soon. Looking for a local for the weekend.',
      },
    },
    {
      email: 'isabella.rossi.travel@example.com',
      displayName: 'Isabella',
      gender: 'female',
      country: 'Italy',
      city: 'Milan',
      bio: 'Heading to Dubai soon for a short stay. Prefer calm conversation over loud clubs.',
      interests: ['Fashion', 'Coffee', 'Walking', 'Architecture', 'Travel'],
      birthDate: new Date('1995-11-02'),
      photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=80',
      trip: {
        country: 'United Arab Emirates',
        city: 'Dubai',
        fromDate: day(5),
        toDate: day(12),
        note: 'Traveling soon to Dubai.',
      },
    },
    {
      email: 'olivia.chen.travel@example.com',
      displayName: 'Olivia',
      gender: 'female',
      country: 'United States',
      city: 'New York',
      bio: 'Coming to Dubai soon. If you know hidden cafes in Marina or JLT, say hi.',
      interests: ['Cafes', 'Yoga', 'Markets', 'Photography', 'Travel'],
      birthDate: new Date('1997-05-09'),
      photo: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&auto=format&fit=crop&q=80',
      trip: {
        country: 'United Arab Emirates',
        city: 'Dubai',
        fromDate: day(10),
        toDate: day(20),
        note: 'Traveling soon. Marina and quieter Dubai.',
      },
    },
    {
      email: 'chloe.anderson.travel@example.com',
      displayName: 'Chloe',
      gender: 'female',
      country: 'United States',
      city: 'Los Angeles',
      bio: 'Abu Dhabi soon — Louvre, Corniche, maybe a desert evening. Company makes it better.',
      interests: ['Museums', 'Desert', 'Reading', 'Food', 'Travel'],
      birthDate: new Date('1999-09-30'),
      photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=80',
      trip: {
        country: 'United Arab Emirates',
        city: 'Abu Dhabi',
        fromDate: day(4),
        toDate: day(9),
        note: 'Traveling soon to Abu Dhabi.',
      },
    },
    {
      email: 'amelia.berg.travel@example.com',
      displayName: 'Amelia',
      gender: 'female',
      country: 'Germany',
      city: 'Berlin',
      bio: 'Riyadh soon for a short trip. Looking for someone respectful to explore with after meetings.',
      interests: ['Art', 'Coffee', 'Walking', 'Design', 'Travel'],
      birthDate: new Date('1996-01-19'),
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
      trip: {
        country: 'Saudi Arabia',
        city: 'Riyadh',
        fromDate: day(8),
        toDate: day(15),
        note: 'Traveling soon to Riyadh.',
      },
    },
  ];

  // Hide older India/Pakistan home profiles if they still exist from prior seeds.
  await prisma.profile.updateMany({
    where: {
      OR: [
        { country: { equals: 'India', mode: 'insensitive' } },
        { country: { equals: 'Pakistan', mode: 'insensitive' } },
      ],
    },
    data: { isVisible: false },
  });

  for (const u of gulfProfiles) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        profileOwnerType: 'staff_assisted',
        createdByStaffId: admin.id,
        lastActiveAt: new Date(),
        profile: {
          update: {
            displayName: u.displayName,
            gender: u.gender,
            country: u.country,
            city: u.city,
            bio: u.bio,
            interests: u.interests,
            lookingFor: 'travel_partner',
            dateOfBirth: u.birthDate,
            isVerified: true,
            isVisible: true,
            profileCompleteness: 90,
          },
        },
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
            lookingFor: 'travel_partner',
            dateOfBirth: u.birthDate,
            isVerified: true,
            isVisible: true,
            profileCompleteness: 90,
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

    const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
    if (!profile) continue;

    await prisma.travelPlan.deleteMany({ where: { profileId: profile.id } });
    await prisma.travelPlan.create({
      data: {
        profileId: profile.id,
        country: u.trip.country,
        city: u.trip.city,
        fromDate: u.trip.fromDate,
        toDate: u.trip.toDate,
        note: u.trip.note,
        isActive: true,
      },
    });
  }

  console.log(`✅ Seeded ${gulfProfiles.length} Gulf travel profiles with active trips`);
  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
