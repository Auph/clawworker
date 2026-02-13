import { useState, useCallback } from "react";
import type { SetupConfig } from "../types";
import "./DeployStep.css";

const DEFAULT_REPO = "https://github.com/Auph/clawworker";

const getDeployUrl = () => {
  const repo = import.meta.env.VITE_DEPLOY_REPO_URL || DEFAULT_REPO;
  return `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(repo)}`;
};

const isLocalhost = () =>
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

interface CopyableRowProps {
  name: string;
  value: string;
}

function CopyableRow({ name, value }: CopyableRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  if (!value) return null;

  return (
    <div className="copyable-row">
      <div className="copyable-label">{name}</div>
      <div className="copyable-value">
        <code>{value.length > 24 ? value.slice(0, 12) + "…" + value.slice(-8) : value}</code>
        <button
          type="button"
          className={`copy-btn ${copied ? "copied" : ""}`}
          onClick={handleCopy}
          title="Copy value"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

interface DeployStepProps {
  config: SetupConfig;
  onBack: () => void;
}

export function DeployStep({ config, onBack }: DeployStepProps) {
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);

  const handleDeploy = useCallback(async () => {
    if (isLocalhost()) {
      setDeploying(true);
      setDeployError(null);
      try {
        const res = await fetch("/api/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });
        const data = (await res.json()) as { success?: boolean; error?: string; details?: string; hint?: string };
        if (!res.ok) {
          throw new Error(data.details || data.error || "Deploy failed");
        }
        setDeploySuccess(true);
      } catch (e) {
        setDeployError(e instanceof Error ? e.message : "Deploy failed");
      } finally {
        setDeploying(false);
      }
    } else {
      window.open(getDeployUrl(), "_blank", "noopener,noreferrer");
    }
  }, [config]);

  const secrets: Array<{ name: string; value: string }> = [];

  if (config.aiProvider === "anthropic") {
    secrets.push({ name: "ANTHROPIC_API_KEY", value: config.anthropicApiKey });
  } else {
    secrets.push({ name: "CLOUDFLARE_AI_GATEWAY_API_KEY", value: config.aiGatewayApiKey });
    secrets.push({ name: "CF_AI_GATEWAY_ACCOUNT_ID", value: config.aiGatewayAccountId });
    secrets.push({ name: "CF_AI_GATEWAY_GATEWAY_ID", value: config.aiGatewayGatewayId });
  }

  secrets.push({ name: "GATEWAY_TOKEN", value: config.gatewayToken });

  secrets.push({ name: "R2_ACCESS_KEY_ID", value: config.r2AccessKeyId });
  secrets.push({ name: "R2_SECRET_ACCESS_KEY", value: config.r2SecretKey });
  secrets.push({ name: "CF_ACCOUNT_ID", value: config.cfAccountId });

  return (
    <div className="deploy-step">
      <h2>Deploy to Cloudflare</h2>
      {isLocalhost() ? (
        <p className="form-hint" style={{ marginBottom: "1.5rem" }}>
          Direct deploy from your machine. Requires{" "}
          <code>npx wrangler login</code> or <code>CLOUDFLARE_API_TOKEN</code>. No re-entering of secrets.
        </p>
      ) : (
        <p className="form-hint" style={{ marginBottom: "1.5rem" }}>
          For one-click deploy without re-entering secrets, run the wizard locally:{" "}
          <code>npm run setup:wizard</code>. Or use the button to open the Cloudflare form and paste values below.
        </p>
      )}

      <div className="deploy-cta">
        <button
          type="button"
          className="btn btn-primary deploy-btn"
          onClick={handleDeploy}
          disabled={deploying}
        >
          {deploying ? "Deploying…" : "Deploy to Cloudflare"}
        </button>
        {isLocalhost() && (
          <p className="deploy-hint">Builds and deploys directly via wrangler (no form)</p>
        )}
        {!isLocalhost() && (
          <p className="deploy-hint">Opens deploy.workers.cloudflare.com in a new tab</p>
        )}
      </div>

      {deploySuccess && isLocalhost() && (
        <div className="deploy-success">✓ Deployed successfully. See your worker URL in the terminal.</div>
      )}
      {deployError && (
        <div className="deploy-error">
          <strong>Deploy failed:</strong> {deployError}
        </div>
      )}

      <div className="secrets-panel">
        <h3>Values to paste when prompted</h3>
        <p className="form-hint">
          Copy each value when the deploy form asks for it. Keep this page open.
        </p>
        <div className="secrets-list">
          {secrets.map((s) => (
            <CopyableRow key={s.name} name={s.name} value={s.value} />
          ))}
        </div>
      </div>

      <div className="post-deploy">
        <h3>After deployment</h3>
        <p>
          Replace <code>YOUR-WORKER</code> with your worker URL from the deploy output:
        </p>
        <ul>
          <li>
            <strong>Control UI:</strong>{" "}
            <code>https://YOUR-WORKER.workers.dev/?token={config.gatewayToken}</code>
          </li>
          <li>
            <strong>Admin UI:</strong>{" "}
            <code>https://YOUR-WORKER.workers.dev/_admin/?token={config.gatewayToken}</code>
          </li>
        </ul>
        <p className="form-hint">
          First request may take 1–2 minutes (container cold start). Pair your device via the Admin UI.
        </p>

        <h3 style={{ marginTop: "1.5rem" }}>Optional: Cloudflare Access (after deploy)</h3>
        <p>
          The Application Audience (AUD) is only available <em>after</em> your worker is deployed.
          To add email/SSO auth for production:
        </p>
        <ol style={{ margin: "0.75rem 0", paddingLeft: "1.5rem" }}>
          <li>Deploy first (using the button above)</li>
          <li>In Workers & Pages → your worker → Settings → Domains & Routes, enable Cloudflare Access on workers.dev</li>
          <li>Go to Zero Trust → Access → Applications, find your worker, copy the <strong>AUD</strong></li>
          <li>Run: <code>npx wrangler secret put CF_ACCESS_TEAM_DOMAIN</code> (e.g. <code>kryst.cloudflareaccess.com</code>)</li>
          <li>Run: <code>npx wrangler secret put CF_ACCESS_AUD</code> (paste the AUD from step 3)</li>
          <li>Redeploy</li>
        </ol>
      </div>

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
