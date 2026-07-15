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

    assert ".program-selector-row select { width: 100%; min-height: 38px;" in styles
    assert "font-size: 12px;" in styles


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


def test_five_education_uses_real_read_only_dashboard() -> None:
    root = ROOT / "frontend" / "src"
    campus = (root / "components" / "CampusServices.tsx").read_text(encoding="utf-8")
    app = (root / "App.tsx").read_text(encoding="utf-8")
    component = (root / "components" / "FiveEducation.tsx").read_text(encoding="utf-8")

    assert "<FiveEducation onUnauthorized={onUnauthorized} />" in campus
    assert "<CampusServices username={session.username} onUnauthorized={handleUnauthorized}" in app
    assert "const OVERVIEW_PATH = '/api/five-education/overview'" in component
    assert "const ACTIVITIES_PATH = '/api/five-education/activities'" in component
    assert "api.cached<FiveEducationOverview>(OVERVIEW_PATH" in component
    assert 'aria-label="五育活动分布雷达图"' in component
    assert "同年级平均" in component
    assert "成长模块" in component
    assert "劳育构成" in component
    assert "我的活动" in component
    assert "查看学习导引图" in component
    assert "/five-education-labor-guide.png" in component
    assert "我的兴趣" not in component
    assert component.count("href={overview.source.systemUrl}") == 1
    assert "five-education-source" not in component
    assert "updateSearchMks" not in component
    assert "wdhdMe" not in component
    assert "电子成绩单" not in component


def test_privacy_copy_covers_short_lived_five_education_data() -> None:
    about = (ROOT / "frontend" / "src" / "components" / "About.tsx").read_text(encoding="utf-8")

    assert "五育数据按需从南京大学五育系统查询" in about
    assert "仅在浏览器内存中短期缓存" in about
    assert "不会写入本站数据库" in about
