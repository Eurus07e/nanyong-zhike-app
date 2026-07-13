import type { ReactNode } from 'react'
import { BookOpenCheck, CalendarDays, GraduationCap, Info, LoaderCircle, LogOut, Menu, Search, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError, EHALL_STATUS_EVENT } from '../api'
import type { Session } from '../types'

export type View = 'overview' | 'program' | 'schedule' | 'reviews' | 'about'

const navigation = [
  { id: 'overview' as const, label: '学业概览', icon: GraduationCap },
  { id: 'program' as const, label: '培养方案', icon: BookOpenCheck },
  { id: 'schedule' as const, label: '我的课表', icon: CalendarDays },
  { id: 'reviews' as const, label: '课程评价', icon: Search },
  { id: 'about' as const, label: '关于本站', icon: Info },
]

export function Shell({
  session,
  active,
  onNavigate,
  onLogout,
  children,
}: {
  session: Session
  active: View
  onNavigate: (view: View) => void
  onLogout: () => Promise<void>
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [eHallUnavailable, setEHallUnavailable] = useState(() => !navigator.onLine)
  const [logoutPending, setLogoutPending] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  async function handleLogout() {
    if (logoutPending) return
    setLogoutPending(true)
    setLogoutError('')
    try {
      await onLogout()
    } catch (error) {
      setLogoutError(error instanceof ApiError ? error.message : '退出失败，请检查网络后重试')
    } finally {
      setLogoutPending(false)
    }
  }

  useEffect(() => {
    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ connected?: boolean }>).detail
      setEHallUnavailable(detail?.connected === false)
    }
    const handleOffline = () => setEHallUnavailable(true)
    const handleOnline = () => setEHallUnavailable(false)
    window.addEventListener(EHALL_STATUS_EVENT, handleStatus)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener(EHALL_STATUS_EVENT, handleStatus)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} id="primary-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small" aria-hidden="true">雍</div>
          <div><strong>南雍知课</strong><span>选课与学业助手</span></div>
          <button type="button" className="icon-button mobile-close" onClick={() => setOpen(false)} aria-label="关闭菜单">
            <X size={20} />
          </button>
        </div>
        {eHallUnavailable && <div className="sidebar-status" role="status"><span className="status-dot" /> eHall 未连接</div>}
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={active === item.id ? 'active' : ''}
              aria-current={active === item.id ? 'page' : undefined}
              onClick={() => { onNavigate(item.id); setOpen(false) }}
            >
              <item.icon size={19} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-account">
          {logoutError && <p className="sidebar-logout-error" role="alert">{logoutError}</p>}
          <span className="account-avatar" aria-hidden="true"><UserRound size={19} /></span>
          <div><strong>{session.username}</strong><span>统一身份认证已连接</span></div>
          <button type="button" className="icon-button" disabled={logoutPending} onClick={() => void handleLogout()} aria-label="退出登录" title="退出登录">
            {logoutPending ? <LoaderCircle className="spin" size={18} /> : <LogOut size={18} />}
          </button>
        </div>
      </aside>
      {open && <button type="button" className="sidebar-backdrop" aria-label="关闭菜单" onClick={() => setOpen(false)} />}
      <button
        type="button"
        className="icon-button mobile-menu mobile-menu-floating"
        onClick={() => setOpen(true)}
        aria-label="打开菜单"
        aria-controls="primary-sidebar"
        aria-expanded={open}
      >
        <Menu size={21} />
      </button>
      <section className="main-column" id="main-content-scroll">
        <main className="content">{children}</main>
      </section>
    </div>
  )
}
