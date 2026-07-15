import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Globe2, Plus, RotateCcw, Trash2, X } from 'lucide-react'

type Site = {
  id: string
  name: string
  url: string
  custom?: boolean
}

type StoredSites = {
  hiddenDefaultIds: string[]
  customSites: Site[]
}

const DEFAULT_SITES: Site[] = [
  { id: 'undergraduate', name: '本科生院', url: 'https://jw.nju.edu.cn/main.psp' },
  { id: 'academic-affairs', name: '教务管理', url: 'https://ehallapp.nju.edu.cn/jwapp/sys/xsglsynju/portal/index.do' },
  { id: 'course-selection', name: '选课', url: 'https://xk.nju.edu.cn/' },
  { id: 'it-guide', name: '信息化中心', url: 'https://guide.nju.edu.cn/faq/mainm.htm' },
  { id: 'ehall', name: 'eHall', url: 'https://ehall.nju.edu.cn/ywtb-portal/official/index.html#/home/official_home' },
  { id: 'auth', name: '统一身份认证', url: 'https://authserver.nju.edu.cn/' },
  { id: 'five-education', name: '五育系统', url: 'https://ndwy.nju.edu.cn/dztml/#/' },
  { id: 'second-class', name: '第二课堂', url: 'https://youth.nju.edu.cn/tw/#/' },
  { id: 'mail', name: '南大邮箱', url: 'https://mail.smail.nju.edu.cn/' },
  { id: 'hospital', name: '南大医院', url: 'https://ndyy.nju.edu.cn/zzfw/' },
  { id: 'library', name: '南大图书馆', url: 'https://lib.nju.edu.cn/#Page1' },
  { id: 'nanna', name: '南哪助手', url: 'https://www.yuque.com/greatnju' },
  { id: 'chaoxing', name: '南大学习通', url: 'https://nju.fanya.chaoxing.com/portal' },
  { id: 'welearn', name: 'WE Learn', url: 'https://welearn.sflep.com/' },
  { id: 'languages', name: '外语部', url: 'https://dafls.nju.edu.cn/main.psp' },
  { id: 'sports', name: '体育部', url: 'https://ggtypt.nju.edu.cn/ggtypt/home' },
]

export function NjuTabs({ username }: { username: string }) {
  const storageKey = `nanyong-nju-tabs:${username}`
  const [stored, setStored] = useState<StoredSites>(() => loadStoredSites(storageKey))
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  const sites = [
    ...DEFAULT_SITES.filter((site) => !stored.hiddenDefaultIds.includes(site.id)),
    ...stored.customSites,
  ]

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(stored))
  }, [storageKey, stored])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (showAdd && !dialog.open) dialog.showModal()
    if (!showAdd && dialog.open) dialog.close()
  }, [showAdd])

  function closeAdd() {
    setShowAdd(false)
    setName('')
    setUrl('')
    setError('')
  }

  function addSite() {
    const cleanName = name.trim()
    const cleanUrl = normalizeSiteUrl(url)
    if (!cleanName) {
      setError('请输入网站名称')
      return
    }
    if (!cleanUrl) {
      setError('请输入有效的 HTTPS 网站地址')
      return
    }
    if (sites.some((site) => site.url === cleanUrl)) {
      setError('该网站已经在 NJU Tabs 中')
      return
    }
    const id = `custom-${globalThis.crypto?.randomUUID?.() || Date.now()}`
    setStored((current) => ({
      ...current,
      customSites: [...current.customSites, { id, name: cleanName.slice(0, 40), url: cleanUrl, custom: true }],
    }))
    closeAdd()
  }

  function removeSite(site: Site) {
    setStored((current) => site.custom
      ? { ...current, customSites: current.customSites.filter((item) => item.id !== site.id) }
      : { ...current, hiddenDefaultIds: [...new Set([...current.hiddenDefaultIds, site.id])] })
  }

  function restoreDefaults() {
    setStored((current) => ({ ...current, hiddenDefaultIds: [] }))
  }

  return <section className="service-panel nju-tabs-panel" role="tabpanel">
    <div className="section-title service-panel-title">
      <div><h2>NJU Tabs</h2><p>常用南京大学网站与个人快捷入口</p></div>
      <div className="service-panel-actions">
        {stored.hiddenDefaultIds.length > 0 && <button type="button" className="icon-button" onClick={restoreDefaults} aria-label="恢复默认网站" title="恢复默认网站"><RotateCcw size={17} /></button>}
        <button type="button" className="secondary-button" onClick={() => setShowAdd(true)}><Plus size={17} />添加网站</button>
      </div>
    </div>

    <div className="nju-site-list">
      {sites.map((site) => <article key={site.id}>
        <span className="nju-site-icon"><Globe2 size={20} /></span>
        <a href={site.url} target="_blank" rel="noreferrer">
          <strong>{site.name}</strong><small>{new URL(site.url).hostname}</small>
        </a>
        <span className="nju-site-kind">{site.custom ? '自定义' : '默认'}</span>
        <a className="icon-button" href={site.url} target="_blank" rel="noreferrer" aria-label={`打开${site.name}`} title="打开网站"><ArrowUpRight size={17} /></a>
        <button type="button" className="icon-button danger" onClick={() => removeSite(site)} aria-label={`删除${site.name}`} title="删除网站"><Trash2 size={17} /></button>
      </article>)}
      {!sites.length && <div className="service-empty"><Globe2 size={25} /><strong>还没有网站</strong><span>添加一个常用入口，或恢复默认网站。</span></div>}
    </div>

    <dialog
      ref={dialogRef}
      className="nju-site-modal"
      aria-labelledby="nju-site-modal-title"
      onCancel={(event) => { event.preventDefault(); closeAdd() }}
      onClose={() => showAdd && closeAdd()}
      onMouseDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
        if (outside) closeAdd()
      }}
    >
      <header><div><h2 id="nju-site-modal-title">添加网站</h2><p>保存为当前账号的本地快捷入口</p></div><button type="button" className="icon-button" onClick={closeAdd} aria-label="关闭添加网站"><X size={20} /></button></header>
      <form onSubmit={(event) => { event.preventDefault(); addSite() }}>
        <label><span>网站名称</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="例如：我的课程平台" autoFocus /></label>
        <label><span>网站地址</span><input value={url} onChange={(event) => setUrl(event.target.value)} maxLength={2048} placeholder="https://example.nju.edu.cn" inputMode="url" /></label>
        {error && <div className="error-banner">{error}</div>}
        <footer><button type="button" className="secondary-button" onClick={closeAdd}>取消</button><button type="submit" className="primary-button"><Plus size={16} />添加</button></footer>
      </form>
    </dialog>
  </section>
}

function loadStoredSites(storageKey: string): StoredSites {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as Partial<StoredSites>
    const hiddenDefaultIds = Array.isArray(parsed.hiddenDefaultIds)
      ? parsed.hiddenDefaultIds.filter((id): id is string => typeof id === 'string')
      : []
    const customSites = Array.isArray(parsed.customSites)
      ? parsed.customSites.flatMap((site) => {
        const cleanUrl = normalizeSiteUrl(site?.url)
        return typeof site?.id === 'string' && typeof site?.name === 'string' && cleanUrl
          ? [{ id: site.id, name: site.name.slice(0, 40), url: cleanUrl, custom: true }]
          : []
      })
      : []
    return { hiddenDefaultIds, customSites }
  } catch {
    return { hiddenDefaultIds: [], customSites: [] }
  }
}

function normalizeSiteUrl(rawUrl: unknown) {
  if (typeof rawUrl !== 'string') return ''
  try {
    const parsed = new URL(rawUrl.trim())
    if (parsed.protocol !== 'https:' || !parsed.hostname) return ''
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return ''
  }
}
