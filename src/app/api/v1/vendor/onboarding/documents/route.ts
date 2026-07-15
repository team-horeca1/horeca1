// POST /api/v1/vendor/onboarding/documents
// Attaches a KYC document to a freshly-created vendor DURING public
// registration, when the applicant has no session yet. Authorized the same way
// the onboarding submit is: the caller must have a recently-verified OTP for a
// phone that matches the vendor's owning user. The vendorId is an unguessable
// uuid returned by /onboarding/submit moments earlier.
// PUBLIC (OTP-gated) + rate-limited.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit } from '@/middleware/withRateLimit';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import {
  MAX_DOC_BYTES,
  extForMime,
  newDocId,
  saveVendorDoc,
  serveUrl,
} from '@/lib/vendorDocStorage';

export const runtime = 'nodejs';

const DOC_TYPES = ['fssai', 'gst', 'pan', 'bank_proof', 'other'];
const PHONE_RE = /^\d{10}$/;

async function postHandler(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data') && !contentType.includes('application/x-www-form-urlencoded')) {
      throw Errors.badRequest('Content-Type must be multipart/form-data');
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw Errors.badRequest('Content-Type must be multipart/form-data');
    }
    const phone = String(form.get('phone') ?? '');
    const vendorId = String(form.get('vendorId') ?? '');
    const type = String(form.get('type') ?? '');
    const file = form.get('file');

    if (!PHONE_RE.test(phone)) throw Errors.badRequest('Invalid phone number');
    if (!vendorId) throw Errors.badRequest('Missing vendor reference');
    if (!DOC_TYPES.includes(type)) throw Errors.badRequest('Invalid document type');
    if (!(file instanceof File)) throw Errors.badRequest('No file provided');

    const ext = extForMime(file.type);
    if (!ext) throw Errors.badRequest('Unsupported file type. Allowed: PDF, JPG, PNG, WebP');
    if (file.size > MAX_DOC_BYTES) throw Errors.badRequest('File too large. Max size: 10MB');

    // Same proof-of-ownership the submit route uses: a used OTP for this phone
    // within the last 30 minutes.
    const verifiedOtp = await prisma.otpCode.findFirst({
      where: { phone, used: true, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
      select: { id: true },
    });
    if (!verifiedOtp) throw Errors.forbidden('Phone not verified');

    // The vendor must belong to the user who owns this phone — otherwise a
    // verified phone could attach docs to someone else's vendor id.
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, user: { select: { phone: true } } },
    });
    if (!vendor || vendor.user.phone !== phone) throw Errors.forbidden('Vendor does not match this phone');

    const docId = newDocId();
    const buffer = Buffer.from(await file.arrayBuffer());
    await saveVendorDoc(vendorId, docId, ext, buffer);

    const document = await prisma.vendorDocument.create({
      data: {
        id: docId,
        vendorId,
        type,
        fileUrl: serveUrl(docId, ext),
        fileName: file.name.slice(0, 255),
      },
      select: { id: true, type: true, fileName: true, status: true },
    });

    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRateLimit(postHandler, 'upload');
