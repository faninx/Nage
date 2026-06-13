# Caddy 反代示例

把仓库 `Caddyfile` 拷贝到 `/etc/caddy/Caddyfile`（覆盖默认），替换域名，重启 Caddy：

```bash
# 装 Caddy（Debian/Ubuntu 官方源）
sudo apt install -y caddy
# 或者用官方一键脚本（自动签 Let's Encrypt）
curl -fsSL https://getcaddy.com | sudo sh

# 把配置覆盖默认（注意替换 nage.example.com）
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/nage.example.com/你的真实域名/g' /etc/caddy/Caddyfile

# 验证 + 重启
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy 会自动向 Let's Encrypt 申请证书（首次启动要外网能访问 80 端口做 ACME 校验）。

## 用容器跑 Caddy（独立 compose）

新建 `docker-compose.proxy.yml`：

```yaml
services:
  caddy:
    image: caddy:2-alpine
    container_name: nage-caddy
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    networks: [nage-net]
volumes:
  caddy-data:
  caddy-config:
```

然后用 `Caddyfile` 里的 **B 方案**（容器内 Caddy 走 `nage-app:3000`，需 `networks: nage-net`），起服务：

```bash
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d
```

## 验证

```bash
curl -I https://nage.example.com
# 期望：HTTP/2 200，有 X-Frame-Options / Strict-Transport-Security 头
```

## 日志

- 主机装：`journalctl -u caddy -f`
- 容器装：`docker compose logs -f caddy`