import type { SetupConfig } from "../types";
import "./ReviewStep.css";

interface ReviewStepProps {
  config: SetupConfig;
  onNext: () => void;
  onBack: () => void;
}

function Secret({ value }: { value: string }) {
  if (!value) return <span className="muted">—</span>;
  const masked = value.slice(0, 8) + "…" + value.slice(-4);
  return <code>{masked}</code>;
}

export function ReviewStep({ config, onNext, onBack }: ReviewStepProps) {
  return (
    <div>
      <h2>Review Configuration</h2>
      <p className="form-hint" style={{ marginBottom: "1.25rem" }}>
        Verify your settings before deploying.
      </p>

      <div className="review-grid">
        <div className="review-item">
          <span className="review-label">AI Provider</span>
          <span>
            {config.aiProvider === "anthropic" ? "Anthropic (direct)" : "Cloudflare AI Gateway"}
          </span>
        </div>
        {config.aiProvider === "anthropic" ? (
          <div className="review-item">
            <span className="review-label">Anthropic API Key</span>
            <Secret value={config.anthropicApiKey} />
          </div>
        ) : (
          <>
            <div className="review-item">
              <span className="review-label">Gateway API Key</span>
              <Secret value={config.aiGatewayApiKey} />
            </div>
            <div className="review-item">
              <span className="review-label">Account / Gateway ID</span>
              <span>
                {config.aiGatewayAccountId} / {config.aiGatewayGatewayId}
              </span>
            </div>
          </>
        )}
        <div className="review-item">
          <span className="review-label">Gateway Token</span>
          <Secret value={config.gatewayToken} />
        </div>
        <div className="review-item">
          <span className="review-label">R2 Storage</span>
          <Secret value={config.r2AccessKeyId} />
        </div>
      </div>

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Deploy to Cloudflare
        </button>
      </div>
    </div>
  );
}
