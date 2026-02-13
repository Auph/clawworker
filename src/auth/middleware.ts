import type { Context, Next } from 'hono';
import type { AppEnv, MoltbotEnv } from '../types';
import { getGatewayToken } from '../config';
import { verifyAccessJWT } from './jwt';

/**
 * Options for creating an access middleware
 */
export interface AccessMiddlewareOptions {
  /** Response type: 'json' for API routes, 'html' for UI routes */
  type: 'json' | 'html';
  /** Whether to redirect to login when JWT is missing (only for 'html' type) */
  redirectOnMissing?: boolean;
}

/**
 * Check if running in development mode (skips CF Access auth + device pairing)
 */
export function isDevMode(env: MoltbotEnv): boolean {
  return env.DEV_MODE === 'true';
}

/**
 * Check if running in E2E test mode (skips CF Access auth but keeps device pairing)
 */
export function isE2ETestMode(env: MoltbotEnv): boolean {
  return env.E2E_TEST_MODE === 'true';
}

/**
 * Extract JWT from request headers or cookies
 */
export function extractJWT(c: Context<AppEnv>): string | null {
  const jwtHeader = c.req.header('CF-Access-JWT-Assertion');
  const jwtCookie = c.req.raw.headers
    .get('Cookie')
    ?.split(';')
    .find((cookie) => cookie.trim().startsWith('CF_Authorization='))
    ?.split('=')[1];

  return jwtHeader || jwtCookie || null;
}

/**
 * Extract gateway token from URL query param or X-Gateway-Token header.
 * Used for bootstrap mode when Cloudflare Access is not yet configured.
 */
export function extractGatewayToken(c: Context<AppEnv>): string | null {
  const url = new URL(c.req.url);
  const queryToken = url.searchParams.get('token');
  const headerToken = c.req.header('X-Gateway-Token');
  return queryToken || headerToken || null;
}

/**
 * Check if gateway token auth should be used (bootstrap mode).
 * When CF Access is not configured, we accept the gateway token for admin/API routes.
 */
export function isBootstrapMode(env: MoltbotEnv): boolean {
  const hasAccess = !!(env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD);
  return !hasAccess && !!getGatewayToken(env);
}

/**
 * Create a Cloudflare Access authentication middleware
 *
 * @param options - Middleware options
 * @returns Hono middleware function
 */
export function createAccessMiddleware(options: AccessMiddlewareOptions) {
  const { type, redirectOnMissing = false } = options;

  return async (c: Context<AppEnv>, next: Next) => {
    // Skip auth in dev mode or E2E test mode
    if (isDevMode(c.env) || isE2ETestMode(c.env)) {
      c.set('accessUser', { email: 'dev@localhost', name: 'Dev User' });
      return next();
    }

    const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
    const expectedAud = c.env.CF_ACCESS_AUD;

    // Bootstrap mode: when CF Access is not configured, accept gateway token for admin/API
    if (!teamDomain || !expectedAud) {
      if (isBootstrapMode(c.env)) {
        const providedToken = extractGatewayToken(c);
        const gatewayToken = getGatewayToken(c.env);
        if (providedToken && gatewayToken && providedToken === gatewayToken) {
          c.set('accessUser', { email: 'bootstrap', name: 'Setup (Gateway Token)' });
          return next();
        }
        if (type === 'json') {
          return c.json(
            {
              error: 'Unauthorized',
              hint: 'Add ?token=YOUR_GATEWAY_TOKEN to the URL, or set up Cloudflare Access for production',
            },
            401,
          );
        }
        return c.html(
          `
          <html>
            <body>
              <h1>Admin UI - Authentication Required</h1>
              <p>Add your gateway token to the URL: <code>/_admin/?token=YOUR_TOKEN</code></p>
              <p>Or set up <a href="https://developers.cloudflare.com/cloudflare-one/policies/access/">Cloudflare Access</a> for production (CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD).</p>
            </body>
          </html>
        `,
          401,
        );
      }
      if (type === 'json') {
        return c.json(
          {
            error: 'Cloudflare Access not configured',
            hint: 'Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD, or ensure GATEWAY_TOKEN is set for bootstrap mode',
          },
          500,
        );
      }
      return c.html(
        `
        <html>
          <body>
            <h1>Admin UI Not Configured</h1>
            <p>Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD, or ensure GATEWAY_TOKEN is set.</p>
          </body>
        </html>
        `,
        500,
      );
    }

    // Get JWT
    const jwt = extractJWT(c);

    if (!jwt) {
      if (type === 'html' && redirectOnMissing) {
        return c.redirect(`https://${teamDomain}`, 302);
      }

      if (type === 'json') {
        return c.json(
          {
            error: 'Unauthorized',
            hint: 'Missing Cloudflare Access JWT. Ensure this route is protected by Cloudflare Access.',
          },
          401,
        );
      } else {
        return c.html(
          `
          <html>
            <body>
              <h1>Unauthorized</h1>
              <p>Missing Cloudflare Access token.</p>
              <a href="https://${teamDomain}">Login</a>
            </body>
          </html>
        `,
          401,
        );
      }
    }

    // Verify JWT
    try {
      const payload = await verifyAccessJWT(jwt, teamDomain, expectedAud);
      c.set('accessUser', { email: payload.email, name: payload.name });
      await next();
    } catch (err) {
      console.error('Access JWT verification failed:', err);

      if (type === 'json') {
        return c.json(
          {
            error: 'Unauthorized',
            details: err instanceof Error ? err.message : 'JWT verification failed',
          },
          401,
        );
      } else {
        return c.html(
          `
          <html>
            <body>
              <h1>Unauthorized</h1>
              <p>Your Cloudflare Access session is invalid or expired.</p>
              <a href="https://${teamDomain}">Login again</a>
            </body>
          </html>
        `,
          401,
        );
      }
    }
  };
}
