import { NextResponse } from 'next/server';

export function success(data: unknown = null, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function error(
  message: string,
  status = 400,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    { success: false, error: { message, ...details } },
    { status }
  );
}

export function unauthorized(message = 'Unauthorized') {
  return error(message, 401);
}

export function forbidden(message = 'Forbidden') {
  return error(message, 403);
}

export function notFound(message = 'Not found') {
  return error(message, 404);
}

export function serverError(message = 'Internal server error') {
  return error(message, 500);
}

export function handleApiError(err: unknown) {
  if (err instanceof Error) {
    if (err.message === 'UNAUTHORIZED') return unauthorized();
    if (err.message === 'FORBIDDEN') return forbidden();
    console.error('API Error:', err.message);
  }
  return serverError();
}

// Rate limiting - simple in-memory store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true; // Bypass rate limiting in development/testing mode
  }
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);
