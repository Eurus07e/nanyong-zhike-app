# 南雍知课

南京大学一站式选课与学业助手。登录南京大学统一身份认证后，可在同一本地界面查看成绩与学分、培养方案、个人课表和红黑榜等。本工具只读查询，不会代替你选课、退课或修改学校数据。

> 本项目是学生个人开发的非官方工具，与南京大学官方无隶属关系。课程、成绩与培养方案请以学校系统最终结果为准。

## 下载和启动

**第一步：根据自己的电脑下载**

- [Windows 10 / 11（64 位）](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest/download/NanyongZhike-windows-x86_64.zip)
- [Apple 芯片 Mac（M1 或更新）](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest/download/NanyongZhike-macos-arm64.zip)
- [Linux（64 位，Ubuntu 22.04+）](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest/download/NanyongZhike-linux-x86_64.zip)
- [Linux（ARM64，Ubuntu 24.04+）](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest/download/NanyongZhike-linux-arm64.zip)

> Mac 版本目前仅支持 Apple 芯片，不支持 Intel 芯片。可在苹果菜单的“关于本机”中查看芯片类型。

**第二步：完整解压 ZIP 压缩包**

不要直接在压缩包预览窗口中运行。解压后，请保持启动文件、主程序和 `_internal` 文件夹在同一目录。

**第三步：双击启动**

- Windows：双击 `启动南雍知课.cmd`。
- macOS：按住 Control 点击 `启动南雍知课.command`，再选择“打开”。
- Linux：双击 `启动南雍知课.sh`。

浏览器会自动打开南雍知课。关闭名为“南雍知课”的启动窗口即可停止程序。

### 首次打开提示

Windows 如果显示 SmartScreen 提示，请选择“更多信息”，再选择“仍要运行”。

macOS 如果仍然拦截启动，请打开“系统设置 > 隐私与安全性”，在安全性提示旁选择“仍要打开”。

v1.0.0 安装包尚未进行 Windows 代码签名或 Apple 公证，因此首次打开时出现上述系统提示属于预期情况。继续前请确认文件来自本仓库的 Release，并在 [v1.0.0 Release 页面](https://github.com/Eurus07e/nanyong-zhike-app/releases/tag/v1.0.0) 核对 SHA-256；不要关闭 SmartScreen、Gatekeeper 或其他系统安全防护。

Linux 如果双击没有反应，请在文件属性中允许 `启动南雍知课.sh`“作为程序执行”；也可以在解压目录中运行：

```bash
chmod +x '启动南雍知课.sh' NanyongZhike
./'启动南雍知课.sh'
```

首次启动可能稍慢，因为程序需要初始化课程评价数据。程序仅监听本机地址，不会向局域网或公网开放服务。请只从本仓库的 [Releases 页面](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest) 下载安装包。

## 包含功能

- 统一身份认证登录，在本机安全保留登录状态，并支持主动退出。
- 学业概览：全部课程成绩筛选与排序、所有课学分绩、平均学分绩、专业排名和培养方案学分进度。成绩、课表和培养方案来自 eHall。
- 专业排名：显示由上游排名百分比和本专业总人数推算的名次、总人数及排名百分比；名次可能存在舍入误差，请以学校系统为准。
- 培养方案：按年级、院系、类型和名称筛选，查看结构图、学年模式、课程组详情并进行筛选与排序。
- 我的课表：查看教学班及全部时间安排。
- 课程评价：按课程、教师或“课程名 + 教师名”组合搜索，支持筛选、排序和滚动加载。评价来自随包附带的 nju-class 公开数据快照，不是实时评价。


## 本地数据与隐私

密码只在发起本次南京大学统一身份认证时存在于进程内存，不会写入数据库、浏览器存储或日志。SQLite 会保存学号、会话创建/到期时间和最近访问时间；学校认证票据以加密形式保存，会话令牌只保存摘要。默认会话有效期为 7 天。浏览器只持有随机的 `HttpOnly` 会话 Cookie；浏览器本地还会按学号保存最近浏览的培养方案选择，用于恢复界面偏好，不保存密码或学校认证票据。成绩、课表和培养方案仅短期缓存在当前程序与浏览器内存中，不写入个人档案数据库。

“我的计划”中的内容由用户主动创建，仅保存在当前浏览器的 `localStorage` 中，不会自动上传服务器。清理浏览器数据会删除计划；需要跨设备迁移或长期保留时，请先在计划页面导出 JSON 备份。

本地程序会保存会话记录、本机密钥和课程评价索引：

| 系统 | 数据目录 |
| --- | --- |
| macOS | `~/Library/Application Support/NanyongZhike` |
| Windows | `%LOCALAPPDATA%\NanyongZhike` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/NanyongZhike` |

删除对应目录可彻底重置南雍知课的本地状态；退出登录只会立即使当前会话失效，删除目录还会清除本机保存的加密票据、数据库和本机密钥。公共电脑尽量不要使用本工具；必须使用时，请退出登录、关闭启动窗口，并删除对应数据目录。不要在 Issue、截图或日志中公开学号、成绩、课表、密码、Cookie 或认证票据。

### 重要安全提示：排名服务

排名与平均学分绩来自南京大学交换生系统。本地发行包已默认启用这两项功能，登录后进入“学业概览”时会自动请求该系统，用户不需要手动修改配置。

该学校旧系统目前只提供 HTTP，无法获得 HTTPS 的机密性和完整性保护。查询过程中，学校认证后的单次票据、交换系统会话以及返回的排名数据会经过这条 HTTP 链路；同一网络中的攻击者或不可信代理可能观察或篡改这些通信。公网服务器部署默认关闭这条链路，除非维护者明确设置 `ALLOW_INSECURE_EXCHANGE_SYSTEM=true`。这项限制来自学校上游系统，无法通过把南雍知课本身改为 HTTPS 消除。

## 常见问题

**双击后浏览器没有打开**

等待启动窗口显示“正在启动”后，手动打开 <http://127.0.0.1:8000>。若 8000 端口被占用，启动窗口会显示实际地址。

**关闭网页后程序还在运行**

网页只是界面。关闭名为“南雍知课”的启动窗口，或在该窗口按 `Ctrl+C`，才能停止本地服务。

**登录或 eHall 查询失败**

先确认浏览器能正常打开南京大学统一身份认证和 eHall，再重启南雍知课。学校系统临时维护、网络环境或认证状态都可能造成查询失败。请勿在公开 Issue 中提交真实账号、密码或完整网络响应。

**排名或平均学分绩暂时没有显示**

这两项数据来自独立的学校旧系统。其暂时不可用时，不影响成绩、课表和培养方案查询；稍后刷新即可重试。公网部署默认不会请求该系统。

**程序提示发行包不完整**

不要直接在压缩包预览中运行；请完整解压，并保持 `_internal`、启动文件和主程序在同一目录。

## 开发与验证

开发环境需要 Python 3.11+、Node.js 20+ 和 `nju-cli` 1.4.6。以下命令适用于 macOS 和 Linux：

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
npm ci --prefix frontend
npm run build --prefix frontend
NJU_CLI_BIN=/path/to/nju-cli .venv/bin/uvicorn backend.app.main:app --reload
```

Windows PowerShell：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
npm ci --prefix frontend
npm run build --prefix frontend
$env:NJU_CLI_BIN = "C:\path\to\nju-cli.exe"
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload
```

Windows 本地修改后，也可以直接双击源码目录根部的 `启动南雍知课.cmd`。首次运行会自动创建独立 Python 环境、安装依赖并构建前端；源码目录应与已解压的原 Windows 发行包目录放在同一父目录，以复用其中固定版本的 `nju-cli.exe`。

提交前执行：

```bash
npm run lint --prefix frontend
npm run build --prefix frontend
.venv/bin/pytest -q
```

如需在开发环境启用排名接口，请在只监听本机的 `.env` 中设置 `ALLOW_INSECURE_EXCHANGE_SYSTEM=true`。不要在不受信任的公网服务器上启用。

Docker/Caddy 配置保留用于开发者自行部署。生产部署必须使用 HTTPS、独立随机 `APP_SECRET`，并保护 `.env` 与数据卷；交换生系统的上游 HTTP 风险仍然存在。

## 发布与构建

v1.0.0 由 [GitHub Release 工作流](.github/workflows/release.yml) 在 GitHub 托管的 macOS、Windows 和 Linux 原生环境中构建，没有使用维护者的 Mac 制作其他平台安装包。

工作流会校验固定的 nju-cli v1.4.6 源码、应用公开的缓存隔离补丁、运行完整测试，并在每个平台真实启动安装包，检查内置 `nju-cli`、本地 API、首页、4 张登录图和头像。补丁以确定性脚本施加，等价完整 diff 随包提供。Windows、macOS 或 Linux 任一检查失败时均不会发布 Release。[查看 v1.0.0 的成功构建记录](https://github.com/Eurus07e/nanyong-zhike-app/actions/runs/29332146424)。

当前工作流仅监听准确的 `v1.0.0` 标签，以防误发布。准备后续版本时，需要先同步更新工作流中的标签规则。

## 开源与许可

南雍知课按 [GNU GPL v3](LICENSE) 发布。项目通过独立子进程调用 [nju-cli](https://github.com/nju-cli/nju-cli)，并使用 [nju-class](https://github.com/carottX/nju-class) 的公开评价数据。发行包附带 nju-cli v1.4.6 对应源码与补丁；完整来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

如果遇到数据错误、页面问题等，欢迎通过站内“关于本站”页面联系维护者。
