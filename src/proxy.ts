import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple in-memory rate limiter using Edge Maps (works on VPS single instances)
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();

/**
 * Security Proxy: Gates the control panel and all admin API routes,
 * while also providing rate limiting and global security headers.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 1. Admin Gate Check
  const isAdminRoute =
    pathname.startsWith("/control-panel-x7k9") ||
    pathname.startsWith("/api/client-admin") ||
    pathname.startsWith("/api/admin");

  if (isAdminRoute && process.env.ENABLE_ADMIN === "false") {
    // Return a genuine 404 — don't reveal that the route exists
    return new NextResponse("Not Found", { status: 404 });
  }

  // 2. Rate Limiting ONLY for Auth routes to prevent brute force / DDoS
  if (pathname.startsWith('/api/auth/login') || pathname.startsWith('/api/auth/register')) {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    
    // Clean up old entries randomly to prevent memory leaks (10% chance)
    if (Math.random() < 0.1) {
      const now = Date.now();
      rateLimitMap.forEach((val, key) => {
        if (now > val.resetTime) rateLimitMap.delete(key);
      });
    }

    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 100; // Increased limit so multiple staff on the same IP don't get locked out

    const record = rateLimitMap.get(ip);
    const now = Date.now();

    if (!record || now > record.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    } else {
      record.count += 1;
      if (record.count > maxRequests) {
        return new NextResponse(JSON.stringify({ error: "Too many attempts, please try again later." }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((record.resetTime - now) / 1000).toString(),
          },
        });
      }
    }
  }

  // 3. Security Headers
  const response = NextResponse.next();
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
