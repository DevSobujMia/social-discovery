import { NextRequest } from 'next/server';
import { getCurrentUser, getCurrentStaff } from '@/lib/auth';
import { success, error, handleApiError } from '@/lib/api-helpers';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = process.env.UPLOAD_PATH || './uploads';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v'];

export async function POST(req: NextRequest) {
  try {
    const [user, staff] = await Promise.all([getCurrentUser(), getCurrentStaff()]);
    if (!user && !staff) {
      return error('Unauthorized to upload media', 401);
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return error('No file uploaded');
    }

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      return error('Only JPEG, PNG, WebP, GIF images, and MP4, WebM, MOV videos are allowed');
    }

    if (file.size > MAX_FILE_SIZE) {
      return error('File size must be under 50MB');
    }

    const uploadDir = path.join(UPLOAD_DIR, 'chat');
    await mkdir(uploadDir, { recursive: true });

    let ext = file.name.split('.').pop()?.toLowerCase() || (isImage ? 'jpg' : 'mp4');
    if (!/^[a-z0-9]+$/.test(ext)) {
      ext = isImage ? 'jpg' : 'mp4';
    }

    const filename = `${uuidv4()}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const mediaUrl = `/api/uploads/chat/${filename}`;
    const contentType = isVideo ? 'video' : 'image';

    return success(
      {
        url: mediaUrl,
        contentType,
        originalName: file.name,
        size: file.size,
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
