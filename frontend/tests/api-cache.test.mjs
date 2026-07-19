import assert from 'node:assert/strict'
import test from 'node:test'

import { api, withRefresh } from '../src/api.ts'


test('coalesces concurrent forced requests but allows a later refresh', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    await Promise.resolve()
    return {
      ok: true,
      status: 200,
      json: async () => ({ call: calls }),
    }
  }

  try {
    api.clearCache('/api/cache-coalescing')
    const first = api.cached('/api/cache-coalescing', { force: true })
    const concurrent = api.cached('/api/cache-coalescing', { force: true })

    await Promise.all([first, concurrent])
    assert.equal(calls, 1)

    await api.cached('/api/cache-coalescing', { force: true })
    assert.equal(calls, 2)
  } finally {
    api.clearCache('/api/cache-coalescing')
    globalThis.fetch = originalFetch
  }
})


test('does not let a request cleared during logout overwrite a newer response', async () => {
  const originalFetch = globalThis.fetch
  let resolveFirst
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) {
      await new Promise((resolve) => { resolveFirst = resolve })
      return {
        ok: true,
        status: 200,
        json: async () => ({ source: 'previous-session' }),
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ source: 'current-session' }),
    }
  }

  try {
    const path = '/api/session-isolation'
    api.clearCache(path)
    const previousSession = api.cached(path)
    api.clearCache(path)
    const currentSession = await api.cached(path)
    resolveFirst()
    await previousSession

    assert.deepEqual(currentSession, { source: 'current-session' })
    assert.deepEqual(api.peek(path), { source: 'current-session' })
  } finally {
    api.clearCache('/api/session-isolation')
    globalThis.fetch = originalFetch
  }
})


test('adds a backend refresh flag without losing existing query parameters', () => {
  assert.equal(withRefresh('/api/programs?grade=2025', true), '/api/programs?grade=2025&refresh=true')
  assert.equal(withRefresh('/api/schedule?term=2026-2027-1', false), '/api/schedule?term=2026-2027-1')
  assert.equal(withRefresh('/api/academic/profile', true), '/api/academic/profile?refresh=true')
})
