from __future__ import annotations

import argparse
import shutil
import stat
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", required=True, choices=("macos", "windows", "linux"))
    parser.add_argument("--arch", required=True, choices=("arm64", "x86_64"))
    parser.add_argument("--nju-source", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = ROOT / "dist" / "NanyongZhike"
    nju_patch = (
        ROOT
        / "third_party"
        / "patches"
        / "nju-cli-v1.4.6-cache-dir.patch"
    )
    if not source.is_dir():
        raise SystemExit(f"missing PyInstaller output: {source}")
    if not args.nju_source.is_file():
        raise SystemExit(f"missing nju-cli source archive: {args.nju_source}")
    if not nju_patch.is_file():
        raise SystemExit(f"missing nju-cli source patch: {nju_patch}")

    release_root = ROOT / "release"
    release_root.mkdir(exist_ok=True)
    package_name = f"NanyongZhike-{args.platform}-{args.arch}"
    package = release_root / package_name
    if package.exists():
        shutil.rmtree(package)
    shutil.copytree(source, package)

    launcher_suffix = {"macos": "command", "windows": "cmd", "linux": "sh"}[args.platform]
    launcher = package / f"启动南雍知课.{launcher_suffix}"
    shutil.copy2(ROOT / "desktop" / "launchers" / launcher.name, launcher)
    if args.platform != "windows":
        launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        executable = package / "NanyongZhike"
        executable.chmod(executable.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    for document in ("README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "SECURITY.md"):
        shutil.copy2(ROOT / document, package / document)
    shutil.copy2(ROOT / "desktop" / "使用说明.txt", package / "使用说明.txt")
    third_party = package / "third-party-sources"
    third_party.mkdir()
    shutil.copy2(args.nju_source, third_party / "nju-cli-v1.4.6.tar.gz")
    shutil.copy2(nju_patch, third_party / nju_patch.name)

    archive = shutil.make_archive(str(release_root / package_name), "zip", release_root, package_name)
    print(archive)


if __name__ == "__main__":
    main()
