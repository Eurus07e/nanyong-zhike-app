import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { GraduationCap, Info, LayoutList, LoaderCircle, RotateCcw, Search, X, ZoomIn, ZoomOut } from 'lucide-react'
import { api, ApiError, query, withRefresh } from '../api'
import { adjustMapScale, formatMapScale } from '../map-scale'
import {
  aggregateNodeCourses,
  buildProgramTree,
  classifyProgramNodesForYear,
  courseCreditValue,
  formatCourseCredit,
  resolveProgramNodeCreditRequirement,
  resolveProgramRequirements,
  summarizeProgramNode,
  type ProgramNodeSummary,
  type ProgramTreeNode,
} from '../program-requirements'
import type { AcademicProfile, Program, ProgramCourse, ProgramNode, Session } from '../types'
import { courseTerm, gradeYear, programBrowserStorageKey, selectOwnedProgram } from '../utils'
import { SegmentedControl } from './SegmentedControl'

type Mode = 'structure' | 'year'
type NodeCourseSort = 'default' | 'course-asc' | 'course-desc' | 'credit-desc' | 'credit-asc' | 'term-asc'

export function ProgramView({ session, onUnauthorized }: { session: Session; onUnauthorized: () => void }) {
  const initialYear = gradeYear(session.username)
  const initialProgramsPath = query('/api/programs', { grade: initialYear })
  const initialPrograms = api.peek<Program[]>(initialProgramsPath) || []
  const initialProgramId = localStorage.getItem(programBrowserStorageKey(session.username)) || ''
  const initialProgramPath = initialProgramId ? `/api/programs/${encodeURIComponent(initialProgramId)}` : ''
  const initialDetail = initialProgramPath ? api.peek<Program>(initialProgramPath) || null : null
  const initialNodes = initialProgramPath ? api.peek<ProgramNode[]>(`${initialProgramPath}/nodes`) || [] : []
  const initialCourses = Object.fromEntries(initialNodes.flatMap((node) => {
    const value = api.peek<ProgramCourse[]>(`${initialProgramPath}/nodes/${encodeURIComponent(node.KZH)}/courses`)
    return value ? [[node.KZH, value]] : []
  }))
  const [programs, setPrograms] = useState<Program[]>(initialPrograms)
  const [allPrograms, setAllPrograms] = useState<Program[]>(initialPrograms)
  const [programId, setProgramId] = useState(initialProgramId)
  const [detail, setDetail] = useState<Program | null>(initialDetail)
  const [nodes, setNodes] = useState<ProgramNode[]>(initialNodes)
  const [courses, setCourses] = useState<Record<string, ProgramCourse[]>>(initialCourses)
  const [selectedNode, setSelectedNode] = useState('')
  const [searchText, setSearchText] = useState('')
  const [year, setYear] = useState(initialYear)
  const [loadedProgramYear, setLoadedProgramYear] = useState(initialPrograms.length ? initialYear : '')
  const [department, setDepartment] = useState('')
  const [studyType, setStudyType] = useState('')
  const [mode, setMode] = useState<Mode>('structure')
  const [mapScale, setMapScale] = useState(1)
  const [showDetail, setShowDetail] = useState(false)
  const [showNodeDetail, setShowNodeDetail] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState<ProgramCourse | null>(null)
  const [loading, setLoading] = useState(!initialDetail || !initialNodes.length)
  const [courseRetryLoading, setCourseRetryLoading] = useState(false)
  const [courseErrors, setCourseErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const programListRequestRef = useRef(0)
  const programRequestRef = useRef(0)
  const courseRetryRequestRef = useRef(0)
  const profileRef = useRef<AcademicProfile | null>(null)

  const applyProgramFilters = useCallback((items: Program[], keyword: string, targetDepartment: string, targetType: string) => {
    const filtered = filterPrograms(items, keyword, targetDepartment, targetType)
    setPrograms(filtered)
    setProgramId((current) => {
      if (current && filtered.some((item) => item.PYFADM === current)) return current
      const stored = localStorage.getItem(programBrowserStorageKey(session.username))
      const preferred = filtered.find((item) => item.PYFADM === stored)
        || (profileRef.current ? selectOwnedProgram(filtered, profileRef.current) : undefined)
        || filtered[0]
      return preferred?.PYFADM || ''
    })
  }, [session.username])

  const loadPrograms = useCallback(async (targetYear: string, keyword = '', targetDepartment = '', targetType = '') => {
    const requestId = ++programListRequestRef.current
    const path = query('/api/programs', { grade: targetYear })
    const hadProgramsCache = api.hasCache(path)
    if (!hadProgramsCache) setLoading(true)
    setError('')
    try {
      const items = await api.cached<Program[]>(query('/api/programs', {
        grade: targetYear,
      }), { ttl: 30 * 60_000 })
      if (requestId !== programListRequestRef.current) return
      setAllPrograms(items)
      setLoadedProgramYear(targetYear)
      const availableDepartments = new Set(items.map((item) => item.DWDM_DISPLAY).filter(Boolean))
      const effectiveDepartment = targetDepartment && availableDepartments.has(targetDepartment) ? targetDepartment : ''
      if (effectiveDepartment !== targetDepartment) setDepartment('')
      applyProgramFilters(items, keyword, effectiveDepartment, targetType)
      if (hadProgramsCache) {
        const freshItems = await api.cached<Program[]>(withRefresh(path, true), { ttl: 30 * 60_000, force: true })
        if (requestId !== programListRequestRef.current) return
        api.setCache(path, freshItems, 30 * 60_000)
        setAllPrograms(freshItems)
        const freshDepartments = new Set(freshItems.map((item) => item.DWDM_DISPLAY).filter(Boolean))
        const freshDepartment = targetDepartment && freshDepartments.has(targetDepartment) ? targetDepartment : ''
        if (freshDepartment !== targetDepartment) setDepartment('')
        applyProgramFilters(freshItems, keyword, freshDepartment, targetType)
      }
    } catch (caught) {
      if (requestId !== programListRequestRef.current) return
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
      setError(caught instanceof Error ? caught.message : '培养方案加载失败')
    } finally {
      if (requestId === programListRequestRef.current) setLoading(false)
    }
  }, [applyProgramFilters, onUnauthorized])

  function searchPrograms() {
    setError('')
    if (loadedProgramYear === year && allPrograms.length) {
      applyProgramFilters(allPrograms, searchText, department, studyType)
      return
    }
    return loadPrograms(year, searchText, department, studyType)
  }

  useEffect(() => {
    let active = true
    void (async () => {
      const profilePath = '/api/academic/profile'
      const hadProfileCache = api.hasCache(profilePath)
      try {
        const profile = await api.cached<AcademicProfile>(profilePath, { ttl: 30 * 60_000 })
        if (!active) return
        profileRef.current = profile
        setYear(profile.grade)
        await loadPrograms(profile.grade)
        if (!active || !hadProfileCache) return
        const freshProfile = await api.cached<AcademicProfile>(withRefresh(profilePath, true), { ttl: 30 * 60_000, force: true })
        if (!active) return
        api.setCache(profilePath, freshProfile, 30 * 60_000)
        profileRef.current = freshProfile
        setYear(freshProfile.grade)
        if (freshProfile.grade !== profile.grade) await loadPrograms(freshProfile.grade)
      } catch (caught) {
        if (!active) return
        if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
        if (!profileRef.current) void loadPrograms(gradeYear(session.username))
      }
    })()
    return () => { active = false }
  }, [loadPrograms, onUnauthorized, session.username])

  useEffect(() => {
    const requestId = ++programRequestRef.current
    setMapScale(1)
    courseRetryRequestRef.current += 1
    setCourseRetryLoading(false)
    if (!programId) {
      setDetail(null)
      setNodes([])
      setCourses({})
      setCourseErrors({})
      setSelectedNode('')
      return
    }
    setLoading(true)
    setError('')
    const programPath = `/api/programs/${encodeURIComponent(programId)}`
    const cachedDetail = api.peek<Program>(programPath)
    const cachedNodes = api.peek<ProgramNode[]>(`${programPath}/nodes`)
    const hadProgramCache = Boolean(cachedDetail && cachedNodes)
    if (cachedDetail && cachedNodes) {
      setDetail(cachedDetail)
      setNodes(cachedNodes)
      setCourses(Object.fromEntries(cachedNodes.flatMap((node) => {
        const value = api.peek<ProgramCourse[]>(`${programPath}/nodes/${encodeURIComponent(node.KZH)}/courses`)
        return value ? [[node.KZH, value]] : []
      })))
      setSelectedNode(cachedNodes.find((node) => node.KZLXDM === '01')?.KZH || '')
      setLoading(false)
    } else {
      setDetail(null)
      setNodes([])
      setCourses({})
      setCourseErrors({})
      setSelectedNode('')
    }
    void (async () => {
      try {
        const [program, nodeItems] = await Promise.all([
          api.cached<Program>(withRefresh(programPath, hadProgramCache), { ttl: 30 * 60_000, force: hadProgramCache }),
          api.cached<ProgramNode[]>(withRefresh(`${programPath}/nodes`, hadProgramCache), { ttl: 30 * 60_000, force: hadProgramCache }),
        ])
        if (requestId !== programRequestRef.current) return
        if (hadProgramCache) {
          api.setCache(programPath, program, 30 * 60_000)
          api.setCache(`${programPath}/nodes`, nodeItems, 30 * 60_000)
        }

        const courseNodes = nodeItems.filter((node) => node.KZLXDM === '01')
        const prefetchedCourses: Record<string, ProgramCourse[]> = {}
        const failedCourses: Record<string, string> = {}
        for (let index = 0; index < courseNodes.length; index += 4) {
          if (requestId !== programRequestRef.current) return
          const batch = courseNodes.slice(index, index + 4)
          const responses = await Promise.allSettled(batch.map((node) =>
            api.cached<ProgramCourse[]>(withRefresh(`${programPath}/nodes/${encodeURIComponent(node.KZH)}/courses`, hadProgramCache), { ttl: 30 * 60_000, force: hadProgramCache })
          ))
          if (requestId !== programRequestRef.current) return
          const authFailure = responses.find((response) => response.status === 'rejected' && response.reason instanceof ApiError && response.reason.status === 401)
          if (authFailure?.status === 'rejected') throw authFailure.reason
          batch.forEach((node, batchIndex) => {
            const response = responses[batchIndex]
            if (response.status === 'fulfilled') {
              prefetchedCourses[node.KZH] = response.value
              if (hadProgramCache) api.setCache(`${programPath}/nodes/${encodeURIComponent(node.KZH)}/courses`, response.value, 30 * 60_000)
            }
            else failedCourses[node.KZH] = response.reason instanceof Error ? response.reason.message : '课程加载失败'
          })
        }

        if (requestId !== programRequestRef.current) return
        setDetail(program)
        setNodes(nodeItems)
        setCourses(prefetchedCourses)
        setCourseErrors(failedCourses)
        setSelectedNode(courseNodes[0]?.KZH || '')
      } catch (caught) {
        if (requestId !== programRequestRef.current) return
        if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
        if (!hadProgramCache) setError(caught instanceof Error ? caught.message : '方案内容加载失败')
      } finally {
        if (requestId === programRequestRef.current) setLoading(false)
      }
    })()
  }, [programId, onUnauthorized])

  useEffect(() => {
    if (!programId) return
    localStorage.setItem(programBrowserStorageKey(session.username), programId)
  }, [programId, session.username])

  function selectNode(nodeId: string) {
    setSelectedNode(nodeId)
    setShowNodeDetail(true)
  }

  function switchMode(next: Mode) {
    setMode(next)
  }

  async function retryCourseNodes(nodeIds: string[]) {
    if (!programId || !nodeIds.length || courseRetryLoading) return
    const requestId = ++courseRetryRequestRef.current
    const activeProgramId = programId
    const basePaths = nodeIds.map((nodeId) => `/api/programs/${encodeURIComponent(activeProgramId)}/nodes/${encodeURIComponent(nodeId)}/courses`)
    setCourseRetryLoading(true)
    try {
      const responses = await Promise.allSettled(basePaths.map((basePath) =>
        api.cached<ProgramCourse[]>(withRefresh(basePath, true), { ttl: 30 * 60_000, force: true })
      ))
      if (requestId !== courseRetryRequestRef.current || activeProgramId !== programId) return
      const authFailure = responses.find((response) => response.status === 'rejected' && response.reason instanceof ApiError && response.reason.status === 401)
      if (authFailure?.status === 'rejected') throw authFailure.reason
      const additions: Record<string, ProgramCourse[]> = {}
      const failures: Record<string, string> = {}
      responses.forEach((response, index) => {
        const nodeId = nodeIds[index]
        const basePath = basePaths[index]
        if (response.status === 'fulfilled') {
          additions[nodeId] = response.value
          api.setCache(basePath, response.value, 30 * 60_000)
        }
        else failures[nodeId] = response.reason instanceof Error ? response.reason.message : '课程加载失败'
      })
      setCourses((current) => ({ ...current, ...additions }))
      setCourseErrors((current) => {
        const next = { ...current }
        Object.keys(additions).forEach((nodeId) => delete next[nodeId])
        return { ...next, ...failures }
      })
    } catch (caught) {
      if (requestId !== courseRetryRequestRef.current) return
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
      else setError(caught instanceof Error ? caught.message : '课程加载失败')
    } finally {
      if (requestId === courseRetryRequestRef.current) {
        setCourseRetryLoading(false)
      }
    }
  }

  const tree = useMemo(() => buildProgramTree(nodes), [nodes])
  const requirements = useMemo(() => resolveProgramRequirements(detail?.XDYQ || '', nodes), [detail?.XDYQ, nodes])
  const nodeSummaries = useMemo(() => new Map(nodes.map((node) => [
    node.KZH,
    summarizeProgramNode(node, nodes, courses, requirements),
  ])), [courses, nodes, requirements])
  const departments = useMemo(() => [...new Set(allPrograms.map((item) => item.DWDM_DISPLAY).filter(Boolean) as string[])].sort(), [allPrograms])
  const years = useMemo(() => {
    const current = new Date().getFullYear()
    const values = Array.from({ length: 10 }, (_, index) => String(current - index))
    if (!values.includes(gradeYear(session.username))) values.push(gradeYear(session.username))
    return values.sort((a, b) => Number(b) - Number(a))
  }, [session.username])
  const selected = nodes.find((node) => node.KZH === selectedNode)
  const selectedCourseData = useMemo(() => selectedNode
    ? aggregateNodeCourses(nodes, courses, selectedNode)
    : { courses: [], leafIds: [], missingLeafIds: [] }, [courses, nodes, selectedNode])
  const selectedSummary = selectedNode ? nodeSummaries.get(selectedNode) : undefined
  const yearNodeGroups = useMemo(() => classifyProgramNodesForYear(nodes, nodeSummaries), [nodeSummaries, nodes])
  const fixedCourses = useMemo(() => deduplicateCourses(yearNodeGroups.fixedCourseNodes
    .flatMap((node) => courses[node.KZH] || [])), [courses, yearNodeGroups])
  const electiveGroups = useMemo(() => yearNodeGroups.electivePoolNodes.map((node) => ({
    node,
    summary: nodeSummaries.get(node.KZH) || summarizeProgramNode(node, nodes, courses, requirements),
  })), [courses, nodeSummaries, nodes, requirements, yearNodeGroups])
  const academicYears = useMemo(() => {
    const start = Number(detail?.NJDM_DISPLAY || year)
    if (!Number.isFinite(start)) return []
    return Array.from({ length: detail?.XZNX || 4 }, (_, index) => {
      const first = start + index
      const code = `${first}-${first + 1}`
      return {
        code,
        label: `${code}学年`,
        terms: [
          { code: `${code}-1`, label: '第1学期' },
          { code: `${code}-2`, label: '第2学期' },
          { code: `${code}-3`, label: '暑期' },
        ],
      }
    })
  }, [detail, year])

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><h1>培养方案</h1></div>
        <SegmentedControl
          value={mode}
          options={[
            { value: 'structure', label: '结构模式', icon: <LayoutList size={15} /> },
            { value: 'year', label: '学年模式', icon: <GraduationCap size={15} /> },
          ]}
          onChange={switchMode}
          label="培养方案展示模式"
          className="segmented-two"
        />
      </div>
      <form className="program-toolbar" onSubmit={(event) => { event.preventDefault(); void searchPrograms() }}>
        <label><span>关键词</span><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="输入专业、院系或培养方案名称" /></label>
        <label><span>年级</span><select value={year} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>院系</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">全部院系</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>修读类型</span><select value={studyType} onChange={(event) => setStudyType(event.target.value)}><option value="">全部类型</option><option value="主修">主修</option><option value="辅修">辅修</option></select></label>
        <button type="submit" className="primary-button program-search-button" disabled={loading}><Search size={17} />搜索</button>
      </form>
      <section className="program-selector-row">
        <div><label htmlFor="program-selector">当前培养方案</label><span>{programs.length} 个匹配方案</span></div>
        <select id="program-selector" value={programId} onChange={(event) => setProgramId(event.target.value)} aria-label="选择培养方案">
          {!programs.length && <option value="">没有匹配的培养方案</option>}
          {programs.map((program) => <option value={program.PYFADM} key={program.PYFADM}>{program.PYFAMC}</option>)}
        </select>
      </section>
      {error && <div className="error-banner">{error}</div>}
      {Object.keys(courseErrors).length > 0 && <div className="warning-banner program-course-warning">
        <span>有 {Object.keys(courseErrors).length} 个课程组暂未加载，已保留其余可用内容。</span>
        <button type="button" className="secondary-button" disabled={courseRetryLoading} onClick={() => void retryCourseNodes(Object.keys(courseErrors))}>{courseRetryLoading && <LoaderCircle size={15} className="spin" />}重试</button>
      </div>}
      {loading && <div className="center-loading"><LoaderCircle className="spin" />正在连接培养方案服务</div>}

      {!loading && mode === 'structure' && <>
        <section className="curriculum-map-section">
          <div className="section-title program-structure-title"><div><h2>培养方案结构</h2><p>点击节点查看课程；橙色标记表示节点包含修读说明</p></div><div className="program-structure-actions"><div className="map-zoom-controls" role="group" aria-label="结构图缩放"><button type="button" className="icon-button" onClick={() => setMapScale((current) => adjustMapScale(current, -1))} disabled={mapScale <= 0.7} aria-label="缩小结构图" title="缩小"><ZoomOut size={17} /></button><button type="button" className="map-zoom-reset" onClick={() => setMapScale(1)} disabled={mapScale === 1} aria-label="重置结构图缩放" title="重置为 100%"><RotateCcw size={15} /><span>{formatMapScale(mapScale)}</span></button><button type="button" className="icon-button" onClick={() => setMapScale((current) => adjustMapScale(current, 1))} disabled={mapScale >= 1} aria-label="放大结构图" title="放大至 100%"><ZoomIn size={17} /></button></div>{detail && <button type="button" className="program-detail-button" onClick={() => setShowDetail(true)}><Info size={16} />查看方案内容</button>}</div></div>
          <div className="curriculum-map"><CurriculumMap title={detail?.PYFAMC || '培养方案'} nodes={tree} summaries={nodeSummaries} selected={selectedNode} scale={mapScale} onSelect={selectNode} /></div>
        </section>
      </>}

      {!loading && mode === 'year' && <section className="year-mode">
        <div className="year-roadmap">
          {academicYears.map((academicYear, index) => <article className="academic-year" key={academicYear.code}>
            <div className="year-label"><span>第{['一', '二', '三', '四'][index] || index + 1}学年</span><strong>{academicYear.label}</strong></div>
            <div className="term-columns">{academicYear.terms.map((term) => {
              const items = fixedCourses.filter((course) => course.XNXQ === term.code || courseTerm(course) === term.code)
              const credits = items.reduce((sum, item) => sum + (courseCreditValue(item.XF) || 0), 0)
              return <section className="term-column" key={term.code}>
                <header><div><strong>{term.label}</strong><span>{term.code}</span></div><small>{items.length} 门 · {formatCredits(credits)} 学分</small></header>
                {items.length ? <div className="term-courses">{items.map((course, courseIndex) => <button type="button" onClick={() => setSelectedCourse(course)} key={`${course.KCH}-${courseIndex}`}><strong>{course.KCM}</strong><span>{course.KCH} · {formatCourseCredit(course.XF)} 学分</span></button>)}</div> : <div className="term-empty">暂无指定课程</div>}
              </section>
            })}</div>
          </article>)}
          {fixedCourses.filter((course) => !courseTerm(course)).length > 0 && <article className="unscheduled-courses"><div><strong>未指定学期</strong><span>培养方案未注明建议修读时间</span></div><CourseTable courses={fixedCourses.filter((course) => !courseTerm(course))} compact onSelect={setSelectedCourse} /></article>}
          {electiveGroups.length > 0 && <section className="year-elective-pools">
            <header><div><h2>课程范围</h2><p>分支、限选或选修课程，不代表需要全部修读</p></div></header>
            <div>{electiveGroups.map(({ node, summary }) => <button type="button" key={node.KZH} onClick={() => selectNode(node.KZH)}>
              <span><strong>{node.KZM}</strong><small>{formatRequiredSummary(summary)}</small></span>
              <b>{formatPoolSummary(summary)}</b>
            </button>)}</div>
          </section>}
        </div>
      </section>}
      {showNodeDetail && selected && selectedSummary && <NodeDetailModal
        node={selected}
        summary={selectedSummary}
        courses={selectedCourseData.courses}
        loading={courseRetryLoading}
        missingCount={selectedCourseData.missingLeafIds.length}
        onRetry={() => void retryCourseNodes(selectedCourseData.missingLeafIds)}
        onClose={() => setShowNodeDetail(false)}
        onCourse={setSelectedCourse}
      />}
      {selectedCourse && <ProgramCourseModal course={selectedCourse} onClose={() => setSelectedCourse(null)} />}
      {showDetail && detail && <ProgramDetail program={detail} onClose={() => setShowDetail(false)} />}
    </div>
  )
}

function filterPrograms(items: Program[], keyword: string, department: string, studyType: string) {
  const terms = keyword.trim().split(/\s+/).map(normalizeProgramSearch).filter(Boolean)
  return items.filter((item) => {
    if (department && item.DWDM_DISPLAY !== department) return false
    if (studyType && (item.XDLXDM_DISPLAY || '主修') !== studyType) return false
    if (!terms.length) return true
    const fields = [item.PYFAMC, item.ZYDM_DISPLAY, item.DWDM_DISPLAY, item.XDLXDM_DISPLAY, item.PYFADM]
      .filter((value): value is string => Boolean(value))
      .map(normalizeProgramSearch)
    return terms.every((term) => fields.some((field) => fuzzyContains(field, term)))
  })
}

function normalizeProgramSearch(value: string) {
  return value.toLocaleLowerCase('zh-CN').replace(/[\s_*()（）·—-]+/g, '')
}

function fuzzyContains(value: string, term: string) {
  if (value.includes(term)) return true
  const characters = Array.from(value)
  const target = Array.from(term)
  let targetIndex = 0
  for (const character of characters) {
    if (character === target[targetIndex]) targetIndex += 1
    if (targetIndex === target.length) return true
  }
  return false
}

function CurriculumMap({ title, nodes, summaries, selected, scale, onSelect }: { title: string; nodes: ProgramTreeNode[]; summaries: Map<string, ProgramNodeSummary>; selected: string; scale: number; onSelect: (id: string) => void }) {
  const treeRef = useRef<HTMLDivElement>(null)
  const [connectors, setConnectors] = useState({ path: '', width: 0, height: 0 })

  useLayoutEffect(() => {
    const tree = treeRef.current
    if (!tree) return

    const measure = () => {
      const elements = [...tree.querySelectorAll<HTMLElement>('[data-map-id]')]
      const byId = new Map(elements.map((element) => [element.dataset.mapId, element]))
      const segments: string[] = []
      const positionInTree = (element: HTMLElement) => {
        let x = 0
        let y = 0
        let current: HTMLElement | null = element
        while (current && current !== tree) {
          x += current.offsetLeft
          y += current.offsetTop
          current = current.offsetParent as HTMLElement | null
        }
        return { x, y }
      }
      elements.forEach((element) => {
        const parentId = element.dataset.parentId
        const parent = parentId ? byId.get(parentId) : undefined
        if (!parent) return
        const parentPosition = positionInTree(parent)
        const childPosition = positionInTree(element)
        const startX = parentPosition.x + parent.offsetWidth
        const startY = parentPosition.y + parent.offsetHeight / 2
        const endX = childPosition.x
        const endY = childPosition.y + element.offsetHeight / 2
        const middleX = startX + (endX - startX) / 2
        segments.push(`M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`)
      })
      setConnectors({ path: segments.join(' '), width: tree.scrollWidth, height: tree.scrollHeight })
    }

    measure()
    const frame = requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(tree)
    tree.querySelectorAll<HTMLElement>('[data-map-id]').forEach((element) => observer.observe(element))
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [nodes, scale, title])

  return <div className="curriculum-tree" ref={treeRef} style={{ zoom: scale }}>
    <svg className="curriculum-connectors" width={connectors.width} height={connectors.height} aria-hidden="true"><path d={connectors.path} /></svg>
    <ul><li><div className="map-node root-node" data-map-id="program-root"><strong>{title}</strong></div><ul>{nodes.map((node) => <MapBranch key={node.KZH} node={node} parentId="program-root" summaries={summaries} selected={selected} onSelect={onSelect} />)}</ul></li></ul>
  </div>
}

function MapBranch({ node, parentId, summaries, selected, onSelect }: { node: ProgramTreeNode; parentId: string; summaries: Map<string, ProgramNodeSummary>; selected: string; onSelect: (id: string) => void }) {
  const hasNote = Boolean(node.XDYQC || node.XDYQ || node.BZ)
  const summary = summaries.get(node.KZH)
  return <li><button type="button" className={`map-node ${selected === node.KZH ? 'selected' : ''}`} data-map-id={node.KZH} data-parent-id={parentId} onClick={() => void onSelect(node.KZH)}>
    <span>{node.KZM}</span><small>{summary ? formatMapSummary(summary) : '要求以方案说明为准'}</small>{hasNote && <i title="包含修读说明" aria-label="包含修读说明" />}
  </button>{node.children.length > 0 && <ul>{node.children.map((child) => <MapBranch key={child.KZH} node={child} parentId={node.KZH} summaries={summaries} selected={selected} onSelect={onSelect} />)}</ul>}</li>
}

function formatRequiredSummary(summary: ProgramNodeSummary) {
  const parts = []
  if (summary.requiredCourses != null) parts.push(`应修 ${formatCredits(summary.requiredCourses)} 门`)
  const creditRequirement = resolveProgramNodeCreditRequirement(summary)
  if (creditRequirement?.source === 'required') {
    parts.push(`应修 ${creditRequirement.values.map(formatCredits).join(' / ')} 学分`)
  } else if (creditRequirement?.source === 'fixed-course-list') {
    parts.push(`固定课程清单 ${creditRequirement.values.map(formatCredits).join(' / ')} 学分`)
  }
  if (parts.length) return parts.join(' · ')
  if (summary.moduleCount > 0) return `${summary.moduleCount} 个课程模块 · 学分待确认`
  return '要求学分待确认'
}

function formatMapSummary(summary: ProgramNodeSummary) {
  const creditRequirement = resolveProgramNodeCreditRequirement(summary)
  if (summary.requiredCourses != null || creditRequirement?.source === 'required') return formatRequiredSummary(summary)
  const parts = []
  if (summary.poolCourses != null) parts.push(`${formatCredits(summary.poolCourses)} 门`)
  if (summary.poolCredits != null) parts.push(`${formatCredits(summary.poolCredits)} 学分`)
  if (summary.poolCredits == null && summary.poolCourses != null) parts.push('学分待确认')
  return parts.length ? `课程清单 ${parts.join(' · ')}` : formatRequiredSummary(summary)
}

function formatPoolSummary(summary: ProgramNodeSummary) {
  const parts = []
  if (summary.poolCourses != null) parts.push(`${formatCredits(summary.poolCourses)} 门`)
  if (summary.poolCredits != null) parts.push(`${formatCredits(summary.poolCredits)} 学分`)
  if (summary.poolCredits == null && summary.poolCourses != null) parts.push('学分待确认')
  return parts.length ? `课程池 ${parts.join(' · ')}` : '未提供固定课程清单 · 学分待确认'
}

function formatCredits(value: number) {
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function CourseTable({ courses, compact = false, onSelect }: { courses: ProgramCourse[]; compact?: boolean; onSelect?: (course: ProgramCourse) => void }) {
  if (!courses.length) return <div className="empty-inline">该节点暂无课程，或课程由其他模块统一维护。</div>
  return <div className={`data-table-wrap ${compact ? 'compact' : ''}`}><table className="data-table"><thead><tr><th>课程</th><th>学分</th><th>建议学期</th><th>开课单位</th></tr></thead><tbody>{courses.map((course, index) => <tr key={`${course.KCH}-${index}`}><td><button type="button" className="course-table-button" onClick={() => onSelect?.(course)}><strong>{course.KCM}</strong><small>{course.KCH}</small></button></td><td>{formatCourseCredit(course.XF)}</td><td>{courseTerm(course) || '—'}</td><td>{String(course.KKYX_DISPLAY || course.KKDWDM_DISPLAY || course.KKDW_DISPLAY || '—')}</td></tr>)}</tbody></table></div>
}

function NodeDetailModal({ node, summary, courses, loading, missingCount, onRetry, onClose, onCourse }: { node: ProgramNode; summary: ProgramNodeSummary; courses: ProgramCourse[]; loading: boolean; missingCount: number; onRetry: () => void; onClose: () => void; onCourse: (course: ProgramCourse) => void }) {
  const [courseQuery, setCourseQuery] = useState('')
  const [courseUnit, setCourseUnit] = useState('')
  const [courseSort, setCourseSort] = useState<NodeCourseSort>('default')
  const units = useMemo(() => [...new Set(courses.map(courseUnitLabel).filter((value) => value !== '—'))].sort((left, right) => left.localeCompare(right, 'zh-CN')), [courses])
  const visibleCourses = useMemo(() => {
    const normalizedQuery = courseQuery.trim().toLocaleLowerCase('zh-CN')
    const filtered = courses.filter((course) => {
      const matchesQuery = !normalizedQuery || `${course.KCM || ''} ${course.KCH || ''}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
      return matchesQuery && (!courseUnit || courseUnitLabel(course) === courseUnit)
    })
    return sortNodeCourses(filtered, courseSort)
  }, [courseQuery, courseSort, courseUnit, courses])

  return <div className="modal-backdrop" role="presentation" onKeyDown={(event) => event.key === 'Escape' && onClose()} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="program-modal node-modal" role="dialog" aria-modal="true" aria-labelledby="node-detail-title">
      <header><div><h2 id="node-detail-title">{node.KZM}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭课程组详情" autoFocus><X size={20} /></button></header>
      <div className="node-modal-summary">
        <div><span>毕业要求</span><strong>{formatRequiredSummary(summary)}</strong></div>
        <div><span>课程清单</span><strong>{formatPoolSummary(summary)}</strong></div>
        {(node.XDYQC || node.XDYQ || node.BZ) && <p>{node.XDYQC || node.XDYQ || node.BZ}</p>}
      </div>
      {missingCount > 0 && <div className="warning-banner node-course-warning"><span>有 {missingCount} 个下级课程组暂未加载，当前结果可能不完整。</span><button type="button" className="secondary-button" onClick={onRetry} disabled={loading}>{loading && <LoaderCircle size={15} className="spin" />}重试</button></div>}
      <div className="node-modal-content">{loading ? <div className="center-loading"><LoaderCircle className="spin" />加载课程</div> : <>
        {courses.length > 0 && <>
          <section className="program-toolbar node-course-filter-toolbar" aria-label="课程组筛选与排序">
            <label><span>课程</span><input value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} placeholder="课程名或课程号" /></label>
            <label><span>开课单位</span><select value={courseUnit} onChange={(event) => setCourseUnit(event.target.value)}><option value="">全部单位</option>{units.map((unit) => <option value={unit} key={unit}>{unit}</option>)}</select></label>
            <label><span>排序</span><select value={courseSort} onChange={(event) => setCourseSort(event.target.value as NodeCourseSort)}><option value="default">默认顺序</option><option value="course-asc">课程名 A-Z</option><option value="course-desc">课程名 Z-A</option><option value="credit-desc">学分从高到低</option><option value="credit-asc">学分从低到高</option><option value="term-asc">建议学期优先</option></select></label>
          </section>
          <span className="record-count">{visibleCourses.length} / {courses.length} 门课程</span>
        </>}
        {visibleCourses.length > 0
          ? <CourseTable courses={visibleCourses} onSelect={onCourse} />
          : <div className="empty-inline">{courses.length ? '没有符合筛选条件的课程。' : '该节点暂无课程，或课程由其他模块统一维护。'}</div>}
      </>}</div>
      <footer><button type="button" className="secondary-button" onClick={onClose}>关闭</button></footer>
    </section>
  </div>
}

function deduplicateCourses(items: ProgramCourse[]) {
  const unique = new Map<string, ProgramCourse>()
  items.forEach((course) => {
    const key = course.KCH ? `code:${course.KCH}` : `name:${course.KCM}|term:${courseTerm(course) || ''}`
    if (!unique.has(key)) unique.set(key, course)
  })
  return [...unique.values()]
}

function courseUnitLabel(course: ProgramCourse) {
  return String(course.KKYX_DISPLAY || course.KKDWDM_DISPLAY || course.KKDW_DISPLAY || '—')
}

function sortNodeCourses(courses: ProgramCourse[], sort: NodeCourseSort) {
  const sorted = [...courses]
  if (sort === 'course-asc') return sorted.sort((left, right) => left.KCM.localeCompare(right.KCM, 'zh-CN'))
  if (sort === 'course-desc') return sorted.sort((left, right) => right.KCM.localeCompare(left.KCM, 'zh-CN'))
  if (sort === 'credit-desc') return sorted.sort((left, right) => (courseCreditValue(right.XF) || 0) - (courseCreditValue(left.XF) || 0))
  if (sort === 'credit-asc') return sorted.sort((left, right) => (courseCreditValue(left.XF) || 0) - (courseCreditValue(right.XF) || 0))
  if (sort === 'term-asc') return sorted.sort((left, right) => (courseTerm(left) || 'zzzz').localeCompare(courseTerm(right) || 'zzzz'))
  return sorted
}

function ProgramCourseModal({ course, onClose }: { course: ProgramCourse; onClose: () => void }) {
  const facts = [
    ['课程号', course.KCH],
    ['学分', `${formatCourseCredit(course.XF)} 学分`],
    ['建议学期', courseTerm(course) || '未指定'],
    ['开课单位', String(course.KKYX_DISPLAY || course.KKDWDM_DISPLAY || course.KKDW_DISPLAY || '—')],
    ['课程性质', String(course.KCXZDM_DISPLAY || course.KCLBDM_DISPLAY || '—')],
    ['课程类别', String(course.KCLBDM_DISPLAY || '—')],
  ]
  return <div className="modal-backdrop course-modal-layer" role="presentation" onKeyDown={(event) => event.key === 'Escape' && onClose()} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="course-modal" role="dialog" aria-modal="true" aria-labelledby="program-course-title">
      <header><div><h2 id="program-course-title">{course.KCM}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭课程详情" autoFocus><X size={20} /></button></header>
      <div className="course-facts">{facts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <footer><button type="button" className="secondary-button" onClick={onClose}>关闭</button></footer>
    </section>
  </div>
}

function ProgramDetail({ program, onClose }: { program: Program; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onKeyDown={(event) => event.key === 'Escape' && onClose()} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="program-modal" role="dialog" aria-modal="true" aria-labelledby="program-detail-title">
      <header><div><h2 id="program-detail-title">方案内容</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭方案内容" autoFocus><X size={20} /></button></header>
      <div className="program-facts">
        <div><span>方案类型</span><strong>{program.XDLXDM_DISPLAY || '主修'}</strong></div>
        <div><span>年级</span><strong>{program.NJDM_DISPLAY || '—'}</strong></div>
        <div><span>院系</span><strong>{program.DWDM_DISPLAY || '—'}</strong></div>
        <div><span>年级专业</span><strong>{program.ZYDM_DISPLAY || '—'}</strong></div>
        <div className="wide"><span>培养方案名称</span><strong>{program.PYFAMC}</strong></div>
        <div><span>培养层次</span><strong>{program.PYCCDM_DISPLAY || '本科'}</strong></div>
        <div><span>学习时间</span><strong>{program.XZNX || 4} 年</strong></div>
        <div><span>开始学年</span><strong>{program.KSXNDM_DISPLAY || `${program.NJDM_DISPLAY || '—'}学年`}</strong></div>
        <div><span>开始学期</span><strong>{program.KSXQDM_DISPLAY || '第1学期'}</strong></div>
      </div>
      <div className="program-copy">
        <article><h3>专业介绍</h3><p>{program.FATS || '暂无内容'}</p></article>
        <article><h3>培养目标</h3><p>{program.PYMB || '暂无内容'}</p></article>
        <article><h3>学制、总学分与学位授予</h3><p>{program.XDYQ || '暂无内容'}</p></article>
        <article><h3>专业准出要求</h3><p>{program.ZGKC || '暂无内容'}</p></article>
      </div>
      <footer><button type="button" className="secondary-button" onClick={onClose}>关闭</button></footer>
    </section>
  </div>
}
