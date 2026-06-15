import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

// Check if auth cookies exist (fast, no network)
function hasAuthCookies(request: NextRequest): boolean {
  const cookies = request.cookies.getAll();
  return cookies.some(c => c.name.startsWith('sb-') && c.name.includes('auth-token'));
}

// Get user with timeout to prevent blocking page loads
async function getAuthUserWithTimeout(
  supabase: ReturnType<typeof createServerClient>,
  timeoutMs: number
): Promise<{ user: { id: string } | null; timedOut: boolean }> {
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<{ data: { user: null }; error: null; timedOut: true }>((resolve) =>
        setTimeout(() => resolve({ data: { user: null }, error: null, timedOut: true }), timeoutMs)
      ),
    ]);

    if ('timedOut' in result && result.timedOut) {
      return { user: null, timedOut: true };
    }

    return { user: result.data?.user ?? null, timedOut: false };
  } catch {
    return { user: null, timedOut: false };
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
  const publicRoutes = ['/auth/login', '/auth/callback', '/auth/signup', '/stakeholder', '/upload', '/debug'];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  // Also allow static assets and API health check
  const isStaticOrApi =
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api/health') ||
    request.nextUrl.pathname.startsWith('/api/upload-links/') ||
    request.nextUrl.pathname === '/favicon.ico';

  // Skip auth check for public routes and static assets
  if (isPublicRoute || isStaticOrApi) {
    return supabaseResponse;
  }

  // First, do a fast check for auth cookies (no network call)
  const hasCookies = hasAuthCookies(request);

  // Get user with timeout - don't block page loads if auth is slow
  // The getUser() call also refreshes tokens and updates cookies via setAll
  const { user, timedOut } = await getAuthUserWithTimeout(supabase, 3000);

  // IMPORTANT: Don't redirect to login if user has auth cookies but getUser timed out
  // This prevents losing valid sessions when auth is slow
  if (!user && !hasCookies) {
    // No cookies and no user - definitely not authenticated
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  // If we have cookies but getUser failed/timed out, handle appropriately
  if (!user && hasCookies) {
    if (timedOut) {
      // Auth timed out but cookies exist - let them through, client will handle
      console.log('[Middleware] Auth timed out but cookies exist - allowing through');
    } else {
      // Cookies exist but session is INVALID/EXPIRED - redirect to login
      console.log('[Middleware] Session invalid/expired - redirecting to login');
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      return NextResponse.redirect(url);
    }
  }

  // Redirect to dashboard if authenticated and trying to access login
  if (user && request.nextUrl.pathname === '/auth/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
