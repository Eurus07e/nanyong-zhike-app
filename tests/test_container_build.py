from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_dockerfile_verifies_downloaded_nju_cli_archive_before_extracting() -> None:
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    checksum = 'echo "${checksum}  /tmp/nju-cli.tar.gz" | sha256sum -c -'

    assert checksum in dockerfile
    assert dockerfile.index(checksum) < dockerfile.index("tar -xzf /tmp/nju-cli.tar.gz")
    assert 'echo "${checksum}  ${binary}" | sha256sum -c -' not in dockerfile
