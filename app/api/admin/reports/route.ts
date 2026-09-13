import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { success, handleApiError } from '@/lib/api-helpers';

// GET /api/admin/reports
export async function GET() {
  try {
    await requireAdmin();

    const reports = await prisma.report.findMany({
      include: {
        reporter: {
          select: { email: true, profile: { select: { displayName: true } } },
        },
        reportedUser: {
          select: { email: true, status: true, profile: { select: { displayName: true } } },
        },
        reviewer: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return success(reports);
  } catch (err) {
    return handleApiError(err);
  }
}

// PATCH /api/admin/reports — resolve report
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const { id, status, suspendUser } = body;

    if (!id || !status) return success(null);

    await prisma.report.update({
      where: { id },
      data: {
        status,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      },
    });

    // Optionally suspend reported user
    if (suspendUser) {
      const report = await prisma.report.findUnique({ where: { id } });
      if (report) {
        await prisma.user.update({
          where: { id: report.reportedUserId },
          data: { status: 'suspended' },
        });
      }
    }

    return success({ message: 'Report updated' });
  } catch (err) {
    return handleApiError(err);
  }
}
