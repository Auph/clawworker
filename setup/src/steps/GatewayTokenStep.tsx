import { useCallback } from "react";
import type { SetupConfig } from "../types";

interface GatewayTokenStepProps {
  config: SetupConfig;
  updateConfig: (updates: Partial<SetupConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

function randomHex32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function GatewayTokenStep({ config, updateConfig, onNext, onBack }: GatewayTokenStepProps) {
  const generateToken = useCallback(() => {
    updateConfig({ gatewayToken: randomHex32() });
  }, [updateConfig]);

  const hasToken = config.gatewayToken.trim().length >= 16;

  return (
    <div>
      <h2>Gateway Token</h2>
      <p className="form-hint" style={{ marginBottom: "1rem" }}>
        This token protects access to your Control UI and Admin UI. Pass it via{" "}
        <code>?token=YOUR_TOKEN</code> in the URL.
      </p>

      <div className="form-group">
        <label htmlFor="gateway-token">Token</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            id="gateway-token"
            type="text"
            placeholder="Generate or paste your token"
            value={config.gatewayToken}
            onChange={(e) => updateConfig({ gatewayToken: e.target.value })}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={generateToken}
          >
            Generate
          </button>
        </div>
        <p className="form-hint">
          Generate with: <code>openssl rand -hex 32</code>
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
          disabled={!hasToken}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
