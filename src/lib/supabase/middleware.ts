import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

// Auth check with timeout to prevent blocking page loads
async function getAuthUserWithTimeout(
  supabase: ReturnType<typeof createServerClient>,
  timeoutMs: number = 3000
): Promise<{ user: { id: string } | null }> {
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<{ data: { user: null }; error: null }>((resolve) =>
        setTimeout(() => resolve({ data: { user: null }, error: null }), timeoutMs)
      ),
    ]);
    return { user: result.data.user };
  } catch {
    return { user: null };
  }
}

export async function updateSession(request: NextRequest) {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // First, set cookies on the request (for server components)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Then create a new response and set cookies on it (for browser)
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Define public routes that don't require authentication
  const publicRoutes = ['/auth/login', '/auth/callback', '/auth/signup', '/stakeholder', '/debug'];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  // Also allow static assets and API health check
  const isStaticOrApi =
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api/health') ||
    request.nextUrl.pathname === '/favicon.ico';

  // Skip auth check for public routes and static assets
  if (isPublicRoute || isStaticOrApi) {
    return supabaseResponse;
  }

  // Get user with timeout - don't block page loads if auth is slow
  // The getUser() call also refreshes tokens and updates cookies via setAll
  const { user } = await getAuthUserWithTimeout(supabase, 3000);

  // Redirect to login if not authenticated
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  // Redirect to dashboard if authenticated and trying to access login
  if (request.nextUrl.pathname === '/auth/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
