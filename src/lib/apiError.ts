/**
 * Client-side API error parsing — safe JSON + field mapping for form feedback.
 */

export interface ParsedApiError {
  message: string;
  code?: string;
  field?: string;
  fields?: Record<string, string>;
}

type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: {
    field?: string;
    fields?: Record<string, string[] | undefined>;
    issues?: Array<{ path?: string; message?: string }>;
  };
};

type ApiJson = {
  success?: boolean;
  error?: ApiErrorPayload | string;
};

/** Parse response body as JSON without throwing on HTML error pages. */
export async function parseJsonResponse<T = ApiJson>(res: Response): Promise<T> {
  const raw = await res.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      res.ok
        ? 'Server returned an invalid response. Please try again.'
        : `Request failed (${res.status}). The server may be busy — try again.`,
    );
  }
}

/** Infer form field from human-readable API message when details.field is absent. */
export function inferFieldFromMessage(message: string): string | undefined {
  const m = message.toLowerCase();
  if (/phone|mobile/.test(m)) return 'phone';
  if (/email/.test(m)) return 'email';
  if (/identifier|already on .* team|team member/.test(m)) return 'identifier';
  if (/password/.test(m)) return 'password';
  if (/full name|name is required/.test(m)) return 'fullName';
  if (/gst|gstin/.test(m)) return 'gstin';
  if (/pan/.test(m)) return 'pan';
  if (/pincode|pin code/.test(m)) return 'pincode';
  if (/brand with this name|slug/.test(m)) return 'legalName';
  if (/vendor with this|trade name/.test(m)) return 'businessName';
  if (/role named/.test(m)) return 'name';
  return undefined;
}

function zodDetailsToFields(details?: ApiErrorPayload['details']): Record<string, string> | undefined {
  if (!details) return undefined;

  const out: Record<string, string> = {};

  if (details.fields) {
    for (const [key, msgs] of Object.entries(details.fields)) {
      if (msgs?.[0]) out[key] = msgs[0];
    }
  }

  if (details.issues) {
    for (const issue of details.issues) {
      const path = issue.path?.split('.').pop() ?? issue.path;
      if (path && issue.message && !out[path]) out[path] = issue.message;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/** Extract structured error from a parsed API JSON body. */
export function extractApiError(json: unknown, fallback = 'Something went wrong'): ParsedApiError {
  if (!json || typeof json !== 'object') {
    return { message: fallback };
  }

  const body = json as ApiJson;
  if (body.success !== false) {
    return { message: fallback };
  }

  const err = body.error;
  if (!err) return { message: fallback };
  if (typeof err === 'string') {
    const field = inferFieldFromMessage(err);
    return { message: err, field, fields: field ? { [field]: err } : undefined };
  }

  const message = err.message || fallback;
  const field =
    typeof err.details?.field === 'string'
      ? err.details.field
      : inferFieldFromMessage(message);
  const fields = zodDetailsToFields(err.details);

  if (field && !fields) {
    return { message, code: err.code, field, fields: { [field]: message } };
  }

  if (fields && !field) {
    const firstField = Object.keys(fields)[0];
    return { message, code: err.code, field: firstField, fields };
  }

  return { message, code: err.code, field, fields };
}
