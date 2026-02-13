import type { SetupConfig } from "../types";

interface NameStepProps {
  config: SetupConfig;
  updateConfig: (updates: Partial<SetupConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

// Worker names: alphanumeric + hyphens, 1-32 chars (empty = use default "clawworker")
const BOT_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,30}[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

export function NameStep({ config, updateConfig, onNext, onBack }: NameStepProps) {
  const displayName = config.botName.trim();
  const fullName = displayName ? `${displayName}-clawworker` : "clawworker";
  const isValid = displayName === "" || BOT_NAME_REGEX.test(displayName);

  return (
    <div>
      <h2>Name your bot</h2>
      <p className="form-hint" style={{ marginBottom: "1rem" }}>
        Choose a name for your worker. It will appear in your Cloudflare dashboard and as the base
        of your URL.
      </p>

      <div className="form-group">
        <label htmlFor="bot-name">Project / Bot name</label>
        <input
          id="bot-name"
          type="text"
          placeholder="my-assistant"
          value={config.botName}
          onChange={(e) => updateConfig({ botName: e.target.value })}
          autoComplete="off"
        />
        <p className="form-hint">
          Use letters, numbers, and hyphens only. 1–32 characters. We add the suffix{" "}
          <code>-clawworker</code>.
        </p>
      </div>

      {displayName && (
        <div className="form-hint" style={{ marginBottom: "1rem" }}>
          Worker name: <code>{fullName}</code>
        </div>
      )}

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={!isValid}
        >
          Next
        </button>
      </div>
    </div>
  );
}
