# 培养方案与轻量备忘录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正培养方案全部统计与浏览隔离问题，并在现有 FastAPI、SQLite、React 应用中加入中文轻量备忘录。

**Architecture:** 以纯 TypeScript 领域模块统一培养方案树遍历、要求解析和节点统计；React 视图仅负责请求与展示。备忘录采用现有 SQLite 单表、当前会话学号隔离和同源 REST API，不引入新的运行时服务。

**Tech Stack:** React 19、TypeScript、Vite、FastAPI、SQLite、pytest、Node 内置 test runner。

---

### Task 1: 培养方案领域口径

**Files:**
- Create: `frontend/src/program-requirements.ts`
- Create: `frontend/tests/program-requirements.test.mjs`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/package.json`

- [ ] 写失败测试，固定顶层 144/59/49/30/6、`ZSXDMS/ZSXDXF` 优先、固定课程回填、选修课程池不冒充应修要求、后代叶子聚合和去重行为。
- [ ] 运行 `npm run test:unit --prefix frontend`，确认因模块或导出缺失而失败。
- [ ] 实现 `parseProgramRequirements`、`buildProgramTree`、`collectCourseLeaves`、`summarizeProgramNode`、`aggregateNodeCourses` 等纯函数。
- [ ] 扩充 `ProgramNode` 的真实字段类型并运行单元测试至通过。

### Task 2: 培养方案和概览共用领域逻辑

**Files:**
- Modify: `frontend/src/components/Program.tsx`
- Modify: `frontend/src/components/Overview.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/utils.ts`

- [ ] 将原有 `requirementText`、`parseRequirements` 和递归遍历替换为领域模块。
- [ ] 分类节点点击时加载所有后代课程叶子；非认证失败使用 `Promise.allSettled` 保留可用结果。
- [ ] 节点卡只显示应修口径；弹窗显示“要求”和“可选课程池”两个独立口径。
- [ ] 学年模式按固定课程与选修池分区，模式切换只消费已预取缓存。
- [ ] 学业概览始终使用 `selectOwnedProgram(profile)`，浏览页 localStorage 只控制浏览选择。
- [ ] 运行 TypeScript 单测、lint 和 build。

### Task 3: 备忘录领域与 API

**Files:**
- Create: `backend/app/memos.py`
- Create: `tests/test_memos.py`
- Modify: `backend/app/database.py`
- Modify: `backend/app/main.py`

- [ ] 先写 `MemoRepository` CRUD、标签提取、搜索、置顶顺序和跨用户 404 的失败测试。
- [ ] 运行 `.venv/bin/pytest tests/test_memos.py -q`，确认测试因功能缺失而失败。
- [ ] 在初始化脚本新增 `memos` 表与索引，实现参数化 SQL 仓储。
- [ ] 增加 `GET/POST/PATCH/DELETE /api/memos`，正文去空白后不能为空且最长 10,000 字。
- [ ] 运行备忘录测试和完整后端测试。

### Task 4: 中文备忘录界面

**Files:**
- Create: `frontend/src/components/Memos.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/Shell.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

- [ ] 增加 API 类型和 PATCH/DELETE 请求能力。
- [ ] 左侧导航增加“备忘录”，沿用现有 Lucide 图标与页面保活模式。
- [ ] 实现中文编辑器、搜索、标签筛选、置顶、编辑、删除确认、加载/空/错误状态。
- [ ] 使用现有灰色、8px 圆角、按钮和排版变量，移动端保持无重叠。
- [ ] 运行 lint、TypeScript 单测和 build。

### Task 5: 开源说明、轻量部署与回归

**Files:**
- Modify: `README.md`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `desktop/smoke_test_release.py`
- Modify: `tests/test_release_smoke_assets.py`

- [ ] 核查 `usememos/memos` 官方许可证和链接，只声明“设计参考”，不声称嵌入完整服务。
- [ ] README 说明备忘录保存在现有本地数据目录，按学号隔离，不增加部署步骤。
- [ ] 发行包烟测覆盖备忘录 API/页面静态资源，继续验证四张登录图、头像和“雍”图标。
- [ ] 运行 `npm run test:unit --prefix frontend`、`npm run lint --prefix frontend`、`npm run build --prefix frontend`、`.venv/bin/pytest -q`。
- [ ] 重启 `127.0.0.1:8000`，使用 Browser 插件在桌面和移动视口完成真实交互与控制台检查。
- [ ] 将本地地址交给用户验收；此步骤不推送、不发布。
