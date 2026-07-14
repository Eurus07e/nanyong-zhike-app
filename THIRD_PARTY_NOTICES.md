# Third-party notices

## nju-cli

南雍知课通过独立子进程调用
[nju-cli v1.4.6](https://github.com/nju-cli/nju-cli/tree/v1.4.6)，用于南京大学统一身份认证及
eHall 数据查询。nju-cli 以 GNU AGPL v3 发布。

本站于 2026-07-14 对 v1.4.6 作了一项局部修改：
`nju-cli-v1.4.6-cache-dir.patch` 为认证缓存增加 `NJU_CLI_CACHE_DIR`。变量存在时必须是
绝对路径，nju-cli 会直接在该目录下创建 `auth/auth.json`；变量不存在时仍保留上游原有的
平台目录行为。南雍知课在每次 nju-cli 调用时都把它设置为本次调用的临时目录，从而避免
CASTGC 认证票据写入用户的常规 AppData 或其他长期缓存目录。补丁不改变登录、验证码识别或
eHall 查询逻辑。

GitHub Release 工作流下载固定的 v1.4.6 源码归档并校验 SHA-256，执行 `git apply --check`
和补丁应用后，在对应的 macOS、Windows、Linux 原生 runner 上运行
`cargo build --locked --release -p cli` 从源码构建。构建产物和最终包内二进制都会通过离线
缓存探针；未包含补丁或未遵守绝对缓存目录的二进制无法进入 Release。

每个南雍知课发行包都附带：

- `third-party-sources/nju-cli-v1.4.6.tar.gz`：未经修改的上游源码和上游许可文件；
- `third-party-sources/nju-cli-v1.4.6-cache-dir.patch`：生成包内修改版二进制所用的完整补丁。

上游源码归档 SHA-256 为
`6d7f794e87b8c22a1f6b700899f0c03c08f37a57499cc5e7014f0a80031b141c`。将源码归档解压后应用
随包补丁，再执行上述 Cargo 命令，即可重建对应的修改版 nju-cli。

## nju-class

`data/reviews/merged_data.json` 来自
[carottX/nju-class](https://github.com/carottX/nju-class)。本项目将其导入本地 SQLite，并
重新实现字面量安全搜索、规范化与去重。上游仓库以 GNU GPL v3 发布；本仓库中保留的 JSON
即发行时使用的数据源形式。评价仅代表原作者观点，使用前应自行核实。

## Campus images and university marks

以下界面素材由项目维护者提供，并明确要求随南雍知课用于登录页和默认头像；它们仅用于本站
界面展示，不代表南京大学官方授权或背书：

- `frontend/public/login-campus-1.jpg`
- `frontend/public/login-campus-2.jpg`
- `frontend/public/login-campus-3.jpg`
- `frontend/public/login-campus-4.jpg`
- `frontend/public/default-avatar.jpeg`

南京大学名称、标识与校园影像的相关权利归各自权利人所有；本站为学生个人开发的非官方工具，
不暗示南京大学认可或背书。如权利人对素材使用有异议，请联系项目维护者处理。
