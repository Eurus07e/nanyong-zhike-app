import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, query } from './api'
import { Login } from './components/Login'
import { Overview } from './components/Overview'
import { ProgramView } from './components/Program'
import { Reviews } from './components/Reviews'
import { Schedule } from './components/Schedule'
import { About } from './components/About'
import { Shell, type View } from './components/Shell'
import { Planner } from './features/planner/Planner'
import type { AcademicProfile, GradePage, GradeSummary, Program, ProgramCourse, ProgramNode, ScheduleCourse, Session, Term } from './types'
import { selectOwnedProgram } from './utils'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [view, setView] = useState<View>('overview')
  const [visited, setVisited] = useState<Set<View>>(() => new Set(['overview']))
  const handleUnauthorized = useCallback(() => setSession(null), [])
  const handleLogin = useCallback((next: Session) => {
    api.clearCache()
    setVisited(new Set(['overview']))
    setView('overview')
    setSession(next)
  }, [])

  const navigate = useCallback((next: View) => {
    setVisited((current) => new Set(current).add(next))
    setView(next)
    document.querySelector<HTMLElement>('.main-column')?.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  useEffect(() => {
    api.get<Session>('/api/auth/session').then(setSession).catch((error) => {
      if (error instanceof ApiError && error.status === 401) setSession(null)
      else setSession(null)
    })
  }, [])

  useEffect(() => {
    if (!session) return
    void prefetchAcademicData()
  }, [session])

  async function logout() {
    await api.post('/api/auth/logout')
    api.clearCache()
    setSession(null)
  }

  if (session === undefined) return <div className="boot-screen"><div className="brand-mark">雍</div><span>南雍知课</span></div>
  if (!session) return <Login onLogin={handleLogin} />

  return <Shell session={session} active={view} onNavigate={navigate} onLogout={logout}>
    {visited.has('overview') && <section hidden={view !== 'overview'}><Overview session={session} onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('program') && <section hidden={view !== 'program'}><ProgramView session={session} onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('schedule') && <section hidden={view !== 'schedule'}><Schedule onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('planner') && <section hidden={view !== 'planner'}><Planner username={session.username} onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('reviews') && <section hidden={view !== 'reviews'}><Reviews /></section>}
    {visited.has('about') && <section hidden={view !== 'about'}><About /></section>}
  </Shell>
}

async function prefetchAcademicData() {
  try {
    const [, , terms, profile] = await Promise.all([
      api.cached<GradeSummary>('/api/grades/summary'),
      api.cached<GradePage>('/api/grades'),
      api.cached<Term[]>('/api/schedule/terms', { ttl: 30 * 60_000 }),
      api.cached<AcademicProfile>('/api/academic/profile', { ttl: 30 * 60_000 }),
    ])
    const programs = await api.cached<Program[]>(query('/api/programs', { grade: profile.grade }), { ttl: 30 * 60_000 })

    const program = selectOwnedProgram(programs, profile)
    const secondary: Promise<unknown>[] = []
    if (terms[0]) secondary.push(api.cached<{ rows: ScheduleCourse[] }>(query('/api/schedule', { term: terms[0].DM }), { ttl: 2 * 60_000 }))
    if (program) {
      secondary.push(api.cached<Program>(`/api/programs/${encodeURIComponent(program.PYFADM)}`, { ttl: 30 * 60_000 }))
      const nodes = await api.cached<ProgramNode[]>(`/api/programs/${encodeURIComponent(program.PYFADM)}/nodes`, { ttl: 30 * 60_000 })
      for (let index = 0; index < nodes.length; index += 4) {
        const batch = nodes.slice(index, index + 4).filter((node) => node.KZLXDM === '01')
        await Promise.all(batch.map((node) => api.cached<ProgramCourse[]>(`/api/programs/${encodeURIComponent(program.PYFADM)}/nodes/${encodeURIComponent(node.KZH)}/courses`, { ttl: 30 * 60_000 })))
      }
    }
    await Promise.all(secondary)
  } catch {
    // Prefetch is best-effort; the active view still reports actionable errors.
  }
}
