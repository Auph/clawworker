import type { SetupConfig } from "../types";

interface AIProviderStepProps {
  config: SetupConfig;
  updateConfig: (updates: Partial<SetupConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function AIProviderStep({ config, updateConfig, onNext, onBack }: AIProviderStepProps) {
  const canProceed =
    config.aiProvider === "anthropic"
      ? config.anthropicApiKey.trim().length > 0
      : config.aiGatewayApiKey.length > 0 &&
        config.aiGatewayAccountId.length > 0 &&
        config.aiGatewayGatewayId.length > 0;

  return (
    <div>
      <h2>AI Provider</h2>
      <p className="form-hint" style={{ marginBottom: "1rem" }}>
        Choose how OpenClaw connects to Claude. Anthropic direct is simplest.
      </p>

      <div className="form-group">
        <div className="radio-group">
          <label className="radio-option">
            <input
              type="radio"
              name="aiProvider"
              checked={config.aiProvider === "anthropic"}
              onChange={() => updateConfig({ aiProvider: "anthropic" })}
            />
            <span>Direct Anthropic API</span>
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="aiProvider"
              checked={config.aiProvider === "ai-gateway"}
              onChange={() => updateConfig({ aiProvider: "ai-gateway" })}
            />
            <span>Cloudflare AI Gateway</span>
          </label>
        </div>
      </div>

      {config.aiProvider === "anthropic" && (
        <div className="form-group">
          <label htmlFor="anthropic-key">Anthropic API Key</label>
          <input
            id="anthropic-key"
            type="password"
            placeholder="sk-ant-..."
            value={config.anthropicApiKey}
            onChange={(e) => updateConfig({ anthropicApiKey: e.target.value })}
          />
          <p className="form-hint">
            Get your key from{" "}
            <a
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              console.anthropic.com
            </a>
          </p>
        </div>
      )}

      {config.aiProvider === "ai-gateway" && (
        <>
          <div className="form-group">
            <label htmlFor="gateway-key">API Key (through gateway)</label>
            <input
              id="gateway-key"
              type="password"
              placeholder="Your provider API key"
              value={config.aiGatewayApiKey}
              onChange={(e) => updateConfig({ aiGatewayApiKey: e.target.value })}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="account-id">Account ID</label>
              <input
                id="account-id"
                type="text"
                placeholder="Cloudflare account ID"
                value={config.aiGatewayAccountId}
                onChange={(e) =>
                  updateConfig({ aiGatewayAccountId: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label htmlFor="gateway-id">Gateway ID</label>
              <input
                id="gateway-id"
                type="text"
                placeholder="AI Gateway ID"
                value={config.aiGatewayGatewayId}
                onChange={(e) =>
                  updateConfig({ aiGatewayGatewayId: e.target.value })
                }
              />
            </div>
          </div>
        </>
      )}

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
