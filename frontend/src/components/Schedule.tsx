import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, MapPin, RefreshCw, UserRound, X } from 'lucide-react'
import { api, ApiError, query } from '../api'
import type { ScheduleCourse, Term } from '../types'
import { courseDisplayName, layoutScheduleSlots, parseSchedule, periods, type ScheduleSlot, weekdays } from '../utils'
import { LoadingLines } from './Overview'

const colors = ['violet', 'teal', 'orange', 'blue', 'rose', 'green']
type CourseSelection = { course: ScheduleCourse; slot?: ScheduleSlot }

export function Schedule({ onUnauthorized }: { onUnauthorized: () => void }) {
  const cachedTerms = api.peek<Term[]>('/api/schedule/terms') || []
  const initialTerm = cachedTerms[0]?.DM || ''
  const initialSchedulePath = initialTerm ? query('/api/schedule', { term: initialTerm }) : ''
  const [terms, setTerms] = useState<Term[]>(cachedTerms)
  const [term, setTerm] = useState(initialTerm)
  const [courses, setCourses] = useState<ScheduleCourse[]>(() => initialSchedulePath ? api.peek<{ rows: ScheduleCourse[] }>(initialSchedulePath)?.rows || [] : [])
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
      const basePath = query('/api/schedule', { term })
      const hadCache = !force && api.hasCache(basePath)
      const path = force ? query('/api/schedule', { term, refresh: 'true' }) : basePath
      const data = await api.cached<{ rows: ScheduleCourse[] }>(path, { ttl: 2 * 60_000, force })
      setCourses(data.rows || [])
      if (hadCache) {
        const fresh = await api.cached<{ rows: ScheduleCourse[] }>(query('/api/schedule', { term, refresh: 'true' }), { force: true })
        setCourses(fresh.rows || [])
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
      setError(caught instanceof Error ? caught.message : '课表加载失败')
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized, term])

  useEffect(() => { void loadSchedule() }, [loadSchedule])

  const parsed = useMemo(() => parseSchedule(courses), [courses])
  const slots = useMemo(() => layoutScheduleSlots(parsed.slots), [parsed.slots])
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
            <div className="timetable-corner" style={{ gridColumn: 1, gridRow: 1 }}>节次</div>
            {weekdays.map((day, dayIndex) => <div className="day-heading" style={{ gridColumn: dayIndex + 2, gridRow: 1 }} key={day}>{day}</div>)}
            {periods.map((period) => <div className="period-heading" style={{ gridColumn: 1, gridRow: period.key + 1 }} key={`p-${period.key}`}><strong>{period.label}</strong><span>{period.time}</span></div>)}
            {periods.flatMap((period) => weekdays.map((day, dayIndex) => (
              <div className="timetable-cell" style={{ gridColumn: dayIndex + 2, gridRow: period.key + 1 }} key={`${day}-${period.key}`} />
            )))}
            {slots.map((slot) => {
              const dayIndex = weekdays.indexOf(slot.day)
              const laneWidth = 100 / slot.laneCount
              return <button
                type="button"
                className={`course-block ${courseColor.get(slot.course.JXBID)}`}
                style={{
                  gridColumn: dayIndex + 2,
                  gridRow: `${slot.startPeriod + 1} / span ${slot.endPeriod - slot.startPeriod + 1}`,
                  width: `calc(${laneWidth}% - 6px)`,
                  marginLeft: `calc(${slot.lane * laneWidth}% + 3px)`,
                }}
                onClick={() => setSelected({ course: slot.course, slot })}
                title={scheduleSlotTitle(slot)}
                key={scheduleSlotIdentity(slot)}
              >
                <strong>{courseDisplayName(slot.course)}</strong>
                <small>{slot.course.JXBMC}</small>
                <span><UserRound size={12} />{slot.course.SKJS || '教师待定'}</span>
                <span><MapPin size={12} />{slot.room}</span>
                <span className="course-meta">{slot.course.XF || '—'} 学分 · {courseType(slot.course)}</span>
              </button>
            })}
          </div>
        )}
      </section>
      {parsed.unrecognized.length > 0 ? <section className="unrecognized-schedules" aria-label="未识别课程安排">
        <header><h2>未识别课程安排</h2><span>{parsed.unrecognized.length} 门课程</span></header>
        <div className="unrecognized-schedule-list">
          {parsed.unrecognized.map((item) => <button
            type="button"
            className="unrecognized-schedule-row"
            onClick={() => setSelected({ course: item.course })}
            title={`${courseDisplayName(item.course)}\n该课程格式暂未识别\n${item.rawParts.join('；')}`}
            key={courseIdentity(item.course)}
          >
            <span className="unrecognized-course-identity">
              <span>该课程格式暂未识别</span>
              <strong>{courseDisplayName(item.course)}</strong>
              <small>{item.course.JXBMC || '教学班待定'} · 课程号 {item.course.KCH || '—'}</small>
            </span>
            <span className="unrecognized-course-facts">
              <span>教师：{item.course.SKJS || '教师待定'}</span>
              <span>{item.course.XF || '—'} 学分 · {courseType(item.course)}</span>
              <span>开课单位：{item.course.PKDWDM_DISPLAY || '—'}</span>
            </span>
            <span className="unrecognized-course-raw">{item.rawParts.join('；')}</span>
          </button>)}
        </div>
      </section> : null}
      {selected && <CourseDetail selection={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function CourseDetail({ selection, onClose }: { selection: CourseSelection; onClose: () => void }) {
  const { course, slot } = selection
  const courseSchedule = parseSchedule([course])
  const arrangements = courseSchedule.slots
  const failedParts = course.ZCXQJCDD?.trim()
    ? courseSchedule.unrecognized.flatMap((item) => item.rawParts)
    : []
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
        {arrangements.length || failedParts.length ? <div className="arrangement-list">
          {arrangements.map((item) => <div key={scheduleSlotIdentity(item)}><strong>{item.day} {periodRangeLabel(item)}</strong><span>{item.weeks}</span><small>{item.room}</small></div>)}
          {failedParts.map((rawPart) => <div key={`${courseIdentity(course)}-unrecognized-${rawPart}`}><strong>该课程格式暂未识别</strong><span>{rawPart}</span></div>)}
        </div> : <p>{slot?.raw || '暂未排定具体时间与教室'}</p>}
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

function courseIdentity(course: ScheduleCourse) {
  return course.JXBID || `${course.KCH}-${course.JXBMC}`
}

function scheduleSlotIdentity(slot: ScheduleSlot) {
  return [
    courseIdentity(slot.course),
    slot.day,
    slot.startPeriod,
    slot.endPeriod,
    slot.weeks,
    slot.room,
    slot.raw,
  ].join('|')
}

function periodRangeLabel(slot: ScheduleSlot) {
  return slot.startPeriod === slot.endPeriod ? `第${slot.startPeriod}节` : `第${slot.startPeriod}-${slot.endPeriod}节`
}

function scheduleSlotTitle(slot: ScheduleSlot) {
  return [
    courseDisplayName(slot.course),
    `教学班：${slot.course.JXBMC || '教学班待定'}`,
    `课程号：${slot.course.KCH || '—'}`,
    `教师：${slot.course.SKJS || '教师待定'}`,
    `时间：${slot.day} ${periodRangeLabel(slot)} ${slot.weeks}`,
    `地点：${slot.room}`,
    `学分与类别：${slot.course.XF || '—'} 学分 · ${courseType(slot.course)}`,
  ].join('\n')
}
