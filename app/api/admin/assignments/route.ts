import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

// GET /api/admin/assignments
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const status = searchParams.get('status') || 'active';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { status };
    if (agentId) where.agentId = agentId;

    const assignments = await prisma.agentAssignment.findMany({
      where,
      include: {
        user: {
          include: {
            profile: { select: { displayName: true, country: true } },
          },
        },
        agent: { select: { displayName: true, email: true } },
        assignedByStaff: { select: { displayName: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return success(assignments);
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/admin/assignments — assign user to agent
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const { userId, agentId, notes } = body;

    if (!userId || !agentId) return error('userId and agentId are required');

    // Deactivate existing assignment
    const existing = await prisma.agentAssignment.findFirst({
      where: { userId, status: 'active' },
    });

    if (existing) {
      await prisma.agentAssignment.update({
        where: { id: existing.id },
        data: { status: 'transferred', removedAt: new Date() },
      });

      // Record history
      await prisma.assignmentHistory.create({
        data: {
          userId,
          previousAgentId: existing.agentId,
          newAgentId: agentId,
          action: 'transferred',
          performedBy: admin.id,
          reason: notes,
        },
      });
    } else {
      await prisma.assignmentHistory.create({
        data: {
          userId,
          newAgentId: agentId,
          action: 'assigned',
          performedBy: admin.id,
          reason: notes,
        },
      });
    }

    const assignment = await prisma.agentAssignment.create({
      data: {
        userId,
        agentId,
        assignedBy: admin.id,
        notes,
      },
    });

    await prisma.auditLog.create({
      data: {
        staffId: admin.id,
        action: existing ? 'assignment.transfer' : 'assignment.create',
        targetType: 'assignment',
        targetId: assignment.id,
        details: {
          userId,
          agentId,
          previousAgentId: existing?.agentId,
          notes,
        },
      },
    });

    return success(assignment, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/admin/assignments — remove assignment
export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return error('userId is required');

    const existing = await prisma.agentAssignment.findFirst({
      where: { userId, status: 'active' },
    });

    if (existing) {
      await prisma.agentAssignment.update({
        where: { id: existing.id },
        data: { status: 'removed', removedAt: new Date() },
      });

      await prisma.assignmentHistory.create({
        data: {
          userId,
          previousAgentId: existing.agentId,
          action: 'removed',
          performedBy: admin.id,
        },
      });

      await prisma.auditLog.create({
        data: {
          staffId: admin.id,
          action: 'assignment.remove',
          targetType: 'assignment',
          targetId: existing.id,
          details: { userId, agentId: existing.agentId },
        },
      });
    }

    return success({ message: 'Assignment removed' });
  } catch (err) {
    return handleApiError(err);
  }
}
