import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, query } from './api'
import { Login } from './components/Login'
import { Overview } from './components/Overview'
import { ProgramView } from './components/Program'
import { Reviews } from './components/Reviews'
import { Schedule } from './components/Schedule'
import { About } from './components/About'
import { Memos } from './components/Memos'
import { PlannerBoard } from './components/PlannerBoard'
import { AiAssistant } from './components/AiAssistant'
import { CampusServices } from './components/CampusServices'
import { Shell, type View } from './components/Shell'
import type { AcademicOverview, AcademicProfile, FiveEducationActivities, FiveEducationOverview, Health, Program, ProgramCourse, ProgramNode, ScheduleCourse, SecondClassroomProfile, Session, Term } from './types'
import { selectOwnedProgram } from './utils'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [deployment, setDeployment] = useState('')
  const [stopping, setStopping] = useState(false)
  const [view, setView] = useState<View>('overview')
  const [visited, setVisited] = useState<Set<View>>(() => new Set(['overview']))
  const handleUnauthorized = useCallback(() => setSession(null), [])
  const handleLogin = useCallback((next: Session) => {
    api.clearCache()
    setVisited(new Set(['overview']))
    setView('overview')
    void hydrateSession(next, setSession)
  }, [])

  const navigate = useCallback((next: View) => {
    setVisited((current) => new Set(current).add(next))
    setView(next)
    document.querySelector<HTMLElement>('.main-column')?.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  useEffect(() => {
    api.get<Health>('/api/health').then((health) => setDeployment(health.deployment)).catch(() => undefined)
    api.get<Session>('/api/auth/session').then((next) => hydrateSession(next, setSession)).catch((error) => {
      if (error instanceof ApiError && error.status === 401) setSession(null)
      else setSession(null)
    })
  }, [])

  useEffect(() => {
    if (!session) return
    void prefetchAcademicData()
    void prefetchCampusData()
  }, [session])

  async function logout() {
    await api.post('/api/auth/logout')
    api.clearCache()
    setSession(null)
  }

  async function quitDesktop() {
    setStopping(true)
    try {
      await api.post('/api/desktop/quit')
    } catch {
      setStopping(false)
      throw new Error('退出本地应用失败')
    }
  }

  if (stopping) return <div className="boot-screen"><div className="brand-mark">雍</div><span>南雍知课已退出，可以关闭此页面</span></div>
  if (session === undefined) return <div className="boot-screen"><div className="brand-mark">雍</div><span>南雍知课</span></div>
  if (!session) return <Login onLogin={handleLogin} onQuit={deployment === 'desktop' ? quitDesktop : undefined} />

  return <Shell session={session} active={view} onNavigate={navigate} onLogout={logout} onQuit={deployment === 'desktop' ? quitDesktop : undefined}>
    {visited.has('overview') && <section hidden={view !== 'overview'}><Overview session={session} onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('program') && <section hidden={view !== 'program'}><ProgramView session={session} onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('schedule') && <section hidden={view !== 'schedule'}><Schedule onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('reviews') && <section hidden={view !== 'reviews'}><Reviews /></section>}
    {visited.has('campus') && <section hidden={view !== 'campus'}><CampusServices username={session.username} onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('planner') && <section hidden={view !== 'planner'}><PlannerBoard username={session.username} onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('memos') && <section hidden={view !== 'memos'}><Memos onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('ai') && <section hidden={view !== 'ai'}><AiAssistant onUnauthorized={handleUnauthorized} /></section>}
    {visited.has('about') && <section hidden={view !== 'about'}><About /></section>}
  </Shell>
}

async function hydrateSession(next: Session, apply: (session: Session) => void) {
  try {
    const bootstrap = await api.get<{ entries: Record<string, { value: unknown; updatedAt: number }> }>('/api/bootstrap')
    api.seedCache(bootstrap.entries)
  } catch {
    // Cached bootstrap is an optimization; live endpoints remain available.
  }
  apply(next)
}

async function prefetchAcademicData() {
  try {
    const [, terms, profile] = await Promise.all([
      api.cached<AcademicOverview>('/api/academic/overview'),
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

async function prefetchCampusData() {
  const ttl = 5 * 60_000
  const [overview, activities, secondClassroom] = await Promise.allSettled([
    api.cached<FiveEducationOverview>('/api/five-education/overview?refresh=true', { ttl }),
    api.cached<FiveEducationActivities>('/api/five-education/activities?refresh=true', { ttl }),
    api.cached<SecondClassroomProfile>('/api/second-classroom/profile?refresh=true', { ttl }),
  ])
  if (overview.status === 'fulfilled') api.setCache('/api/five-education/overview', overview.value, ttl)
  if (activities.status === 'fulfilled') api.setCache('/api/five-education/activities', activities.value, ttl)
  if (secondClassroom.status === 'fulfilled') api.setCache('/api/second-classroom/profile', secondClassroom.value, ttl)
}
