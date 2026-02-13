// API client for admin endpoints
// Authentication: Cloudflare Access (JWT in cookies) or gateway token (?token= in bootstrap mode)

const API_BASE = '/api/admin';

/** Get gateway token from URL (bootstrap mode - used when CF Access not configured) */
function getBootstrapToken(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('token');
}

export interface PendingDevice {
  requestId: string;
  deviceId: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  ts: number;
}

export interface PairedDevice {
  deviceId: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  createdAtMs: number;
  approvedAtMs: number;
}

export interface DeviceListResponse {
  pending: PendingDevice[];
  paired: PairedDevice[];
  raw?: string;
  stderr?: string;
  parseError?: string;
  error?: string;
}

export interface ApproveResponse {
  success: boolean;
  requestId: string;
  message?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface ApproveAllResponse {
  approved: string[];
  failed: Array<{ requestId: string; success: boolean; error?: string }>;
  message?: string;
  error?: string;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

async function apiRequest<T>(path: string, options: globalThis.RequestInit = {}): Promise<T> {
  const token = getBootstrapToken();
  const url = token ? `${API_BASE}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  } as globalThis.RequestInit);

  if (response.status === 401) {
    throw new AuthError(getBootstrapToken() ? 'Token invalid or expired' : 'Add ?token=YOUR_GATEWAY_TOKEN to the URL, or log in via Cloudflare Access');
  }

  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

export async function listDevices(): Promise<DeviceListResponse> {
  return apiRequest<DeviceListResponse>('/devices');
}

export async function approveDevice(requestId: string): Promise<ApproveResponse> {
  return apiRequest<ApproveResponse>(`/devices/${requestId}/approve`, {
    method: 'POST',
  });
}

export async function approveAllDevices(): Promise<ApproveAllResponse> {
  return apiRequest<ApproveAllResponse>('/devices/approve-all', {
    method: 'POST',
  });
}

export interface RestartGatewayResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export async function restartGateway(): Promise<RestartGatewayResponse> {
  return apiRequest<RestartGatewayResponse>('/gateway/restart', {
    method: 'POST',
  });
}

export interface StorageStatusResponse {
  configured: boolean;
  missing?: string[];
  lastSync: string | null;
  message: string;
}

export interface CdpStatusResponse {
  configured: boolean;
  missing?: string[];
  workerUrlHint?: string;
}

export async function getCdpStatus(): Promise<CdpStatusResponse> {
  return apiRequest<CdpStatusResponse>('/cdp-status');
}

export interface DiagnosticsResponse {
  env: {
    has_anthropic_key: boolean;
    has_openai_key: boolean;
    has_gateway_token: boolean;
    has_r2_access_key: boolean;
    has_r2_secret_key: boolean;
    has_cf_account_id: boolean;
    r2_configured: boolean;
    dev_mode: boolean;
    debug_routes: boolean;
  };
  processes?:
    | { count: number; list: unknown[]; gateway_process: { found: boolean } }
    | { error: string };
  config_file?: string;
}

export async function getDiagnostics(): Promise<DiagnosticsResponse> {
  return apiRequest<DiagnosticsResponse>('/debug/diagnostics');
}

export async function getProcessLogs(processId: string): Promise<{
  id: string;
  command: string;
  status: string;
  exitCode?: number;
  stdout: string;
  stderr: string;
}> {
  return apiRequest(`/debug/process-logs?id=${encodeURIComponent(processId)}`);
}

export interface IntegrationsResponse {
  telegram: boolean;
  discord: boolean;
  slack: boolean;
}

export async function getIntegrations(): Promise<IntegrationsResponse> {
  return apiRequest<IntegrationsResponse>('/integrations');
}

export async function getStorageStatus(): Promise<StorageStatusResponse> {
  return apiRequest<StorageStatusResponse>('/storage');
}

export interface SyncResponse {
  success: boolean;
  message?: string;
  lastSync?: string;
  error?: string;
  details?: string;
}

export async function triggerSync(): Promise<SyncResponse> {
  return apiRequest<SyncResponse>('/storage/sync', {
    method: 'POST',
  });
}
