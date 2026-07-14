#!/usr/bin/env sh

cd -- "$(dirname -- "$0")" || exit 1
./NanyongZhike
status=$?

if [ "$status" -ne 0 ]; then
  printf '\n启动失败。请保留上方信息，并到 GitHub Issues 反馈。\n'
  printf '按回车键关闭窗口……'
  read -r _
fi

exit "$status"
