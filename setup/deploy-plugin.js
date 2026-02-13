/**
 * Vite plugin that adds POST /api/deploy for direct deployment when running locally.
 * Runs wrangler deploy and sets secrets from the wizard config.
 * Only active in dev mode (npm run setup:wizard).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: options.cwd || PROJECT_ROOT,
      stdio: options.silent ? "pipe" : "inherit",
      shell: true,
      ...options,
    });
    if (options.silent) {
      let stdout = "";
      let stderr = "";
      proc.stdout?.on("data", (d) => (stdout += d.toString()));
      proc.stderr?.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr || stdout || `Exit ${code}`));
      });
    } else {
      proc.on("close", (code) => {
        if (code === 0) resolve({});
        else reject(new Error(`Command failed with exit code ${code}`));
      });
    }
  });
}

function setSecret(key, value) {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", "secret", "put", key], {
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stdin.write(value);
    proc.stdin.end();
    let stderr = "";
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Exit ${code}`));
    });
  });
}

export function deployPlugin() {
  return {
    name: "deploy-api",
    configureServer(server) {
      server.middlewares.use("/api/deploy", async (req, res, next) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const body = await new Promise((resolve, reject) => {
          let data = "";
          req.on("data", (chunk) => (data += chunk));
          req.on("end", () => resolve(data));
          req.on("error", reject);
        });

        let config;
        try {
          config = JSON.parse(body);
        } catch (e) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }

        res.setHeader("Content-Type", "application/json");

        const secrets = [];
        if (config.aiProvider === "anthropic") {
          secrets.push({ key: "ANTHROPIC_API_KEY", value: config.anthropicApiKey });
        } else {
          secrets.push({ key: "CLOUDFLARE_AI_GATEWAY_API_KEY", value: config.aiGatewayApiKey });
          secrets.push({ key: "CF_AI_GATEWAY_ACCOUNT_ID", value: config.aiGatewayAccountId });
          secrets.push({ key: "CF_AI_GATEWAY_GATEWAY_ID", value: config.aiGatewayGatewayId });
        }
        secrets.push(
          { key: "GATEWAY_TOKEN", value: config.gatewayToken },
          { key: "R2_ACCESS_KEY_ID", value: config.r2AccessKeyId },
          { key: "R2_SECRET_ACCESS_KEY", value: config.r2SecretKey },
          { key: "CF_ACCOUNT_ID", value: config.cfAccountId }
        );

        try {
          console.log("[deploy] Building worker...");
          await runCommand("npm", ["run", "build"], { cwd: PROJECT_ROOT });
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Build failed", details: e.message }));
          return;
        }

        const workerName = config.botName?.trim()
          ? `${config.botName.trim()}-clawworker`
          : "clawworker";

        try {
          console.log("[deploy] Deploying to Cloudflare as", workerName, "...");
          await runCommand("npx", ["wrangler", "deploy", "--name", workerName], { cwd: PROJECT_ROOT });
        } catch (e) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: "Deploy failed",
              details: e.message,
              hint: "Run 'npx wrangler login' or set CLOUDFLARE_API_TOKEN",
            })
          );
          return;
        }

        for (const { key, value } of secrets) {
          if (!value) continue;
          try {
            await setSecret(key, value);
          } catch (e) {
            console.error(`[deploy] Failed to set ${key}:`, e.message);
          }
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, message: "Deployed successfully" }));
      });
    },
  };
}
