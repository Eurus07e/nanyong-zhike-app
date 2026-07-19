import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, CircleHelp, RefreshCw, Trash2, X } from 'lucide-react'
import { api, ApiError, query, withRefresh } from '../api'
import { courseCreditValue, formatCourseCredit } from '../program-requirements'
import type { ScheduleCourse, Term } from '../types'
import {
  createPlannerId,
  dateLabel,
  loadPlanner,
  movePlannerTask,
  movePlannerTaskDate,
  movePlannerTaskToList,
  savePlanner,
  todayDate,
  updatePlannerTaskTitle,
  type PlannerPlan,
  type PlannerState,
  type PlannerTask,
  weekdayLabel,
} from '../planner-state'

const MAX_COLUMN_TASKS = 9

export function PlannerBoard({ username, onUnauthorized }: { username: string; onUnauthorized: () => void }) {
  const [state, setState] = useState<PlannerState>(() => loadPlanner(username))
  const [windowStart, setWindowStart] = useState(todayDate())
  const [selectedDate, setSelectedDate] = useState(todayDate())
  const [courses, setCourses] = useState<ScheduleCourse[]>([])
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [courseError, setCourseError] = useState('')
  const [composerTitle, setComposerTitle] = useState('')
  const [linkedCourse, setLinkedCourse] = useState<ScheduleCourse | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [editingListName, setEditingListName] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskTitle, setEditingTaskTitle] = useState('')
  const [inlineTarget, setInlineTarget] = useState<{ kind: 'day' | 'list'; id: string } | null>(null)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left')
  const [showHelp, setShowHelp] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ taskId: string; x: number; y: number } | null>(null)
  const [coursePickerPosition, setCoursePickerPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const inlineInputRef = useRef<HTMLInputElement | null>(null)

  const activePlan = state.plans.find((plan) => plan.id === state.activePlanId) || state.plans[0]
  const dates = useMemo(() => Array.from({ length: 5 }, (_, index) => addDays(windowStart, index)), [windowStart])
  const courseQuery = composerTitle.match(/(?:^|\s)#([^\s#]*)$/)?.[1]?.toLocaleLowerCase('zh-CN') || ''
  const showCoursePicker = /(?:^|\s)#[^\s#]*$/.test(composerTitle)
  const matchingCourses = useMemo(() => courses.filter((course) => `${course.KCM || ''} ${course.JXBMC || ''} ${course.KCH || ''}`.toLocaleLowerCase('zh-CN').includes(courseQuery)).slice(0, 8), [courseQuery, courses])

  useEffect(() => savePlanner(username, state), [state, username])
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])
  useLayoutEffect(() => {
    if (!showCoursePicker || !inlineInputRef.current) { setCoursePickerPosition(null); return }
    const updatePosition = () => {
      const rect = inlineInputRef.current?.getBoundingClientRect()
      if (!rect) return
      const margin = 8
      const width = Math.min(310, window.innerWidth - margin * 2)
      const desiredHeight = Math.min(320, 40 + (coursesLoading ? 48 : Math.max(1, matchingCourses.length) * 40))
      const spaceAbove = Math.max(0, rect.top - margin - 5)
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - margin - 5)
      const placeBelow = spaceBelow >= desiredHeight || spaceBelow >= spaceAbove
      const availableHeight = placeBelow ? spaceBelow : spaceAbove
      const maxHeight = Math.max(48, Math.min(desiredHeight, availableHeight))
      const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin))
      const top = placeBelow ? rect.bottom + 5 : Math.max(margin, rect.top - maxHeight - 5)
      setCoursePickerPosition({ top, left, width, maxHeight })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [coursesLoading, inlineTarget, matchingCourses.length, showCoursePicker])
  useEffect(() => {
    setEditingListId(null)
    setInlineTarget(null)
  }, [activePlan?.id])

  const loadCourses = useCallback(async (force = false) => {
    setCoursesLoading(true)
    setCourseError('')
    try {
      const termsPath = '/api/schedule/terms'
      const terms = await api.cached<Term[]>(withRefresh(termsPath, force), { ttl: 30 * 60_000, force })
      if (force) api.setCache(termsPath, terms, 30 * 60_000)
      if (!terms[0]) { setCourses([]); return }
      const basePath = query('/api/schedule', { term: terms[0].DM })
      const path = withRefresh(basePath, force)
      const response = await api.cached<{ rows: ScheduleCourse[] }>(path, { ttl: 2 * 60_000, force })
      if (force) api.setCache(basePath, response, 2 * 60_000)
      const unique = new Map(response.rows.map((course) => [course.KCH || course.JXBID, course]))
      setCourses([...unique.values()])
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      setCourseError(error instanceof Error ? error.message : '课程列表暂时不可用')
    } finally {
      setCoursesLoading(false)
    }
  }, [onUnauthorized])

  useEffect(() => { void loadCourses() }, [loadCourses])

  if (!activePlan) return <div className="planner-panel-loading">正在初始化计划…</div>

  const tasksByDate = (date: string) => activePlan.tasks
    .filter((task) => task.date === date && !task.listId)
    .sort((left, right) => Number(left.status === 'done') - Number(right.status === 'done') || left.createdAt - right.createdAt)
    .slice(0, MAX_COLUMN_TASKS)

  const tasksByList = (listId: string) => activePlan.tasks
    .filter((task) => task.listId === listId)
    .sort((left, right) => Number(left.status === 'done') - Number(right.status === 'done') || left.createdAt - right.createdAt)
    .slice(0, MAX_COLUMN_TASKS)

  function hasTargetCapacity(kind: 'day' | 'list', id: string, movingTaskId?: string) {
    const tasks = activePlan.tasks.filter((task) => kind === 'day'
      ? task.date === id && !task.listId
      : task.listId === id)
    return tasks.some((task) => task.id === movingTaskId) || tasks.length < MAX_COLUMN_TASKS
  }

  function updateActivePlan(update: (plan: PlannerPlan) => PlannerPlan) {
    const now = Date.now()
    setState((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === activePlan.id ? { ...update(plan), updatedAt: now } : plan) }))
  }

  function addTask() {
    const title = composerTitle.replace(/(?:^|\s)#[^\s#]*$/, '').trim()
    if (!inlineTarget) return
    if (!title || !hasTargetCapacity(inlineTarget.kind, inlineTarget.id)) { cancelInlineTask(); return }
    const now = Date.now()
    const targetDate = inlineTarget.kind === 'day' ? inlineTarget.id : selectedDate
    const targetList = inlineTarget.kind === 'list' ? inlineTarget.id : undefined
    updateActivePlan((plan) => ({
      ...plan,
      tasks: [...plan.tasks, {
        id: createPlannerId(),
        title,
        date: targetDate,
        status: 'backlog',
        source: linkedCourse ? 'course' : 'manual',
        courseCode: linkedCourse?.KCH || linkedCourse?.JXBID,
        courseName: linkedCourse?.KCM || linkedCourse?.JXBMC,
        credits: linkedCourse && courseCreditValue(linkedCourse.XF) != null
          ? formatCourseCredit(linkedCourse.XF)
          : undefined,
        listId: targetList,
        tags: linkedCourse ? ['课程'] : [],
        createdAt: now,
        updatedAt: now,
      }],
    }))
    setComposerTitle('')
    setLinkedCourse(null)
    setInlineTarget(null)
  }

  function startInlineTask(kind: 'day' | 'list', id: string) {
    if (!hasTargetCapacity(kind, id)) return
    setInlineTarget({ kind, id })
    setComposerTitle('')
    setLinkedCourse(null)
    if (kind === 'day') setSelectedDate(id)
  }

  function cancelInlineTask() {
    setInlineTarget(null)
    setComposerTitle('')
    setLinkedCourse(null)
  }

  function selectCourse(course: ScheduleCourse) {
    setLinkedCourse(course)
    setComposerTitle((current) => current.replace(/(?:^|\s)#[^\s#]*$/, '').trimEnd())
  }

  function toggleTask(task: PlannerTask) {
    setState((current) => movePlannerTask(current, task.id, task.status === 'done' ? 'backlog' : 'done'))
  }

  function moveTaskToDate(taskId: string, date: string) {
    if (!hasTargetCapacity('day', date, taskId)) { setDraggedTaskId(null); return }
    setState((current) => movePlannerTaskDate(current, taskId, date))
    setDraggedTaskId(null)
  }

  function moveTaskIntoList(taskId: string, listId: string) {
    if (!hasTargetCapacity('list', listId, taskId)) { setDraggedTaskId(null); return }
    setState((current) => movePlannerTaskToList(current, taskId, listId))
    setDraggedTaskId(null)
  }

  function beginTaskEdit(task: PlannerTask) {
    setEditingTaskId(task.id)
    setEditingTaskTitle(task.title)
  }

  function finishTaskEdit() {
    if (!editingTaskId) return
    setState((current) => updatePlannerTaskTitle(current, editingTaskId, editingTaskTitle))
    setEditingTaskId(null)
    setEditingTaskTitle('')
  }

  function openTaskMenu(event: ReactMouseEvent<HTMLElement>, taskId: string) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({
      taskId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 148)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 52)),
    })
  }

  function deleteTask(taskId: string) {
    setState((current) => updatePlannerTaskTitle(current, taskId, ''))
    if (editingTaskId === taskId) {
      setEditingTaskId(null)
      setEditingTaskTitle('')
    }
    setContextMenu(null)
  }

  function startRename(list: { id: string; name: string }) {
    setEditingListId(list.id)
    setEditingListName(list.name)
  }

  function finishRename() {
    if (editingListId && editingListName.trim()) setState((current) => {
      const now = Date.now()
      return { ...current, plans: current.plans.map((plan) => plan.id === activePlan.id ? { ...plan, lists: plan.lists.map((list) => list.id === editingListId ? { ...list, name: editingListName.trim(), updatedAt: now } : list), updatedAt: now } : plan) }
    })
    setEditingListId(null)
    setEditingListName('')
  }

  function shiftWeek(direction: number) {
    setSlideDirection(direction > 0 ? 'left' : 'right')
    setWindowStart((current) => addDays(current, direction))
  }

  async function refreshCourses() {
    setRefreshing(true)
    try { await loadCourses(true) } finally { setRefreshing(false) }
  }

  function renderInlineEditor(kind: 'day' | 'list', id: string) {
    if (!inlineTarget || inlineTarget.kind !== kind || inlineTarget.id !== id) return null
    return <form className="planner-inline-editor" onSubmit={(event) => { event.preventDefault(); addTask() }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) addTask() }}>
      <input ref={inlineInputRef} autoFocus value={composerTitle} onChange={(event) => setComposerTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancelInlineTask() }} placeholder="输入任务，键入 # 选择课程" aria-label="输入任务" />
      {linkedCourse && <span className="planner-linked-course">#{linkedCourse.KCM || linkedCourse.JXBMC || linkedCourse.KCH}<button type="button" onClick={() => setLinkedCourse(null)} aria-label="移除课程"><X size={12} /></button></span>}
      {showCoursePicker && coursePickerPosition && typeof document !== 'undefined' && createPortal(<div className="planner-course-picker" style={coursePickerPosition} role="listbox" aria-label="课程列表" onMouseDown={(event) => event.preventDefault()}>
        <header><strong>选择课程</strong><button type="button" className="icon-button" onClick={() => setComposerTitle((current) => current.replace(/(?:^|\s)#[^\s#]*$/, '').trimEnd())} aria-label="关闭课程列表"><X size={15} /></button></header>
        {coursesLoading ? <p><RefreshCw size={14} className="spin" />正在读取课程</p> : matchingCourses.map((course) => <button type="button" role="option" key={course.KCH || course.JXBID} onClick={() => selectCourse(course)}><span>{course.KCM || course.JXBMC || course.KCH}</span><small>{course.KCH || course.JXBID}{courseCreditValue(course.XF) != null ? ` · ${formatCourseCredit(course.XF)} 学分` : ''}</small></button>)}
        {!coursesLoading && matchingCourses.length === 0 && <p>没有匹配的课程</p>}
      </div>, document.body)}
    </form>
  }

  return <div className="page-stack planner-board-page planner-weektodo-page">
    <header className="page-heading planner-board-heading">
      <div><h1>我的计划</h1></div>
      <div className="planner-heading-actions">
        <button type="button" className="icon-button planner-week-nav" onClick={() => shiftWeek(-1)} aria-label="向前移动一天" title="向前移动一天"><ArrowLeft size={19} /></button>
        <button type="button" className="icon-button planner-week-nav" onClick={() => shiftWeek(1)} aria-label="向后移动一天" title="向后移动一天"><ArrowRight size={19} /></button>
        <button type="button" className="icon-button planner-help-button" onClick={() => setShowHelp(true)} aria-label="查看使用说明" title="查看使用说明"><CircleHelp size={20} /></button>
      </div>
    </header>

    <section className="planner-week-canvas" aria-label="本周计划">
      <div className={`planner-week-grid slide-${slideDirection}`} key={windowStart}>
        {dates.map((date) => <section className="planner-day-column" key={date} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedTaskId) moveTaskToDate(draggedTaskId, date) }}>
          <button type="button" className="planner-day-heading" onClick={() => setSelectedDate(date)}><span>{weekdayLabel(date)}</span><strong>{dayLabel(date)}</strong><small>{tasksByDate(date).length || ''}</small></button>
          <div className="planner-day-tasks">
            {tasksByDate(date).map((task) => <PlannerTaskRow key={task.id} task={task} editing={editingTaskId === task.id} dragging={draggedTaskId === task.id} editingTitle={editingTaskTitle} onDragStart={() => setDraggedTaskId(task.id)} onDragEnd={() => setDraggedTaskId(null)} onToggle={() => toggleTask(task)} onEdit={() => beginTaskEdit(task)} onContextMenu={(event) => openTaskMenu(event, task.id)} onEditTitleChange={setEditingTaskTitle} onEditCommit={finishTaskEdit} />)}
            {renderInlineEditor('day', date)}
            {tasksByDate(date).length < MAX_COLUMN_TASKS && (!inlineTarget || inlineTarget.kind !== 'day' || inlineTarget.id !== date) && <button type="button" className="planner-day-empty" onClick={() => startInlineTask('day', date)} aria-label={`在${dateLabel(date)}添加任务`} />}
          </div>
        </section>)}
      </div>
    </section>
    {courseError && <p className="planner-course-note">{courseError}。仍可直接添加不关联课程的任务。<button type="button" onClick={() => void refreshCourses()}><RefreshCw size={13} className={refreshing ? 'spin' : ''} />重试</button></p>}

    <section className="planner-custom-lists">
      <div className="planner-list-grid">
        {activePlan.lists.map((list) => <section className="planner-day-column planner-custom-list" key={list.id} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedTaskId) moveTaskIntoList(draggedTaskId, list.id) }}>
          {editingListId === list.id ? <div className="planner-day-heading planner-list-name-editor"><input autoFocus value={editingListName} onChange={(event) => setEditingListName(event.target.value)} onBlur={finishRename} onKeyDown={(event) => { if (event.key === 'Enter') finishRename(); if (event.key === 'Escape') setEditingListId(null) }} aria-label="编辑列表名称" /></div> : <button type="button" className="planner-day-heading planner-list-heading" onClick={() => startRename(list)} title={`${list.name} · 单击修改名称`}><strong>{list.name}</strong><small>{tasksByList(list.id).length || ''}</small></button>}
          <div className="planner-day-tasks planner-custom-list-tasks">{tasksByList(list.id).map((task) => <PlannerTaskRow key={task.id} task={task} editing={editingTaskId === task.id} dragging={draggedTaskId === task.id} editingTitle={editingTaskTitle} onDragStart={() => setDraggedTaskId(task.id)} onDragEnd={() => setDraggedTaskId(null)} onToggle={() => toggleTask(task)} onEdit={() => beginTaskEdit(task)} onContextMenu={(event) => openTaskMenu(event, task.id)} onEditTitleChange={setEditingTaskTitle} onEditCommit={finishTaskEdit} />)}{renderInlineEditor('list', list.id)}{tasksByList(list.id).length < MAX_COLUMN_TASKS && (!inlineTarget || inlineTarget.kind !== 'list' || inlineTarget.id !== list.id) && <button type="button" className="planner-custom-list-empty" onClick={() => startInlineTask('list', list.id)} aria-label={`在${list.name}添加任务`} />}</div>
        </section>)}
      </div>
    </section>

    {contextMenu && <div className="planner-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onClick={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" onClick={() => deleteTask(contextMenu.taskId)}><Trash2 size={15} />删除日程</button>
    </div>}

    {showHelp && <div className="planner-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHelp(false) }}>
      <section className="planner-help-modal" role="dialog" aria-modal="true" aria-labelledby="planner-help-title">
        <header>
          <h2 id="planner-help-title">使用说明</h2>
          <button type="button" className="icon-button" onClick={() => setShowHelp(false)} aria-label="关闭使用说明"><X size={19} /></button>
        </header>
        <div className="planner-help-body">
          <ol>
            <li><strong>关联课程</strong><span>输入任务时键入 #，从当前课程列表中选择课程，课程会作为任务属性保存。</span></li>
            <li><strong>完成状态</strong><span>单击任务左侧圆点切换未完成与已完成状态，单击任务其他位置不会改变完成状态。</span></li>
            <li><strong>编辑与删除</strong><span>单击任务内容进入原位编辑；清空全部文字并确认即可删除。右键任务还可打开快捷菜单，直接选择“删除日程”。</span></li>
            <li><strong>移动任务</strong><span>拖动任务到其他日期或自定义列表即可移动；日期列与自定义列表中的任务相互独立。</span></li>
            <li><strong>容量限制</strong><span>每列最多 9 项任务。列满后不能继续添加或拖入，删除已有任务后会重新开放输入。</span></li>
            <li><strong>自定义列表</strong><span>单击列表名称即可修改，按 Enter 或单击其他位置保存。</span></li>
          </ol>
        </div>
        <footer><button type="button" className="primary-button" onClick={() => setShowHelp(false)}>知道了</button></footer>
      </section>
    </div>}
  </div>
}

function addDays(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

function dayLabel(value: string) {
  return value === todayDate() ? '今天' : dateLabel(value)
}

function PlannerTaskRow({ task, editing, dragging, editingTitle, onDragStart, onDragEnd, onToggle, onEdit, onContextMenu, onEditTitleChange, onEditCommit }: { task: PlannerTask; editing: boolean; dragging: boolean; editingTitle: string; onDragStart: () => void; onDragEnd: () => void; onToggle: () => void; onEdit: () => void; onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void; onEditTitleChange: (value: string) => void; onEditCommit: () => void }) {
  return <article className={`planner-week-task ${task.status === 'done' ? 'done' : ''}${dragging ? ' dragging' : ''}`} draggable={!editing} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => { if (!editing) onEdit() }} onContextMenu={onContextMenu} onKeyDown={(event) => { if (!editing && (event.key === 'Enter' || event.key === ' ')) onEdit() }} role="button" tabIndex={0} aria-label={`编辑任务：${task.title}`}>
    <button type="button" className="planner-task-check" onClick={(event) => { event.stopPropagation(); onToggle() }} aria-label={task.status === 'done' ? `标记${task.title}为未完成` : `标记${task.title}为已完成`}><span /></button>
    <div className="planner-week-task-copy" title={task.title}>{editing ? <input autoFocus value={editingTitle} onClick={(event) => event.stopPropagation()} onChange={(event) => onEditTitleChange(event.target.value)} onBlur={onEditCommit} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') onEditCommit() }} aria-label="编辑任务名称" /> : <><strong>{task.title}</strong>{task.courseName && <small>#{task.courseName}</small>}</>}</div>
  </article>
}
