# 南雍知课

南京大学一站式选课与学业助手。登录统一身份认证后，可以在一个界面中查看成绩与学分、
培养方案、学年课程、个人课表和公开课程评价。

> 本项目是学生个人开发的非官方工具，与南京大学官方无隶属关系。成绩、课程和培养方案以
> 学校系统最终结果为准。不要将真实密码、认证票据、`.env` 或运行数据库提交到仓库。

## 功能

- 学号密码登录，服务端缓存学校认证状态，支持主动退出。
- 学业概览：全部课程成绩、5 分制成绩点、已获学分与培养方案进度。
- 培养方案：年级/院系/类型筛选、结构图、学年模式、课程组下钻。
- 我的课表：冲突课程并排显示，点击查看教学班及全部时间安排。
- 课程评价：课程、教师及“课程名 + 教师名”组合搜索，滚动加载结果。
- 登录后后台预取常用数据，页面切换不重复请求，支持手动刷新。

## 最简单的本地运行方式

只需要安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)。下载项目后，在项目
目录执行：

```bash
./scripts/start-local.sh
```

首次运行会自动构建镜像并下载 `nju-cli`，完成后打开 <http://127.0.0.1:8000>。停止服务按
`Ctrl+C`；以后再次运行同一条命令即可。仅停止并保留本地数据：

```bash
docker compose -f compose.local.yaml down
```

Windows PowerShell 用户可直接运行：

```powershell
docker compose -f compose.local.yaml up --build
```

本地模式只监听 `127.0.0.1:8000`，不会把服务暴露到局域网或公网。

## 不使用 Docker

前置条件：Python 3.11+、Node.js 20+、可执行的 `nju-cli` 1.4.6。

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
npm ci --prefix frontend
npm run build --prefix frontend
NJU_CLI_BIN=/path/to/nju-cli .venv/bin/uvicorn backend.app.main:app --reload
```

打开 <http://127.0.0.1:8000>。前端开发时可另启 `npm run dev --prefix frontend`。

## 生产部署

复制配置文件并生成独立随机密钥：

```bash
cp .env.example .env
openssl rand -base64 48
chmod 600 .env
```

把生成结果填入 `.env` 的 `APP_SECRET`，不要提交 `.env`。两种部署方式二选一：

```bash
# Cloudflare Tunnel，不开放源站端口
docker compose -f compose.cloudflare.yaml up -d --build

# Caddy 直连，需配置域名并开放 80/443
docker compose up -d --build
```

Cloudflare 的完整操作见 [部署说明](docs/deployment-cloudflare.md)。生产环境必须使用 HTTPS，
并妥善保护 `.env` 和 `nanyong-state` 数据卷。

## 安全设计

- 密码只在登录请求内存中存在，通过子进程环境变量传给 `nju-cli`，不进入命令行、日志或数据库。
- 服务端仅保存 Fernet 加密的 CASTGC；浏览器仅保存随机 `HttpOnly` 会话 Cookie。
- SQLite 只保存会话令牌的 SHA-256 摘要；API 学业数据明确使用 `no-store`。
- 登录按 IP 和学号限速，并配置 CSP、HSTS、`frame-ancestors` 等安全响应头。
- 本仓库忽略 `.env`、SQLite、开发密钥、浏览器测试记录、构建目录和个人工作文件。

## 开发验证

```bash
npm run lint --prefix frontend
npm run build --prefix frontend
.venv/bin/pytest -q
```

评价快照来自 `carottX/nju-class`。更新快照：

```bash
python3 scripts/update_reviews.py
```

## 开源与许可

项目代码按 [GNU GPL v3](LICENSE) 发布。项目通过独立子进程调用
[nju-cli](https://github.com/nju-cli/nju-cli)，并使用
[nju-class](https://github.com/carottX/nju-class) 的公开评价数据。详细来源与许可见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

反馈问题可通过站内“关于本站”页面列出的联系方式联系维护者。
