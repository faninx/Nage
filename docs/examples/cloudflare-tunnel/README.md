# Cloudflare Tunnel 反代示例

**特点**：主机不需要开放 80/443，cloudflared 主动出连到 Cloudflare 边缘，由 Cloudflare 终结 HTTPS。

适合：

- 国内服务器（Cloudflare 边缘做 HTTPS 终结）
- NAT / 防火墙严格的主机
- 临时公开演示

## 一次性配置

```bash
# 1. 装 cloudflared
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main' \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# 2. 登录（会跳浏览器）
cloudflared tunnel login

# 3. 建 Tunnel（记下输出的 UUID）
cloudflared tunnel create nage
# → UUID 就是 config.yml 里的 <your-tunnel-id>
# → credentials 在 ~/.cloudflared/<UUID>.json

# 4. DNS 解析
cloudflared tunnel route dns nage nage.example.com
# → Cloudflare 自动加一条 CNAME: nage.example.com → <UUID>.cfargotunnel.com

# 5. 写 config（替换三个 <...>）
cp config.yml ~/.cloudflared/config.yml
# 编辑填入 tunnel ID / credentials-file 路径 / 域名

# 6. 装成系统服务
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

## Cloudflare 侧设置

登录 Cloudflare Dashboard：

1. 选你的域名
2. **SSL/TLS** → Overview → 改成 **Full**（上游是 HTTP）
3. （可选）**SSL/TLS** → Edge Certificates → 打开 **Always Use HTTPS**

## 验证

```bash
cloudflared tunnel info nage
curl -I https://nage.example.com
```

## 日志

```bash
sudo journalctl -u cloudflared -f
```