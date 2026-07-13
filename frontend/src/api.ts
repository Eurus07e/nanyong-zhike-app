export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const EHALL_STATUS_EVENT = 'nanyong-ehall-status'

function isEhallRequest(path: string) {
  return /^\/api\/(grades|schedule|programs|academic\/profile)(?:[/?]|$)/.test(path)
}

function reportEhallStatus(connected: boolean) {
  window.dispatchEvent(new CustomEvent(EHALL_STATUS_EVENT, { detail: { connected } }))
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const eHallRequest = isEhallRequest(path)
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch (error) {
    if (eHallRequest) reportEhallStatus(false)
    throw error
  }
  if (!response.ok) {
    if (eHallRequest && (response.status === 401 || response.status >= 500)) reportEhallStatus(false)
    let message = '请求失败，请稍后重试'
    try {
      const body = await response.json()
      message = body.detail || message
    } catch {
      // A non-JSON upstream failure still gets a useful message.
    }
    throw new ApiError(message, response.status)
  }
  if (eHallRequest) reportEhallStatus(true)
  return response.json() as Promise<T>
}

type CacheEntry = { expiresAt: number; value?: unknown; promise?: Promise<unknown> }
const responseCache = new Map<string, CacheEntry>()

async function cached<T>(path: string, options: { ttl?: number; force?: boolean } = {}): Promise<T> {
  const ttl = options.ttl ?? 5 * 60_000
  const current = responseCache.get(path)
  if (!options.force && current && current.expiresAt > Date.now()) {
    if (current.value !== undefined) return current.value as T
    if (current.promise) return current.promise as Promise<T>
  }
  const promise = request<T>(path)
  responseCache.set(path, { expiresAt: Date.now() + ttl, promise })
  try {
    const value = await promise
    responseCache.set(path, { expiresAt: Date.now() + ttl, value })
    return value
  } catch (error) {
    responseCache.delete(path)
    throw error
  }
}

function clearCache(prefix?: string) {
  if (!prefix) responseCache.clear()
  else [...responseCache.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => responseCache.delete(key))
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  cached,
  clearCache,
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
}

export function query(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const suffix = search.toString()
  return suffix ? `${path}?${suffix}` : path
}
