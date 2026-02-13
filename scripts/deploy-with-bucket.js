#!/usr/bin/env node
/**
 * Deploy wrapper: uses R2 bucket from .r2-bucket (gitignored) or R2_BUCKET_OVERRIDE env.
 * Prevents wrangler.jsonc from reverting to clawworker-data when using moltworker-data.
 *
 * Usage:
 *   echo "moltworker-data" > .r2-bucket   # then: npm run deploy
 *   R2_BUCKET_OVERRIDE=moltworker-data npm run deploy
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WRANGLER_CONFIG = path.join(ROOT, "wrangler.jsonc");

function getBucketOverride() {
  const fromFile = path.join(ROOT, ".r2-bucket");
  if (fs.existsSync(fromFile)) {
    const name = fs.readFileSync(fromFile, "utf8").trim();
    if (name) return name;
  }
  return process.env.R2_BUCKET_OVERRIDE?.trim() || null;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", shell: true, ...opts });
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
  });
}

async function main() {
  const bucket = getBucketOverride();
  let configPath = WRANGLER_CONFIG;

  if (bucket && bucket !== "clawworker-data") {
    const raw = fs.readFileSync(WRANGLER_CONFIG, "utf8");
    const safe = bucket.replace(/"/g, '\\"');
    const patched = raw
      .replace(/"bucket_name":\s*"clawworker-data"/g, `"bucket_name": "${safe}"`)
      .replace(/"preview_bucket_name":\s*"clawworker-data"/g, `"preview_bucket_name": "${safe}"`);
    configPath = path.join(ROOT, ".wrangler-deploy-temp.jsonc");
    fs.writeFileSync(configPath, patched);
    console.log("[deploy] Using R2 bucket:", bucket);
  }

  try {
    const args = process.argv.slice(2);
    await run("npx", ["wrangler", "deploy", "--config", configPath, ...args]);
  } finally {
    if (configPath !== WRANGLER_CONFIG) {
      try { fs.unlinkSync(configPath); } catch (_) {}
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
