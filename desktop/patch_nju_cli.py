from __future__ import annotations

import argparse
from pathlib import Path


ORIGINAL_AUTH_CACHE_DIR = """fn auth_cache_dir() -> Result<PathBuf> {
    let app_dirs = AppDirs::new(Some("nju-cli"), true)
        .ok_or_else(|| anyhow!("failed to resolve application cache directory"))?;
    let dir = app_dirs.cache_dir.join("auth");

    std::fs::create_dir_all(&dir).with_context(|| format!("failed to create {}", dir.display()))?;

    Ok(dir)
}
"""

PATCHED_AUTH_CACHE_DIR = """fn auth_cache_dir() -> Result<PathBuf> {
    let override_dir = std::env::var_os("NJU_CLI_CACHE_DIR")
        .map(PathBuf::from)
        .or_else(|| {
            if cfg!(target_os = "windows") {
                Some(std::env::temp_dir().join("nju-cli"))
            } else {
                None
            }
        });
    let cache_dir = match override_dir {
        Some(cache_dir) => {
            if !cache_dir.is_absolute() {
                return Err(anyhow!("NJU_CLI_CACHE_DIR must be an absolute path"));
            }
            cache_dir
        }
        None => AppDirs::new(Some("nju-cli"), true)
            .ok_or_else(|| anyhow!("failed to resolve application cache directory"))?
            .cache_dir,
    };
    let dir = cache_dir.join("auth");

    std::fs::create_dir_all(&dir).with_context(|| format!("failed to create {}", dir.display()))?;

    Ok(dir)
}
"""


def patch_source(source_root: Path) -> Path:
    auth_source = source_root / "crates" / "cli" / "src" / "auth.rs"
    text = auth_source.read_text(encoding="utf-8")
    matches = text.count(ORIGINAL_AUTH_CACHE_DIR)
    if matches != 1:
        raise RuntimeError(
            f"expected one upstream auth cache function in {auth_source}, found {matches}"
        )

    patched = text.replace(ORIGINAL_AUTH_CACHE_DIR, PATCHED_AUTH_CACHE_DIR, 1)
    with auth_source.open("w", encoding="utf-8", newline="\n") as output:
        output.write(patched)
    return auth_source


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_root", type=Path)
    args = parser.parse_args()
    patched = patch_source(args.source_root)
    print(f"patched {patched}")


if __name__ == "__main__":
    main()
