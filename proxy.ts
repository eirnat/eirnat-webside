import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_QR_PATHS = ["/qr/login", "/qr/ikke-funnet", "/qr/personvern"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/qr") &&
    !PUBLIC_QR_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  ) {
    const session = await auth();
    if (!session) {
      const loginUrl = new URL("/qr/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/qr/:path*"],
};
