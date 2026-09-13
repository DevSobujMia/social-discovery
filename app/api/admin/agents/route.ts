import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, hashPassword } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';

// GET /api/admin/agents
export async function GET() {
  try {
    await requireAdmin();

    const agents = await prisma.staffAccount.findMany({
      where: { role: 'agent' },
      select: {
        id: true, email: true, displayName: true, status: true,
        lastActiveAt: true, createdAt: true,
        _count: {
          select: {
            agentAssignments: { where: { status: 'active' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return success(agents);
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/admin/agents — create agent
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const { email, password, displayName } = body;

    if (!email || !password || !displayName) {
      return error('Email, password, and name are required');
    }

    const existing = await prisma.staffAccount.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing) return error('Email already in use');

    const passwordHash = await hashPassword(password);

    const agent = await prisma.staffAccount.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        displayName,
        role: 'agent',
        createdById: admin.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        staffId: admin.id,
        action: 'agent.create',
        targetType: 'staff',
        targetId: agent.id,
        details: { email: agent.email, displayName },
      },
    });

    return success({
      id: agent.id,
      email: agent.email,
      displayName: agent.displayName,
      status: agent.status,
    }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

// PATCH /api/admin/agents — update agent status
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const { id, status, displayName } = body;

    if (!id) return error('Agent ID is required');

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (displayName) updateData.displayName = displayName;

    const agent = await prisma.staffAccount.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        staffId: admin.id,
        action: 'agent.update',
        targetType: 'staff',
        targetId: id,
        details: updateData as any,
      },
    });

    return success(agent);
  } catch (err) {
    return handleApiError(err);
  }
}
