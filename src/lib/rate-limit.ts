// Simple in-memory rate limiter
// For production, use Redis or a dedicated rate limiting service

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function rateLimit(identifier: string, config: RateLimitConfig): {
  success: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || entry.resetAt < now) {
    // Create new entry
    const resetAt = now + config.windowMs;
    rateLimitMap.set(identifier, { count: 1, resetAt });
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

export function getRateLimitIdentifier(req: Request): string {
  // Try to get IP from various headers
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0] || realIp || "unknown";
  
  return ip;
}
