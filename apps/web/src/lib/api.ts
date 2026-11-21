let token: string | null = null;

async function getToken(): Promise<string> {
  if (token) return token;
  const r = await fetch('/api/session');
  token = (await r.json()).token as string;
  return token;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['x-wf-token'] = await getToken();
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`/api${path}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const issues = data?.issues ? `: ${data.issues.map((i: any) => `${(i.path ?? []).join('.')} ${i.message}`).join('; ')}` : '';
    throw new ApiError(r.status, `${data?.error ?? r.statusText}${issues}`, data);
  }
  return data as T;
}

export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
