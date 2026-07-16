from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def test_program_map_exposes_accessible_zoom_controls() -> None:
    source = (ROOT / "frontend" / "src" / "components" / "Program.tsx").read_text(
        encoding="utf-8"
    )

    assert 'aria-label="缩小结构图"' in source
    assert 'aria-label="重置结构图缩放"' in source
    assert 'aria-label="放大结构图"' in source

    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")
    assert "overflow-x: auto; overflow-y: hidden" in styles
    assert ".program-structure-title { align-items: flex-start; flex-direction: column" in styles
    assert ".map-zoom-controls button:focus-visible { outline-offset: -3px; }" in styles


def test_program_surfaces_distinguish_requirements_from_course_ranges() -> None:
    program = (ROOT / "frontend" / "src" / "components" / "Program.tsx").read_text(
        encoding="utf-8"
    )
    overview = (ROOT / "frontend" / "src" / "components" / "Overview.tsx").read_text(
        encoding="utf-8"
    )

    assert "课程清单 ${parts.join(' · ')}" in program
    assert "<h2>课程范围</h2>" in program
    assert "分支、限选或选修课程" in program
    assert "requirementOptions" in overview


def test_mobile_dialogs_fill_the_viewport_without_user_agent_width_caps() -> None:
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert ".program-modal, .course-modal, .credit-modal, .support-modal, .notice-modal, .nju-site-modal { width: 100%; max-width: none;" in styles


def test_keyboard_focus_indicator_uses_a_solid_high_contrast_outline() -> None:
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert ":focus-visible { outline: 2px solid var(--purple); outline-offset: 2px;" in styles


def test_review_navigation_and_heading_use_red_black_list_name() -> None:
    shell = (ROOT / "frontend" / "src" / "components" / "Shell.tsx").read_text(
        encoding="utf-8"
    )
    reviews = (ROOT / "frontend" / "src" / "components" / "Reviews.tsx").read_text(
        encoding="utf-8"
    )
    metadata = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")

    assert "label: '红黑榜'" in shell
    assert '<h1>红黑榜</h1>' in reviews
    assert "成绩、红黑榜与备忘录" in metadata


def test_credit_drilldown_shows_dynamic_matching_basis_and_official_category() -> None:
    source = (ROOT / "frontend" / "src" / "components" / "Overview.tsx").read_text(
        encoding="utf-8"
    )

    assert "大学英语按本人培养方案" in source
    assert "BY9_DISPLAY" in source
    assert "XGXKLBDM_DISPLAY" in source


def test_reading_plan_uses_the_standard_course_row_layout() -> None:
    source = (ROOT / "frontend" / "src" / "components" / "Overview.tsx").read_text(
        encoding="utf-8"
    )

    assert "__readingPlan: true" in source
    assert "培养方案认定 · ${String(course.XF ?? '—')} 学分 · 三门课程" in source
    assert "已完成 · 平均成绩 ${grade.ZCJ}" in source
    assert "悦读经典计划已认定" not in source


def test_notices_open_details_and_create_linked_memos() -> None:
    source = (ROOT / "frontend" / "src" / "components" / "CampusServices.tsx").read_text(
        encoding="utf-8"
    )
    memos = (ROOT / "frontend" / "src" / "components" / "Memos.tsx").read_text(
        encoding="utf-8"
    )

    assert "添加到备忘录" in source
    assert "BookmarkPlus" in source
    assert "BellRing size={17}" not in source
    assert "ReactMarkdown" in source
    assert "'/api/notices?limit=12&refresh=true'" in source
    assert "'/api/notices?limit=12'" in source
    assert "limit=8" not in source
    assert "linkUrl: notice.url" in source
    assert "window.addEventListener(MEMOS_CHANGED_EVENT, sync)" in source
    assert "memo.linkUrl" in memos
    assert "window.dispatchEvent(new Event(MEMOS_CHANGED_EVENT))" in memos


def test_notice_images_are_suppressed_and_button_links_have_no_underlines() -> None:
    source = (ROOT / "frontend" / "src" / "components" / "CampusServices.tsx").read_text(
        encoding="utf-8"
    )
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert "img: () => null" in source
    assert "通知图片" not in source
    assert re.search(
        r"\.primary-button, \.secondary-button \{[^}]*text-decoration: none;",
        styles,
    )


def test_about_support_and_contact_sections_are_visually_separated() -> None:
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert ".contact-section { padding-top: 27px; border-top: 1px solid var(--line); }" in styles
    assert ".support-section .secondary-button { align-self: center; }" in styles


def test_nju_tabs_uses_sanitized_default_urls_and_user_scoped_storage() -> None:
    source = (ROOT / "frontend" / "src" / "components" / "NjuTabs.tsx").read_text(
        encoding="utf-8"
    )

    assert "nanyong-nju-tabs:${username}" in source
    assert "gid_=" not in source
    assert "clientuin=" not in source
    assert "https://ndwy.nju.edu.cn/dztml/#/" in source
    assert "https://mail.smail.nju.edu.cn/" in source
    assert "https://lib.nju.edu.cn/#Page1" in source
    assert "恢复默认网站" in source

    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")
    assert '.segmented[data-active-index="4"] .segmented-indicator { transform: translateX(400%); }' in styles
    assert ".nju-site-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));" in styles


def test_schedule_hover_uses_title_color_without_a_colored_frame() -> None:
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert ".course-block:hover { filter: none; box-shadow: none; }" in styles
    assert ".course-block:hover strong { color: var(--purple); }" in styles


def test_program_selector_uses_compact_type_and_height() -> None:
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert ".program-selector-row > div { min-width: 0; min-height: 38px;" in styles
    assert ".program-selector-row select { width: 100%; height: 38px; min-height: 38px;" in styles
    assert "font-size: 12px;" in styles


def test_mail_placeholder_and_about_release_note_match_v2_0_2_copy() -> None:
    campus_services = (
        ROOT / "frontend" / "src" / "components" / "CampusServices.tsx"
    ).read_text(encoding="utf-8")
    about = (ROOT / "frontend" / "src" / "components" / "About.tsx").read_text(
        encoding="utf-8"
    )

    assert "邮箱接口暂未开放，敬请期待。" in campus_services
    assert "邮箱内容暂不由本站读取" not in campus_services
    assert "v2.0.2" in about
    assert "Windows" in about
    assert "反复弹出命令窗口" in about


def test_main_content_uses_the_available_width_with_symmetric_gutters() -> None:
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert ".content { width: 100%; margin: 0; padding: 24px 44px 72px; }" in styles
    assert "width: min(1420px, 100%)" not in styles


def test_academic_views_render_snapshots_before_background_refresh() -> None:
    overview = (ROOT / "frontend" / "src" / "components" / "Overview.tsx").read_text(
        encoding="utf-8"
    )
    schedule = (ROOT / "frontend" / "src" / "components" / "Schedule.tsx").read_text(
        encoding="utf-8"
    )
    program = (ROOT / "frontend" / "src" / "components" / "Program.tsx").read_text(
        encoding="utf-8"
    )

    assert "api.peek<AcademicOverview>('/api/academic/overview')" in overview
    assert "await academicRefresh" in overview
    assert "loading || rankingLoading ? 'spin'" in overview
    assert "const hadCache = !force && api.hasCache(basePath)" in schedule
    assert "refresh: 'true'" in schedule
    assert "const initialDetail = initialProgramPath ? api.peek<Program>" in program


def test_link_hover_language_matches_notice_titles() -> None:
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert ".notice-title-button:hover, .nju-site-list article > a:not(.icon-button):hover strong, .mail-service-link:hover strong, .contact-list a:hover strong { color: var(--purple); }" in styles


def test_program_and_campus_use_the_same_segmented_control_interaction() -> None:
    program = (ROOT / "frontend" / "src" / "components" / "Program.tsx").read_text(
        encoding="utf-8"
    )
    campus = (ROOT / "frontend" / "src" / "components" / "CampusServices.tsx").read_text(
        encoding="utf-8"
    )
    reviews = (ROOT / "frontend" / "src" / "components" / "Reviews.tsx").read_text(
        encoding="utf-8"
    )
    control = (ROOT / "frontend" / "src" / "components" / "SegmentedControl.tsx").read_text(
        encoding="utf-8"
    )

    assert "<SegmentedControl" in program
    assert "<SegmentedControl" in campus
    assert "<SegmentedControl" in reviews
    assert '<div className="segmented' not in program
    assert '<div className="segmented' not in campus
    assert '<div className="segmented' not in reviews
    assert 'role="tablist"' in control
    assert 'role="tab"' in control
    assert "ArrowRight" in control
    assert "ArrowLeft" in control
    assert "Home" in control
    assert "End" in control

    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")
    assert ".segmented button:hover { color: var(--purple); }" in styles
    assert ".service-tabs button:hover" not in styles


def test_ai_assistant_beta_entry_is_visible_and_read_only() -> None:
    shell = (ROOT / "frontend" / "src" / "components" / "Shell.tsx").read_text(encoding="utf-8")
    app = (ROOT / "frontend" / "src" / "App.tsx").read_text(encoding="utf-8")
    assistant = (ROOT / "frontend" / "src" / "components" / "AiAssistant.tsx").read_text(encoding="utf-8")
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert "label: 'AI 助手'" in shell
    assert "nav-beta" in shell
    assert "AiAssistant" in app
    assert "仅保存在当前浏览器" in assistant
    assert "/api/ai/chat" in assistant
    assert ".ai-layout {" in styles


def test_ai_chat_uses_one_bubble_and_scrolls_only_the_transcript() -> None:
    assistant = (ROOT / "frontend" / "src" / "components" / "AiAssistant.tsx").read_text(
        encoding="utf-8"
    )
    shell = (ROOT / "frontend" / "src" / "components" / "Shell.tsx").read_text(
        encoding="utf-8"
    )
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert "src={assetUrl('default-avatar.jpeg')}" in assistant
    assert "小蓝鲸" in assistant
    assert "按需查询你的南大信息" not in assistant
    assert "已准备好查询" not in assistant
    assert "深度思考中" in assistant
    assert 'className="ai-message-bubble"' in assistant
    assert "ref={transcriptRef}" in assistant
    assert "transcriptViewport.scrollTo" in assistant
    assert "ai-main-column" in shell
    assert ".ai-main-column { overflow-y: hidden;" in styles
    assert ".ai-transcript { min-height: 0; overflow-y: auto;" in styles
    assert ".ai-message-bubble {" in styles
    assert ".ai-message-bubble > :last-child { margin-bottom: 0; }" in styles


def test_ai_connection_fields_do_not_look_like_a_login_form_to_safari() -> None:
    assistant = (ROOT / "frontend" / "src" / "components" / "AiAssistant.tsx").read_text(
        encoding="utf-8"
    )
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert "DEFAULT_MODEL = 'deepseek-v4-pro'" in assistant
    assert 'type="url"' in assistant
    assert 'name="llm-endpoint"' in assistant
    assert 'name="llm-model"' in assistant
    assert 'name="llm-api-token"' in assistant
    assert 'className="ai-secret-input"' in assistant
    assert 'type="password"' not in assistant
    assert assistant.count('autoComplete="off"') >= 2
    assert 'autoComplete="one-time-code"' in assistant
    assert "'\\u2022'.repeat(apiKey.length)" in assistant
    assert 'className="ai-secret-mask"' in assistant
    assert "-webkit-text-security" not in styles
    assert ".ai-secret-mask" in styles


def test_ai_connection_settings_are_restored_from_local_storage() -> None:
    assistant = (ROOT / "frontend" / "src" / "components" / "AiAssistant.tsx").read_text(
        encoding="utf-8"
    )

    assert "AI_CONNECTION_STORAGE_KEY" in assistant
    assert "window.localStorage.getItem(AI_CONNECTION_STORAGE_KEY)" in assistant
    assert "window.localStorage.setItem(AI_CONNECTION_STORAGE_KEY" in assistant
    assert "仅保存在当前浏览器，不会写入本站数据库或服务端日志" in assistant
    assert "请勿在模型服务账户中存放过高余额" in assistant
    assert "清空此字段即可删除已保存的密钥" in assistant


def test_ai_suggested_prompts_require_an_api_key() -> None:
    assistant = (ROOT / "frontend" / "src" / "components" / "AiAssistant.tsx").read_text(
        encoding="utf-8"
    )
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert "function choosePrompt(prompt: string)" in assistant
    assert "if (!apiKey.trim())" in assistant
    assert "apiKeyRef.current?.focus()" in assistant
    assert "setNeedsApiKey(true)" in assistant
    assert "onClick={() => choosePrompt(prompt)}" in assistant
    assert "onClick={() => setDraft(prompt)}" not in assistant
    assert ".ai-field.ai-field-attention input" in styles


def test_ai_empty_state_randomly_selects_one_of_four_messages() -> None:
    assistant = (ROOT / "frontend" / "src" / "components" / "AiAssistant.tsx").read_text(
        encoding="utf-8"
    )

    assert "问问你的南大资讯" in assistant
    assert "整合南大资讯，赋能每一个人" in assistant
    assert "探索未至之境" in assistant
    assert "让 AI 惠及所有人" in assistant
    assert assistant.count("回答将会标注所使用的数据来源。") >= 10
    assert "Math.floor(Math.random() * emptyMessages.length)" in assistant
    assert "useState(pickEmptyMessage)" in assistant
    assert "问问你的南大数据" not in assistant
    assert "不会替代学校系统的最终结果" not in assistant


def test_planner_uses_click_to_edit_week_cells_and_five_custom_lists() -> None:
    planner = (ROOT / "frontend" / "src" / "components" / "PlannerBoard.tsx").read_text(encoding="utf-8")
    state = (ROOT / "frontend" / "src" / "planner-state.ts").read_text(encoding="utf-8")
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert "planner-week-canvas" in planner
    assert "planner-week-nav" in planner
    assert "键入 # 选择课程" in planner
    assert "planner-course-picker" in planner
    assert "if (!event.currentTarget.contains(event.relatedTarget as Node | null)) addTask()" in planner
    assert "movePlannerTaskDate" in planner
    assert "Array.from({ length: 5 }" in planner
    assert "const MAX_COLUMN_TASKS = 9" in planner
    assert "hasTargetCapacity" in planner
    assert "title={task.title}" in planner
    assert "clickTimerRef" not in planner
    assert '<button type="button" className="planner-task-check"' in planner
    assert "event.stopPropagation(); onToggle()" in planner
    assert "if (!editing) onEdit()" in planner
    assert "updatePlannerTaskTitle" in planner
    assert "task.date === date && !task.listId" in planner
    assert "inlineTarget.kind === 'list' ? inlineTarget.id : undefined" in planner
    assert planner.count("dragging={draggedTaskId === task.id}") == 2
    assert planner.count("onDragEnd={() => setDraggedTaskId(null)}") == 2
    assert "onClick={() => startRename(list)}" in planner
    assert "TaskDetailModal" not in planner
    assert "MoreHorizontal" not in planner
    assert "PlannerListTask" not in planner
    assert "renderInlineEditor('day', date)" in planner
    assert "renderInlineEditor('list', list.id)" in planner
    assert "planner-day-empty" in planner
    assert "dayLabel(date)" in planner
    assert "value === todayDate() ? '今天'" in planner
    assert "slide-${slideDirection}" in planner
    assert "planner-week-toolbar" not in planner
    assert "planner-weektodo-composer" not in planner
    assert "新建计划" not in planner
    assert "新建列表" not in planner
    assert "删除${list.name}" not in planner
    assert "查看使用说明" in planner
    assert "单击任务左侧圆点" in planner
    assert "单击任务内容" in planner
    assert "清空全部文字并确认" in planner
    assert "右键任务" in planner
    assert "onContextMenu" in planner
    assert "planner-context-menu" in planner
    assert "删除日程" in planner
    assert "键入 #" in planner
    assert "拖动任务" in planner
    assert "每列最多 9 项" in planner
    assert "切换日期" not in planner
    assert "本地保存" not in planner
    assert "添加任务</strong>" not in planner
    assert "把这一周要做的事" not in planner
    assert "按你的方式整理任务" not in planner
    assert "addPlannerList" in state
    assert "removePlannerList" in state
    assert "createDefaultLists(now" in state
    assert ".planner-week-grid" in styles
    assert ".planner-course-picker" in styles
    assert "grid-template-columns: repeat(5" in styles
    assert ".planner-weektodo-page .planner-board-heading h1 { font-size: 34px; }" in styles
    assert "height: 35px" in styles
    assert "grid-template-rows: 72px 315px" in styles
    assert ".planner-day-tasks { min-height: 0; overflow: hidden" in styles
    assert "flex: 1 0 35px" in styles
    assert ".planner-week-task.dragging" in styles
    assert "padding: 0" in styles
    assert "padding: 0 10px" in styles
    assert ":hover" not in "\n".join(line for line in styles.splitlines() if ".planner" in line)
    assert ".planner-inline-editor > input:focus { border: 0; box-shadow: none; }" in styles
    assert "createPortal" in planner
    assert "coursePickerPosition" in planner
    assert "position: fixed" in styles
    assert "planner-slide-left" in styles
    assert "animation: planner-slide-left .65s" in styles
    assert "translateX(20%)" in styles
    assert "translateX(-20%)" in styles
    assert ".planner-week-canvas { min-width: 0; width: 100%;" in styles
    assert ".planner-week-nav" in styles
    assert "完成率" not in planner


def test_ai_suggested_questions_randomly_select_three_from_a_larger_pool() -> None:
    assistant = (ROOT / "frontend" / "src" / "components" / "AiAssistant.tsx").read_text(
        encoding="utf-8"
    )

    assert "suggestedPromptPool" in assistant
    assert "pickSuggestedPrompts" in assistant
    assert "useState(pickSuggestedPrompts)" in assistant
    assert "return shuffled.slice(0, 3)" in assistant
    assert "我的大学英语和体育课认定完成了吗？" in assistant
    assert "五育活动里我参与了哪些项目？" in assistant
    assert "第二课堂目前有多少活动和服务时长？" in assistant
    assert "我的课表哪几天最忙？" in assistant
    assert "最近有哪些通知和我的年级有关？" in assistant
    assert "根据培养方案，我下学期适合修哪些课程？" in assistant


def test_five_education_uses_real_read_only_dashboard() -> None:
    root = ROOT / "frontend" / "src"
    campus = (root / "components" / "CampusServices.tsx").read_text(encoding="utf-8")
    app = (root / "App.tsx").read_text(encoding="utf-8")
    component = (root / "components" / "FiveEducation.tsx").read_text(encoding="utf-8")

    assert "<FiveEducation onUnauthorized={onUnauthorized} />" in campus
    assert "<CampusServices username={session.username} onUnauthorized={handleUnauthorized}" in app
    assert "const OVERVIEW_PATH = '/api/five-education/overview'" in component
    assert "const ACTIVITIES_PATH = '/api/five-education/activities'" in component
    assert "api.cached<FiveEducationOverview>(`${OVERVIEW_PATH}?refresh=true`" in component
    assert 'aria-label="五育活动分布雷达图"' in component
    assert "同年级平均" in component
    assert "成长模块" in component
    assert "劳育构成" in component
    assert "我的活动" in component
    assert "查看学习导引图" in component
    assert "assetUrl('five-education-labor-guide.svg')" in component
    assert "five-activity-modal" in component
    assert "活动详情" in component
    assert "five-evaluation-card" not in component
    assert "/five-education-labor-guide.png" not in component
    assert "我的兴趣" not in component
    assert component.count("href={overview.source.systemUrl}") == 1
    assert "five-education-source" not in component
    assert "updateSearchMks" not in component
    assert "wdhdMe" not in component
    assert "电子成绩单" not in component


def test_five_education_dimension_table_and_labor_cards_are_visually_consistent() -> None:
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert ".five-dimension-list > div { min-height: 47px; grid-template-columns: repeat(3, minmax(0, 1fr));" in styles
    assert ".five-dimension-list > div > * { text-align: center; }" in styles
    assert ".five-labor-grid .total { background: var(--surface-raised); }" in styles


def test_five_education_and_second_classroom_use_semantic_system_icons() -> None:
    components = ROOT / "frontend" / "src" / "components"
    five = (components / "FiveEducation.tsx").read_text(encoding="utf-8")
    second = (components / "SecondClassroom.tsx").read_text(encoding="utf-8")

    assert "Pentagon" in five
    assert "Medal" in second
    assert 'className="icon-button" href={overview.source.systemUrl}' in five
    assert 'className="icon-button" href={profile.sourceUrl}' in second
    assert 'title="进入五育系统"' in five
    assert 'title="进入第二课堂"' in second
    assert "formatFetchedAt" not in five
    assert "数据来自{overview.source.systemName}" not in five
    assert "ArrowUpRight" not in five
    assert "ArrowUpRight" not in second


def test_campus_service_loading_states_are_centered_in_their_panels() -> None:
    components = ROOT / "frontend" / "src" / "components"
    campus = (components / "CampusServices.tsx").read_text(encoding="utf-8")
    five = (components / "FiveEducation.tsx").read_text(encoding="utf-8")
    second = (components / "SecondClassroom.tsx").read_text(encoding="utf-8")
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert 'className="center-loading service-panel-loading"' in campus
    assert 'className="center-loading service-panel-loading"' in five
    assert 'className="center-loading service-panel-loading"' in second
    assert ".service-panel-loading { min-height: 330px;" in styles


def test_five_education_and_second_classroom_render_snapshots_then_refresh() -> None:
    components = ROOT / "frontend" / "src" / "components"
    five = (components / "FiveEducation.tsx").read_text(encoding="utf-8")
    second = (components / "SecondClassroom.tsx").read_text(encoding="utf-8")
    app = (ROOT / "frontend" / "src" / "App.tsx").read_text(encoding="utf-8")
    api = (ROOT / "frontend" / "src" / "api.ts").read_text(encoding="utf-8")

    assert "api.peek<FiveEducationOverview>(OVERVIEW_PATH)" in five
    assert "api.peek<FiveEducationActivities>(ACTIVITIES_PATH)" in five
    assert "?refresh=true" in five
    assert "api.setCache(OVERVIEW_PATH" in five
    assert "api.peek<SecondClassroomProfile>(PROFILE_PATH)" in second
    assert "?refresh=true" in second
    assert "api.setCache(PROFILE_PATH" in second
    assert "void prefetchCampusData()" in app
    assert "async function prefetchCampusData()" in app
    assert "setCache," in api


def test_five_education_activity_filters_reuse_the_site_toolbar_language() -> None:
    component = (ROOT / "frontend" / "src" / "components" / "FiveEducation.tsx").read_text(
        encoding="utf-8"
    )
    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")

    assert 'className="program-toolbar five-activity-controls"' in component
    assert '<label><span>搜索</span><input' in component
    assert ".five-activity-controls label > div" not in styles
    assert ".five-activity-controls input {" not in styles


def test_five_education_guide_wraps_long_green_descriptions_inside_boxes() -> None:
    guide = (ROOT / "frontend" / "public" / "five-education-labor-guide.svg").read_text(
        encoding="utf-8"
    )

    assert "南京大学本科生劳动教育学习导引图（2025版）" in guide
    assert 'viewBox="0 0 1600 1000"' in guide
    assert 'class="scroll-body"' in guide
    assert 'class="scroll-curl"' not in guide
    assert "<style>" not in guide
    assert guide.count('lengthAdjust="spacingAndGlyphs"') >= 12
    assert "学工部勤工助学项目" in guide
    assert "志愿服务项目可以认定" in guide
    assert "和相关职能部门创设的其它劳动教育" in guide
    assert "实践项目获得劳动时长" in guide
    assert "适用于 2021 级及以后入学" not in guide

    styles = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")
    assert ".five-guide-canvas { max-height: calc(92vh - 72px); overflow: hidden;" in styles
    assert "max-height: calc(92vh - 116px)" in styles


def test_privacy_copy_covers_encrypted_campus_service_snapshots() -> None:
    about = (ROOT / "frontend" / "src" / "components" / "About.tsx").read_text(encoding="utf-8")

    assert "五育数据按需从南京大学五育系统查询" in about
    assert "最近一次五育总览和活动记录的加密快照" in about
    assert "第二课堂个人资料与志愿服务统计按需" in about
    assert "最近一次第二课堂数据的加密快照" in about
    assert "同域 HTTP 兼容跳转" in about


def test_second_classroom_replaces_placeholder_with_real_profile() -> None:
    root = ROOT / "frontend" / "src"
    campus = (root / "components" / "CampusServices.tsx").read_text(encoding="utf-8")
    component = (root / "components" / "SecondClassroom.tsx").read_text(encoding="utf-8")
    assert "<SecondClassroom onUnauthorized={onUnauthorized} />" in campus
    assert "ServicePreparation" not in campus
    assert "const PROFILE_PATH = '/api/second-classroom/profile'" in component
    for label in ["学号", "姓名", "年级", "学院", "电子邮箱", "英语水平", "其他语言", "其他技能", "参加活动数", "服务总时长", "不诚信记录"]:
        assert label in component
    assert "报名通过率" not in component
    assert "完成率" not in component
