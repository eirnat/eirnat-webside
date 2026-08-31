export const dynamic = "force-dynamic";
export const revalidate = 0;

import { waitUntil } from "@vercel/functions";
import { NextResponse } from "next/server";
import { getLinkBySlug } from "@/lib/db/links";
import { logScan } from "@/lib/qr/log-scan";
import { checkRedirectRateLimit } from "@/lib/qr/rate-limit";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const { allowed } = await checkRedirectRateLimit(req);
  if (!allowed) {
    return new NextResponse("For mange forespørsler", { status: 429 });
  }

  let link;
  try {
    link = await getLinkBySlug(slug);
  } catch (error) {
    console.error("Kunne ikke slå opp lenke", error);
    return NextResponse.redirect(new URL("/qr/ikke-funnet", req.url), 302);
  }

  if (!link || !link.active) {
    return NextResponse.redirect(new URL("/qr/ikke-funnet", req.url), 302);
  }

  waitUntil(
    logScan(req, link.id).catch((error) => {
      console.error("scan-logg feilet", error);
    }),
  );

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: link.target_url,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
