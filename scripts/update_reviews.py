#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import tempfile
import urllib.request
from pathlib import Path


DEFAULT_URL = "https://raw.githubusercontent.com/carottX/nju-class/main/data/merged_data.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Update the local nju-class review snapshot")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--output", type=Path, default=Path("data/reviews/merged_data.json"))
    args = parser.parse_args()

    request = urllib.request.Request(args.url, headers={"User-Agent": "nanyong-zhike/0.1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = response.read()
    parsed = json.loads(payload)
    if not isinstance(parsed, list) or not parsed:
        raise SystemExit("refusing to replace review data with an empty or invalid payload")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="reviews-", suffix=".json", dir=args.output.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, args.output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(f"updated {args.output} with {len(parsed)} source records")


if __name__ == "__main__":
    main()
