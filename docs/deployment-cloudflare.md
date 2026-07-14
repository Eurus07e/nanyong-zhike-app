# Cloudflare Tunnel 部署说明

该方案由 Cloudflare 在公网侧终止 HTTPS，服务器只主动建立出站 Tunnel。仅启动本编排文件且
主机没有其他端口映射或反向代理时，Docker 不映射 `80`、`443` 或应用端口，外部流量只能经
Tunnel 到达源站。

## 1. 准备服务器

需要一台支持 `linux/amd64` 或 `linux/arm64` 的 Linux 主机，并安装 Docker Engine 与 Docker
Compose 插件。先确认 SSH 登录和系统安全更新正常，再在主机防火墙及云厂商安全组中关闭不需要的
入站端口；至少保留实际使用的 SSH 管理入口。

Cloudflare Tunnel 需要出站访问 Cloudflare。通常允许出站 TCP 443，以及 TCP/UDP 7844 即可。
部署完成后无需开放入站 TCP 80、443 或 UDP 443。

## 2. 创建 Tunnel

1. 将域名托管到 Cloudflare。
2. 在 Cloudflare Zero Trust 中进入 **Networks > Tunnels**，创建 Cloudflared Tunnel。
3. 选择 Docker 连接方式，复制命令中 `--token` 后面的 token。只保存 token 本身。
4. 为 Tunnel 添加 Public Hostname，选择需要上线的域名。
5. 将 Service type 设为 `HTTP`，URL 填写 `caddy:8080`。

`caddy` 是 Compose 内部 DNS 名称，不能填写 `localhost`。Cloudflare 会为该公开主机名创建或提示
创建对应的 Tunnel DNS 记录。

## 3. 配置密钥

在项目目录创建 `.env`：

```bash
cp .env.example .env
openssl rand -base64 48
chmod 600 .env
```

编辑 `.env`，设置：

```dotenv
APP_SECRET=上一步生成的随机值
CLOUDFLARE_TUNNEL_TOKEN=Cloudflare提供的TunnelToken
SESSION_TTL_HOURS=168
```

`APP_SECRET` 和 Tunnel token 都不得提交到 Git、写入镜像或发送到日志。更换 `APP_SECRET` 会令
所有现有登录会话失效；Tunnel token 泄露时应立即在 Cloudflare 控制台轮换。

## 4. 启动并验证

只使用独立的 Tunnel 编排文件，避免加载会公开源站端口的直连配置：

```bash
docker compose -f compose.cloudflare.yaml config --quiet
docker compose -f compose.cloudflare.yaml pull caddy cloudflared
docker compose -f compose.cloudflare.yaml up -d --build
docker compose -f compose.cloudflare.yaml ps
```

三个服务都应处于运行状态，其中健康检查最终应变为 `healthy`。随后验证：

```bash
curl -fsS https://你的域名/api/health
docker compose -f compose.cloudflare.yaml logs --tail=100 app caddy cloudflared
```

健康接口应返回 `status: ok`。首次启动会将只读评价快照建立为 SQLite 搜索索引，应用进入健康状态
可能比后续启动稍慢。

最后从另一网络确认网站可访问，并确认主机上没有 Docker 发布端口：

```bash
docker compose -f compose.cloudflare.yaml ps
```

输出的 `PORTS` 列不应出现任何 `host_ip:host_port->container_port` 映射（包括 `0.0.0.0`、
`[::]` 或指定主机 IP）。也可以执行以下命令；没有输出或返回非零状态才符合预期：

```bash
docker compose -f compose.cloudflare.yaml port app 8000
```

## 5. 更新、备份与回滚

更新应用：

```bash
docker compose -f compose.cloudflare.yaml pull caddy cloudflared
docker compose -f compose.cloudflare.yaml up -d --build --remove-orphans
```

查看日志：

```bash
docker compose -f compose.cloudflare.yaml logs --since=30m app caddy cloudflared
```

停止服务但保留数据：

```bash
docker compose -f compose.cloudflare.yaml down
```

不要使用 `down -v`，它会删除 SQLite 状态卷。`nanyong-state` 保存学号、会话时间、评价搜索
索引以及使用 `APP_SECRET` 加密的学校认证票据；会话令牌只保存摘要。备份时应同时保护 `.env`，
因为没有原 `APP_SECRET` 无法解密已有认证票据。

## 6. Cloudflare 缓存规则

Caddy 已发送以下源站缓存策略：

- `/api/*`：`no-store`，不得缓存学业与登录数据。
- `/assets/*`：Vite 内容哈希资源，缓存一年并标记为 `immutable`。
- HTML、路由入口和未哈希图片：`no-cache`，允许浏览器保存但每次使用前重新验证。

不要在 Cloudflare 添加“Cache Everything”规则覆盖 `/api/*`。如需额外缓存，只应限定到
`/assets/*`，并保留源站的 Cache-Control 响应头。
