import { defineMiddleware } from 'astro:middleware';
import { createHash } from 'crypto';

const PROTECTED = ['/admin', '/api/admin', '/dev'];

export const onRequest = defineMiddleware(({ url, cookies, redirect }, next) => {
  const isProtected = PROTECTED.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'));
  const isLoginRoute = url.pathname === '/api/admin/login' || url.pathname === '/admin-login';

  if (!isProtected || isLoginRoute) return next();

  const password = import.meta.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const session = cookies.get('admin_session')?.value;
  // Without a configured password the admin area stays locked (never compare against hash(''))
  const expected = password ? createHash('sha256').update(password).digest('hex') : null;

  if (!expected || session !== expected) {
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401 });
    }
    return redirect('/admin-login');
  }

  return next();
});
