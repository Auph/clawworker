import type { SetupConfig } from "../types";

interface StorageStepProps {
  config: SetupConfig;
  updateConfig: (updates: Partial<SetupConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StorageStep({ config, updateConfig, onNext, onBack }: StorageStepProps) {
  const canProceed =
    config.r2AccessKeyId.trim().length > 0 &&
    config.r2SecretKey.trim().length > 0 &&
    config.cfAccountId.trim().length > 0;

  return (
    <div>
      <h2>R2 Storage (Required)</h2>
      <p className="form-hint" style={{ marginBottom: "1.25rem" }}>
        ClawWorker requires R2 storage for memory persistence. Your conversations,
        paired devices, and workspace are synced here so they survive container restarts.
      </p>

      <div className="form-group">
        <label htmlFor="r2-key">R2 Access Key ID</label>
        <input
          id="r2-key"
          type="text"
          placeholder="From R2 API token"
          value={config.r2AccessKeyId}
          onChange={(e) => updateConfig({ r2AccessKeyId: e.target.value })}
        />
        <p className="form-hint">
          <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer">
            Cloudflare Dashboard
          </a>
          {" "}→ R2 → Manage R2 API Tokens → Object Read & Write on <code>clawworker-data</code> (created on first deploy)
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="r2-secret">R2 Secret Key</label>
        <input
          id="r2-secret"
          type="password"
          placeholder="From R2 API token"
          value={config.r2SecretKey}
          onChange={(e) => updateConfig({ r2SecretKey: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label htmlFor="cf-account">Cloudflare Account ID</label>
        <input
          id="cf-account"
          type="text"
          placeholder="Your account ID"
          value={config.cfAccountId}
          onChange={(e) => updateConfig({ cfAccountId: e.target.value })}
        />
        <p className="form-hint">
          Dashboard → click account name → Copy Account ID. The <code>clawworker-data</code> bucket
          is created automatically on first deploy.
        </p>
      </div>

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={!canProceed}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
