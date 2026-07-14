#!/bin/zsh

cd -- "$(dirname -- "$0")" || exit 1
./NanyongZhike
status=$?

if (( status != 0 )); then
  echo
  echo "启动失败。请保留上方信息，并到 GitHub Issues 反馈。"
  read -r "?按回车键关闭窗口……"
fi

exit $status
