import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { BookOpenText, Search, SlidersHorizontal, UserRoundSearch } from 'lucide-react'
import { api, query } from '../api'
import type { ReviewResponse } from '../types'

type Field = 'all' | 'course' | 'teacher'

const searchCopy: Record<Field, { placeholder: string; rule: string }> = {
  all: {
    placeholder: '输入课程名称或教师姓名',
    rule: '输入课程名称或教师姓名可模糊查找；使用“课程名 + 教师名”可组合筛选。',
  },
  course: {
    placeholder: '输入课程名称',
    rule: '输入课程名称可模糊查找。',
  },
  teacher: {
    placeholder: '输入教师姓名',
    rule: '输入教师姓名可模糊查找。',
  },
}

export function Reviews() {
  const [text, setText] = useState('')
  const [field, setField] = useState<Field>('all')
  const [result, setResult] = useState<ReviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const requestRef = useRef(0)
  const copy = searchCopy[field]

  const loadPage = useCallback(async (q: string, offset: number, requestId: number) => {
    if (offset === 0) setLoading(true)
    else setLoadingMore(true)
    setError('')
    try {
      const page = await api.get<ReviewResponse>(query('/api/reviews/search', { q, field, limit: '50', offset: String(offset) }))
      if (requestId !== requestRef.current) return
      setResult((current) => offset === 0 || !current
        ? page
        : { ...page, items: [...current.items, ...page.items] })
    } catch (caught) {
      if (requestId !== requestRef.current) return
      setError(caught instanceof Error ? caught.message : '搜索失败')
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [field])

  function search(event?: FormEvent) {
    event?.preventDefault()
    const q = text.trim()
    if (q) {
      const requestId = ++requestRef.current
      setResult(null)
      setLoadingMore(false)
      void loadPage(q, 0, requestId)
    }
  }

  function changeField(next: Field) {
    if (next === field) return
    requestRef.current += 1
    setField(next)
    setResult(null)
    setError('')
    setLoading(false)
    setLoadingMore(false)
  }

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !result || result.items.length >= result.total || loadingMore) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadPage(result.query, result.items.length, requestRef.current)
    }, { rootMargin: '240px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [loadPage, loadingMore, result])

  return (
    <div className="page-stack reviews-page">
      <div className="page-heading">
        <div><h1>课程评价</h1></div>
      </div>
      <section className="review-search-band">
        <div className="segmented segmented-three" role="group" aria-label="搜索范围" data-active-index={field === 'all' ? 0 : field === 'course' ? 1 : 2}>
          <span className="segmented-indicator" aria-hidden="true" />
          <button type="button" aria-pressed={field === 'all'} className={field === 'all' ? 'active' : ''} onClick={() => changeField('all')}><SlidersHorizontal size={15} />全部</button>
          <button type="button" aria-pressed={field === 'course'} className={field === 'course' ? 'active' : ''} onClick={() => changeField('course')}><BookOpenText size={15} />课程</button>
          <button type="button" aria-pressed={field === 'teacher'} className={field === 'teacher' ? 'active' : ''} onClick={() => changeField('teacher')}><UserRoundSearch size={15} />教师</button>
        </div>
        <form className="large-search" onSubmit={search}>
          <Search size={20} />
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder={copy.placeholder} maxLength={80} aria-label={copy.placeholder} />
          <button className="primary-button" disabled={loading || !text.trim()}>{loading ? '搜索中' : '搜索'}</button>
        </form>
        <p className="search-rule">{copy.rule}</p>
      </section>
      {error && <div className="error-banner">{error}</div>}
      <section className="review-results">
        {result && <div className="section-title"><div><h2>“{result.query}” 的结果</h2><p>共查询到 {result.total} 条公开评价</p></div></div>}
        {result?.items.map((item, index) => {
          const review = item.review?.replace(/^\s*关于课程特色\s*[：:]\s*/, '').trim()
          if (!review) return null
          return (
            <article className="review-card" key={`${item.courseName}-${item.teacher}-${index}`}>
              <div className="review-card-heading">
                <div><strong>{item.courseName || '课程名称缺失'}</strong><span>{item.teacher || '教师信息缺失'}</span></div>
                <div>{item.sources.map((source) => <span className="source-tag" key={source}>来源：{source}</span>)}</div>
              </div>
              <p>“{review}”</p>
            </article>
          )
        })}
        {result && !result.items.length && <div className="empty-state"><Search size={30} /><strong>暂时没有匹配结果</strong><span>可以缩短关键词，或切换课程 / 教师搜索范围。</span></div>}
        {result && result.items.length < result.total && <div className="load-more-sentinel" ref={loadMoreRef}>{loadingMore ? '正在加载更多评价' : '继续下拉加载更多'}</div>}
        {!result && <div className="review-intro"><BookOpenText size={32} /><h2>选课之前，先看红黑榜</h2></div>}
      </section>
    </div>
  )
}
