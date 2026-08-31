export const dynamic = "force-dynamic";

import { getLinkBySlug } from "@/lib/db/links";
import { generateQrPng, generateQrSvg } from "@/lib/qr/generate";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "svg";

  let link;
  try {
    link = await getLinkBySlug(slug);
  } catch {
    return new Response("Ikke funnet", { status: 404 });
  }

  if (!link) {
    return new Response("Ikke funnet", { status: 404 });
  }

  if (format === "png") {
    const png = await generateQrPng(slug);
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="qr-${slug}.png"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const svg = await generateQrSvg(slug);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="qr-${slug}.svg"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
