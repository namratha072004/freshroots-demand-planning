import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidSessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (await isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

// /login stays public; cron and static assets are not behind the dashboard login.
export const config = {
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
