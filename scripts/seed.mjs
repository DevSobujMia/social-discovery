import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Create Super Admin
  const adminPasswordHash = await bcrypt.hash('Dev007', 10);
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
      lookingFor: 'travel_partner',
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
      lookingFor: 'travel_partner',
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
      lookingFor: 'travel_partner',
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
      lookingFor: 'travel_partner',
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
      lookingFor: 'travel_partner',
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
      lookingFor: 'travel_partner',
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
      lookingFor: 'travel_partner',
      birthDate: new Date('1995-05-18'),
      photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80',
      profileOwnerType: 'staff_assisted',
      requirements: {
        ageRangeMin: 28,
        ageRangeMax: 40,
        preferredGender: 'male',
        preferredCountries: ['United States', 'United Kingdom', 'Canada'],
        relationshipIntention: 'travel_partner',
        travelDestination: 'Europe & Japan',
        interests: ['Art', 'Culture', 'Travel', 'Fine Dining'],
        additionalNotes: 'Authorized City Host matchmaking staff to assist in communication and curate high-compatibility introductions.'
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
          notes: 'Travel meetup lead — looking for a local guide.',
        },
      });
    }
  }

  // Dating-era demo personas stay in the DB for CRM tests but must not
  // appear on the public meetup feed.
  await prisma.profile.updateMany({
    where: {
      user: {
        email: { in: mockUsers.map((u) => u.email) },
      },
    },
    data: {
      isVisible: false,
      lookingFor: 'travel_partner',
    },
  });

  console.log(`✅ Seeded ${mockUsers.length} legacy demo profiles (hidden from meetup feed)`);

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
      photo: '/api/uploads/profiles/w_blonde_mirror_63fefa87-5295-4fda-819d-534145fb0a60.png',
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
      photo: '/api/uploads/profiles/w_blonde_bookstore_0315588a-f3ab-4045-b89d-9c16b0675dcd.jpg',
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
      photo: '/api/uploads/profiles/w_brunette_cafe_4b99c9a7-0bef-44cd-be26-3231ed4b81a8.png',
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
      photo: '/api/uploads/profiles/w_blonde_street_eb7cd076-c2de-4c55-ba5f-1c4c23de8b14.jpg',
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
      photo: '/api/uploads/profiles/w_brunette_dinner_38dcc320-bad4-4f74-9c0b-a5403febecb7.png',
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
      photo: '/api/uploads/profiles/16ca3052-480b-4d07-81f2-9e14c4799ff1.jpg',
      trip: {
        country: 'Saudi Arabia',
        city: 'Riyadh',
        fromDate: day(8),
        toDate: day(15),
        note: 'Traveling soon to Riyadh.',
      },
    },
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
      },
    },
    {
      email: 'liam.chen.travel@example.com',
      displayName: 'Liam',
      gender: 'male',
      country: 'Australia',
      city: 'Sydney',
      bio: 'Flying to Dubai soon for fintech meetings & leisure. Looking for great company, sunset dinners in Downtown or Marina.',
      interests: ['Fintech', 'Coffee', 'Architecture', 'Travel', 'Fine Dining'],
      birthDate: new Date('1995-11-14'),
      photo: '/api/uploads/profiles/m_liam_park_b7ab04fd-f97b-47ab-b9e5-60fa91d938d7.jpg',
      trip: {
        country: 'United Arab Emirates',
        city: 'Dubai',
        fromDate: day(2),
        toDate: day(14),
        note: 'Traveling soon to Dubai. Looking forward to meeting good people.',
      },
    },
    {
      email: 'marcus.vance.travel@example.com',
      displayName: 'Marcus',
      gender: 'male',
      country: 'Canada',
      city: 'Vancouver',
      bio: 'Architect heading to Dubai & Abu Dhabi. Passionate about modern skyline design, art spaces, and pleasant evening conversations.',
      interests: ['Architecture', 'Design', 'Photography', 'Travel', 'Espresso'],
      birthDate: new Date('1993-06-20'),
      photo: '/api/uploads/profiles/m_marcus_bridge_e06bdc1e-a827-413f-a2e2-c697ff85016b.jpg',
      trip: {
        country: 'United Arab Emirates',
        city: 'Dubai',
        fromDate: day(4),
        toDate: day(18),
        note: 'Traveling soon to Dubai & UAE.',
      },
    },
    {
      email: 'daniel.kim.travel@example.com',
      displayName: 'Daniel',
      gender: 'male',
      country: 'United States',
      city: 'San Francisco',
      bio: 'Visiting Abu Dhabi and Dubai soon. Enjoy waterfront walks, jazz lounges, and authentic culinary experiences.',
      interests: ['Jazz', 'Piano', 'Hiking', 'Science', 'Travel'],
      birthDate: new Date('1994-09-23'),
      photo: '/api/uploads/profiles/m_daniel_library_773fdff4-88a3-4f25-8e85-480886c5e180.jpg',
      trip: {
        country: 'United Arab Emirates',
        city: 'Abu Dhabi',
        fromDate: day(6),
        toDate: day(16),
        note: 'Traveling soon to Abu Dhabi & Dubai.',
      },
    },
    {
      email: 'alexander.wright.travel@example.com',
      displayName: 'Alexander',
      gender: 'male',
      country: 'United Kingdom',
      city: 'London',
      bio: 'Creative director traveling to Dubai. Would love to connect with someone grounded for dinner and desert sunset views.',
      interests: ['Art', 'Design', 'Brunch', 'Travel', 'Cinema'],
      birthDate: new Date('1996-04-18'),
      photo: '/api/uploads/profiles/m_alex_cafe_0876fcda-5312-4b94-af55-b1131f80286e.jpg',
      trip: {
        country: 'United Arab Emirates',
        city: 'Dubai',
        fromDate: day(3),
        toDate: day(12),
        note: 'Upcoming trip to Dubai.',
      },
    },
    {
      email: 'lucas.silva.travel@example.com',
      displayName: 'Lucas',
      gender: 'male',
      country: 'Spain',
      city: 'Madrid',
      bio: 'Entrepreneur visiting the Emirates for a couple of weeks. Looking for friendly locals to share coffee and interesting conversations.',
      interests: ['Entrepreneurship', 'Fitness', 'Sailing', 'Travel', 'Culture'],
      birthDate: new Date('1992-08-12'),
      photo: '/api/uploads/profiles/m_lucas_coastal_750a9480-228e-452e-99a5-dd4afcccf591.jpg',
      trip: {
        country: 'United Arab Emirates',
        city: 'Dubai',
        fromDate: day(5),
        toDate: day(15),
        note: 'Traveling soon to Dubai.',
      },
    },
    {
      email: 'julian.rossi.travel@example.com',
      displayName: 'Julian',
      gender: 'male',
      country: 'Italy',
      city: 'Rome',
      bio: 'Heading to Riyadh and Dubai soon. Appreciate good food, historical architecture, and honest relaxed conversations.',
      interests: ['Gastronomy', 'Wine', 'Architecture', 'Travel', 'Art'],
      birthDate: new Date('1997-02-15'),
      photo: '/api/uploads/profiles/m_julian_gallery_7f52c47e-be08-4b14-8322-254aaab82cc2.jpg',
      trip: {
        country: 'Saudi Arabia',
        city: 'Riyadh',
        fromDate: day(7),
        toDate: day(17),
        note: 'Upcoming travel to Riyadh.',
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

    // Keep curated local photos attached even when seed re-runs after a wipe.
    const primary = await prisma.profilePhoto.findFirst({
      where: { profileId: profile.id, isPrimary: true },
    });
    if (primary) {
      await prisma.profilePhoto.update({
        where: { id: primary.id },
        data: { filePath: u.photo },
      });
    } else {
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

    await prisma.travelPlan.deleteMany({ where: { profileId: profile.id } });
    await prisma.travelPlan.create({
      data: {
        profileId: profile.id,
        country: u.trip.country,
        city: u.trip.city,
        fromDate: u.trip.fromDate,
        toDate: u.trip.toDate,
        note: u.trip.note,
        photoUrl: u.photo,
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
