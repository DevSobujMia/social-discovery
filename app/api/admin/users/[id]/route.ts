import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { success, error, notFound, handleApiError } from '@/lib/api-helpers';

// GET /api/admin/users/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await requireStaff(req);
    const { id } = await params;

    // Agent access check
    if (staff.role === 'agent') {
      const assignment = await prisma.agentAssignment.findFirst({
        where: { userId: id, agentId: staff.id, status: 'active' },
      });
      if (!assignment) return notFound('User not found');
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        profile: { include: { photos: { orderBy: { sortOrder: 'asc' } } } },
        assignments: {
          include: { agent: { select: { displayName: true, email: true, id: true } } },
          orderBy: { assignedAt: 'desc' },
        },
        utmAttribution: true,
        customerRequirements: true,
        sentInteractions: { take: 20, orderBy: { createdAt: 'desc' } },
        receivedInteractions: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) return notFound('User not found');

    return success(user);
  } catch (err) {
    return handleApiError(err);
  }
}

// PATCH /api/admin/users/[id] — update user status/profile
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await requireStaff(req);
    const { id } = await params;
    const body = await req.json();
    const { status, displayName, gender, country, city, bio, interests,
            lookingFor, relationshipIntention, dateOfBirth, isVisible, photoUrl } = body;

    // Agent access check
    if (staff.role === 'agent') {
      const assignment = await prisma.agentAssignment.findFirst({
        where: { userId: id, agentId: staff.id, status: 'active' },
      });
      if (!assignment) return notFound('User not found');
    }

    // Update user status (admin only)
    if (status && staff.role === 'admin') {
      await prisma.user.update({
        where: { id },
        data: { status },
      });

      await prisma.auditLog.create({
        data: {
          staffId: staff.id,
          action: `user.${status}`,
          targetType: 'user',
          targetId: id,
          details: { newStatus: status },
        },
      });
    }

    // Update profile
    const profileUpdate: Record<string, unknown> = {};
    if (displayName !== undefined) profileUpdate.displayName = displayName;
    if (gender !== undefined) profileUpdate.gender = gender || null;
    if (country !== undefined) profileUpdate.country = country;
    if (city !== undefined) profileUpdate.city = city;
    if (bio !== undefined) profileUpdate.bio = bio;
    if (interests !== undefined) profileUpdate.interests = interests;
    if (lookingFor !== undefined) profileUpdate.lookingFor = lookingFor || null;
    if (relationshipIntention !== undefined) profileUpdate.relationshipIntention = relationshipIntention;
    if (dateOfBirth !== undefined) profileUpdate.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (isVisible !== undefined && staff.role === 'admin') profileUpdate.isVisible = isVisible;

    if (Object.keys(profileUpdate).length > 0) {
      await prisma.profile.update({
        where: { userId: id },
        data: profileUpdate,
      });
    }

    const nextPhoto = typeof photoUrl === 'string' ? photoUrl.trim() : '';
    if (nextPhoto) {
      const profile = await prisma.profile.findUnique({
        where: { userId: id },
        include: { photos: { orderBy: { sortOrder: 'asc' } } },
      });
      if (profile) {
        const primary = profile.photos.find((p) => p.isPrimary) || profile.photos[0];
        if (primary) {
          await prisma.profilePhoto.update({
            where: { id: primary.id },
            data: { filePath: nextPhoto },
          });
        } else {
          await prisma.profilePhoto.create({
            data: {
              profileId: profile.id,
              filePath: nextPhoto,
              isPrimary: true,
              sortOrder: 0,
              uploadedBy: 'staff',
              uploadedByStaffId: staff.id,
            },
          });
        }
      }
    }

    const updated = await prisma.user.findUnique({
      where: { id },
      include: { profile: { include: { photos: true } } },
    });

    return success(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/admin/users/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff(req, 'admin');
    const { id } = await params;

    await prisma.user.update({
      where: { id },
      data: { status: 'deleted' },
    });

    return success({ message: 'User deleted' });
  } catch (err) {
    return handleApiError(err);
  }
}
