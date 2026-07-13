#!/usr/bin/env sh
set -eu

if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' '未找到 Docker。请先安装 Docker Desktop，然后重新运行此脚本。' >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  printf '%s\n' '当前 Docker 未安装 Compose 插件，请更新 Docker Desktop。' >&2
  exit 1
fi

cd "$(dirname "$0")/.."
docker compose -f compose.local.yaml up --build
