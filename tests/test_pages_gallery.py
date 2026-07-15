from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

SCREENSHOTS = {
    "academic-overview.jpeg": "学业概览",
    "program.jpeg": "培养方案",
    "schedule.jpeg": "我的课表",
    "reviews.jpeg": "红黑榜",
    "notices.jpeg": "重要通知",
    "nju-tabs.jpeg": "NJU Tabs",
    "memos.jpeg": "备忘录",
}


def test_pages_gallery_contains_seven_accessible_snap_slides() -> None:
    gallery_path = ROOT / "docs" / "index.html"

    assert gallery_path.exists()
    source = gallery_path.read_text(encoding="utf-8")

    assert source.count('class="gallery-slide"') == 7
    for filename, title in SCREENSHOTS.items():
        assert f'src="screenshots/{filename}"' in source
        assert f'alt="南雍知课{title}"' in source

    assert "scroll-snap-type: x mandatory" in source
    assert "scroll-snap-align: center" in source
    assert 'data-action="previous"' in source
    assert 'data-action="next"' in source
    assert 'event.key === "ArrowLeft"' in source
    assert 'event.key === "ArrowRight"' in source
    assert 'aria-live="polite"' in source
    assert "prefers-reduced-motion: reduce" in source
    assert '<meta name="viewport" content="width=device-width, initial-scale=1">' in source


def test_pages_gallery_fits_full_images_without_repeated_slide_titles() -> None:
    source = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")

    assert 'class="slide-heading"' not in source
    assert ".gallery-slide {" in source
    assert "place-items: center" in source
    assert "width: 100%;" in source
    assert "height: 100%;" in source
    assert "object-fit: contain" in source
    assert '<strong class="current-title">' not in source
    assert 'class="brand-mark"' not in source


def test_pages_gallery_uses_swipe_friendly_images_and_original_viewer() -> None:
    source = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
    gallery = source.split('<main class="gallery"', 1)[1].split("</main>", 1)[0]

    assert "touch-action: pan-x" in source
    assert "-webkit-user-drag: none" in source
    assert gallery.count('draggable="false"') == 7
    assert 'data-action="view-original"' in source
    assert 'class="lightbox"' in source
    assert 'gallery.addEventListener("touchstart"' in source
    assert 'gallery.addEventListener("touchend"' in source
    assert "SWIPE_THRESHOLD = 32" in source


def test_readme_uses_one_large_preview_link_to_the_pages_gallery() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    preview = readme.split("## 界面预览", 1)[1].split("## 下载和启动", 1)[0]

    assert "https://eurus07e.github.io/nanyong-zhike-app/" in preview
    assert preview.count("<img") == 1
    assert "docs/screenshots/academic-overview.jpeg" in preview
    assert "<table>" not in preview
