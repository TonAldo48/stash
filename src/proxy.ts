import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  // We must run the Supabase auth middleware on all requests, including POST,
  // to ensure the session is refreshed and cookies are updated.
  // This also ensures that Server Actions are protected by the same
  // authentication rules as pages.
  
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
