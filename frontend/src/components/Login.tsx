import { FormEvent, useState } from 'react'
import { Eye, EyeOff, LoaderCircle, Power, ShieldCheck } from 'lucide-react'
import { api } from '../api'
import type { Session } from '../types'

export function Login({ onLogin, onQuit }: { onLogin: (session: Session) => void; onQuit?: () => Promise<void> }) {
  const [photo] = useState(() => `/login-campus-${Math.floor(Math.random() * 4) + 1}.jpg`)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const session = await api.post<Session>('/api/auth/login', { username, password })
      setPassword('')
      onLogin(session)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      {onQuit && <button type="button" className="icon-button desktop-exit-button" onClick={() => void onQuit()} aria-label="退出本地应用" title="退出本地应用"><Power size={18} /></button>}
      <img className="login-photo" src={photo} alt="南京大学校园" fetchPriority="high" />
      <div className="login-shade" aria-hidden="true" />
      <section className="login-content">
        <div className="login-brand">
          <div className="login-brand-lockup">
            <div className="brand-mark login-brand-mark" aria-hidden="true">雍</div>
            <div><h1>南雍知课</h1><p>南京大学一站式选课助手</p></div>
          </div>
        </div>

        <form className="login-panel" onSubmit={submit}>
          <div className="unofficial-badge">学生开发 · 非官方服务</div>
          <div className="panel-heading">
            <div>
              <h2>南京大学统一身份认证登录</h2>
              <p>连接 eHall 以查询你的学业信息</p>
            </div>
          </div>
          <label>
            学号
            <input
              autoComplete="username"
              inputMode="numeric"
              maxLength={32}
              placeholder="请输入南京大学学号"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value.trim())}
            />
          </label>
          <label>
            密码
            <span className="password-field">
              <input
                autoComplete="current-password"
                maxLength={128}
                placeholder="请输入统一身份认证密码"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                title={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button login-button" disabled={loading} type="submit">
            {loading ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
            {loading ? '正在连接统一身份认证' : '安全登录'}
          </button>
          <p className="security-note">
            认证凭据仅用于发起本次南京大学统一身份认证。南雍知课不会将你的密码写入数据库，或用于身份验证以外的用途。
          </p>
        </form>
      </section>
      <a className="photo-credit" href="https://www.nju.edu.cn/" target="_blank" rel="noreferrer">图片来源：南京大学官网</a>
    </main>
  )
}
