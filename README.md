# 南雍知课

南京大学一站式选课与学业助手。登录南京大学统一身份认证后，可在同一本地界面查看
成绩与学分、培养方案、个人课表和公开课程评价等。

> 本项目是学生个人开发的非官方工具，与南京大学官方无隶属关系。课程、成绩与培养方案
> 请以学校系统最终结果为准。

## 下载和启动


**根据自己的系统下载：**

- [Windows 10 / 11（64 位）](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest/download/NanyongZhike-windows-x86_64.zip)
- [Apple 芯片 Mac（M1 / M2 / M3 / M4）](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest/download/NanyongZhike-macos-arm64.zip)
- [Linux（64 位，Ubuntu 22.04+）](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest/download/NanyongZhike-linux-x86_64.zip)
- [Linux（ARM64，Ubuntu 24.04+）](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest/download/NanyongZhike-linux-arm64.zip)

下载后：

1. 把下载的 ZIP 压缩包完整解压。
2. 打开解压后的文件夹，双击“启动南雍知课”。
3. 等待浏览器自动打开，即可登录使用。关闭启动窗口即可停止程序。

Windows 双击 `启动南雍知课.cmd`。如果 SmartScreen 弹出提示，选择“更多信息 > 仍要运行”。

Mac 按住 Control 点击 `启动南雍知课.command`，再选择“打开”。如果仍被拦截，请到
“系统设置 > 隐私与安全性”确认打开。目前仅支持 Apple 芯片 Mac。

Linux 双击 `启动南雍知课.sh`；如果没有反应，请先在文件属性中允许“作为程序执行”。

首次启动可能稍慢，因为程序需要导入课程评价数据。程序只在本机运行，不会向局域网或公网
开放网站端口。请只从本仓库的 [Releases 页面](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest)
下载安装包。

## 包含功能

- 统一身份认证登录，保留本地登录状态并支持主动退出。
- 学业概览：全部课程成绩、所有课学分绩、平均学分绩、专业排名和培养方案学分进度。
- 培养方案：年级、院系、类型和名称筛选，结构图、学年模式与课程组详情。
- 我的课表：冲突课程并排显示，点击查看教学班及全部时间安排。
- 课程评价：课程、教师及“课程名 + 教师名”组合搜索，结果筛选、排序和滚动加载。
- 登录后预取常用数据，页面切换不重复请求；需要时可手动刷新。

## 本地数据与隐私

密码只在发起本次南京大学统一身份认证时存在于进程内存，不会写入数据库、浏览器存储或
日志。学校认证票据会在本机使用随机密钥加密；浏览器只持有随机的 `HttpOnly` 会话 Cookie。
成绩、课表和培养方案仅短期缓存在当前程序与浏览器内存中，不写入个人档案数据库。

本地程序会保存加密会话、随机密钥和课程评价索引：

| 系统 | 数据目录 |
| --- | --- |
| macOS | `~/Library/Application Support/NanyongZhike` |
| Windows | `%LOCALAPPDATA%\NanyongZhike` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/NanyongZhike` |

删除对应目录可彻底重置南雍知课的本地状态。公共电脑使用完毕后，应先在网站中退出登录。
不要在 Issue、截图或日志中公开学号、成绩、课表、密码、Cookie 或认证票据。

### 排名服务说明

排名与平均学分绩来自南京大学交换生系统。该学校旧系统目前只提供 HTTP，无法获得 HTTPS
传输保护；本地发行包为保持功能完整会按需连接该系统。公网服务器部署默认关闭这条链路，
除非维护者明确设置 `ALLOW_INSECURE_EXCHANGE_SYSTEM=true`。这项限制来自学校上游系统，
不是把本地网站改为 HTTPS 就能消除的。

## 常见问题

**双击后浏览器没有打开**

等待启动窗口出现“正在启动”后，手动打开 <http://127.0.0.1:8000>。若 8000 端口被占用，
启动窗口会显示实际地址。

**关闭网页后程序还在运行**

网页只是界面。关闭名为“南雍知课”的启动窗口，或在该窗口按 `Ctrl+C`，才能停止本地服务。

**登录或 eHall 查询失败**

先确认浏览器能正常打开南京大学统一身份认证和 eHall，再重启南雍知课。请勿在公开 Issue
中提交真实账号、密码或完整网络响应。

**程序提示发行包不完整**

不要直接在压缩包预览中运行；先完整解压，并保持 `_internal`、启动文件和主程序在同一目录。

## 开发与验证

前置条件：Python 3.11+、Node.js 20+、`nju-cli` 1.4.6。

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
npm ci --prefix frontend
npm run build --prefix frontend
NJU_CLI_BIN=/path/to/nju-cli .venv/bin/uvicorn backend.app.main:app --reload
```

提交前执行：

```bash
npm run lint --prefix frontend
npm run build --prefix frontend
.venv/bin/pytest -q
```

如需开发环境启用排名接口，在只监听本机的 `.env` 中设置
`ALLOW_INSECURE_EXCHANGE_SYSTEM=true`。不要在不受信任的公网服务器上启用。

Docker/Caddy 配置保留用于开发者自行部署。生产部署必须使用 HTTPS、独立随机
`APP_SECRET`，并保护 `.env` 与数据卷；交换生系统的上游 HTTP 风险仍然存在。

## 发布新版

推送形如 `v1.0.0` 的标签后，[Release 工作流](.github/workflows/release.yml) 会在 GitHub
托管的 macOS、Windows 和 Linux 机器上校验固定的 nju-cli v1.4.6 源码、应用公开的缓存隔离补丁，
从源码原生构建后装入免安装包，最后自动创建 GitHub Release。工作流不会使用维护者的 Mac 打包。

每个平台的包都会在对应的 GitHub 托管系统上真实启动，并检查内置 `nju-cli`、本地 API、首页、
4 张登录图和头像；Windows、macOS 或 Linux 任一烟雾测试失败时，Release 不会发布。

## 开源与许可

南雍知课按 [GNU GPL v3](LICENSE) 发布。项目通过独立子进程调用
[nju-cli](https://github.com/nju-cli/nju-cli)，并使用
[nju-class](https://github.com/carottX/nju-class) 的公开评价数据。发行包附带 nju-cli v1.4.6
对应源码与补丁；完整来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

如果遇到数据错误、页面问题等，欢迎通过站内“关于本站”页面联系维护者。
