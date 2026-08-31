import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  if (!ratelimit) {
    ratelimit = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      analytics: false,
    });
  }
  return ratelimit;
}

function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return headers.get("x-real-ip") ?? "unknown";
}

export async function checkRedirectRateLimit(
  req: Request,
): Promise<{ allowed: boolean }> {
  const limiter = getRatelimit();
  if (!limiter) {
    return { allowed: true };
  }

  const ip = getClientIp(req.headers);
  const { success } = await limiter.limit(`qr-redirect:${ip}`);
  return { allowed: success };
}
