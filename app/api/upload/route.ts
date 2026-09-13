import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = process.env.UPLOAD_PATH || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '5') * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireUser();

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return error('No file uploaded');
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return error('Only JPEG, PNG, WebP, and GIF images are allowed');
    }

    if (file.size > MAX_FILE_SIZE) {
      return error(`File size must be under ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Create upload directory
    const uploadDir = path.join(UPLOAD_DIR, 'profiles');
    await mkdir(uploadDir, { recursive: true });

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${uuidv4()}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Ensure user has a profile
    let profileId = currentUser.profile?.id;
    if (!profileId) {
      const createdProfile = await prisma.profile.create({
        data: {
          userId: currentUser.id,
          displayName: currentUser.profile?.displayName || currentUser.email?.split('@')[0] || 'Traveler',
        },
      });
      profileId = createdProfile.id;
    }

    const isAvatar = formData.get('type') === 'avatar' || formData.get('isPrimary') === 'true';
    if (isAvatar) {
      await prisma.profilePhoto.updateMany({
        where: { profileId },
        data: { isPrimary: false },
      });
    }

    const existingPhotos = await prisma.profilePhoto.count({
      where: { profileId },
    });

    const photo = await prisma.profilePhoto.create({
      data: {
        profileId,
        filePath: `/api/uploads/profiles/${filename}`,
        isPrimary: isAvatar || existingPhotos === 0,
        sortOrder: existingPhotos,
        uploadedBy: 'user',
      },
    });

    // Update profile completeness if first photo
    if (existingPhotos === 0) {
      const profile = await prisma.profile.findUnique({
        where: { userId: currentUser.id },
      });
      if (profile) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: {
            profileCompleteness: Math.min(100, profile.profileCompleteness + 10),
          },
        });
      }
    }

    return success({
      id: photo.id,
      url: photo.filePath,
      isPrimary: photo.isPrimary,
    }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
