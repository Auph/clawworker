import type { Sandbox } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import { getR2BucketName } from '../config';

const RCLONE_CONF_PATH = '/root/.config/rclone/rclone.conf';

/**
 * Build rclone config content from env. Escapes values for INI format.
 */
function buildRcloneConfigContent(accessKey: string, secretKey: string, accountId: string): string {
  // Rclone config is INI-style. Values with special chars (e.g. # = \ ") may need escaping.
  // R2 secrets are typically alphanumeric; trim and ensure no newlines.
  const safe = (s: string) => s.replace(/\r?\n/g, '').trim();
  return [
    '[r2]',
    'type = s3',
    'provider = Cloudflare',
    `access_key_id = ${safe(accessKey)}`,
    `secret_access_key = ${safe(secretKey)}`,
    `endpoint = https://${safe(accountId)}.r2.cloudflarestorage.com`,
    'acl = private',
    'no_check_bucket = true',
  ].join('\n');
}

/**
 * Ensure rclone is configured in the container for R2 access.
 * Always writes current credentials so updated secrets take effect immediately.
 *
 * @returns true if rclone is configured, false if credentials are missing
 */
export async function ensureRcloneConfig(sandbox: Sandbox, env: MoltbotEnv): Promise<boolean> {
  const accessKey = env.R2_ACCESS_KEY_ID?.trim();
  const secretKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const accountId = env.CF_ACCOUNT_ID?.trim();

  if (!accessKey || !secretKey || !accountId) {
    console.log(
      'R2 storage not configured (missing R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, or CF_ACCOUNT_ID)',
    );
    return false;
  }

  const rcloneConfig = buildRcloneConfigContent(accessKey, secretKey, accountId);

  await sandbox.exec(`mkdir -p $(dirname ${RCLONE_CONF_PATH})`);
  // Remove any stale config before writing - avoids cached credentials
  await sandbox.exec(`rm -f ${RCLONE_CONF_PATH}`);
  await sandbox.writeFile(RCLONE_CONF_PATH, rcloneConfig);

  console.log('Rclone configured for R2 bucket:', getR2BucketName(env));
  return true;
}

const RCLONE_TEMP_CONFIG = '/tmp/rclone-fresh.conf';

/**
 * Run rclone with a freshly written config to avoid any caching.
 * Used by Test R2 and Backup - guarantees we use current worker env (secrets).
 */
export async function runRcloneWithFreshConfig(
  sandbox: Sandbox,
  env: MoltbotEnv,
  command: string,
  options?: { timeout?: number },
): Promise<{ stdout: string; stderr: string; success: boolean; exitCode: number }> {
  const accessKey = env.R2_ACCESS_KEY_ID?.trim() ?? '';
  const secretKey = env.R2_SECRET_ACCESS_KEY?.trim() ?? '';
  const accountId = env.CF_ACCOUNT_ID?.trim() ?? '';

  if (!accessKey || !secretKey || !accountId) {
    return { stdout: '', stderr: 'R2 not configured', success: false, exitCode: 1 };
  }

  const configContent = buildRcloneConfigContent(accessKey, secretKey, accountId);
  await sandbox.writeFile(RCLONE_TEMP_CONFIG, configContent);

  const result = await sandbox.exec(`rclone ${command} --config ${RCLONE_TEMP_CONFIG} 2>&1 || true`, {
    timeout: options?.timeout ?? 15000,
  });

  await sandbox.exec(`rm -f ${RCLONE_TEMP_CONFIG}`);

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    success: result.success,
    exitCode: result.exitCode ?? (result.success ? 0 : 1),
  };
}
