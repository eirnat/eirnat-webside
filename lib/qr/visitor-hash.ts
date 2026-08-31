import { createHash } from "crypto";

function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "";
  }
  return headers.get("x-real-ip") ?? "";
}

export function computeVisitorHash(headers: Headers, userAgent: string): string | null {
  const secret = process.env.QR_HASH_SECRET;
  if (!secret || secret.length < 32) {
    return null;
  }

  const ip = getClientIp(headers);
  const today = new Date().toISOString().slice(0, 10);

  return createHash("sha256")
    .update(`${ip}${userAgent}${today}${secret}`)
    .digest("hex");
}
