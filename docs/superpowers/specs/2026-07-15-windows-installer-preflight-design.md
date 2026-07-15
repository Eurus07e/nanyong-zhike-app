# Windows Installer Preflight Design

## Goal

Make Windows installer failures fast and deterministic while retaining a Simplified Chinese installer. A normal branch push must validate the Inno Setup script before a release tag starts the expensive native nju-cli build.

## Root Cause

Release run `29422067187` successfully built and launched the frozen Windows application, passed `desktop/smoke_test_release.py`, and created `NanyongZhike-windows-x86_64.zip`. The next step failed because the runner's Inno Setup 6.7.1 installation did not contain `compiler:Languages\ChineseSimplified.isl`.

The SQLite handle leak from the previous run is fixed and is not part of this failure.

## Chosen Approach

Use a shared PowerShell preflight script from both ordinary CI and the release workflow.

1. Vendor the Inno Setup 6.7.1-compatible Simplified Chinese translation from the official `jrsoftware/issrc` repository at immutable commit `cfdf48923178df4b4f040e038b423aa555a61ffc`.
2. Verify SHA-256 `7d544b9bb1d142cfa11f2e5d3cc8abe2e55f8e066c5124e3772675aa236e1278` before use.
3. Store the verified 20 KB file in the repository at `desktop/Languages/ChineseSimplified.isl`; the installer script resolves it relative to its own `SourcePath`, not the runner's optional compiler language directory.
4. Derive every path from the script location, refuse to overwrite an existing `dist/NanyongZhike`, create a disposable placeholder executable there, and compile the real installer script to an isolated `release-preflight` output directory.
5. Assert that the expected setup executable exists, then remove the placeholder distribution and preflight output in `finally`.
6. Run this script in a lightweight Windows job on every CI push and pull request. In the release matrix, run it immediately after checkout and before Python, Node, Rust, or nju-cli compilation.

Removing Chinese localization was rejected because it would regress the user experience. Downloading the translation only after the Rust build was rejected because it would preserve the current slow feedback loop.

## Components

### `desktop/preflight_windows_installer.ps1`

Owns the bundled-file checksum validation, Inno compiler discovery, placeholder setup, isolated compile invocation, expected output assertion, and cleanup. Native commands must have `$LASTEXITCODE` checked explicitly because PowerShell does not automatically convert every non-zero native exit into a terminating error. It must never delete a pre-existing local distribution.

### `desktop/windows-installer.iss`

Defines the translation path from `AddBackslash(SourcePath)` and supports an `AppOutputDir` preprocessor override. Its normal output remains `..\release`; preflight uses `..\release-preflight`.

### CI and Release Workflows

`.github/workflows/ci.yml` gains a small Windows installer preflight job. `.github/workflows/release.yml` invokes the same script before `Build patched nju-cli from source`; the final Inno step compiles the actual frozen application and explicitly checks `release\NanyongZhike-windows-x86_64-setup.exe` before artifact upload.

## Failure Behavior

- Missing bundled translation: preflight fails before native compilation.
- Checksum mismatch: preflight stops before Inno Setup sees untrusted content.
- Missing Inno compiler or incompatible script/language file: branch CI fails in the preflight job.
- Missing final setup executable: the release job fails explicitly even if the Windows ZIP exists, preventing upload globs from masking a missing installer.

## Testing

Python tests hash the bundled translation and enforce its SHA-256, explicit native exit-code checks, local `SourcePath` language resolution, disposable output override, expected setup artifact assertion, CI Windows preflight job, and release-step ordering before Rust compilation. Version synchronization tests advance all release-sensitive metadata to `1.1.7` while preserving earlier changelog entries.

The authoritative end-to-end check remains a successful `v1.1.7` GitHub Release with Windows setup EXE/ZIP, macOS DMG/ZIP, and both Linux ZIP packages.

## Non-Goals

- Do not change application features or authentication behavior.
- Do not merge or rebase `main` or the unrelated merged pull request.
- Do not move or delete failed historical tags.
- Do not rely on a language file being preinstalled on a mutable hosted runner image.
