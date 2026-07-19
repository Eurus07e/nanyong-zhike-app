import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BellRing,
  BookmarkPlus,
  Check,
  Landmark,
  LoaderCircle,
  RefreshCw,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api'
import { MEMOS_CHANGED_EVENT } from '../memo-state'
import type { Memo, MemoListResponse, Notice, NoticeDetail, NoticeResponse } from '../types'
import { NjuTabs } from './NjuTabs'
import { FiveEducation } from './FiveEducation'
import { SegmentedControl } from './SegmentedControl'
import { SecondClassroom } from './SecondClassroom'

type ServiceTab = 'notices' | 'links' | 'five' | 'second-class'

const tabs: { id: ServiceTab; label: string }[] = [
  { id: 'notices', label: '重要通知' },
  { id: 'links', label: 'NJU Tabs' },
  { id: 'five', label: '五育系统' },
  { id: 'second-class', label: '第二课堂' },
]

export function CampusServices({ username, onUnauthorized }: { username: string; onUnauthorized: () => void }) {
  const [active, setActive] = useState<ServiceTab>('notices')
  const [notices, setNotices] = useState<NoticeResponse['items']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null)
  const [noticeDetail, setNoticeDetail] = useState<NoticeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [memoStates, setMemoStates] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
  const noticeDialogRef = useRef<HTMLDialogElement>(null)
  const noticeDetailRequestRef = useRef(0)

  async function loadNotices(force = false) {
    setLoading(true)
    setError('')
    try {
      const path = force ? '/api/notices?limit=12&refresh=true' : '/api/notices?limit=12'
      const response = await api.cached<NoticeResponse>(path, { ttl: 10 * 60_000, force })
      setNotices(response.items)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '通知加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadNotices() }, [])
  useEffect(() => () => { noticeDetailRequestRef.current += 1 }, [])

  useEffect(() => {
    async function syncNoticeMemoStates() {
      try {
        const response = await api.get<MemoListResponse>('/api/memos')
        const savedUrls = new Set(response.items.map((memo) => memo.linkUrl).filter(Boolean))
        setMemoStates(Object.fromEntries(
          notices.filter((notice) => savedUrls.has(notice.url)).map((notice) => [notice.id, 'saved' as const]),
        ))
      } catch {
        // The memo action still reports its own error; a background sync can fail silently.
      }
    }
    const sync = () => void syncNoticeMemoStates()
    sync()
    window.addEventListener(MEMOS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(MEMOS_CHANGED_EVENT, sync)
  }, [notices])

  useEffect(() => {
    const dialog = noticeDialogRef.current
    if (!dialog) return
    if (selectedNotice && !dialog.open) dialog.showModal()
    if (!selectedNotice && dialog.open) dialog.close()
  }, [selectedNotice])

  async function openNotice(notice: Notice) {
    const requestId = ++noticeDetailRequestRef.current
    setSelectedNotice(notice)
    setNoticeDetail(null)
    setDetailError('')
    setDetailLoading(true)
    try {
      const detail = await api.cached<NoticeDetail>(`/api/notices/${notice.id}`, { ttl: 30 * 60_000 })
      if (requestId !== noticeDetailRequestRef.current) return
      setNoticeDetail(detail)
    } catch (caught) {
      if (requestId !== noticeDetailRequestRef.current) return
      setDetailError(caught instanceof Error ? caught.message : '通知正文加载失败')
    } finally {
      if (requestId === noticeDetailRequestRef.current) setDetailLoading(false)
    }
  }

  function closeNotice() {
    noticeDetailRequestRef.current += 1
    setSelectedNotice(null)
    setNoticeDetail(null)
    setDetailError('')
    setDetailLoading(false)
  }

  async function addNoticeToMemos(notice: Notice) {
    if (memoStates[notice.id] === 'saving' || memoStates[notice.id] === 'saved') return
    setMemoStates((current) => ({ ...current, [notice.id]: 'saving' }))
    try {
      await api.post<Memo>('/api/memos', {
        content: notice.title,
        linkUrl: notice.url,
        linkLabel: '查看通知原文',
      })
      setMemoStates((current) => ({ ...current, [notice.id]: 'saved' }))
      window.dispatchEvent(new Event(MEMOS_CHANGED_EVENT))
    } catch {
      setMemoStates((current) => ({ ...current, [notice.id]: 'error' }))
    }
  }

  return <div className="page-stack campus-services-page">
    <div className="page-heading campus-services-heading">
      <div><h1>校园服务</h1></div>
      <SegmentedControl
        value={active}
        options={tabs.map((tab) => ({ value: tab.id, label: tab.label }))}
        onChange={setActive}
        label="校园服务模块"
        className="service-tabs"
      />
    </div>

    {active === 'notices' && <section className="service-panel" role="tabpanel">
      <div className="section-title service-panel-title">
        <div><h2>重要通知</h2><p>南京大学本科生院公告通知</p></div>
        <div className="service-panel-actions">
          <a className="icon-button" href="https://jw.nju.edu.cn/main.psp" target="_blank" rel="noreferrer" aria-label="打开本科生院" title="打开本科生院"><Landmark size={18} /></a>
          <button type="button" className="icon-button" onClick={() => void loadNotices(true)} disabled={loading} aria-label="刷新重要通知" title="刷新"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && !notices.length ? <div className="center-loading service-panel-loading"><LoaderCircle className="spin" />正在加载通知</div> : <div className="notice-list">
        {notices.map((notice) => {
          const memoState = memoStates[notice.id]
          return <article key={notice.id}>
            <time>{notice.date}</time>
            <button type="button" className="notice-title-button" onClick={() => void openNotice(notice)}>{notice.title}</button>
            <button
              type="button"
              className={`icon-button notice-memo-button ${memoState === 'saved' ? 'saved' : ''}`}
              onClick={() => void addNoticeToMemos(notice)}
              disabled={memoState === 'saving' || memoState === 'saved'}
              aria-label={memoState === 'saved' ? '已添加到备忘录' : '添加到备忘录'}
              title={memoState === 'saved' ? '已添加到备忘录' : memoState === 'error' ? '添加失败，点击重试' : '添加到备忘录'}
            >
              {memoState === 'saving' ? <LoaderCircle size={17} className="spin" /> : memoState === 'saved' ? <Check size={17} /> : <BookmarkPlus size={17} />}
            </button>
          </article>
        })}
        {!loading && !notices.length && !error && <div className="service-empty"><BellRing size={25} /><strong>暂时没有可显示的通知</strong></div>}
      </div>}
    </section>}

    {active === 'links' && <NjuTabs username={username} />}

    {active === 'five' && <FiveEducation onUnauthorized={onUnauthorized} />}

    {active === 'second-class' && <SecondClassroom onUnauthorized={onUnauthorized} />}

    <dialog
      ref={noticeDialogRef}
      className="notice-modal"
      aria-labelledby="notice-detail-title"
      onCancel={(event) => { event.preventDefault(); closeNotice() }}
      onClose={() => selectedNotice && closeNotice()}
      onMouseDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
        if (outside) closeNotice()
      }}
    >
      <header>
        <div><time>{selectedNotice?.date}</time><h2 id="notice-detail-title">{selectedNotice?.title || '通知详情'}</h2></div>
        <button type="button" className="icon-button" onClick={closeNotice} aria-label="关闭通知详情"><X size={20} /></button>
      </header>
      <div className="notice-detail-body">
        {detailLoading && <div className="center-loading"><LoaderCircle className="spin" />正在读取通知正文</div>}
        {detailError && <div className="error-banner">{detailError}</div>}
        {noticeDetail && <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              const safeHref = resolveNoticeUrl(href, noticeDetail.url)
              return safeHref ? <a href={safeHref} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>
            },
            img: () => null,
          }}
        >{noticeDetail.content}</ReactMarkdown>}
      </div>
      <footer>
        <a className="secondary-button" href={noticeDetail?.url || selectedNotice?.url} target="_blank" rel="noreferrer">查看通知原文<ArrowUpRight size={16} /></a>
      </footer>
    </dialog>
  </div>
}

function resolveNoticeUrl(url: string | undefined, baseUrl: string) {
  if (!url) return ''
  try {
    const resolved = new URL(url, baseUrl)
    if (resolved.protocol === 'https:') return resolved.toString()
    if (resolved.protocol === 'http:' && resolved.hostname.endsWith('.nju.edu.cn')) {
      resolved.protocol = 'https:'
      return resolved.toString()
    }
  } catch {
    return ''
  }
  return ''
}
