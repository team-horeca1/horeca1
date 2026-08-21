// POST /api/v1/upload — Upload image to ImageKit
// WHY: Centralized image upload endpoint for products, categories, vendors, etc.
//      Uploads go to organized folders (/horeca/products, /horeca/categories, etc.)
// PROTECTED: Any authenticated user (vendor, admin, customer)

import { NextRequest, NextResponse } from 'next/server';
import { getImageKit, IMAGEKIT_FOLDERS, type ImageFolder } from '@/lib/imagekit';
import { withRole } from '@/middleware/rbac';
import { withRateLimit } from '@/middleware/withRateLimit';
import { errorResponse } from '@/middleware/errorHandler';
import { toFile } from '@imagekit/nodejs';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const POST = withRateLimit(withRole(['admin', 'vendor', 'customer', 'brand'], async (req: NextRequest) => {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'misc';

    if (!file) {
      return NextResponse.json(
        { success: false, error: { message: 'No file provided' } },
        { status: 400 },
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: { message: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, GIF, SVG` } },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size <= 0) {
      return NextResponse.json(
        { success: false, error: { message: 'File is empty' } },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: { message: `File too large. Max size: 10MB` } },
        { status: 400 },
      );
    }

    // Resolve folder path
    const folderPath = IMAGEKIT_FOLDERS[folder as ImageFolder] || IMAGEKIT_FOLDERS.misc;

    // Generate a unique file name
    const ext = file.name.split('.').pop() || 'jpg';
    const safeName = file.name
      .replace(/\.[^/.]+$/, '') // remove extension
      .replace(/[^a-zA-Z0-9-_]/g, '-') // sanitize
      .substring(0, 60);
    const fileName = `${safeName}-${Date.now()}.${ext}`;

    // Convert File to buffer for ImageKit SDK
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const imagekit = getImageKit();
    const uploadResponse = await imagekit.files.upload({
      file: await toFile(buffer, fileName, { type: file.type }),
      fileName,
      folder: folderPath,
      useUniqueFileName: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        fileId: uploadResponse.fileId,
        name: uploadResponse.name,
        url: uploadResponse.url,
        thumbnailUrl: uploadResponse.thumbnailUrl,
        filePath: uploadResponse.filePath,
        size: uploadResponse.size,
        width: uploadResponse.width,
        height: uploadResponse.height,
      },
    });
  } catch (error) {
    console.error('Image upload failed:', error);
    return errorResponse(error);
  }
}), 'upload');
