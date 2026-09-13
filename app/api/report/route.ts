import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireUser();
    const body = await req.json();
    const { userId, reason, description } = body;

    if (!userId || !reason) return error('userId and reason are required');
    if (!['spam', 'fake_profile', 'harassment', 'inappropriate_content', 'other'].includes(reason)) {
      return error('Invalid reason');
    }

    await prisma.report.create({
      data: {
        reporterId: currentUser.id,
        reportedUserId: userId,
        reason,
        description: description || null,
      },
    });

    return success({ message: 'Report submitted' }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
