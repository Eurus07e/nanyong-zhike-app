import { useEffect, useRef, useState } from 'react'
import { CalendarRange, CheckCircle2, Download, FileUp, ListChecks, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { api, ApiError, query } from '../../api'
import type { ScheduleCourse, Term } from '../../types'
import { createPlan } from './templates'
import { clearPlanner, loadPlanner, parsePlanFile, savePlanner } from './storage'
import type { PlanDocument, PlannerCourse, PlannerEnvelope, PlanResource } from './types'

type PlannerProps = {
  username: string
  onUnauthorized: () => void
}

function dateAfter(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function parseResources(text: string): PlanResource[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 100).map((line) => ({
    id: crypto.randomUUID(),
    label: line,
    ...(line.startsWith('https://') || line.startsWith('http://') ? { url: line } : {}),
  }))
}

function courseFromSchedule(course: ScheduleCourse): PlannerCourse {
  return { id: course.KCH || course.JXBID, name: course.KCM || course.JXBMC, credits: course.XF }
}

export function Planner({ username, onUnauthorized }: PlannerProps) {
  const [envelope, setEnvelope] = useState<PlannerEnvelope>(() => loadPlanner(username))
  const activePlan = envelope.plans.find((plan) => plan.id === envelope.activePlanId) ?? null

  useEffect(() => savePlanner(username, envelope), [envelope, username])

  function replacePlan(plan: PlanDocument) {
    setEnvelope((current) => ({
      ...current,
      plans: current.plans.map((item) => item.id === plan.id ? { ...plan, updatedAt: new Date().toISOString() } : item),
    }))
  }

  function addPlan(plan: PlanDocument) {
    setEnvelope((current) => ({ schemaVersion: 1, plans: [...current.plans, plan], activePlanId: plan.id }))
  }

  function deleteActivePlan() {
    if (!activePlan || !window.confirm(`确定删除“${activePlan.title}”吗？此操作不会删除导出的备份。`)) return
    setEnvelope((current) => {
      const plans = current.plans.filter((plan) => plan.id !== activePlan.id)
      return { schemaVersion: 1, plans, activePlanId: plans[0]?.id ?? null }
    })
  }

  function clearAllPlans() {
    if (!window.confirm('确定清空当前账号在本浏览器中的全部计划吗？')) return
    clearPlanner(username)
    setEnvelope({ schemaVersion: 1, plans: [], activePlanId: null })
  }

  return <div className="page-stack planner-page">
    <header className="page-heading">
      <div><span className="eyebrow">个人学习空间</span><h1>我的计划</h1><p>把课表、目标和资料整理成可以每天执行的个人看板。</p></div>
      {activePlan && <div className="heading-actions planner-heading-actions">
        <select aria-label="切换计划" value={activePlan.id} onChange={(event) => setEnvelope((current) => ({ ...current, activePlanId: event.target.value }))}>
          {envelope.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}
        </select>
        <button className="secondary-button" type="button" onClick={() => setEnvelope((current) => ({ ...current, activePlanId: null }))}><Plus size={16} />新建</button>
      </div>}
    </header>

    <div className="planner-privacy" role="note"><Save size={17} /><span><strong>仅保存在当前浏览器。</strong>计划不会自动上传服务器；清理浏览器数据前请先导出备份。</span></div>

    {activePlan
      ? <PlanDashboard plan={activePlan} replacePlan={replacePlan} addPlan={addPlan} deletePlan={deleteActivePlan} clearAll={clearAllPlans} />
      : <PlannerSetup onCreate={addPlan} onImport={addPlan} onUnauthorized={onUnauthorized} hasPlans={envelope.plans.length > 0} onCancel={() => setEnvelope((current) => ({ ...current, activePlanId: current.plans[0]?.id ?? null }))} />}
  </div>
}

function PlannerSetup({ onCreate, onImport, onUnauthorized, hasPlans, onCancel }: {
  onCreate: (plan: PlanDocument) => void
  onImport: (plan: PlanDocument) => void
  onUnauthorized: () => void
  hasPlans: boolean
  onCancel: () => void
}) {
  const [templateId, setTemplateId] = useState<PlanDocument['templateId']>('semester')
  const [title, setTitle] = useState('本学期学习计划')
  const [goal, setGoal] = useState('稳定推进核心课程，每周完成任务并及时复盘。')
  const [startDate, setStartDate] = useState(dateAfter(0))
  const [endDate, setEndDate] = useState(dateAfter(120))
  const [courses, setCourses] = useState<PlannerCourse[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualCourses, setManualCourses] = useState('')
  const [resources, setResources] = useState('')
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function loadCourses() {
      try {
        const terms = await api.cached<Term[]>('/api/schedule/terms', { ttl: 30 * 60_000 })
        if (!terms[0]) return
        const response = await api.cached<{ rows: ScheduleCourse[] }>(query('/api/schedule', { term: terms[0].DM }), { ttl: 2 * 60_000 })
        const unique = new Map(response.rows.map((course) => [course.KCH || course.JXBID, courseFromSchedule(course)]))
        setCourses([...unique.values()])
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) onUnauthorized()
        else setMessage('未能读取课表，可以在下方手动填写课程。')
      } finally {
        setLoadingCourses(false)
      }
    }
    void loadCourses()
  }, [onUnauthorized])

  function changeTemplate(next: PlanDocument['templateId']) {
    setTemplateId(next)
    if (next === 'cross-major') {
      setTitle('跨专业准入课计划')
      setGoal('按目标院系要求推进核心课程与材料，每周留下可核验的成果。')
    } else {
      setTitle('本学期学习计划')
      setGoal('稳定推进核心课程，每周完成任务并及时复盘。')
    }
  }

  function submit() {
    if (!title.trim() || !goal.trim()) { setMessage('请填写计划名称和目标。'); return }
    if (endDate < startDate) { setMessage('结束日期不能早于开始日期。'); return }
    const manual = manualCourses.split('\n').map((name) => name.trim()).filter(Boolean).slice(0, 60).map((name) => ({ id: crypto.randomUUID(), name }))
    const chosen = courses.filter((course) => selected.has(course.id))
    onCreate(createPlan({ templateId, title, goal, startDate, endDate, courses: [...chosen, ...manual], resources: parseResources(resources) }))
  }

  async function importFile(file?: File) {
    if (!file) return
    try { onImport({ ...parsePlanFile(await file.text()), id: crypto.randomUUID(), updatedAt: new Date().toISOString() }) } catch (error) { setMessage(error instanceof Error ? error.message : '导入失败') }
    if (fileRef.current) fileRef.current.value = ''
  }

  return <div className="planner-setup-grid">
    <section className="planner-card planner-setup-main">
      <div className="section-title"><div><h2>创建个人计划</h2><p>先选一个起点，所有内容之后都可以修改。</p></div></div>
      <div className="planner-template-grid">
        <button type="button" className={templateId === 'semester' ? 'planner-template active' : 'planner-template'} onClick={() => changeTemplate('semester')}><CalendarRange size={22} /><strong>学期稳分</strong><span>课程优先级、每周任务和复盘</span></button>
        <button type="button" className={templateId === 'cross-major' ? 'planner-template active' : 'planner-template'} onClick={() => changeTemplate('cross-major')}><ListChecks size={22} /><strong>跨专业准入课</strong><span>目标课程、材料与多阶段推进</span></button>
      </div>
      <div className="planner-form-grid">
        <label><span>计划名称</span><input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="wide"><span>目标</span><textarea maxLength={1000} rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
        <label><span>开始日期</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label><span>结束日期</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
      </div>
      <div className="planner-fieldset"><strong>从本学期课表选择</strong>{loadingCourses ? <p className="planner-muted">正在读取课表…</p> : courses.length > 0 ? <div className="planner-course-picker">{courses.map((course) => <label key={course.id}><input type="checkbox" checked={selected.has(course.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(course.id)) next.delete(course.id); else next.add(course.id); return next })} /><span>{course.name}<small>{course.id}{course.credits ? ` · ${course.credits} 学分` : ''}</small></span></label>)}</div> : <p className="planner-muted">当前课表没有可选课程。</p>}</div>
      <div className="planner-form-grid">
        <label className="wide"><span>补充课程（每行一门）</span><textarea rows={3} placeholder="例如：数据结构" value={manualCourses} onChange={(event) => setManualCourses(event.target.value)} /></label>
        <label className="wide"><span>资料或链接（每行一项）</span><textarea rows={4} placeholder={'教材章节\nhttps://example.com/resource'} value={resources} onChange={(event) => setResources(event.target.value)} /></label>
      </div>
      {message && <p className="planner-message" role="alert">{message}</p>}
      <div className="planner-actions"><button className="primary-button" type="button" onClick={submit}>生成我的看板</button>{hasPlans && <button className="secondary-button" type="button" onClick={onCancel}>取消</button>}</div>
    </section>
    <aside className="planner-card planner-import-card"><FileUp size={24} /><h2>恢复已有计划</h2><p>只支持南雍知课导出的 JSON，导入前会校验格式和安全链接。</p><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /><button className="secondary-button" type="button" onClick={() => fileRef.current?.click()}><FileUp size={16} />选择计划文件</button></aside>
  </div>
}

function PlanDashboard({ plan, replacePlan, addPlan, deletePlan, clearAll }: {
  plan: PlanDocument
  replacePlan: (plan: PlanDocument) => void
  addPlan: (plan: PlanDocument) => void
  deletePlan: () => void
  clearAll: () => void
}) {
  const [newTask, setNewTask] = useState('')
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const completed = plan.tasks.filter((task) => task.done).length

  function exportPlan() {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${plan.title.replace(/[\\/:*?"<>|]/g, '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage('计划已导出，请妥善保存文件。')
  }

  async function importFile(file?: File) {
    if (!file) return
    try { addPlan({ ...parsePlanFile(await file.text()), id: crypto.randomUUID(), updatedAt: new Date().toISOString() }); setMessage('计划已作为新计划导入。') }
    catch (error) { setMessage(error instanceof Error ? error.message : '导入失败') }
    if (fileRef.current) fileRef.current.value = ''
  }

  function addTask() {
    const text = newTask.trim()
    if (!text) return
    replacePlan({ ...plan, tasks: [...plan.tasks, { id: crypto.randomUUID(), text, done: false }] })
    setNewTask('')
  }

  return <>
    <section className="planner-hero planner-card">
      <div className="planner-hero-fields"><span className="eyebrow">{plan.templateId === 'cross-major' ? '跨专业准入课' : '学期稳分'}</span><input className="planner-title-input" aria-label="计划名称" maxLength={120} value={plan.title} onChange={(event) => replacePlan({ ...plan, title: event.target.value })} /><textarea aria-label="计划目标" rows={2} maxLength={1000} value={plan.goal} onChange={(event) => replacePlan({ ...plan, goal: event.target.value })} /><div className="planner-date-row"><input aria-label="开始日期" type="date" value={plan.startDate} onChange={(event) => replacePlan({ ...plan, startDate: event.target.value })} /><span>—</span><input aria-label="结束日期" type="date" value={plan.endDate} onChange={(event) => replacePlan({ ...plan, endDate: event.target.value })} /></div></div>
      <div className="planner-progress"><strong>{completed}/{plan.tasks.length}</strong><span>任务完成</span><progress max={Math.max(plan.tasks.length, 1)} value={completed} /></div>
    </section>
    <div className="planner-dashboard-grid">
      <section className="planner-card"><div className="section-title"><div><h2>本周任务</h2><p>把目标拆成今天可以完成的动作。</p></div></div><div className="planner-task-list">{plan.tasks.map((task) => <label key={task.id} className={task.done ? 'done' : ''}><input type="checkbox" checked={task.done} onChange={() => replacePlan({ ...plan, tasks: plan.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) })} /><span>{task.text}</span><button type="button" aria-label="删除任务" onClick={() => replacePlan({ ...plan, tasks: plan.tasks.filter((item) => item.id !== task.id) })}><Trash2 size={15} /></button></label>)}</div><div className="planner-add-row"><input maxLength={300} placeholder="添加一项可执行任务" value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addTask() }} /><button type="button" className="secondary-button" onClick={addTask}><Plus size={16} />添加</button></div></section>
      <section className="planner-card"><div className="section-title"><div><h2>课程与资料</h2><p>只保存你加入计划的内容。</p></div></div><div className="planner-course-list">{plan.courses.length ? plan.courses.map((course) => <div key={course.id}><strong>{course.name}</strong><span>{course.id}{course.credits ? ` · ${course.credits} 学分` : ''}</span></div>) : <p className="planner-muted">还没有关联课程。</p>}</div><div className="planner-resource-list">{plan.resources.map((resource) => resource.url ? <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a> : <span key={resource.id}>{resource.label}</span>)}</div></section>
      <section className="planner-card planner-review"><div className="section-title"><div><h2>周复盘</h2><p>记录完成了什么、哪里受阻、下周怎么调整。</p></div><CheckCircle2 size={20} /></div><textarea rows={8} maxLength={4000} value={plan.weeklyReview} placeholder="本周完成…\n遇到的问题…\n下周调整…" onChange={(event) => replacePlan({ ...plan, weeklyReview: event.target.value })} /></section>
      <section className="planner-card planner-data"><div className="section-title"><div><h2>备份与删除</h2><p>本地数据不会自动跨设备同步。</p></div></div><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /><div className="planner-data-actions"><button type="button" className="secondary-button" onClick={exportPlan}><Download size={16} />导出当前计划</button><button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}><FileUp size={16} />导入为新计划</button><button type="button" className="danger-button" onClick={deletePlan}><Trash2 size={16} />删除当前计划</button><button type="button" className="text-button" onClick={clearAll}><RotateCcw size={15} />清空本机全部计划</button></div>{message && <p className="planner-message" role="status">{message}</p>}</section>
    </div>
  </>
}
