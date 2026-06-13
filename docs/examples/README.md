# 反向代理示例

Nage 自身只监听 `:3000`，不处理 HTTPS。反代由你自己决定。

常见选择：

| 方案 | 优点 | 缺点 | 适合 |
|------|------|------|------|
| [Caddy](./caddy/) | 配置最少，自动 HTTPS | 国内访问偶尔不稳 | 个人 / 国外 VPS |
| [Nginx](./nginx/) | 用的人最多，文档全 | 配置最长 | 生产环境 / 大流量 |
| [Cloudflare Tunnel](./cloudflare-tunnel/) | 不需主机开 80/443 | 流量过 Cloudflare | 国内服务器 / NAT 后主机 |

## 通用前置

无论用哪个反代，先把 Nage 起起来：

```bash
cd /opt/nage
docker compose up -d --build
docker compose ps    # 看到 app 是 Up (healthy)
curl -I http://127.0.0.1:3000/login    # 应返回 200
```

确认 `http://127.0.0.1:3000` 能访问后，挑一个反代方案配。

## HTTPS 是必需的

- 管理员密码、登录 cookie 都走 HTTP(S)
- 不上 HTTPS 等于明文密码在网络上跑
- 国内服务器还要面对合规问题（备案 + ICP）

## 几个不要做的事

- ❌ 直接把 3000 端口暴露到公网 — 没 HTTPS + 没任何防护
- ❌ 用自签证书 — 浏览器会拦，扫码也用不了
- ❌ 在 Nage 应用层做 HTTPS — Next.js 没考虑过这件事，工作量巨大且没必要