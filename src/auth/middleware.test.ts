import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isDevMode,
  isE2ETestMode,
  isBootstrapMode,
  extractJWT,
  extractGatewayToken,
} from './middleware';
import type { MoltbotEnv } from '../types';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { createMockEnv } from '../test-utils';

describe('isDevMode', () => {
  it('returns true when DEV_MODE is "true"', () => {
    const env = createMockEnv({ DEV_MODE: 'true' });
    expect(isDevMode(env)).toBe(true);
  });

  it('returns false when DEV_MODE is undefined', () => {
    const env = createMockEnv();
    expect(isDevMode(env)).toBe(false);
  });

  it('returns false when DEV_MODE is "false"', () => {
    const env = createMockEnv({ DEV_MODE: 'false' });
    expect(isDevMode(env)).toBe(false);
  });

  it('returns false when DEV_MODE is any other value', () => {
    const env = createMockEnv({ DEV_MODE: 'yes' });
    expect(isDevMode(env)).toBe(false);
  });

  it('returns false when DEV_MODE is empty string', () => {
    const env = createMockEnv({ DEV_MODE: '' });
    expect(isDevMode(env)).toBe(false);
  });
});

describe('isE2ETestMode', () => {
  it('returns true when E2E_TEST_MODE is "true"', () => {
    const env = createMockEnv({ E2E_TEST_MODE: 'true' });
    expect(isE2ETestMode(env)).toBe(true);
  });

  it('returns false when E2E_TEST_MODE is undefined', () => {
    const env = createMockEnv();
    expect(isE2ETestMode(env)).toBe(false);
  });

  it('returns false when E2E_TEST_MODE is "false"', () => {
    const env = createMockEnv({ E2E_TEST_MODE: 'false' });
    expect(isE2ETestMode(env)).toBe(false);
  });

  it('returns false when E2E_TEST_MODE is any other value', () => {
    const env = createMockEnv({ E2E_TEST_MODE: 'yes' });
    expect(isE2ETestMode(env)).toBe(false);
  });
});

describe('extractJWT', () => {
  // Helper to create a mock context
  function createMockContext(options: { jwtHeader?: string; cookies?: string }): Context<AppEnv> {
    const headers = new Headers();
    if (options.jwtHeader) {
      headers.set('CF-Access-JWT-Assertion', options.jwtHeader);
    }
    if (options.cookies) {
      headers.set('Cookie', options.cookies);
    }

    return {
      req: {
        header: (name: string) => headers.get(name),
        raw: {
          headers,
        },
      },
    } as unknown as Context<AppEnv>;
  }

  it('extracts JWT from CF-Access-JWT-Assertion header', () => {
    const jwt = 'header.payload.signature';
    const c = createMockContext({ jwtHeader: jwt });
    expect(extractJWT(c)).toBe(jwt);
  });

  it('extracts JWT from CF_Authorization cookie', () => {
    const jwt = 'cookie.payload.signature';
    const c = createMockContext({ cookies: `CF_Authorization=${jwt}` });
    expect(extractJWT(c)).toBe(jwt);
  });

  it('extracts JWT from CF_Authorization cookie with other cookies', () => {
    const jwt = 'cookie.payload.signature';
    const c = createMockContext({
      cookies: `other=value; CF_Authorization=${jwt}; another=test`,
    });
    expect(extractJWT(c)).toBe(jwt);
  });

  it('prefers header over cookie', () => {
    const headerJwt = 'header.jwt.token';
    const cookieJwt = 'cookie.jwt.token';
    const c = createMockContext({
      jwtHeader: headerJwt,
      cookies: `CF_Authorization=${cookieJwt}`,
    });
    expect(extractJWT(c)).toBe(headerJwt);
  });

  it('returns null when no JWT present', () => {
    const c = createMockContext({});
    expect(extractJWT(c)).toBeNull();
  });

  it('returns null when cookie header exists but no CF_Authorization', () => {
    const c = createMockContext({ cookies: 'other=value; session=abc123' });
    expect(extractJWT(c)).toBeNull();
  });

  it('handles cookie with whitespace', () => {
    const jwt = 'spaced.payload.signature';
    const c = createMockContext({ cookies: `  CF_Authorization=${jwt}  ` });
    expect(extractJWT(c)).toBe(jwt);
  });
});

describe('createAccessMiddleware', () => {
  // Import the function dynamically to allow mocking
  let createAccessMiddleware: typeof import('./middleware').createAccessMiddleware;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('./middleware');
    createAccessMiddleware = module.createAccessMiddleware;
  });

  // Helper to create a mock context with full implementation
  function createFullMockContext(options: {
    env?: Partial<MoltbotEnv>;
    jwtHeader?: string;
    cookies?: string;
    url?: string;
    gatewayTokenHeader?: string;
  }): {
    c: Context<AppEnv>;
    jsonMock: ReturnType<typeof vi.fn>;
    htmlMock: ReturnType<typeof vi.fn>;
    redirectMock: ReturnType<typeof vi.fn>;
    setMock: ReturnType<typeof vi.fn>;
  } {
    const headers = new Headers();
    if (options.jwtHeader) {
      headers.set('CF-Access-JWT-Assertion', options.jwtHeader);
    }
    if (options.cookies) {
      headers.set('Cookie', options.cookies);
    }
    if (options.gatewayTokenHeader) {
      headers.set('X-Gateway-Token', options.gatewayTokenHeader);
    }

    const jsonMock = vi.fn().mockReturnValue(new Response());
    const htmlMock = vi.fn().mockReturnValue(new Response());
    const redirectMock = vi.fn().mockReturnValue(new Response());
    const setMock = vi.fn();

    const reqUrl = options.url ?? 'https://example.com/';
    const c = {
      req: {
        header: (name: string) => headers.get(name) ?? null,
        raw: { headers },
        url: reqUrl,
      },
      env: createMockEnv(options.env),
      json: jsonMock,
      html: htmlMock,
      redirect: redirectMock,
      set: setMock,
    } as unknown as Context<AppEnv>;

    return { c, jsonMock, htmlMock, redirectMock, setMock };
  }

  it('skips auth and sets dev user when DEV_MODE is true', async () => {
    const { c, setMock } = createFullMockContext({ env: { DEV_MODE: 'true' } });
    const middleware = createAccessMiddleware({ type: 'json' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith('accessUser', {
      email: 'dev@localhost',
      name: 'Dev User',
    });
  });

  it('skips auth and sets dev user when E2E_TEST_MODE is true', async () => {
    const { c, setMock } = createFullMockContext({ env: { E2E_TEST_MODE: 'true' } });
    const middleware = createAccessMiddleware({ type: 'json' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith('accessUser', {
      email: 'dev@localhost',
      name: 'Dev User',
    });
  });

  it('returns 500 JSON error when CF Access not configured', async () => {
    const { c, jsonMock } = createFullMockContext({ env: {} });
    const middleware = createAccessMiddleware({ type: 'json' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Cloudflare Access not configured' }),
      500,
    );
  });

  it('returns 500 HTML error when CF Access not configured', async () => {
    const { c, htmlMock } = createFullMockContext({ env: {} });
    const middleware = createAccessMiddleware({ type: 'html' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(htmlMock).toHaveBeenCalledWith(expect.stringContaining('Admin UI Not Configured'), 500);
  });

  it('returns 401 JSON error when JWT is missing', async () => {
    const { c, jsonMock } = createFullMockContext({
      env: { CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', CF_ACCESS_AUD: 'aud123' },
    });
    const middleware = createAccessMiddleware({ type: 'json' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }), 401);
  });

  it('returns 401 HTML error when JWT is missing', async () => {
    const { c, htmlMock } = createFullMockContext({
      env: { CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', CF_ACCESS_AUD: 'aud123' },
    });
    const middleware = createAccessMiddleware({ type: 'html' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(htmlMock).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'), 401);
  });

  it('redirects when JWT is missing and redirectOnMissing is true', async () => {
    const { c, redirectMock } = createFullMockContext({
      env: { CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', CF_ACCESS_AUD: 'aud123' },
    });
    const middleware = createAccessMiddleware({ type: 'html', redirectOnMissing: true });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith('https://team.cloudflareaccess.com', 302);
  });

  it('allows access with valid gateway token in bootstrap mode', async () => {
    const { c, setMock } = createFullMockContext({
      env: { MOLTBOT_GATEWAY_TOKEN: 'my-secret-token' },
      url: 'https://example.com/_admin/?token=my-secret-token',
    });
    const middleware = createAccessMiddleware({ type: 'html' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith('accessUser', {
      email: 'bootstrap',
      name: 'Setup (Gateway Token)',
    });
  });

  it('allows access with gateway token in X-Gateway-Token header (bootstrap mode)', async () => {
    const { c, setMock } = createFullMockContext({
      env: { MOLTBOT_GATEWAY_TOKEN: 'my-secret-token' },
      url: 'https://example.com/api/admin/devices',
      gatewayTokenHeader: 'my-secret-token',
    });
    const middleware = createAccessMiddleware({ type: 'json' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith('accessUser', {
      email: 'bootstrap',
      name: 'Setup (Gateway Token)',
    });
  });

  it('returns 401 when gateway token is wrong in bootstrap mode', async () => {
    const { c, jsonMock } = createFullMockContext({
      env: { MOLTBOT_GATEWAY_TOKEN: 'correct-token' },
      url: 'https://example.com/_admin/?token=wrong-token',
    });
    const middleware = createAccessMiddleware({ type: 'json' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized', hint: expect.stringContaining('token') }),
      401,
    );
  });

  it('returns 401 when no token in bootstrap mode', async () => {
    const { c, htmlMock } = createFullMockContext({
      env: { MOLTBOT_GATEWAY_TOKEN: 'my-token' },
      url: 'https://example.com/_admin/',
    });
    const middleware = createAccessMiddleware({ type: 'html' });
    const next = vi.fn();

    await middleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(htmlMock).toHaveBeenCalledWith(
      expect.stringContaining('Add your gateway token to the URL'),
      401,
    );
  });
});

describe('isBootstrapMode', () => {
  it('returns true when gateway token set and Access not configured', () => {
    const env = createMockEnv({
      MOLTBOT_GATEWAY_TOKEN: 'token',
    });
    expect(isBootstrapMode(env)).toBe(true);
  });

  it('returns false when Access is configured', () => {
    const env = createMockEnv({
      MOLTBOT_GATEWAY_TOKEN: 'token',
      CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      CF_ACCESS_AUD: 'aud',
    });
    expect(isBootstrapMode(env)).toBe(false);
  });

  it('returns false when no gateway token', () => {
    const env = createMockEnv({});
    expect(isBootstrapMode(env)).toBe(false);
  });
});

describe('extractGatewayToken', () => {
  function createMockContext(url: string): Context<AppEnv> {
    return {
      req: {
        header: () => null,
        url,
      },
    } as unknown as Context<AppEnv>;
  }

  it('extracts token from URL query param', () => {
    const c = createMockContext('https://example.com/_admin/?token=abc123');
    expect(extractGatewayToken(c)).toBe('abc123');
  });

  it('returns null when no token in URL', () => {
    const c = createMockContext('https://example.com/_admin/');
    expect(extractGatewayToken(c)).toBeNull();
  });
});
