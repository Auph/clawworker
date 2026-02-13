import "./WelcomeStep.css";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="welcome">
      <div className="welcome-badge">~5 min setup</div>
      <h2>Deploy your personal AI to the edge</h2>
      <p className="lead">
        ClawWorker is a free, open-source way to run OpenClaw (Claude-powered assistant) on your
        own Cloudflare account. This wizard guides you through setup—no prior experience required.
      </p>
      <p className="hosting-note">
        Everything is hosted on <strong>your own Cloudflare account</strong>. You manage your own
        hosting and data. This is a guided setup tool only.
      </p>
      <ul className="requirements">
        <li>
          <strong>Cloudflare account</strong> —{" "}
          <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener noreferrer">
            Sign up
          </a>
          , then upgrade to Workers Paid plan ($5/mo) for containers
        </li>
        <li>
          <strong>AI API key</strong> — Anthropic direct or Cloudflare AI Gateway
        </li>
        <li>
          <strong>R2 storage</strong> — Free tier works; keeps your memory & devices
        </li>
      </ul>
      <div className="whats-next">
        <span className="whats-next-label">What happens next</span>
        <ol>
          <li>Name your bot (e.g. <code>my-assistant</code> → <code>my-assistant-clawworker</code>)</li>
          <li>Choose AI provider and enter credentials</li>
          <li>Generate a secure gateway token</li>
          <li>Connect R2 for persistence</li>
          <li>Deploy → get your Control UI & Admin URLs</li>
        </ol>
      </div>
      <p className="hint">
        First request after deploy takes 1–2 min (container cold start). Then you're live.
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Begin setup
        </button>
      </div>
    </div>
  );
}
