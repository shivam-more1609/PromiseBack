import { NextResponse } from 'next/server';
import { 
  getSessionFromRequest, 
  authenticateOperator, 
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS 
} from '@/lib/auth';

/**
 * GET /api/auth/session
 * Inspects existing session cookie. Returns authentication state.
 */
export async function GET(request: Request) {
  const sessionCheck = getSessionFromRequest(request);
  if (sessionCheck.valid && sessionCheck.session) {
    return NextResponse.json({
      authenticated: true,
      user: sessionCheck.session.username,
      role: sessionCheck.session.role,
      expiresAt: sessionCheck.session.expiresAt
    });
  }

  return NextResponse.json({
    authenticated: false,
    reason: sessionCheck.reason || 'NO_ACTIVE_SESSION'
  }, { status: 401 });
}

/**
 * POST /api/auth/session
 * Genuine Operator Authentication Endpoint.
 * Requires valid username and password configured in server environment.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, password } = body;

    const authResult = authenticateOperator({ username, password });
    if (!authResult.success || !authResult.token) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        error: authResult.reason || 'Authentication failed.'
      }, { status: 401 });
    }

    const isHttps = request.headers.get('x-forwarded-proto') === 'https' || new URL(request.url).protocol === 'https:';

    const response = NextResponse.json({
      success: true,
      authenticated: true,
      message: 'Operator authenticated successfully.',
      user: authResult.user,
      role: authResult.role
    });

    // Set signed, HttpOnly, SameSite=Lax session cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: authResult.token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000), // 86400 seconds (24h)
      secure: isHttps
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/session
 * Clears session cookie on logout.
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true, authenticated: false, message: 'Logged out successfully.' });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
