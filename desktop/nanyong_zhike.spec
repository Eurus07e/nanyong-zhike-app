from pathlib import Path
import os
import platform


ROOT = Path(SPECPATH).resolve().parent
NJU_CLI = Path(os.environ["NJU_CLI_PATH"]).resolve()
ICON = ROOT / "frontend" / "public" / "apple-touch-icon.png"

analysis = Analysis(
    [str(ROOT / "desktop" / "launcher.py")],
    pathex=[str(ROOT)],
    binaries=[(str(NJU_CLI), "bin")],
    datas=[
        (str(ROOT / "frontend" / "dist"), "frontend/dist"),
        (str(ROOT / "data" / "reviews" / "merged_data.json"), "data/reviews"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
    ],
    noarchive=False,
)

pyz = PYZ(analysis.pure)

executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="NanyongZhike",
    console=False,
    icon=str(ICON),
)

distribution = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="NanyongZhike",
)

if platform.system() == "Darwin":
    application = BUNDLE(
        distribution,
        name="南雍知课.app",
        icon=str(ICON),
        bundle_identifier="cn.nanyong.zhike",
        info_plist={
            "CFBundleDisplayName": "南雍知课",
            "CFBundleName": "南雍知课",
            "CFBundleShortVersionString": "3.0.0",
            "CFBundleVersion": "3.0.0",
            "NSHighResolutionCapable": True,
        },
    )
