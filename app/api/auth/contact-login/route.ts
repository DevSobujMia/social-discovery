import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { signToken, setAuthCookie } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contact } = body;

    if (!contact || typeof contact !== 'string' || !contact.trim()) {
      return error('Please enter your Phone, WhatsApp, or Telegram.', 400);
    }

    const cleanContact = contact.trim();
    const cleanDigits = cleanContact.replace(/[^0-9]/g, '');
    const telegramWithAt = cleanContact.startsWith('@') ? cleanContact : `@${cleanContact}`;
    const telegramWithoutAt = cleanContact.replace(/^@/, '');

    // Search user by exact match or digit match
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: cleanContact },
          { whatsapp: cleanContact },
          { telegram: cleanContact },
          { telegram: telegramWithAt },
          { telegram: telegramWithoutAt },
          ...(cleanDigits.length >= 6
            ? [
                { phone: { contains: cleanDigits } },
                { whatsapp: { contains: cleanDigits } },
              ]
            : []),
        ],
      },
      include: {
        profile: {
          include: { photos: true },
        },
      },
    });

    if (!user) {
      return error('No existing account found with this contact. Please start a new chat and verify.', 404);
    }

    if (user.status === 'blocked' || user.status === 'suspended') {
      return error('This account has been suspended or restricted.', 403);
    }

    // Issue JWT cookie
    const token = signToken({
      id: user.id,
      email: user.email || '',
      type: 'user',
    });
    await setAuthCookie(token);

    return success({
      user: {
        id: user.id,
        displayName: user.profile?.displayName || 'Customer',
        phone: user.phone,
        whatsapp: user.whatsapp,
        telegram: user.telegram,
        isVerifiedLead: user.isVerifiedLead,
        leadStage: user.leadStage,
        verifiedVia: user.verifiedVia,
      },
      message: 'Logged in successfully! Your chat history has been restored.',
    });
  } catch (err) {
    return handleApiError(err);
  }
}
