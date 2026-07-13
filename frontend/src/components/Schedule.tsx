import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, MapPin, RefreshCw, UserRound, X } from 'lucide-react'
import { api, ApiError, query } from '../api'
import type { ScheduleCourse, Term } from '../types'
import { courseDisplayName, parseSchedule, periods, type ScheduleSlot, weekdays } from '../utils'
import { LoadingLines } from './Overview'

const colors = ['violet', 'teal', 'orange', 'blue', 'rose', 'green']
type CourseSelection = { course: ScheduleCourse; slot?: ScheduleSlot }

export function Schedule({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [terms, setTerms] = useState<Term[]>([])
  const [term, setTerm] = useState('')
  const [courses, setCourses] = useState<ScheduleCourse[]>([])
  const [selected, setSelected] = useState<CourseSelection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.cached<Term[]>('/api/schedule/terms', { ttl: 30 * 60_000 }).then((items) => {
      setTerms(items)
      setTerm((current) => current || items[0]?.DM || '')
    }).catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
      setError(caught instanceof Error ? caught.message : '学期加载失败')
      setLoading(false)
    })
  }, [onUnauthorized])

  const loadSchedule = useCallback(async (force = false) => {
    if (!term) return
    setLoading(true)
    setError('')
    try {
      const data = await api.cached<{ rows: ScheduleCourse[] }>(query('/api/schedule', { term }), { ttl: 2 * 60_000, force })
      setCourses(data.rows || [])
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
      setError(caught instanceof Error ? caught.message : '课表加载失败')
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized, term])

  useEffect(() => { void loadSchedule() }, [loadSchedule])

  const slots = useMemo(() => parseSchedule(courses), [courses])
  const totalCredits = useMemo(() => courses.reduce((sum, course) => sum + Number(course.XF || 0), 0), [courses])
  const courseColor = useMemo(() => new Map(courses.map((course, index) => [course.JXBID, colors[index % colors.length]])), [courses])

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><h1>我的课表</h1></div>
        <div className="heading-actions">
          <select value={term} onChange={(event) => setTerm(event.target.value)} aria-label="选择学期">
            {terms.map((item) => <option value={item.DM} key={item.DM}>{item.MC}</option>)}
          </select>
          <button className="icon-button bordered" onClick={() => void loadSchedule(true)} title="刷新课表" aria-label="刷新课表"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <section className="schedule-summary">
        <div><CalendarDays size={18} /><span>本学期课程数</span><strong>{courses.length}</strong></div>
        <div><span>本学期修读学分数</span><strong>{formatCredits(totalCredits)}</strong></div>
      </section>
      <section className="timetable-wrap" aria-busy={loading}>
        {loading && !courses.length ? <LoadingLines count={7} /> : (
          <div className="timetable">
            <div className="timetable-corner">节次</div>
            {weekdays.map((day) => <div className="day-heading" key={day}>{day}</div>)}
            {periods.flatMap((period) => [
              <div className="period-heading" key={`p-${period.key}`}><strong>{period.label}</strong><span>{period.time}</span></div>,
              ...weekdays.map((day) => {
                const current = slots.filter((slot) => slot.day === day && slot.period === period.key)
                return <div className="timetable-cell" data-course-count={current.length} key={`${day}-${period.key}`}>
                  {current.map((slot) => (
                    <button type="button" className={`course-block ${courseColor.get(slot.course.JXBID)}`} onClick={() => setSelected({ course: slot.course, slot })} key={`${slot.course.JXBID}-${slot.raw}`}>
                      <strong>{courseDisplayName(slot.course)}</strong>
                      <small>{slot.course.JXBMC}</small>
                      <span><UserRound size={12} />{slot.course.SKJS || '教师待定'}</span>
                      <span><MapPin size={12} />{slot.room}</span>
                      <span className="course-meta">{slot.course.XF || '—'} 学分 · {courseType(slot.course)}</span>
                    </button>
                  ))}
                </div>
              }),
            ])}
          </div>
        )}
      </section>
      {selected && <CourseDetail selection={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function CourseDetail({ selection, onClose }: { selection: CourseSelection; onClose: () => void }) {
  const { course, slot } = selection
  const arrangements = parseSchedule([course])
  const facts = [
    ['教学班', course.JXBMC || '—'],
    ['课程号', course.KCH || '—'],
    ['学分', `${course.XF || '—'} 学分`],
    ['课程类型', courseType(course)],
    ['选课方式', course.XKLY_DISPLAY || '—'],
    ['授课教师', course.SKJS || '教师待定'],
    ['开课单位', course.PKDWDM_DISPLAY || '—'],
    ['时间安排', arrangements.length ? `${arrangements.length} 个上课时段` : (slot ? '1 个上课时段' : '未排定')],
    ['当前教室', slot?.room || arrangements[0]?.room || '—'],
  ]
  return <div className="modal-backdrop" role="presentation" onKeyDown={(event) => event.key === 'Escape' && onClose()} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="course-modal" role="dialog" aria-modal="true" aria-labelledby="course-detail-title">
      <header><div><h2 id="course-detail-title">{courseDisplayName(course)}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭课程详情" autoFocus><X size={20} /></button></header>
      <div className="course-facts">{facts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="course-schedule-detail"><span>完整上课安排</span>
        {arrangements.length ? <div className="arrangement-list">{arrangements.map((item, index) => {
          const label = periods.find((period) => period.key === item.period)?.label || item.period
          return <div key={`${item.raw}-${index}`}><strong>{item.day} {label} 节</strong><span>{item.weeks}</span><small>{item.room}</small></div>
        })}</div> : <p>{course.ZCXQJCDD || slot?.raw || '暂未排定具体时间与教室'}</p>}
      </div>
      <footer><button type="button" className="secondary-button" onClick={onClose}>关闭</button></footer>
    </section>
  </div>
}

function formatCredits(value: number) {
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function courseType(course: ScheduleCourse) {
  return course.KCFLDM_DISPLAY || course.KCFL1_DISPLAY || '课程类别待定'
}
