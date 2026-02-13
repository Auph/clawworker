import { useState, useEffect, useCallback } from 'react';
import {
  listDevices,
  approveDevice,
  approveAllDevices,
  restartGateway,
  getStorageStatus,
  getIntegrations,
  getCdpStatus,
  getDiagnostics,
  triggerSync,
  AuthError,
  type PendingDevice,
  type PairedDevice,
  type DeviceListResponse,
  type StorageStatusResponse,
  type IntegrationsResponse,
  type CdpStatusResponse,
  type DiagnosticsResponse,
} from '../api';
import './AdminPage.css';

// Small inline spinner for buttons
function ButtonSpinner() {
  return <span className="btn-spinner" />;
}

function formatSyncTime(isoString: string | null) {
  if (!isoString) return 'Never';
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

function formatTimestamp(ts: number) {
  const date = new Date(ts);
  return date.toLocaleString();
}

function formatTimeAgo(ts: number) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminPage() {
  const [pending, setPending] = useState<PendingDevice[]>([]);
  const [paired, setPaired] = useState<PairedDevice[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatusResponse | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsResponse | null>(null);
  const [cdpStatus, setCdpStatus] = useState<CdpStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [restartInProgress, setRestartInProgress] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncError, setSyncError] = useState<{ message: string; details?: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [troubleshootExpanded, setTroubleshootExpanded] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem('clawworker-onboarding-dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const dismissOnboarding = useCallback(() => {
    try {
      localStorage.setItem('clawworker-onboarding-dismissed', 'true');
      setOnboardingDismissed(true);
    } catch {
      setOnboardingDismissed(true);
    }
  }, []);

  const showOnboarding =
    !onboardingDismissed &&
    !loading &&
    (paired.length === 0 || !storageStatus?.configured || (!integrations?.telegram && !integrations?.discord && !integrations?.slack));

  const fetchDevices = useCallback(async () => {
    try {
      setError(null);
      const data: DeviceListResponse = await listDevices();
      setPending(data.pending || []);
      setPaired(data.paired || []);

      if (data.error) {
        setError(data.error);
      } else if (data.parseError) {
        setError(`Parse error: ${data.parseError}`);
      }
    } catch (err) {
      if (err instanceof AuthError) {
        setError('Authentication required. Please log in via Cloudflare Access.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch devices');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStorageStatus = useCallback(async () => {
    try {
      const status = await getStorageStatus();
      setStorageStatus(status);
    } catch (err) {
      console.error('Failed to fetch storage status:', err);
    }
  }, []);

  const fetchIntegrations = useCallback(async () => {
    try {
      const data = await getIntegrations();
      setIntegrations(data);
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    }
  }, []);

  const fetchCdpStatus = useCallback(async () => {
    try {
      const data = await getCdpStatus();
      setCdpStatus(data);
    } catch (err) {
      console.error('Failed to fetch CDP status:', err);
    }
  }, []);

  const fetchDiagnostics = useCallback(async () => {
    try {
      const data = await getDiagnostics();
      setDiagnostics(data);
    } catch (err) {
      console.error('Failed to fetch diagnostics:', err);
      setDiagnostics(null);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchStorageStatus();
    fetchIntegrations();
    fetchCdpStatus();
  }, [fetchDevices, fetchStorageStatus, fetchIntegrations, fetchCdpStatus]);

  const handleApprove = async (requestId: string) => {
    setActionInProgress(requestId);
    try {
      const result = await approveDevice(requestId);
      if (result.success) {
        // Refresh the list
        await fetchDevices();
      } else {
        setError(result.error || 'Approval failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve device');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApproveAll = async () => {
    if (pending.length === 0) return;

    setActionInProgress('all');
    try {
      const result = await approveAllDevices();
      if (result.failed && result.failed.length > 0) {
        setError(`Failed to approve ${result.failed.length} device(s)`);
      }
      // Refresh the list
      await fetchDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve devices');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRestartGateway = async () => {
    if (
      !confirm(
        'Are you sure you want to restart the gateway? This will disconnect all clients temporarily.',
      )
    ) {
      return;
    }

    setRestartInProgress(true);
    try {
      const result = await restartGateway();
      if (result.success) {
        setError(null);
        // Show success message briefly
        alert('Gateway restart initiated. Clients will reconnect automatically.');
      } else {
        setError(result.error || 'Failed to restart gateway');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart gateway');
    } finally {
      setRestartInProgress(false);
    }
  };

  const handleSync = async () => {
    setSyncInProgress(true);
    setSyncError(null);
    try {
      const result = await triggerSync();
      if (result.success) {
        // Update the storage status with new lastSync time
        setStorageStatus((prev) => (prev ? { ...prev, lastSync: result.lastSync || null } : null));
        setError(null);
      } else {
        setSyncError({
          message: result.error || 'Sync failed',
          details: result.details,
        });
      }
    } catch (err) {
      setSyncError({
        message: err instanceof Error ? err.message : 'Failed to sync',
        details: undefined,
      });
    } finally {
      setSyncInProgress(false);
    }
  };

  return (
    <div className="devices-page">
      {showOnboarding && (
        <section className="devices-section onboarding-checklist">
          <h3>Getting Started</h3>
          <div className="onboarding-steps">
            {paired.length > 0 ? (
              <div className="onboarding-step done">
                <span className="step-icon">✓</span>
                <span className="step-text">Device paired — you can chat from the Control UI</span>
              </div>
            ) : (
              <div className={`onboarding-step ${pending.length > 0 ? 'highlight' : ''}`}>
                <span className="step-icon">1</span>
                <span className="step-text">
                  <strong>Pair your first device</strong> — Open the Control UI on your phone or desktop. When prompted, approve it here.
                  {pending.length > 0 && ' A device is waiting!'}
                </span>
              </div>
            )}
            {!storageStatus?.configured && (
              <div className="onboarding-step">
                <span className="step-icon">2</span>
                <span className="step-text">
                  <strong>Configure R2 storage</strong> — Required for memory persistence. See the warning above for setup instructions.
                </span>
              </div>
            )}
            {storageStatus?.configured && (
              <div className="onboarding-step done">
                <span className="step-icon">✓</span>
                <span className="step-text">R2 storage configured — your data persists across restarts</span>
              </div>
            )}
            {!integrations?.telegram && !integrations?.discord && !integrations?.slack && (
              <div className="onboarding-step">
                <span className="step-icon">3</span>
                <span className="step-text">
                  <strong>Optional:</strong> Add Telegram, Discord, or Slack — set <code>TELEGRAM_BOT_TOKEN</code> etc. via wrangler secrets.
                </span>
              </div>
            )}
            <div className="onboarding-step">
              <span className="step-icon">→</span>
              <span className="step-text">
                <strong>Control UI:</strong> Open the root URL with <code>?token=YOUR_TOKEN</code> to chat with your AI
              </span>
            </div>
          </div>
          <button type="button" className="onboarding-dismiss" onClick={dismissOnboarding}>
            Dismiss checklist
          </button>
        </section>
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">
            Dismiss
          </button>
        </div>
      )}

      {storageStatus && !storageStatus.configured && (
        <div className="warning-banner">
          <div className="warning-content">
            <strong>R2 Storage Not Configured</strong>
            <p>
              Paired devices and conversations will be lost when the container restarts. To enable
              persistent storage, configure R2 credentials. See the{' '}
              <a
                href="https://github.com/Auph/clawworker"
                target="_blank"
                rel="noopener noreferrer"
              >
                README
              </a>{' '}
              for setup instructions.
            </p>
            {storageStatus.missing && (
              <p className="missing-secrets">Missing: {storageStatus.missing.join(', ')}</p>
            )}
          </div>
        </div>
      )}

      {storageStatus?.configured && (
        <div className="success-banner">
          <div className="storage-status">
            <div className="storage-info">
              <span>
                R2 storage is configured. Your data will persist across container restarts.
              </span>
              <span className="last-sync">
                Last backup: {formatSyncTime(storageStatus.lastSync)}
              </span>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleSync}
              disabled={syncInProgress}
            >
              {syncInProgress && <ButtonSpinner />}
              {syncInProgress ? 'Syncing...' : 'Backup Now'}
            </button>
          </div>
          {syncError && (
            <div className="sync-error">
              <strong>Backup failed:</strong> {syncError.message}
              {syncError.details && (
                <pre className="sync-error-details">{syncError.details}</pre>
              )}
              <div className="sync-error-fix">
                <strong>How to fix:</strong>
                <ul>
                  <li>
                    <strong>R2 not configured:</strong> Set{' '}
                    <code>R2_ACCESS_KEY_ID</code>, <code>R2_SECRET_ACCESS_KEY</code>, and{' '}
                    <code>CF_ACCOUNT_ID</code> via{' '}
                    <code>npx wrangler secret put &lt;KEY&gt;</code>, then redeploy.
                  </li>
                  <li>
                    <strong>Permission denied / access denied:</strong> Your R2 API token must have
                    Object Read & Write on the <code>clawworker-data</code> bucket. In Cloudflare
                    Dashboard → R2 → Manage R2 API Tokens, edit your token and add
                    <code>clawworker-data</code> with read+write access.
                  </li>
                  <li>
                    <strong>No config file found:</strong> The gateway may not have started yet.
                    Try Restart Gateway above, wait 1–2 minutes, then Backup Now again.
                  </li>
                  <li>
                    <strong>Other errors:</strong> Check <code>npx wrangler tail</code> for logs.
                    Ensure the <code>clawworker-data</code> bucket exists (created on first deploy).
                    If you use a custom bucket, set <code>R2_BUCKET_NAME</code> via wrangler secret.
                  </li>
                </ul>
              </div>
              <button onClick={() => setSyncError(null)} className="dismiss-btn">
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      <section className="devices-section gateway-section">
        <div className="section-header">
          <h2>Gateway Dashboard</h2>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              fetchStorageStatus();
              fetchIntegrations();
              fetchCdpStatus();
            }}
          >
            Refresh
          </button>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-card integrations-card">
            <h3>Connected Integrations</h3>
            <p className="hint">Chat platforms configured to connect to your assistant</p>
            <div className="integrations-grid">
              <div
                className={`integration-item ${integrations?.telegram ? 'connected' : 'not-configured'}`}
                title={integrations?.telegram ? 'Telegram bot is connected' : 'Set TELEGRAM_BOT_TOKEN to enable'}
              >
                <span className="integration-icon" aria-hidden>TG</span>
                <span className="integration-name">Telegram</span>
                <span className="integration-status">
                  {integrations?.telegram ? 'Connected' : 'Not configured'}
                </span>
              </div>
              <div
                className={`integration-item ${integrations?.discord ? 'connected' : 'not-configured'}`}
                title={integrations?.discord ? 'Discord bot is connected' : 'Set DISCORD_BOT_TOKEN to enable'}
              >
                <span className="integration-icon" aria-hidden>DC</span>
                <span className="integration-name">Discord</span>
                <span className="integration-status">
                  {integrations?.discord ? 'Connected' : 'Not configured'}
                </span>
              </div>
              <div
                className={`integration-item ${integrations?.slack ? 'connected' : 'not-configured'}`}
                title={integrations?.slack ? 'Slack app is connected' : 'Set SLACK_BOT_TOKEN and SLACK_APP_TOKEN to enable'}
              >
                <span className="integration-icon" aria-hidden>SL</span>
                <span className="integration-name">Slack</span>
                <span className="integration-status">
                  {integrations?.slack ? 'Connected' : 'Not configured'}
                </span>
              </div>
            </div>
            <p className="integration-hint">
              Add tokens via <code>npx wrangler secret put TELEGRAM_BOT_TOKEN</code> (etc.), then redeploy.
            </p>
          </div>

          <div className="dashboard-card gateway-actions-card">
            <h3>Gateway Controls</h3>
            <p className="hint">
              Restart the gateway to apply config changes or recover from errors. Clients will reconnect automatically.
            </p>
            <button
              className="btn btn-danger"
              onClick={handleRestartGateway}
              disabled={restartInProgress}
            >
              {restartInProgress && <ButtonSpinner />}
              {restartInProgress ? 'Restarting...' : 'Restart Gateway'}
            </button>
          </div>

          <div className="dashboard-card cdp-card">
            <h3>Browser Automation (CDP)</h3>
            <p className="hint">
              Enables screenshots, web scraping, and video capture via headless Chrome. Used by the cloudflare-browser skill.
            </p>
            {cdpStatus?.configured ? (
              <div className="cdp-configured">
                <span className="cdp-status-badge connected">Configured</span>
                <p className="cdp-configured-hint">
                  CDP is ready. OpenClaw can use the cloudflare-browser skill for screenshots and browser automation.
                </p>
              </div>
            ) : (
              <div className="cdp-setup">
                <span className="cdp-status-badge not-configured">Not configured</span>
                <div className="cdp-setup-steps">
                  <p><strong>Setup (run in terminal):</strong></p>
                  <ol>
                    <li>
                      Set a shared secret for CDP authentication:
                      <pre className="cdp-command">npx wrangler secret put CDP_SECRET</pre>
                      <span className="cdp-step-hint">Enter a secure random string (e.g. <code>openssl rand -hex 32</code>)</span>
                    </li>
                    <li>
                      Set your worker&apos;s public URL:
                      <pre className="cdp-command">npx wrangler secret put WORKER_URL</pre>
                      <span className="cdp-step-hint">Enter: <code>{typeof window !== 'undefined' ? window.location.origin : 'https://your-worker.workers.dev'}</code></span>
                    </li>
                    <li>
                      Redeploy:
                      <pre className="cdp-command">npm run deploy</pre>
                    </li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="devices-section troubleshoot-section">
        <button
          className="section-header troubleshoot-toggle"
          onClick={() => {
            setTroubleshootExpanded(!troubleshootExpanded);
            if (!troubleshootExpanded) fetchDiagnostics();
          }}
        >
          <h2>Troubleshooting</h2>
          <span className="troubleshoot-chevron">{troubleshootExpanded ? '▼' : '▶'}</span>
        </button>

        {troubleshootExpanded && (
          <div className="troubleshoot-content">
            <div className="troubleshoot-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => fetchDiagnostics()}
              >
                Refresh diagnostics
              </button>
            </div>

            {diagnostics ? (
              <div className="diagnostics-grid">
                <div className="diagnostics-card">
                  <h4>Environment</h4>
                  <dl className="diagnostics-dl">
                    <dt>R2 configured</dt>
                    <dd className={diagnostics.env.r2_configured ? 'ok' : 'missing'}>
                      {diagnostics.env.r2_configured ? 'Yes' : 'No'}
                    </dd>
                    <dt>AI provider</dt>
                    <dd className={diagnostics.env.has_anthropic_key || diagnostics.env.has_openai_key ? 'ok' : 'missing'}>
                      {diagnostics.env.has_anthropic_key
                        ? 'Anthropic'
                        : diagnostics.env.has_openai_key
                          ? 'OpenAI'
                          : 'Not set'}
                    </dd>
                    <dt>Gateway token</dt>
                    <dd className={diagnostics.env.has_gateway_token ? 'ok' : 'missing'}>
                      {diagnostics.env.has_gateway_token ? 'Set' : 'Not set'}
                    </dd>
                    <dt>Config file</dt>
                    <dd className={diagnostics.config_file === 'exists' ? 'ok' : 'missing'}>
                      {diagnostics.config_file || 'unknown'}
                    </dd>
                  </dl>
                </div>

                <div className="diagnostics-card">
                  <h4>Processes</h4>
                  {diagnostics.processes && 'error' in diagnostics.processes ? (
                    <p className="diagnostics-error">{diagnostics.processes.error}</p>
                  ) : diagnostics.processes ? (
                    <>
                      <p>{diagnostics.processes.count} process(es) running</p>
                      <p className={diagnostics.processes.gateway_process.found ? 'ok' : 'missing'}>
                        Gateway: {diagnostics.processes.gateway_process.found ? 'Found' : 'Not found'}
                      </p>
                      {diagnostics.processes.list.length > 0 && (
                        <details className="diagnostics-details">
                          <summary>Process list</summary>
                          <pre className="diagnostics-pre">
                            {(diagnostics.processes.list as { id: string; command: string; status: string }[])
                              .map((p) => `${p.status} [${p.id}] ${p.command}`)
                              .join('\n')}
                          </pre>
                        </details>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="diagnostics-loading">Loading diagnostics…</p>
            )}

            <div className="troubleshoot-tips">
              <h4>Tips</h4>
              <ul>
                <li>
                  <strong>Secrets not detected?</strong> Run{' '}
                  <code>npx wrangler secret put R2_ACCESS_KEY_ID</code> (etc.) and redeploy. Secrets are per-worker.
                </li>
                <li>
                  <strong>Gateway stuck?</strong> Use Restart Gateway above. Check live logs:{' '}
                  <code>npx wrangler tail</code>
                </li>
                <li>
                  <strong>More debug info?</strong> Set <code>DEBUG_ROUTES=true</code> via wrangler secret, redeploy, then visit{' '}
                  <code>/debug/processes</code> and <code>/debug/container-config</code> with your token.
                </li>
              </ul>
            </div>
          </div>
        )}
      </section>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading devices...</p>
        </div>
      ) : (
        <>
          <section className="devices-section">
            <div className="section-header">
              <h2>Pending Pairing Requests</h2>
              <div className="header-actions">
                {pending.length > 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={handleApproveAll}
                    disabled={actionInProgress !== null}
                  >
                    {actionInProgress === 'all' && <ButtonSpinner />}
                    {actionInProgress === 'all'
                      ? 'Approving...'
                      : `Approve All (${pending.length})`}
                  </button>
                )}
                <button className="btn btn-secondary" onClick={fetchDevices} disabled={loading}>
                  Refresh
                </button>
              </div>
            </div>

            {pending.length === 0 ? (
              <div className="empty-state">
                <p>No pending pairing requests</p>
                <p className="hint">
                  Devices will appear here when they attempt to connect without being paired.
                </p>
              </div>
            ) : (
              <div className="devices-grid">
                {pending.map((device) => (
                  <div key={device.requestId} className="device-card pending">
                    <div className="device-header">
                      <span className="device-name">
                        {device.displayName || device.deviceId || 'Unknown Device'}
                      </span>
                      <span className="device-badge pending">Pending</span>
                    </div>
                    <div className="device-details">
                      {device.platform && (
                        <div className="detail-row">
                          <span className="label">Platform:</span>
                          <span className="value">{device.platform}</span>
                        </div>
                      )}
                      {device.clientId && (
                        <div className="detail-row">
                          <span className="label">Client:</span>
                          <span className="value">{device.clientId}</span>
                        </div>
                      )}
                      {device.clientMode && (
                        <div className="detail-row">
                          <span className="label">Mode:</span>
                          <span className="value">{device.clientMode}</span>
                        </div>
                      )}
                      {device.role && (
                        <div className="detail-row">
                          <span className="label">Role:</span>
                          <span className="value">{device.role}</span>
                        </div>
                      )}
                      {device.remoteIp && (
                        <div className="detail-row">
                          <span className="label">IP:</span>
                          <span className="value">{device.remoteIp}</span>
                        </div>
                      )}
                      <div className="detail-row">
                        <span className="label">Requested:</span>
                        <span className="value" title={formatTimestamp(device.ts)}>
                          {formatTimeAgo(device.ts)}
                        </span>
                      </div>
                    </div>
                    <div className="device-actions">
                      <button
                        className="btn btn-success"
                        onClick={() => handleApprove(device.requestId)}
                        disabled={actionInProgress !== null}
                      >
                        {actionInProgress === device.requestId && <ButtonSpinner />}
                        {actionInProgress === device.requestId ? 'Approving...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="devices-section">
            <div className="section-header">
              <h2>Paired Devices</h2>
            </div>

            {paired.length === 0 ? (
              <div className="empty-state">
                <p>No paired devices</p>
              </div>
            ) : (
              <div className="devices-grid">
                {paired.map((device) => (
                  <div key={device.deviceId} className="device-card paired">
                    <div className="device-header">
                      <span className="device-name">
                        {device.displayName || device.deviceId || 'Unknown Device'}
                      </span>
                      <span className="device-badge paired">Paired</span>
                    </div>
                    <div className="device-details">
                      {device.platform && (
                        <div className="detail-row">
                          <span className="label">Platform:</span>
                          <span className="value">{device.platform}</span>
                        </div>
                      )}
                      {device.clientId && (
                        <div className="detail-row">
                          <span className="label">Client:</span>
                          <span className="value">{device.clientId}</span>
                        </div>
                      )}
                      {device.clientMode && (
                        <div className="detail-row">
                          <span className="label">Mode:</span>
                          <span className="value">{device.clientMode}</span>
                        </div>
                      )}
                      {device.role && (
                        <div className="detail-row">
                          <span className="label">Role:</span>
                          <span className="value">{device.role}</span>
                        </div>
                      )}
                      <div className="detail-row">
                        <span className="label">Paired:</span>
                        <span className="value" title={formatTimestamp(device.approvedAtMs)}>
                          {formatTimeAgo(device.approvedAtMs)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
