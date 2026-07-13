import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { GraduationCap, Info, LayoutList, LoaderCircle, Search, X } from 'lucide-react'
import { api, ApiError, query } from '../api'
import type { AcademicProfile, Program, ProgramCourse, ProgramNode, Session } from '../types'
import { courseTerm, gradeYear, programBrowserStorageKey, selectOwnedProgram } from '../utils'

type Mode = 'structure' | 'year'
type TreeItem = ProgramNode & { children: TreeItem[] }
type NodeCourseSort = 'default' | 'course-asc' | 'course-desc' | 'credit-desc' | 'credit-asc' | 'term-asc'

export function ProgramView({ session, onUnauthorized }: { session: Session; onUnauthorized: () => void }) {
  const [programs, setPrograms] = useState<Program[]>([])
  const [allPrograms, setAllPrograms] = useState<Program[]>([])
  const [programId, setProgramId] = useState('')
  const [detail, setDetail] = useState<Program | null>(null)
  const [nodes, setNodes] = useState<ProgramNode[]>([])
  const [courses, setCourses] = useState<Record<string, ProgramCourse[]>>({})
  const [selectedNode, setSelectedNode] = useState('')
  const [searchText, setSearchText] = useState('')
  const [year, setYear] = useState(gradeYear(session.username))
  const [loadedProgramYear, setLoadedProgramYear] = useState('')
  const [department, setDepartment] = useState('')
  const [studyType, setStudyType] = useState('')
  const [mode, setMode] = useState<Mode>('structure')
  const [showDetail, setShowDetail] = useState(false)
  const [showNodeDetail, setShowNodeDetail] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState<ProgramCourse | null>(null)
  const [loading, setLoading] = useState(true)
  const [nodeCourseLoading, setNodeCourseLoading] = useState(false)
  const [yearCourseLoading, setYearCourseLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const programListRequestRef = useRef(0)
  const programRequestRef = useRef(0)
  const nodeCourseRequestRef = useRef(0)
  const yearCourseRequestRef = useRef(0)
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
    setLoading(true)
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
    void api.cached<AcademicProfile>('/api/academic/profile', { ttl: 30 * 60_000 }).then((profile) => {
      if (!active) return
      profileRef.current = profile
      setYear(profile.grade)
      return loadPrograms(profile.grade)
    }).catch((caught) => {
      if (!active) return
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
      void loadPrograms(gradeYear(session.username))
    })
    return () => { active = false }
  }, [loadPrograms, onUnauthorized, session.username])

  useEffect(() => {
    const requestId = ++programRequestRef.current
    nodeCourseRequestRef.current += 1
    yearCourseRequestRef.current += 1
    setNodeCourseLoading(false)
    setYearCourseLoading(false)
    if (!programId) {
      setDetail(null)
      setNodes([])
      setCourses({})
      setSelectedNode('')
      return
    }
    setLoading(true)
    setError('')
    setDetail(null)
    setNodes([])
    setCourses({})
    setSelectedNode('')
    void (async () => {
      try {
        const [program, nodeItems] = await Promise.all([
          api.cached<Program>(`/api/programs/${encodeURIComponent(programId)}`, { ttl: 30 * 60_000 }),
          api.cached<ProgramNode[]>(`/api/programs/${encodeURIComponent(programId)}/nodes`, { ttl: 30 * 60_000 }),
        ])
        if (requestId !== programRequestRef.current) return

        const courseNodes = nodeItems.filter((node) => node.KZLXDM === '01')
        const prefetchedCourses: Record<string, ProgramCourse[]> = {}
        for (let index = 0; index < courseNodes.length; index += 4) {
          if (requestId !== programRequestRef.current) return
          const batch = courseNodes.slice(index, index + 4)
          const responses = await Promise.allSettled(batch.map((node) =>
            api.cached<ProgramCourse[]>(`/api/programs/${encodeURIComponent(programId)}/nodes/${encodeURIComponent(node.KZH)}/courses`, { ttl: 30 * 60_000 })
          ))
          if (requestId !== programRequestRef.current) return
          batch.forEach((node, batchIndex) => {
            const response = responses[batchIndex]
            if (response.status === 'fulfilled') prefetchedCourses[node.KZH] = response.value
          })
        }

        if (requestId !== programRequestRef.current) return
        setDetail(program)
        setNodes(nodeItems)
        setCourses(prefetchedCourses)
        setSelectedNode(courseNodes[0]?.KZH || '')
      } catch (caught) {
        if (requestId !== programRequestRef.current) return
        if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
        setError(caught instanceof Error ? caught.message : '方案内容加载失败')
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

  const selectedCourses = selectedNode ? courses[selectedNode] : undefined

  useEffect(() => {
    const requestId = ++nodeCourseRequestRef.current
    if (!selectedNode || selectedCourses || !programId) {
      setNodeCourseLoading(false)
      return
    }
    setNodeCourseLoading(true)
    api.cached<ProgramCourse[]>(`/api/programs/${encodeURIComponent(programId)}/nodes/${encodeURIComponent(selectedNode)}/courses`, { ttl: 30 * 60_000 }).then((items) => {
      if (requestId !== nodeCourseRequestRef.current) return
      setCourses((current) => ({ ...current, [selectedNode]: items }))
    }).catch((caught) => {
      if (requestId !== nodeCourseRequestRef.current) return
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
      setError(caught instanceof Error ? caught.message : '课程加载失败')
    }).finally(() => {
      if (requestId === nodeCourseRequestRef.current) setNodeCourseLoading(false)
    })
  }, [onUnauthorized, programId, selectedCourses, selectedNode])

  async function switchMode(next: Mode) {
    const requestId = ++yearCourseRequestRef.current
    setMode(next)
    if (next !== 'year') {
      setYearCourseLoading(false)
      setProgress('')
      return
    }
    const activeProgramId = programId
    const missing = nodes.filter((node) => node.KZLXDM === '01' && !courses[node.KZH])
    if (!missing.length) return
    setYearCourseLoading(true)
    try {
      for (let index = 0; index < missing.length; index += 4) {
        if (requestId !== yearCourseRequestRef.current) return
        const batch = missing.slice(index, index + 4)
        setProgress(`正在整理课程 ${Math.min(index + 4, missing.length)} / ${missing.length}`)
        const responses = await Promise.all(batch.map((node) =>
          api.cached<ProgramCourse[]>(`/api/programs/${encodeURIComponent(activeProgramId)}/nodes/${encodeURIComponent(node.KZH)}/courses`, { ttl: 30 * 60_000 })
        ))
        if (requestId !== yearCourseRequestRef.current) return
        const additions: Record<string, ProgramCourse[]> = {}
        batch.forEach((node, batchIndex) => { additions[node.KZH] = responses[batchIndex] })
        setCourses((current) => ({ ...current, ...additions }))
      }
    } catch (caught) {
      if (requestId !== yearCourseRequestRef.current) return
      setError(caught instanceof Error ? caught.message : '学年模式加载失败')
    } finally {
      if (requestId === yearCourseRequestRef.current) {
        setYearCourseLoading(false)
        setProgress('')
      }
    }
  }

  const tree = useMemo(() => buildTree(nodes), [nodes])
  const departments = useMemo(() => [...new Set(allPrograms.map((item) => item.DWDM_DISPLAY).filter(Boolean) as string[])].sort(), [allPrograms])
  const years = useMemo(() => {
    const current = new Date().getFullYear()
    const values = Array.from({ length: 10 }, (_, index) => String(current - index))
    if (!values.includes(gradeYear(session.username))) values.push(gradeYear(session.username))
    return values.sort((a, b) => Number(b) - Number(a))
  }, [session.username])
  const selected = nodes.find((node) => node.KZH === selectedNode)
  const allCourses = useMemo(() => {
    const unique = new Map<string, ProgramCourse>()
    Object.values(courses).flat().forEach((course) => {
      unique.set(`${course.KCH}-${course.KCM}-${course.XNXQ || ''}`, course)
    })
    return [...unique.values()]
  }, [courses])
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
        <div className="segmented segmented-two" role="group" aria-label="培养方案展示模式" data-active-index={mode === 'structure' ? 0 : 1}>
          <span className="segmented-indicator" aria-hidden="true" />
          <button type="button" aria-pressed={mode === 'structure'} className={mode === 'structure' ? 'active' : ''} onClick={() => void switchMode('structure')}><LayoutList size={15} />结构模式</button>
          <button type="button" aria-pressed={mode === 'year'} className={mode === 'year' ? 'active' : ''} onClick={() => void switchMode('year')}><GraduationCap size={15} />学年模式</button>
        </div>
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
      {loading && <div className="center-loading"><LoaderCircle className="spin" />正在连接培养方案服务</div>}

      {!loading && mode === 'structure' && <>
        <section className="curriculum-map-section">
          <div className="section-title program-structure-title"><div><h2>培养方案结构</h2><p>点击节点查看课程；橙色标记表示节点包含修读说明</p></div>{detail && <button type="button" className="program-detail-button" onClick={() => setShowDetail(true)}><Info size={16} />查看方案内容</button>}</div>
          <div className="curriculum-map"><CurriculumMap title={detail?.PYFAMC || '培养方案'} nodes={tree} selected={selectedNode} onSelect={selectNode} /></div>
        </section>
      </>}

      {!loading && mode === 'year' && <section className="year-mode">
        {yearCourseLoading && <div className="progress-line"><LoaderCircle size={17} className="spin" />{progress || '正在整理学年课程'}</div>}
        <div className="year-roadmap">
          {academicYears.map((academicYear, index) => <article className="academic-year" key={academicYear.code}>
            <div className="year-label"><span>第{['一', '二', '三', '四'][index] || index + 1}学年</span><strong>{academicYear.label}</strong></div>
            <div className="term-columns">{academicYear.terms.map((term) => {
              const items = allCourses.filter((course) => course.XNXQ === term.code || courseTerm(course) === term.code)
              const credits = items.reduce((sum, item) => sum + Number(item.XF || 0), 0)
              return <section className="term-column" key={term.code}>
                <header><div><strong>{term.label}</strong><span>{term.code}</span></div><small>{items.length} 门 · {formatCredits(credits)} 学分</small></header>
                {items.length ? <div className="term-courses">{items.map((course, courseIndex) => <button type="button" onClick={() => setSelectedCourse(course)} key={`${course.KCH}-${courseIndex}`}><strong>{course.KCM}</strong><span>{course.KCH} · {course.XF || '—'} 学分</span></button>)}</div> : <div className="term-empty">暂无指定课程</div>}
              </section>
            })}</div>
          </article>)}
          {!yearCourseLoading && allCourses.filter((course) => !course.XNXQ).length > 0 && <article className="unscheduled-courses"><div><strong>未指定学期</strong><span>选修模块或由学生自主安排</span></div><CourseTable courses={allCourses.filter((course) => !course.XNXQ)} compact onSelect={setSelectedCourse} /></article>}
        </div>
      </section>}
      {showNodeDetail && selected && <NodeDetailModal node={selected} courses={courses[selectedNode] || []} loading={nodeCourseLoading} onClose={() => setShowNodeDetail(false)} onCourse={setSelectedCourse} />}
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

function buildTree(nodes: ProgramNode[]): TreeItem[] {
  const map = new Map(nodes.map((node) => [node.KZH, { ...node, children: [] as TreeItem[] }]))
  const roots: TreeItem[] = []
  map.forEach((node) => {
    const parent = map.get(node.FKZH)
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  const sort = (items: TreeItem[]) => items.sort((a, b) => (a.PX || 0) - (b.PX || 0)).forEach((item) => sort(item.children))
  sort(roots)
  return roots
}

function CurriculumMap({ title, nodes, selected, onSelect }: { title: string; nodes: TreeItem[]; selected: string; onSelect: (id: string) => void }) {
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
  }, [nodes, title])

  return <div className="curriculum-tree" ref={treeRef}>
    <svg className="curriculum-connectors" width={connectors.width} height={connectors.height} aria-hidden="true"><path d={connectors.path} /></svg>
    <ul><li><div className="map-node root-node" data-map-id="program-root"><strong>{title}</strong></div><ul>{nodes.map((node) => <MapBranch key={node.KZH} node={node} parentId="program-root" selected={selected} onSelect={onSelect} />)}</ul></li></ul>
  </div>
}

function MapBranch({ node, parentId, selected, onSelect }: { node: TreeItem; parentId: string; selected: string; onSelect: (id: string) => void }) {
  const hasNote = Boolean(node.XDYQC || node.XDYQ || node.BZ)
  return <li><button type="button" className={`map-node ${selected === node.KZH ? 'selected' : ''}`} data-map-id={node.KZH} data-parent-id={parentId} onClick={() => void onSelect(node.KZH)}>
    <span>{node.KZM}</span><small>{requirementText(node)}</small>{hasNote && <i title="包含修读说明" aria-label="包含修读说明" />}
  </button>{node.children.length > 0 && <ul>{node.children.map((child) => <MapBranch key={child.KZH} node={child} parentId={node.KZH} selected={selected} onSelect={onSelect} />)}</ul>}</li>
}

function requirementText(node: ProgramNode) {
  const parts = []
  if (node.KCZMS) parts.push(`${node.KCZMS} 门`)
  if (node.KCZXF) parts.push(`共 ${node.KCZXF} 学分`)
  if (node.ZSXDXF != null) parts.push(`至少 ${node.ZSXDXF} 学分`)
  return parts.join(' · ') || node.KZLXDM_DISPLAY || '课程节点'
}

function formatCredits(value: number) {
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function CourseTable({ courses, compact = false, onSelect }: { courses: ProgramCourse[]; compact?: boolean; onSelect?: (course: ProgramCourse) => void }) {
  if (!courses.length) return <div className="empty-inline">该节点暂无课程，或课程由其他模块统一维护。</div>
  return <div className={`data-table-wrap ${compact ? 'compact' : ''}`}><table className="data-table"><thead><tr><th>课程</th><th>学分</th><th>建议学期</th><th>开课单位</th></tr></thead><tbody>{courses.map((course, index) => <tr key={`${course.KCH}-${index}`}><td><button type="button" className="course-table-button" onClick={() => onSelect?.(course)}><strong>{course.KCM}</strong><small>{course.KCH}</small></button></td><td>{String(course.XF ?? '—')}</td><td>{courseTerm(course) || '—'}</td><td>{String(course.KKYX_DISPLAY || course.KKDWDM_DISPLAY || course.KKDW_DISPLAY || '—')}</td></tr>)}</tbody></table></div>
}

function NodeDetailModal({ node, courses, loading, onClose, onCourse }: { node: ProgramNode; courses: ProgramCourse[]; loading: boolean; onClose: () => void; onCourse: (course: ProgramCourse) => void }) {
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
      <div className="node-modal-summary"><strong>{requirementText(node)}</strong>{(node.XDYQC || node.XDYQ || node.BZ) && <p>{node.XDYQC || node.XDYQ || node.BZ}</p>}</div>
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

function courseUnitLabel(course: ProgramCourse) {
  return String(course.KKYX_DISPLAY || course.KKDWDM_DISPLAY || course.KKDW_DISPLAY || '—')
}

function sortNodeCourses(courses: ProgramCourse[], sort: NodeCourseSort) {
  const sorted = [...courses]
  if (sort === 'course-asc') return sorted.sort((left, right) => left.KCM.localeCompare(right.KCM, 'zh-CN'))
  if (sort === 'course-desc') return sorted.sort((left, right) => right.KCM.localeCompare(left.KCM, 'zh-CN'))
  if (sort === 'credit-desc') return sorted.sort((left, right) => Number(right.XF || 0) - Number(left.XF || 0))
  if (sort === 'credit-asc') return sorted.sort((left, right) => Number(left.XF || 0) - Number(right.XF || 0))
  if (sort === 'term-asc') return sorted.sort((left, right) => (courseTerm(left) || 'zzzz').localeCompare(courseTerm(right) || 'zzzz'))
  return sorted
}

function ProgramCourseModal({ course, onClose }: { course: ProgramCourse; onClose: () => void }) {
  const facts = [
    ['课程号', course.KCH],
    ['学分', `${String(course.XF ?? '—')} 学分`],
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
