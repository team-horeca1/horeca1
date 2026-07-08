import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

// Standard API error class
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Standard error response format
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Human-readable message for an arbitrary caught error. Used for per-row
// import errors (and by errorResponse) — never surfaces raw Prisma engine
// dumps ("Invalid `prisma.…` invocation in …") to the client.
export function friendlyErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (issue) {
      const path = issue.path.map(String).join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    }
    return 'Invalid input';
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    const target = (error as { meta?: { target?: unknown } }).meta?.target;
    if (code === 'P2002') {
      const field = Array.isArray(target) ? String(target[target.length - 1]) : 'Record';
      if (field === 'slug' || field === 'Record') {
        return 'A product with this name or slug already exists';
      }
      return `${field} already exists`;
    }
    if (code === 'P2003') {
      const field = (error as { meta?: { field_name?: string } }).meta?.field_name;
      console.error('[API Error] P2003 foreign key constraint', field ?? error);
      return 'Cannot delete — related records still exist. Contact support if this persists.';
    }
    if (code === 'P2028') {
      console.error('[API Error] P2028 transaction timeout', error);
      return 'Delete took too long and was rolled back. Please try again.';
    }
    if (code === 'P2000') return 'A value is too long for its field';
  }
  if (error instanceof Error && error.name === 'PrismaClientValidationError') {
    const unknownArg = error.message.match(/Unknown argument `([^`]+)`/);
    if (unknownArg) {
      return `Database schema out of date (${unknownArg[1]}). Run: npx prisma generate && restart dev server`;
    }
    const line = error.message.split('\n').find((l) => l.includes('Invalid')) ?? error.message.split('\n')[0];
    return line?.trim() || fallback;
  }
  if (error instanceof Error && error.message && !error.message.includes('invocation')) {
    return error.message;
  }
  return fallback;
}

export function errorResponse(error: unknown): NextResponse<ErrorResponse> {
  // Zod validation error — surface the FIRST failing field so the user knows what to fix
  // instead of a generic "Invalid input". Full per-field details still in details.fields.
  if (error instanceof ZodError) {
    const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
    const issues = error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return NextResponse.json(
      {
        success: false as const,
        error: {
          code: 'VALIDATION_ERROR',
          message: friendlyErrorMessage(error),
          details: { fields: flat, issues },
        },
      },
      { status: 400 }
    );
  }

  // Prisma unique-constraint violation (P2002) — a TOCTOU race past a
  // pre-insert existence check (e.g. two admins creating the same coupon code
  // at once) reaches the DB constraint. Translate it to a clean 409 instead of
  // a 500. Detected structurally so we don't couple the handler to Prisma.
  if (
    typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  ) {
    return NextResponse.json(
      {
        success: false as const,
        error: { code: 'DUPLICATE', message: friendlyErrorMessage(error) },
      },
      { status: 409 }
    );
  }

  // Known API error
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false as const,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.statusCode }
    );
  }

  // Unknown error
  console.error('[API Error]', error);
  return NextResponse.json(
    {
      success: false as const,
      error: {
        code: 'INTERNAL_ERROR',
        message: friendlyErrorMessage(error, 'Something went wrong'),
      },
    },
    { status: 500 }
  );
}

// Common error factories
export const Errors = {
  unauthorized: (message = 'Authentication required') =>
    new ApiError('UNAUTHORIZED', message, 401),

  forbidden: (message = "You don't have permission for this action") =>
    new ApiError('FORBIDDEN', message, 403),

  notFound: (resource: string) =>
    new ApiError('NOT_FOUND', `${resource} not found`, 404),

  duplicate: (field: string) =>
    new ApiError('DUPLICATE', `${field} already exists`, 409),

  belowMOV: (vendorName: string, mov: number, current: number) =>
    new ApiError('BELOW_MOV', `Minimum order value is ₹${mov} for ${vendorName}`, 400, {
      min_order_value: mov,
      current_total: current,
    }),

  outOfStock: (productName: string, available: number) =>
    new ApiError('OUT_OF_STOCK', `${productName} has only ${available} units available`, 400, {
      available,
    }),

  insufficientCredit: (available: number, required: number) =>
    new ApiError('INSUFFICIENT_CREDIT', `Available credit ₹${available}, required ₹${required}`, 400, {
      available,
      required,
    }),

  conflict: (message: string) =>
    new ApiError('CONFLICT', message, 409),

  badRequest: (message: string, details?: Record<string, unknown>) =>
    new ApiError('BAD_REQUEST', message, 400, details),

  /** Validation / duplicate with a target form field for client highlighting. */
  fieldError: (field: string, message: string, statusCode: number = 400) =>
    new ApiError(statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST', message, statusCode, { field }),
};
