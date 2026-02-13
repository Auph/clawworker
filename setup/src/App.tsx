import { useState, useCallback } from "react";
import type { SetupConfig } from "./types";
import { defaultConfig } from "./types";
import { WelcomeStep } from "./steps/WelcomeStep";
import { AIProviderStep } from "./steps/AIProviderStep";
import { GatewayTokenStep } from "./steps/GatewayTokenStep";
import { StorageStep } from "./steps/StorageStep";
import { ReviewStep } from "./steps/ReviewStep";
import { DeployStep } from "./steps/DeployStep";
import "./App.css";

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "ai", title: "AI Provider" },
  { id: "token", title: "Gateway Token" },
  { id: "storage", title: "R2 Storage" },
  { id: "review", title: "Review" },
  { id: "deploy", title: "Deploy" },
] as const;

export default function App() {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<SetupConfig>(defaultConfig);

  const updateConfig = useCallback((updates: Partial<SetupConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const next = useCallback(() => {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, []);

  const prev = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const goTo = useCallback((index: number) => {
    setStep(Math.max(0, Math.min(index, STEPS.length - 1)));
  }, []);

  const currentStepId = STEPS[step].id;

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <img src="/logo-small.png" alt="ClawWorker" className="logo" />
          <h1>ClawWorker</h1>
          <p className="subtitle">Setup Wizard</p>
        </div>
      </header>

      <nav className="stepper">
        <div className="stepper-track">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`step-dot ${i <= step ? "active" : ""} ${i === step ? "current" : ""}`}
              onClick={() => goTo(i)}
              title={s.title}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="step-number">{i + 1}</span>
            </button>
          ))}
        </div>
        <p className="step-label">{STEPS[step].title}</p>
      </nav>

      <main className="main">
        <div className="card">
          {currentStepId === "welcome" && (
            <WelcomeStep onNext={next} />
          )}
          {currentStepId === "ai" && (
            <AIProviderStep
              config={config}
              updateConfig={updateConfig}
              onNext={next}
              onBack={prev}
            />
          )}
          {currentStepId === "token" && (
            <GatewayTokenStep
              config={config}
              updateConfig={updateConfig}
              onNext={next}
              onBack={prev}
            />
          )}
          {currentStepId === "storage" && (
            <StorageStep
              config={config}
              updateConfig={updateConfig}
              onNext={next}
              onBack={prev}
            />
          )}
          {currentStepId === "review" && (
            <ReviewStep
              config={config}
              onNext={next}
              onBack={prev}
            />
          )}
          {currentStepId === "deploy" && (
            <DeployStep config={config} onBack={prev} />
          )}
        </div>
      </main>

      <footer className="footer">
        <p>
          Based on{' '}
          <a href="https://github.com/cloudflare/moltworker" target="_blank" rel="noopener noreferrer">
            Cloudflare Moltworker
          </a>
        </p>
      </footer>
    </div>
  );
}
