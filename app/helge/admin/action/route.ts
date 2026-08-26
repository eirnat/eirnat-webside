import { NextRequest, NextResponse } from "next/server";
import { applyAdminMutation } from "../mutate";

function scrollHash(action: string, sp: URLSearchParams): string {
  if (action === "points") return "poeng";
  if (action === "team" || action === "redraw") return "lag";
  if (action === "toggle" || action === "helge" || action === "resten") {
    return "spillere";
  }
  if (action === "mode") {
    const mode = sp.get("mode");
    if (mode === "lag") return "lag";
    if (mode === "alle-mot-helge") return "spillere";
    return "spillere";
  }
  if (action === "reset") return "nullstill";
  return "konkurranse";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "";
  await applyAdminMutation(url.searchParams);
  const hash = scrollHash(action, url.searchParams);
  return NextResponse.redirect(new URL(`/helge/admin#${hash}`, request.url));
}
