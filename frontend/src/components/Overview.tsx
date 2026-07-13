import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, RefreshCw, X } from 'lucide-react'
import { api, ApiError, query } from '../api'
import type { AcademicProfile, AcademicRanking, GradePage, GradeSummary, Program, ProgramCourse, ProgramNode, Session } from '../types'
import { selectOwnedProgram } from '../utils'

type Requirements = { total: number | null; categories: Record<string, number | null> }
type CreditGroup = { node: ProgramNode; courses: ProgramCourse[] }
type CreditDrilldown = { category: string; groups: CreditGroup[]; loading: boolean; error?: string }
type GradeRow = GradePage['rows'][number]
type GradeStatusFilter = 'all' | 'passed' | 'failed'
type GradeSort = 'default' | 'course-asc' | 'course-desc' | 'score-desc' | 'score-asc' | 'credit-desc' | 'credit-asc'
type CourseStatusFilter = 'all' | 'completed' | 'unmatched'
type CourseSort = 'default' | 'course-asc' | 'course-desc' | 'credit-desc' | 'credit-asc' | 'completed-first' | 'unmatched-first'

export function Overview({ onUnauthorized }: { session: Session; onUnauthorized: () => void }) {
  const [summary, setSummary] = useState<GradeSummary | null>(null)
  const [ranking, setRanking] = useState<AcademicRanking | null>(null)
  const [grades, setGrades] = useState<GradePage | null>(null)
  const [requirements, setRequirements] = useState<Requirements>({ total: null, categories: {} })
  const [programId, setProgramId] = useState('')
  const [drilldown, setDrilldown] = useState<CreditDrilldown | null>(null)
  const [loading, setLoading] = useState(true)
  const [rankingLoading, setRankingLoading] = useState(true)
  const [rankingError, setRankingError] = useState('')
  const [error, setError] = useState('')
  const [gradeQuery, setGradeQuery] = useState('')
  const [gradeTerm, setGradeTerm] = useState('')
  const [gradeNature, setGradeNature] = useState('')
  const [gradeStatus, setGradeStatus] = useState<GradeStatusFilter>('all')
  const [gradeSort, setGradeSort] = useState<GradeSort>('default')
  const requirementRequestRef = useRef(0)
  const drilldownRequestRef = useRef(0)
  const rankingRequestRef = useRef(0)

  const loadRanking = useCallback(async (force = false) => {
    const requestId = ++rankingRequestRef.current
    setRankingLoading(true)
    setRankingError('')
    try {
      const data = await api.cached<AcademicRanking>('/api/academic/ranking', { ttl: 30 * 60_000, force })
      if (requestId !== rankingRequestRef.current) return
      setRanking(data)
    } catch (caught) {
      if (requestId !== rankingRequestRef.current) return
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
      setRankingError(caught instanceof Error ? caught.message : '交换生系统数据暂不可用')
    } finally {
      if (requestId === rankingRequestRef.current) setRankingLoading(false)
    }
  }, [onUnauthorized])

  const loadProgramRequirements = useCallback(async (nextProgramId: string, force = false) => {
    const requestId = ++requirementRequestRef.current
    setProgramId(nextProgramId)
    setRequirements({ total: null, categories: {} })
    drilldownRequestRef.current += 1
    setDrilldown(null)
    setError('')
    try {
      const detail = await api.cached<Program>(`/api/programs/${encodeURIComponent(nextProgramId)}`, { ttl: 30 * 60_000, force })
      if (requestId !== requirementRequestRef.current) return
      setRequirements(parseRequirements(detail.XDYQ || ''))
    } catch (caught) {
      if (requestId !== requirementRequestRef.current) return
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
      setError(caught instanceof Error ? caught.message : '培养方案加载失败')
    }
  }, [onUnauthorized])

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError('')
    requirementRequestRef.current += 1
    drilldownRequestRef.current += 1
    setProgramId('')
    setRequirements({ total: null, categories: {} })
    setDrilldown(null)
    void loadRanking(force)
    try {
      const profilePromise = api.cached<AcademicProfile>('/api/academic/profile', { ttl: 30 * 60_000, force })
      const [summaryData, gradeData] = await Promise.all([
        api.cached<GradeSummary>('/api/grades/summary', { force }),
        api.cached<GradePage>('/api/grades', { force }),
      ])
      setSummary(summaryData)
      setGrades(gradeData)

      const profile = await profilePromise
      const programs = await api.cached<Program[]>(query('/api/programs', { grade: profile.grade }), { ttl: 30 * 60_000, force })
      const selected = selectOwnedProgram(programs, profile)
      if (!selected) throw new Error(`未找到与本人专业“${profile.majorName}”匹配的主修培养方案`)
      await loadProgramRequirements(selected.PYFADM, force)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
      setError(caught instanceof Error ? caught.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [loadProgramRequirements, loadRanking, onUnauthorized])

  useEffect(() => { void load() }, [load])
  const allGrades = useMemo(() => grades?.rows || [], [grades])
  const gradeTerms = useMemo(() => uniqueSorted(allGrades.map(gradeTermLabel)), [allGrades])
  const gradeNatures = useMemo(() => uniqueSorted(allGrades.map((grade) => grade.KCXZDM_DISPLAY || '未分类')), [allGrades])
  const filteredGrades = useMemo(() => {
    const normalizedQuery = gradeQuery.trim().toLocaleLowerCase('zh-CN')
    const filtered = allGrades.filter((grade) => {
      const matchesQuery = !normalizedQuery || `${grade.KCM || ''} ${grade.KCH || ''}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
      const matchesTerm = !gradeTerm || gradeTermLabel(grade) === gradeTerm
      const matchesNature = !gradeNature || (grade.KCXZDM_DISPLAY || '未分类') === gradeNature
      const passed = gradePassed(grade)
      const matchesStatus = gradeStatus === 'all' || (gradeStatus === 'passed' ? passed : !passed)
      return matchesQuery && matchesTerm && matchesNature && matchesStatus
    })
    return sortGrades(filtered, gradeSort)
  }, [allGrades, gradeNature, gradeQuery, gradeSort, gradeStatus, gradeTerm])

  async function openCreditCategory(category: string) {
    const requestId = ++drilldownRequestRef.current
    const activeProgramId = programId
    setDrilldown({ category, groups: [], loading: true })
    if (!programId) {
      setDrilldown({ category, groups: [], loading: false, error: '尚未确定当前培养方案' })
      return
    }
    try {
      const nodes = await api.cached<ProgramNode[]>(`/api/programs/${encodeURIComponent(activeProgramId)}/nodes`, { ttl: 30 * 60_000 })
      if (requestId !== drilldownRequestRef.current) return
      const root = nodes.find((node) => node.FKZH === '-1' && node.KZM === category)
      if (!root) throw new Error('培养方案中未找到该学分类别')
      const descendants = collectDescendants(nodes, root.KZH)
      const leaves = descendants.filter((node) => node.KZLXDM === '01')
      const courseLists = await Promise.all(leaves.map((node) => api.cached<ProgramCourse[]>(`/api/programs/${encodeURIComponent(activeProgramId)}/nodes/${encodeURIComponent(node.KZH)}/courses`, { ttl: 30 * 60_000 })))
      if (requestId !== drilldownRequestRef.current) return
      setDrilldown({ category, groups: leaves.map((node, index) => ({ node, courses: courseLists[index] })), loading: false })
    } catch (caught) {
      if (requestId !== drilldownRequestRef.current) return
      setDrilldown({ category, groups: [], loading: false, error: caught instanceof Error ? caught.message : '课程进度加载失败' })
    }
  }

  function closeDrilldown() {
    drilldownRequestRef.current += 1
    setDrilldown(null)
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><h1>学业概览</h1></div>
        <button className="secondary-button" onClick={() => void load(true)} disabled={loading || rankingLoading}><RefreshCw size={17} className={loading || rankingLoading ? 'spin' : ''} />刷新</button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <section className="metric-grid" aria-busy={loading || rankingLoading}>
        <article className="metric"><p>毕业学分进度</p><strong>{summary?.earnedCredits ?? '—'}<small> / {requirements.total ?? '—'}</small></strong><span>已获学分 / 培养方案总学分</span></article>
        <article className="metric metric-with-secondary metric-score-pair">
          <div className="metric-value-grid">
            <div><p>所有课学分绩</p><strong>{summary?.gpa ?? '—'}<small> / 5.0</small></strong></div>
            <div><p>平均学分绩</p><strong>{ranking ? formatNumber(ranking.averageScore) : '—'}<small> / 5.0</small></strong></div>
          </div>
          <span>所有课学分绩按原加权均分 ÷ 20 折算</span>
        </article>
        <article className="metric metric-with-secondary"><p>专业排名</p><strong>{ranking?.rank ?? '—'}<small> / {ranking?.majorTotal ?? '—'}</small></strong><div className="metric-secondary"><span>排名百分比</span><b>{ranking ? `${formatNumber(ranking.rankPercent)}%` : '—'}</b></div><span>{rankingError || (rankingLoading ? '正在查询交换生系统' : '来自南京大学交换生系统')}</span></article>
      </section>

      <section className="section-band two-columns">
        <div>
          <div className="section-title"><div><h2>培养方案学分</h2><p>已获得学分 / 该类毕业培养方案要求学分</p></div></div>
          <div className="credit-bars">
            {(summary?.graduationCategories || []).map((item) => {
              const required = requirements.categories[item.name]
              return <button type="button" className="credit-row" onClick={() => void openCreditCategory(item.name)} key={item.name}>
                <div><span>{item.name}</span><strong>{item.credits} / {required ?? '—'} 学分</strong></div>
                <progress className="bar-track" max={required || Math.max(item.credits, 1)} value={Math.min(item.credits, required || item.credits)} aria-label={`${item.name} ${item.credits} 学分`} />
              </button>
            })}
            {loading && <LoadingLines count={4} />}
          </div>
        </div>
        <div>
          <div className="section-title"><div><h2>学期进度</h2><p>各学期已通过课程学分</p></div></div>
          <div className="term-list">
            {(summary?.terms || []).slice(-6).map((item) => <div key={item.name}><span>{item.name}</span><strong>{item.credits}</strong></div>)}
            {loading && <LoadingLines count={4} />}
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="section-title"><div><h2>全部课程成绩</h2><p>成绩状态以 eHall 的“是否及格”字段为准</p></div><span className="record-count">{filteredGrades.length} / {allGrades.length} 条记录</span></div>
        <section className="program-toolbar grade-filter-toolbar" aria-label="成绩筛选与排序">
          <label><span>课程</span><input value={gradeQuery} onChange={(event) => setGradeQuery(event.target.value)} placeholder="课程名或课程号" /></label>
          <label><span>状态</span><select value={gradeStatus} onChange={(event) => setGradeStatus(event.target.value as GradeStatusFilter)}><option value="all">全部状态</option><option value="passed">已通过</option><option value="failed">未通过</option></select></label>
          <label><span>学期</span><select value={gradeTerm} onChange={(event) => setGradeTerm(event.target.value)}><option value="">全部学期</option>{gradeTerms.map((term) => <option value={term} key={term}>{term}</option>)}</select></label>
          <label><span>性质</span><select value={gradeNature} onChange={(event) => setGradeNature(event.target.value)}><option value="">全部性质</option>{gradeNatures.map((nature) => <option value={nature} key={nature}>{nature}</option>)}</select></label>
          <label><span>排序</span><select value={gradeSort} onChange={(event) => setGradeSort(event.target.value as GradeSort)}><option value="default">默认顺序</option><option value="course-asc">课程名 A-Z</option><option value="course-desc">课程名 Z-A</option><option value="score-desc">成绩从高到低</option><option value="score-asc">成绩从低到高</option><option value="credit-desc">学分从高到低</option><option value="credit-asc">学分从低到高</option></select></label>
        </section>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>课程</th><th>学期</th><th>性质</th><th>学分</th><th>成绩</th><th>状态</th></tr></thead>
            <tbody>{filteredGrades.map((grade) => {
              const passed = gradePassed(grade)
              return <tr key={`${grade.XNXQDM}-${grade.KCH}`}>
                <td><strong>{grade.KCM}</strong><small>{grade.KCH}</small></td>
                <td>{grade.XNXQDM_DISPLAY || grade.XNXQDM}</td><td>{grade.KCXZDM_DISPLAY || '—'}</td><td>{grade.XF}</td>
                <td><span className="score">{grade.ZCJ}</span></td><td><span className={passed ? 'status-text passed' : 'status-text'}>{passed ? '已通过' : '未通过'}</span></td>
              </tr>
            })}</tbody>
          </table>
          {loading && <LoadingLines count={6} />}
        </div>
      </section>
      {drilldown && <CreditDrilldownModal data={drilldown} grades={allGrades} categoryEarned={summary?.graduationCategories.find((item) => item.name === drilldown.category)?.credits || 0} required={requirements.categories[drilldown.category]} onClose={closeDrilldown} />}
    </div>
  )
}

function collectDescendants(nodes: ProgramNode[], parentId: string): ProgramNode[] {
  const direct = nodes.filter((node) => node.FKZH === parentId)
  return direct.flatMap((node) => [node, ...collectDescendants(nodes, node.KZH)])
}

function CreditDrilldownModal({ data, grades, categoryEarned, required, onClose }: { data: CreditDrilldown; grades: GradePage['rows']; categoryEarned: number; required: number | null; onClose: () => void }) {
  const [courseQuery, setCourseQuery] = useState('')
  const [courseStatus, setCourseStatus] = useState<CourseStatusFilter>('all')
  const [courseSort, setCourseSort] = useState<CourseSort>('default')
  const filterCourses = (courses: ProgramCourse[], matches: Map<ProgramCourse, GradeRow>) => {
    const normalizedQuery = courseQuery.trim().toLocaleLowerCase('zh-CN')
    const filtered = courses.filter((course) => {
      const matchesQuery = !normalizedQuery || `${course.KCM || ''} ${course.KCH || ''}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
      const completed = matches.has(course)
      const matchesStatus = courseStatus === 'all' || (courseStatus === 'completed' ? completed : !completed)
      return matchesQuery && matchesStatus
    })
    return sortProgramCourses(filtered, courseSort, matches)
  }
  return <div className="modal-backdrop" role="presentation" onKeyDown={(event) => event.key === 'Escape' && onClose()} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="credit-modal" role="dialog" aria-modal="true" aria-labelledby="credit-detail-title">
      <header><div><h2 id="credit-detail-title">{data.category}</h2><span>{categoryEarned} / {required ?? '—'} 学分</span></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭学分详情" autoFocus><X size={20} /></button></header>
      {data.loading ? <div className="center-loading"><LoaderCircle className="spin" />正在整理课程进度</div> : data.error ? <div className="error-banner credit-error">{data.error}</div> : <div className="credit-group-list">
        <p className="credit-matching-note">一般课程按课程号直接匹配；大学体育按已通过的具体体育课程逐门等效匹配。免修、其他课程替代和认定结果以教务审核为准，“未直接匹配”不等同于确定缺课。</p>
        <section className="program-toolbar credit-filter-toolbar" aria-label="课程进度筛选与排序">
          <label><span>课程</span><input value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} placeholder="课程名或课程号" /></label>
          <label><span>状态</span><select value={courseStatus} onChange={(event) => setCourseStatus(event.target.value as CourseStatusFilter)}><option value="all">全部状态</option><option value="completed">已完成</option><option value="unmatched">未直接匹配</option></select></label>
          <label><span>排序</span><select value={courseSort} onChange={(event) => setCourseSort(event.target.value as CourseSort)}><option value="default">默认顺序</option><option value="course-asc">课程名 A-Z</option><option value="course-desc">课程名 Z-A</option><option value="credit-desc">学分从高到低</option><option value="credit-asc">学分从低到高</option><option value="completed-first">已完成优先</option><option value="unmatched-first">未匹配优先</option></select></label>
        </section>
        {data.groups.map(({ node, courses }) => {
          const matches = buildCourseMatches(node, courses, grades)
          const completed = courses.filter((course) => matches.has(course))
          const earned = completed.reduce((sum, course) => sum + Number(course.XF || 0), 0)
          const groupRequired = node.ZSXDXF ?? node.KCZXF
          const visibleCourses = filterCourses(courses, matches)
          return <section key={node.KZH}>
            <header><div><strong>{node.KZM}</strong><span>{requirementTextForCredit(node)}</span></div><small>{courses.length ? formatNumber(earned) : '待认定'} / {groupRequired ?? '—'} 学分</small></header>
            {courses.length ? visibleCourses.length ? <div className="credit-course-list">{visibleCourses.map((course, index) => {
              const grade = matches.get(course)
              const equivalent = grade && grade.KCH !== course.KCH ? `（等效：${grade.KCM || grade.KCH}）` : ''
              return <div key={`${course.KCH}-${index}`}><span><strong>{course.KCM}</strong><small>{course.KCH} · {String(course.XF ?? '—')} 学分</small></span><b className={grade ? 'completed' : ''}>{grade ? `已完成 · ${grade.ZCJ}${equivalent}` : '未直接匹配'}</b></div>
            })}</div> : <div className="empty-inline">该课程组没有匹配筛选条件的课程。</div> : <p>开放选修或模块课程，培养方案未提供固定课程清单。</p>}
          </section>
        })}
        {!data.groups.length && <div className="empty-inline">该类别暂未提供可继续细分的课程组。</div>}
      </div>}
      <footer><button type="button" className="secondary-button" onClick={onClose}>关闭</button></footer>
    </section>
  </div>
}

function requirementTextForCredit(node: ProgramNode) {
  const parts = []
  if (node.KCZMS) parts.push(`${node.KCZMS} 门`)
  if (node.KCZXF) parts.push(`共 ${node.KCZXF} 学分`)
  if (node.ZSXDXF != null) parts.push(`至少 ${node.ZSXDXF} 学分`)
  return parts.join(' · ') || '课程组'
}

function formatNumber(value: number) {
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function gradePassed(grade: GradeRow) {
  return grade.SFJG === '1' || grade.SFJG_DISPLAY === '是'
}

function gradeTermLabel(grade: GradeRow) {
  return grade.XNXQDM_DISPLAY || grade.XNXQDM || '未知学期'
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

function sortGrades(grades: GradeRow[], sort: GradeSort) {
  const sorted = [...grades]
  if (sort === 'course-asc') return sorted.sort((left, right) => String(left.KCM || '').localeCompare(String(right.KCM || ''), 'zh-CN'))
  if (sort === 'course-desc') return sorted.sort((left, right) => String(right.KCM || '').localeCompare(String(left.KCM || ''), 'zh-CN'))
  if (sort === 'score-desc') return sorted.sort((left, right) => compareNumbers(left.ZCJ, right.ZCJ, true))
  if (sort === 'score-asc') return sorted.sort((left, right) => compareNumbers(left.ZCJ, right.ZCJ, false))
  if (sort === 'credit-desc') return sorted.sort((left, right) => compareNumbers(left.XF, right.XF, true))
  if (sort === 'credit-asc') return sorted.sort((left, right) => compareNumbers(left.XF, right.XF, false))
  return sorted
}

function sortProgramCourses(courses: ProgramCourse[], sort: CourseSort, matches: Map<ProgramCourse, GradeRow>) {
  const sorted = [...courses]
  if (sort === 'course-asc') return sorted.sort((left, right) => left.KCM.localeCompare(right.KCM, 'zh-CN'))
  if (sort === 'course-desc') return sorted.sort((left, right) => right.KCM.localeCompare(left.KCM, 'zh-CN'))
  if (sort === 'credit-desc') return sorted.sort((left, right) => compareNumbers(left.XF, right.XF, true))
  if (sort === 'credit-asc') return sorted.sort((left, right) => compareNumbers(left.XF, right.XF, false))
  if (sort === 'completed-first') return sorted.sort((left, right) => Number(matches.has(right)) - Number(matches.has(left)))
  if (sort === 'unmatched-first') return sorted.sort((left, right) => Number(matches.has(left)) - Number(matches.has(right)))
  return sorted
}

const PHYSICAL_EDUCATION_SLOT_CODE = /^000400(?:00|10)[A-D]$/
const PHYSICAL_EDUCATION_COURSE_CODES = new Set([
  '00040020A', '00040020C', '00040030A', '00040030C', '00040050A', '00040050C',
  '00040070A', '00040070B', '00040070C', '00040090A', '00040090C', '00040100A',
  '00040100C', '00040110A', '00040110B', '00040110C', '00040120A', '00040120C',
  '00040130', '00040140', '00040160', '00040200A', '00040200C', '00040210',
  '00040220A', '00040220C', '00040230A', '00040230C', '00040240', '00040280A',
  '00040280C', '00040290A', '00040310C', '00040330C', '00040460', '00040460C',
  '00041010', '00041010A', '00042020', '00042030', '00042050', '00042070',
  '00042080C', '00042100A', '00042100C', '00042110C', '00042120A', '00042130',
  '00042150',
])
const PHYSICAL_EDUCATION_NAMES = ['体育', '体适能', '游泳', '篮球', '足球', '排球', '羽毛球', '乒乓球', '网球', '健美操', '瑜伽', '武术', '太极', '跆拳道', '健身', '飞盘', '定向越野']

function buildCourseMatches(node: ProgramNode, courses: ProgramCourse[], grades: GradeRow[]) {
  const passedGrades = grades.filter(gradePassed)
  const matches = new Map<ProgramCourse, GradeRow>()
  const usedGrades = new Set<GradeRow>()

  courses.forEach((course) => {
    const exact = passedGrades.find((grade) => !usedGrades.has(grade) && grade.KCH === course.KCH)
    if (!exact) return
    matches.set(course, exact)
    usedGrades.add(exact)
  })

  if (node.KZM !== '大学体育' && node.KZM !== '体育课') return matches
  const remainingGrades = passedGrades
    .filter((grade) => !usedGrades.has(grade) && isPhysicalEducationGrade(grade))
    .sort((left, right) => gradeTermCode(left).localeCompare(gradeTermCode(right)) || String(left.KCM || '').localeCompare(String(right.KCM || ''), 'zh-CN'))
  const openSlots = courses
    .filter((course) => PHYSICAL_EDUCATION_SLOT_CODE.test(course.KCH) && !matches.has(course))
    .sort((left, right) => left.KCH.localeCompare(right.KCH))

  openSlots.forEach((course) => {
    const gradeIndex = remainingGrades.findIndex((grade) => sportGradeMatchesSlot(grade, course))
    if (gradeIndex < 0) return
    matches.set(course, remainingGrades[gradeIndex])
    remainingGrades.splice(gradeIndex, 1)
  })
  openSlots.filter((course) => !matches.has(course)).forEach((course) => {
    const gradeIndex = remainingGrades.findIndex((grade) => Number(grade.XF || 0) === Number(course.XF || 0))
    if (gradeIndex < 0) return
    matches.set(course, remainingGrades[gradeIndex])
    remainingGrades.splice(gradeIndex, 1)
  })
  return matches
}

function isPhysicalEducationGrade(grade: GradeRow) {
  const code = String(grade.KCH || '')
  const name = String(grade.KCM || '')
  if (code.startsWith('00042140') || name.includes('体质健康测试')) return false
  return PHYSICAL_EDUCATION_COURSE_CODES.has(code)
    || PHYSICAL_EDUCATION_NAMES.some((keyword) => name.includes(keyword))
    || (code.startsWith('0004') && Number(grade.XF || 0) <= 1)
}

function gradeTermCode(grade: GradeRow) {
  return String(grade.XNXQDM || grade.XNXQDM_DISPLAY || '')
}

function sportGradeMatchesSlot(grade: GradeRow, course: ProgramCourse) {
  const plannedTerms = String(course.XNXQ || course.XNXQDM_DISPLAY || '').split(',').map((term) => term.trim())
  return plannedTerms.includes(gradeTermCode(grade)) && Number(grade.XF || 0) === Number(course.XF || 0)
}

function compareNumbers(left: unknown, right: unknown, descending: boolean) {
  const leftNumber = numericValue(left)
  const rightNumber = numericValue(right)
  if (leftNumber === null && rightNumber === null) return 0
  if (leftNumber === null) return 1
  if (rightNumber === null) return -1
  return descending ? rightNumber - leftNumber : leftNumber - rightNumber
}

function numericValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function parseRequirements(text: string): Requirements {
  const numberAfter = (label: string) => {
    const match = text.match(new RegExp(`${label}[^，。；]{0,24}?(\\d+(?:\\.\\d+)?)\\s*学分`))
    return match ? Number(match[1]) : null
  }
  const totalMatch = text.match(/(?:应修总学分|总学分)\s*(\d+(?:\.\d+)?)/)
  return {
    total: totalMatch ? Number(totalMatch[1]) : null,
    categories: {
      '通识通修课程': numberAfter('通识通修课程'),
      '学科专业课程': numberAfter('学科专业课程'),
      '多元发展课程': numberAfter('多元发展课程'),
      '毕业论文/设计': numberAfter('毕业论文\\/设计'),
    },
  }
}

export function LoadingLines({ count }: { count: number }) {
  return <div className="loading-lines" aria-label="正在加载">{Array.from({ length: count }, (_, index) => <span key={index} />)}</div>
}
