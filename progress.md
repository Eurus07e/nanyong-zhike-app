## 2026-07-15 - Task: 实现“我的计划”本地个人看板 MVP
### What was done
- 在主导航加入“我的计划”，复用现有登录态、页面挂载方式和本学期课表接口。
- 实现“学期稳分”和“跨专业准入课”两个模板，用户可选择课表课程、补充课程、目标、日期和资料生成个人看板。
- 实现多计划切换、计划名称/目标/日期编辑、任务增删与勾选、周复盘、课程资料展示和本地自动保存。
- 实现按账号短哈希隔离的浏览器存储，以及计划 JSON 导入、导出、单计划删除和本机全部清除；导入限制为 1 MB，并拒绝非 HTTP(S) 资源链接。
- 补充个人计划使用说明、隐私边界和自动化测试入口；未新增后端写接口，也未修改认证、数据库结构或 CSP。
### Testing
- `npm run lint --prefix frontend`：通过。
- `npm test --prefix frontend`：通过，1 个测试文件、3 个测试用例全部通过，覆盖模板生成、JSON 往返恢复和危险链接拒绝。
- `npm run build --prefix frontend`：通过，TypeScript 编译与 Vite 生产构建成功。
- `git diff --check`：通过，无空白错误。
- `python -m pytest -q`：未进入后端测试执行，当前全局 Python 缺少项目依赖 `pydantic_settings`；本轮未改后端，未把该环境缺口表述为后端测试通过。
### Notes
- `frontend/src/App.tsx`：挂载计划页面并传入当前账号与未授权处理。
- `frontend/src/components/Shell.tsx`：新增“我的计划”导航和视图类型。
- `frontend/src/styles.css`：增加计划创建、看板、响应式和编辑状态样式。
- `frontend/src/features/planner/Planner.tsx`：实现计划创建、课表选择、看板交互及导入导出界面。
- `frontend/src/features/planner/types.ts`：定义计划、课程、任务、资料和存储 envelope 类型。
- `frontend/src/features/planner/templates.ts`：实现两个模板共用的计划生成逻辑。
- `frontend/src/features/planner/storage.ts`：实现账号隔离、本地保存和严格导入校验。
- `frontend/src/features/planner/planner.test.ts`：新增模板与导入安全测试。
- `frontend/package.json`：增加 `test` 脚本和 Vitest 开发依赖。
- `frontend/package-lock.json`：锁定新增测试依赖版本。
- `README.md`：补充个人计划功能和本地数据说明。
- `docs/planner.md`：新增使用方式、数据边界、当前限制和验证命令。
- `progress.md`：追加本轮施工记录。
- 回滚方式：在仓库根目录执行 `git restore -- README.md frontend/package.json frontend/package-lock.json frontend/src/App.tsx frontend/src/components/Shell.tsx frontend/src/styles.css`，再执行 `Remove-Item -LiteralPath '.\frontend\src\features\planner' -Recurse -Force; Remove-Item -LiteralPath '.\docs\planner.md' -Force; Remove-Item -LiteralPath '.\progress.md' -Force`。执行递归删除前应确认当前目录为本仓库根目录。
## 2026-07-15 - Task: 增加 Windows 双击启动入口
### What was done
- 在源码根目录新增 `启动南雍知课.cmd`，首次运行自动创建独立 Python 环境、安装项目依赖、构建最新前端并复用原发行包的固定版 `nju-cli.exe`。
- 启动脚本采用纯 ASCII 内容以兼容 Windows 10/11 不同系统代码页，同时保留中文文件名供用户直接双击。
- 将运行时 `bin/` 加入 Git 忽略，避免把约 110 MB 的本地登录组件误提交到仓库。
- 补充 README 与个人计划文档中的双击启动方式、目录要求和停止方式。
### Testing
- 在干净的本地 `.venv` 状态下实际运行 `启动南雍知课.cmd`，成功完成 Python 依赖安装、前端生产构建和 `nju-cli.exe` 硬链接创建。
- 以 `NANYONG_ZHIKE_NO_BROWSER=1` 启动桌面服务后，`GET /api/health` 返回 `status=ok`、`version=1.0.0`、`deployment=desktop`。
- 首页请求返回 HTTP 200，构建后的 JavaScript 资源 `assets/index-BPAJ98YH.js` 返回 HTTP 200。
- 烟雾测试结束后通过 `Ctrl+C` 正常停止服务。
### Notes
- `启动南雍知课.cmd`：新增 Windows 一键准备、构建与启动入口。
- `.gitignore`：忽略本地运行时 `bin/` 目录。
- `README.md`：补充源码版 Windows 双击启动说明。
- `docs/planner.md`：补充用户打开方式和目录摆放要求。
- `progress.md`：追加本轮启动入口任务记录。
- 回滚方式：执行 `git restore -- .gitignore README.md docs/planner.md`，删除根目录 `启动南雍知课.cmd`，并移除 `progress.md` 末尾本任务记录；本地产生的 `.venv` 与 `bin` 均为忽略项，可在确认路径位于本仓库根目录后分别删除。
