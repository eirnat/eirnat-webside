import { UAParser } from "ua-parser-js";
import { insertScan } from "@/lib/db/scans";
import { computeVisitorHash } from "@/lib/qr/visitor-hash";

function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "";
  }
  return headers.get("x-real-ip") ?? "";
}

function classifyDeviceType(type: string | undefined): string {
  if (type === "mobile") return "mobile";
  if (type === "tablet") return "tablet";
  return "desktop";
}

export async function logScan(req: Request, linkId: string): Promise<void> {
  const headers = req.headers;
  const userAgent = headers.get("user-agent") ?? "";

  // IP brukes kun til geo og hash — lagres aldri
  getClientIp(headers);

  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  await insertScan({
    link_id: linkId,
    country: headers.get("x-vercel-ip-country"),
    region: headers.get("x-vercel-ip-country-region"),
    city: headers.get("x-vercel-ip-city"),
    device_type: classifyDeviceType(result.device.type),
    os: result.os.name ?? null,
    browser: result.browser.name ?? null,
    visitor_hash: computeVisitorHash(headers, userAgent),
  });
}
