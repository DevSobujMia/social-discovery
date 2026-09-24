import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function updateProfilesToGermany() {
  console.log('Updating DB profiles to Germany...');
  
  const germanCities = ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne', 'Düsseldorf'];
  
  const profiles = await prisma.profile.findMany({
    include: { user: true, travelPlans: true }
  });
  
  console.log('Found profiles:', profiles.length);
  
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const assignedCity = germanCities[i % germanCities.length];
    
    // Update profile country & city to Germany
    await prisma.profile.update({
      where: { id: p.id },
      data: {
        country: 'Germany',
        city: assignedCity,
      }
    });

    // Update travel plans notes to remove specific country names
    for (const tp of p.travelPlans) {
      await prisma.travelPlan.update({
        where: { id: tp.id },
        data: {
          note: 'Traveler visiting your city · excited to connect with locals.',
        }
      });
    }
  }

  console.log('✓ Successfully updated all profiles and travel plans in DB!');
  await prisma.$disconnect();
}

updateProfilesToGermany();
