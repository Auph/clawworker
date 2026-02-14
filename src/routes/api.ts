import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getGatewayToken, getR2BucketName } from '../config';
import { createAccessMiddleware } from '../auth';
import {
  ensureMoltbotGateway,
  findExistingMoltbotProcess,
  syncToR2,
  waitForProcess,
} from '../gateway';
import { ensureRcloneConfig, runRcloneWithFreshConfig } from '../gateway/r2';

// CLI commands can take 10-15 seconds to complete due to WebSocket connection overhead
const CLI_TIMEOUT_MS = 20000;

/**
 * API routes
 * - /api/admin/* - Protected admin API routes (Cloudflare Access required)
 *
 * Note: /api/status is now handled by publicRoutes (no auth required)
 */
const api = new Hono<AppEnv>();

/**
 * Admin API routes - all protected by Cloudflare Access
 */
const adminApi = new Hono<AppEnv>();

// Middleware: Verify Cloudflare Access JWT for all admin routes
adminApi.use('*', createAccessMiddleware({ type: 'json' }));

// GET /api/admin/devices - List pending and paired devices
adminApi.get('/devices', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Ensure gateway is running first
    await ensureMoltbotGateway(sandbox, c.env);

    // Run OpenClaw CLI to list devices
    // Must specify --url and --token (OpenClaw v2026.2.3 requires explicit credentials with --url)
    const token = getGatewayToken(c.env);
    const tokenArg = token ? ` --token ${token}` : '';
    const proc = await sandbox.startProcess(
      `openclaw devices list --json --url ws://localhost:18789${tokenArg}`,
    );
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';

    // Try to parse JSON output
    try {
      // Find JSON in output (may have other log lines)
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return c.json(data);
      }

      // If no JSON found, return raw output for debugging
      return c.json({
        pending: [],
        paired: [],
        raw: stdout,
        stderr,
      });
    } catch {
      return c.json({
        pending: [],
        paired: [],
        raw: stdout,
        stderr,
        parseError: 'Failed to parse CLI output',
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/admin/devices/:requestId/approve - Approve a pending device
adminApi.post('/devices/:requestId/approve', async (c) => {
  const sandbox = c.get('sandbox');
  const requestId = c.req.param('requestId');

  if (!requestId) {
    return c.json({ error: 'requestId is required' }, 400);
  }

  try {
    // Ensure gateway is running first
    await ensureMoltbotGateway(sandbox, c.env);

    // Run OpenClaw CLI to approve the device
    const token = getGatewayToken(c.env);
    const tokenArg = token ? ` --token ${token}` : '';
    const proc = await sandbox.startProcess(
      `openclaw devices approve ${requestId} --url ws://localhost:18789${tokenArg}`,
    );
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';

    // Check for success indicators (case-insensitive, CLI outputs "Approved ...")
    const success = stdout.toLowerCase().includes('approved') || proc.exitCode === 0;

    return c.json({
      success,
      requestId,
      message: success ? 'Device approved' : 'Approval may have failed',
      stdout,
      stderr,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/admin/devices/approve-all - Approve all pending devices
adminApi.post('/devices/approve-all', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Ensure gateway is running first
    await ensureMoltbotGateway(sandbox, c.env);

    // First, get the list of pending devices
    const token = getGatewayToken(c.env);
    const tokenArg = token ? ` --token ${token}` : '';
    const listProc = await sandbox.startProcess(
      `openclaw devices list --json --url ws://localhost:18789${tokenArg}`,
    );
    await waitForProcess(listProc, CLI_TIMEOUT_MS);

    const listLogs = await listProc.getLogs();
    const stdout = listLogs.stdout || '';

    // Parse pending devices
    let pending: Array<{ requestId: string }> = [];
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        pending = data.pending || [];
      }
    } catch {
      return c.json({ error: 'Failed to parse device list', raw: stdout }, 500);
    }

    if (pending.length === 0) {
      return c.json({ approved: [], message: 'No pending devices to approve' });
    }

    // Approve each pending device
    const results: Array<{ requestId: string; success: boolean; error?: string }> = [];

    for (const device of pending) {
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential device approval required
        const approveProc = await sandbox.startProcess(
          `openclaw devices approve ${device.requestId} --url ws://localhost:18789${tokenArg}`,
        );
        // eslint-disable-next-line no-await-in-loop
        await waitForProcess(approveProc, CLI_TIMEOUT_MS);

        // eslint-disable-next-line no-await-in-loop
        const approveLogs = await approveProc.getLogs();
        const success =
          approveLogs.stdout?.toLowerCase().includes('approved') || approveProc.exitCode === 0;

        results.push({ requestId: device.requestId, success });
      } catch (err) {
        results.push({
          requestId: device.requestId,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const approvedCount = results.filter((r) => r.success).length;
    return c.json({
      approved: results.filter((r) => r.success).map((r) => r.requestId),
      failed: results.filter((r) => !r.success),
      message: `Approved ${approvedCount} of ${pending.length} device(s)`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// GET /api/admin/debug/diagnostics - Lightweight diagnostics (no gateway start)
adminApi.get('/debug/diagnostics', async (c) => {
  const sandbox = c.get('sandbox');
  const env = c.env;

  const diagnostics: Record<string, unknown> = {
    env: {
      has_anthropic_key: !!env.ANTHROPIC_API_KEY,
      has_openai_key: !!env.OPENAI_API_KEY,
      has_gateway_token: !!getGatewayToken(env),
      has_r2_access_key: !!env.R2_ACCESS_KEY_ID,
      has_r2_secret_key: !!env.R2_SECRET_ACCESS_KEY,
      has_cf_account_id: !!env.CF_ACCOUNT_ID,
      r2_configured:
        !!env.R2_ACCESS_KEY_ID && !!env.R2_SECRET_ACCESS_KEY && !!env.CF_ACCOUNT_ID,
      dev_mode: env.DEV_MODE === 'true',
      debug_routes: env.DEBUG_ROUTES === 'true',
    },
  };

  try {
    const processes = await sandbox.listProcesses();
    diagnostics.processes = {
      count: processes.length,
      list: processes.map((p) => ({
        id: p.id,
        command: p.command.substring(0, 80) + (p.command.length > 80 ? '...' : ''),
        status: p.status,
        exitCode: p.exitCode,
      })),
      gateway_process: processes.find(
        (p) =>
          p.command.includes('openclaw gateway') ||
          p.command.includes('start-openclaw.sh'),
      )
        ? { found: true }
        : { found: false },
    };
  } catch (e) {
    diagnostics.processes = { error: String(e) };
  }

  try {
    const proc = await sandbox.startProcess(
      'test -f /root/.openclaw/openclaw.json && echo exists || echo missing',
    );
    await waitForProcess(proc, 3000);
    const logs = await proc.getLogs();
    diagnostics.config_file = (logs.stdout || '').trim().includes('exists') ? 'exists' : 'missing';
  } catch {
    diagnostics.config_file = 'unknown';
  }

  return c.json(diagnostics);
});

// GET /api/admin/debug/process-logs - Get logs for a process (for stuck gateway debugging)
adminApi.get('/debug/process-logs', async (c) => {
  const sandbox = c.get('sandbox');
  const processId = c.req.query('id');

  if (!processId) {
    return c.json({ error: 'Query param "id" (process id) required' }, 400);
  }

  try {
    const processes = await sandbox.listProcesses();
    const proc = processes.find((p) => p.id === processId);
    if (!proc) {
      return c.json({ error: 'Process not found', available: processes.map((p) => p.id) }, 404);
    }
    const logs = await proc.getLogs();
    return c.json({
      id: proc.id,
      command: proc.command,
      status: proc.status,
      exitCode: proc.exitCode,
      stdout: logs.stdout || '',
      stderr: logs.stderr || '',
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// GET /api/admin/cdp-status - CDP (browser automation) configuration status
adminApi.get('/cdp-status', async (c) => {
  const hasSecret = !!c.env.CDP_SECRET;
  const hasWorkerUrl = !!c.env.WORKER_URL;
  return c.json({
    configured: hasSecret && hasWorkerUrl,
    missing: [hasSecret ? null : 'CDP_SECRET', hasWorkerUrl ? null : 'WORKER_URL'].filter(
      Boolean,
    ) as string[],
    workerUrlHint: hasWorkerUrl ? undefined : 'https://your-worker.workers.dev',
  });
});

// GET /api/admin/integrations - List configured channels (no secrets exposed)
adminApi.get('/integrations', async (c) => {
  const env = c.env;
  return c.json({
    telegram: !!env.TELEGRAM_BOT_TOKEN,
    discord: !!env.DISCORD_BOT_TOKEN,
    slack: !!(env.SLACK_BOT_TOKEN && env.SLACK_APP_TOKEN),
  });
});

// GET /api/admin/storage - Get R2 storage status and last sync time
adminApi.get('/storage', async (c) => {
  const sandbox = c.get('sandbox');
  const hasCredentials = !!(
    c.env.R2_ACCESS_KEY_ID &&
    c.env.R2_SECRET_ACCESS_KEY &&
    c.env.CF_ACCOUNT_ID
  );

  const missing: string[] = [];
  if (!c.env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!c.env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (!c.env.CF_ACCOUNT_ID) missing.push('CF_ACCOUNT_ID');

  let lastSync: string | null = null;

  if (hasCredentials) {
    try {
      const result = await sandbox.exec('cat /tmp/.last-sync 2>/dev/null || echo ""');
      const timestamp = result.stdout?.trim();
      if (timestamp && timestamp !== '') {
        lastSync = timestamp;
      }
    } catch {
      // Ignore errors checking sync status
    }
  }

  return c.json({
    configured: hasCredentials,
    missing: missing.length > 0 ? missing : undefined,
    lastSync,
    message: hasCredentials
      ? 'R2 storage is configured. Your data will persist across container restarts.'
      : 'R2 storage is not configured. Paired devices and conversations will be lost when the container restarts.',
  });
});

// GET /api/admin/storage/test - Test R2 connectivity (returns raw rclone output for debugging)
adminApi.get('/storage/test', async (c) => {
  const sandbox = c.get('sandbox');

  if (!c.env.R2_ACCESS_KEY_ID || !c.env.R2_SECRET_ACCESS_KEY || !c.env.CF_ACCOUNT_ID) {
    return c.json({
      ok: false,
      error: 'R2 not configured',
      missing: [
        !c.env.R2_ACCESS_KEY_ID && 'R2_ACCESS_KEY_ID',
        !c.env.R2_SECRET_ACCESS_KEY && 'R2_SECRET_ACCESS_KEY',
        !c.env.CF_ACCOUNT_ID && 'CF_ACCOUNT_ID',
      ].filter(Boolean) as string[],
    });
  }

  const bucket = getR2BucketName(c.env);
  const accessKey = c.env.R2_ACCESS_KEY_ID?.trim() ?? '';
  const accountId = c.env.CF_ACCOUNT_ID?.trim() ?? '';

  // Use "size" to test connectivity without listing prefixes; "ls" with --max-depth can
  // trigger "directory not found" from rclone on some R2/s3 responses. size works on empty buckets.
  // Retry once on failure to handle transient network/container glitches.
  let result = await runRcloneWithFreshConfig(
    sandbox,
    c.env,
    `size r2:${bucket}/`,
  );
  if (!result.success) {
    await new Promise((r) => setTimeout(r, 1500));
    result = await runRcloneWithFreshConfig(sandbox, c.env, `size r2:${bucket}/`);
  }

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

  return c.json({
    ok: result.success,
    bucket,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: output.slice(-2000),
    exitCode: result.exitCode,
    // Diagnostics (masked) - verify env vars are correct
    diagnostics: {
      bucket,
      endpoint: accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '(not set)',
      cf_account_id_length: accountId.length,
      r2_access_key_id_preview:
        accessKey.length >= 8
          ? `${accessKey.slice(0, 4)}...${accessKey.slice(-4)}`
          : accessKey
            ? '(too short)'
            : '(not set)',
    },
  });
});

// POST /api/admin/storage/sync - Trigger a manual sync to R2
adminApi.post('/storage/sync', async (c) => {
  const sandbox = c.get('sandbox');

  const result = await syncToR2(sandbox, c.env);

  if (result.success) {
    return c.json({
      success: true,
      message: 'Sync completed successfully',
      lastSync: result.lastSync,
    });
  } else {
    const status = result.error?.includes('not configured') ? 400 : 500;
    return c.json(
      {
        success: false,
        error: result.error,
        details: result.details,
      },
      status,
    );
  }
});

// GET /api/admin/openclaw/version - Current version, latest on npm, update available
adminApi.get('/openclaw/version', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Get current version from container
    const versionProc = await sandbox.startProcess('openclaw --version');
    await waitForProcess(versionProc, 5000);
    const versionLogs = await versionProc.getLogs();
    const currentRaw = (versionLogs.stdout || versionLogs.stderr || '').trim();
    const currentMatch = currentRaw.match(/[0-9]+\.[0-9]+\.[0-9]+/);
    const current = currentMatch ? currentMatch[0] : currentRaw || 'unknown';

    // Fetch latest from npm registry
    let latest: string | null = null;
    try {
      const npmRes = await fetch('https://registry.npmjs.org/openclaw');
      if (npmRes.ok) {
        const npm = (await npmRes.json()) as { 'dist-tags'?: { latest?: string } };
        latest = npm['dist-tags']?.latest ?? null;
      }
    } catch {
      latest = null;
    }

    return c.json({
      current,
      latest,
      updateAvailable: latest ? current !== latest : false,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg, current: null, latest: null }, 500);
  }
});

// POST /api/admin/openclaw/update - Update to specified version and restart gateway
adminApi.post('/openclaw/update', async (c) => {
  const sandbox = c.get('sandbox');

  let body: { version?: string };
  try {
    body = (await c.req.json()) as { version?: string };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const version = body.version?.trim();
  if (!version) {
    return c.json({ error: 'Missing "version" in body (e.g. "2026.2.12")' }, 400);
  }

  // Validate version format (semver-like)
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    return c.json({ error: 'Version must be semver (e.g. 2026.2.12)' }, 400);
  }

  try {
    await ensureMoltbotGateway(sandbox, c.env);

    // Write version override file (synced to R2, persists across restarts)
    const versionFile = '/root/.openclaw/clawworker-version-override';
    await sandbox.writeFile(versionFile, version);

    // Sync to R2 so version override persists across cold starts
    const syncResult = await syncToR2(sandbox, c.env);

    // Install new version
    const installProc = await sandbox.startProcess(`npm install -g openclaw@${version}`, {
      timeout: 120000,
    });
    await waitForProcess(installProc, 120000);
    const installLogs = await installProc.getLogs();
    if (installProc.exitCode !== 0) {
      return c.json(
        {
          error: 'npm install failed',
          stderr: installLogs.stderr?.slice(-1000),
        },
        500,
      );
    }

    // Fix config schema for new version (prevents ProcessExitedBeforeReadyError on restart)
    try {
      const doctorProc = await sandbox.startProcess('openclaw doctor --fix', {
        timeout: 15000,
      });
      await waitForProcess(doctorProc, 15000);
      if (doctorProc.exitCode === 0) {
        await syncToR2(sandbox, c.env);
      }
    } catch {
      // Non-fatal: startup script will run doctor again
    }

    // Kill gateway so next request starts fresh with new version
    const existingProcess = await findExistingMoltbotProcess(sandbox);
    if (existingProcess) {
      try {
        await existingProcess.kill();
      } catch {
        // Ignore
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    return c.json({
      success: true,
      message: `Updated to openclaw@${version}. Gateway will restart on next request.`,
      syncPersisted: syncResult.success,
      ...(syncResult.success
        ? {}
        : {
            warning:
              'Version override was not synced to R2. It will apply for this session but may not persist across cold starts.',
          }),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// POST /api/admin/gateway/restart - Kill the current gateway and start a new one
adminApi.post('/gateway/restart', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Find and kill the existing gateway process
    const existingProcess = await findExistingMoltbotProcess(sandbox);

    if (existingProcess) {
      console.log('Killing existing gateway process:', existingProcess.id);
      try {
        await existingProcess.kill();
      } catch (killErr) {
        console.error('Error killing process:', killErr);
      }
      // Wait a moment for the process to die
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Start a new gateway in the background
    const bootPromise = ensureMoltbotGateway(sandbox, c.env).catch((err) => {
      console.error('Gateway restart failed:', err);
    });
    c.executionCtx.waitUntil(bootPromise);

    return c.json({
      success: true,
      message: existingProcess
        ? 'Gateway process killed, new instance starting...'
        : 'No existing process found, starting new instance...',
      previousProcessId: existingProcess?.id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// Mount admin API routes under /admin
api.route('/admin', adminApi);

export { api };
