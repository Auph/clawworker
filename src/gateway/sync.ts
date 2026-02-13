import type { Sandbox } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import { getR2BucketName } from '../config';
import { runRcloneWithFreshConfig } from './r2';

export interface SyncResult {
  success: boolean;
  lastSync?: string;
  error?: string;
  details?: string;
}

const RCLONE_FLAGS = '--transfers=16 --fast-list --s3-no-check-bucket';
const LAST_SYNC_FILE = '/tmp/.last-sync';
const SYNC_TIMEOUT = 120000;

function rcloneRemote(env: MoltbotEnv, prefix: string): string {
  return `r2:${getR2BucketName(env)}/${prefix}`;
}

function hasR2Config(env: MoltbotEnv): boolean {
  return !!(
    env.R2_ACCESS_KEY_ID?.trim() &&
    env.R2_SECRET_ACCESS_KEY?.trim() &&
    env.CF_ACCOUNT_ID?.trim()
  );
}

/**
 * Detect which config directory exists in the container.
 */
async function detectConfigDir(sandbox: Sandbox): Promise<string | null> {
  const check = await sandbox.exec(
    'test -f /root/.openclaw/openclaw.json && echo openclaw || ' +
      '(test -f /root/.clawdbot/clawdbot.json && echo clawdbot || echo none)',
  );
  const result = check.stdout?.trim();
  if (result === 'openclaw') return '/root/.openclaw';
  if (result === 'clawdbot') return '/root/.clawdbot';
  return null;
}

/**
 * Sync OpenClaw config and workspace from container to R2 for persistence.
 * Uses runRcloneWithFreshConfig so Backup uses same credential flow as Test R2 (no cache).
 */
export async function syncToR2(sandbox: Sandbox, env: MoltbotEnv): Promise<SyncResult> {
  if (!hasR2Config(env)) {
    return { success: false, error: 'R2 storage is not configured' };
  }

  const configDir = await detectConfigDir(sandbox);
  if (!configDir) {
    return {
      success: false,
      error: 'Sync aborted: no config file found',
      details: 'Neither openclaw.json nor clawdbot.json found in config directory.',
    };
  }

  const remote = (prefix: string) => rcloneRemote(env, prefix);

  // Sync config - use fresh config (same as Test R2) to avoid stale credentials
  const configResult = await runRcloneWithFreshConfig(
    sandbox,
    env,
    `sync ${configDir}/ ${remote('openclaw/')} ${RCLONE_FLAGS} --exclude='*.lock' --exclude='*.log' --exclude='*.tmp' --exclude='.git/**'`,
    { timeout: SYNC_TIMEOUT },
  );
  if (!configResult.success) {
    const errOut = [configResult.stderr, configResult.stdout]
      .filter(Boolean)
      .join('\n---\n')
      .slice(-2000);
    return {
      success: false,
      error: 'Config sync failed',
      details: errOut || 'No error output from rclone (exit code may indicate failure)',
    };
  }

  // Sync workspace (non-fatal, skip if dir doesn't exist)
  const hasWorkspace = await sandbox.exec('test -d /root/clawd && echo yes');
  if (hasWorkspace.stdout?.trim() === 'yes') {
    await runRcloneWithFreshConfig(
      sandbox,
      env,
      `sync /root/clawd/ ${remote('workspace/')} ${RCLONE_FLAGS} --exclude='skills/**' --exclude='.git/**'`,
      { timeout: SYNC_TIMEOUT },
    );
  }

  // Sync skills (non-fatal)
  const hasSkills = await sandbox.exec('test -d /root/clawd/skills && echo yes');
  if (hasSkills.stdout?.trim() === 'yes') {
    await runRcloneWithFreshConfig(
      sandbox,
      env,
      `sync /root/clawd/skills/ ${remote('skills/')} ${RCLONE_FLAGS}`,
      { timeout: SYNC_TIMEOUT },
    );
  }

  // Write timestamp
  await sandbox.exec(`date -Iseconds > ${LAST_SYNC_FILE}`);
  const tsResult = await sandbox.exec(`cat ${LAST_SYNC_FILE}`);
  const lastSync = tsResult.stdout?.trim();

  return { success: true, lastSync };
}
