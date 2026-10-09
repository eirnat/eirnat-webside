import { renderTrafikkIcon } from "../../pwa-icon";

const ALLOWED = new Set([192, 512]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!ALLOWED.has(size)) {
    return new Response("Ikke funnet", { status: 404 });
  }

  const maskable = new URL(request.url).searchParams.get("maskable") === "1";
  const image = renderTrafikkIcon(size, { maskable });
  image.headers.set("Cache-Control", "public, max-age=86400");
  return image;
}
