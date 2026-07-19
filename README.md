# 南雍知课

nju**一站式**学业助手，集成所有常用信息。

**查排名**、**算绩点**、**看课表**、**查通知**、**红黑榜**、**备忘录**、**我的计划**...所有常用功能 all in one !

**已经支持接入大语言模型分析学业数据！**

>排名查询和五育系统可能需要在校园网或vpn环境下打开
>
>第一次进入时加载可能需要一段时间
>
> 本项目是个人开发的非官方工具，与学校官方无隶属关系。课程、成绩与培养方案请以学校系统最终结果为准。


## 界面预览

<p align="center">
  <a href="https://eurus07e.github.io/nanyong-zhike-app/"><img src="docs/screenshots/interactive-preview.png" width="700" alt="南雍知课 v3.0 交互预览"></a>
</p>

<p align="center">
  <a href="https://eurus07e.github.io/nanyong-zhike-app/"><img src="docs/badges/online-preview.svg" width="260" alt="在线预览"></a>
  <a href="https://github.com/Eurus07e/nanyong-zhike-app/releases/tag/v3.0"><img src="docs/badges/download-latest.svg" width="260" alt="下载最新版 v3.0"></a>
</p>

<p align="center">
  <sub>预览页非真实数据，仅作演示。</sub>
</p>

## 下载和启动

**第一步：下载**

<p align="center">
  <a href="https://github.com/Eurus07e/nanyong-zhike-app/releases/tag/v3.0"><img src="docs/badges/release-download.svg" width="550" alt="前往 GitHub Release 下载南雍知课 v3.0"></a>
</p>

**第二步：安装或解压**

- Windows：运行安装程序，可勾选创建桌面快捷方式。
- macOS：打开 DMG，将“南雍知课”拖入“应用程序”。

**第三步：启动**

- Windows：双击桌面或开始菜单中的“南雍知课”。
- macOS：首次运行不能直接双击，请按住 Control 点击“南雍知课”并选择“打开”；完成首次系统确认后可正常启动。

需要结束后台服务时，点击网页左下角图标退出本地应用。


### 您可能用到的首次打开提示

Windows 如果显示 SmartScreen 提示，请选择“更多信息”，再选择“仍要运行”。

macOS 如果仍然拦截启动，请打开“系统设置 > 隐私与安全性”，在安全性提示旁选择“仍要打开”。

macOS 安装包没有通过 Apple 公证，Windows 安装包未进行商业代码签名，因此首次打开时出现上述系统提示属于预期情况。继续前请确认文件来自本仓库的 [Release 页面](https://github.com/Eurus07e/nanyong-zhike-app/releases/tag/v3.0)；不要关闭 SmartScreen、Gatekeeper 或其他系统安全防护。

***首次启动可能稍慢，请耐心等待***，因为程序需要初始化红黑榜数据。程序仅监听本机地址，不会向局域网或公网开放服务。请只从本仓库的 [Releases 页面](https://github.com/Eurus07e/nanyong-zhike-app/releases/latest) 下载安装包。

<details>
<summary><strong>功能</strong></summary>


- 统一身份认证登录，在本机安全保留登录状态，并支持主动退出登录。
- 学业概览：全部课程成绩筛选与排序、所有课学分绩、平均学分绩、专业排名和培养方案学分进度。
- 培养方案：按年级、院系、类型和名称筛选，查看可缩放结构图、学年模式、课程组详情并进行筛选与排序。
- 我的课表：显示教学班及详细信息。
- 红黑榜：按课程、教师或“课程名 + 教师名”组合搜索，支持筛选、排序和滚动加载。内容来自随包附带的 nju-class 公开数据快照。
- 备忘录：新建、编辑、删除和置顶记录，支持搜索与 `#标签`；内容保存在现有本地数据库中。
- AI 助手：可连接用户自己的 OpenAI 兼容模型接口，按需查询学业概览、成绩、课表、培养方案、五育、第二课堂、重要通知、红黑榜和备忘录。
- 五育系统：展示五维活动对比、成长模块、劳育时长和学期评价，支持活动搜索、筛选、排序、详情弹层及矢量劳动教育学习导引图。
- 第二课堂：展示参加活动数、服务总时长和个人资料。
- 我的计划：以五日滚动视图和五个固定自定义列表管理个人任务；单击空行输入，键入 `#` 从本人课表关联课程，单击任务编辑，单击左侧圆点切换完成状态，清空内容或右键可删除，并支持跨列拖动。计划与自定义列表名称按学号隔离保存在当前浏览器中。
- 登录后预取常用数据，页面切换不重复请求；需要时可手动刷新。
</details>


<details>
<summary><strong>隐私</strong></summary>

密码只在发起本次南京大学统一身份认证时存在于进程内存，不会写入数据库、浏览器存储或日志。SQLite 会保存学号、会话创建/到期时间和最近访问时间；学校认证票据以加密形式保存，会话令牌只保存摘要。默认会话有效期为 7 天。浏览器只持有随机的 `HttpOnly` 会话 Cookie；浏览器本地还会按学号保存最近浏览的培养方案选择和 NJU Tabs 设置，用于恢复界面偏好，不保存密码或学校认证票据。为先显示上次结果并在后台刷新，SQLite 会按学号保存最近一次成绩、排名、课表和培养方案加密快照；浏览器仅在当前会话内存中使用这些启动快照，不持久保存学业数据。备忘录正文会持久保存在运行南雍知课的同一个 SQLite 数据库中，按统一身份认证学号隔离，不发送给 Memos 或其他第三方。删除备忘录后，对应记录会从数据库删除。为先显示上次结果并在后台刷新，SQLite 还会按学号保存最近一次五育总览、五育活动和第二课堂数据的加密快照；浏览器仅在当前会话内存中使用这些数据。使用本地桌面版时，数据只保存在下方本机数据目录；使用他人维护的共享部署时，服务维护者能够接触服务器上的数据库，因此只应使用可信部署。AI 助手由用户自行提供模型接口、模型名称和 API Key。接口、模型名称与 API Key 仅保存在当前浏览器的本地存储中，不写入 SQLite 或服务端日志，也不会随源码或安装包发布；清空连接设置或浏览器站点数据即可删除。对话不会由本站持久保存。启用后，模型服务会收到回答当前问题所需的成绩、课表、培养方案、校园服务或备忘录数据，具体保留规则由用户选择的模型服务商决定。API Key 属于敏感凭证，请勿在服务商账户中存放过高余额，也不要在公共设备上保存。AI 回答仅供参考，课程、成绩和培养方案仍以学校系统为准。“我的计划”数据同样仅按学号保存在当前浏览器本地，不写入 SQLite。项目源码和官方发行包不包含维护者或任何用户的 API Key、备忘录、计划、登录状态、学校认证票据或本地数据库；桌面应用首次启动后才会在每位用户自己的数据目录创建独立数据库和本机密钥。本地程序会保存会话记录、本机密钥、备忘录和红黑榜索引：

| 系统 | 数据目录 |
| --- | --- |
| macOS | `~/Library/Application Support/NanyongZhike` |
| Windows | `%LOCALAPPDATA%\NanyongZhike` |

删除对应目录可彻底重置南雍知课的本地状态；退出登录只会立即使当前会话失效，删除目录还会清除本机保存的加密票据、数据库和本机密钥。公共电脑尽量不要使用本工具；必须使用时，请退出登录、关闭启动窗口，并删除对应数据目录。

</details>

<details>
<summary><strong>提示</strong></summary>
  

排名与平均学分绩来自南京大学交换生系统。本地发行包已默认启用这两项功能，登录后进入“学业概览”时会自动请求该系统，用户不需要手动修改配置。学校系统目前只提供 HTTP，无法获得 HTTPS 的机密性和完整性保护。查询过程中，学校认证后的单次票据、交换系统会话以及返回的排名数据会经过这条 HTTP 链路；同一网络中的攻击者或不可信代理可能观察或篡改这些通信。公网服务器部署默认关闭这条链路，除非维护者明确设置 `ALLOW_INSECURE_EXCHANGE_SYSTEM=true`。
</details>

  
<details>
<summary><strong>版本路线</strong></summary>

- `v1.1.0`：培养方案与课程认定修复、中文轻量备忘录、结构图缩放。
- `v1.1.1`：加密成绩快照、新成绩提示、成绩详情批量查询和校园服务模块界面。
- `v1.1.2`：悦读经典计划按标准课程条目展示，并参与课程进度筛选与排序。
- `v1.1.3`：完善通识课程缺项展示、通知正文与备忘录联动，并新增可管理的 NJU Tabs。
- `v1.1.4`：加入加密启动快照和静默后台刷新，完善 NJU Tabs 两列布局与统一悬停交互。
- `v1.1.5`：加入南大图书馆入口、统一全站分段控件，并提供无需终端的 macOS DMG 与 Windows 安装程序。
- `v1.1.6`：Windows 冒烟测试显式关闭 SQLite 连接，开发环境优先解析插件缓存中的原生 nju-cli。
- `v1.1.7`：固定并校验 Windows 安装器简体中文语言文件，在 CI 与发布构建前用真实 Inno Setup 提前验证安装脚本。
- `v1.2.0`：完成五育总览、详细活动记录和劳动教育导引图；第二课堂接通真实个人资料、活动数、服务时长与不诚信记录，并保持轻量只读。
- `v1.3.0`：计划接入南京大学邮箱系统的安全只读能力。
- `v2.0.0`：正式整合五育、第二课堂、AI 助手与轻量个人任务看板，并继续保持单机运行、按需查询和本地优先的数据边界。
- `v2.0.1`：全面修正培养方案学分要求、课程清单与分支课程的认定语义，并完善校园服务提示和培养方案选择布局。
- `v2.0.2`：修复 Windows 版读取学校数据时反复弹出命令窗口的问题，所有内置 `nju-cli.exe` 子进程均改为后台无窗口运行。
- `v2.0.3`：完善十二节课表与异常课程兜底，并增强教务通知获取的稳定性。
- `v3.0`：增强校园接口刷新与旧快照兜底，修正培养方案学分显示，清理过时文案；桌面发行收窄为 Windows x86_64 与 macOS Apple Silicon，并明确本地浏览器型启动器的能力边界。

</details>

<details>
<summary><strong>开发与验证</strong></summary>

开发环境需要 Python 3.11+、Node.js 20+ 和 `nju-cli` 1.4.6。以下命令适用于 macOS；Windows PowerShell 命令见下方：

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

提交前执行：

```bash
npm run lint --prefix frontend
npm run test:unit --prefix frontend
npm run build --prefix frontend
.venv/bin/pytest -q
```

如需在开发环境启用排名接口，请在只监听本机的 `.env` 中设置 `ALLOW_INSECURE_EXCHANGE_SYSTEM=true`。不要在不受信任的公网服务器上启用。

Docker/Caddy 配置保留用于开发者自行部署。生产部署必须使用 HTTPS、独立随机 `APP_SECRET`，并保护 `.env` 与数据卷；交换生系统的上游 HTTP 风险仍然存在。

</details>



## 开源与许可

南雍知课按 [GNU GPL v3](LICENSE) 发布。项目通过独立子进程调用 [nju-cli](https://github.com/nju-cli/nju-cli)，并使用 [nju-class](https://github.com/carottX/nju-class) 的公开评价数据；备忘录交互受到 MIT 许可的 [Memos](https://github.com/usememos/memos) 启发。发行包附带 nju-cli v1.4.6 对应源码与补丁；完整来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。在此一并致谢！

如遇问题，欢迎通过站内“关于本站”页面或 github 联系维护者。
