# Nginx 反代示例

```bash
# 装 Nginx + Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# 复制配置（替换你的域名）
sudo cp nage.conf /etc/nginx/sites-available/nage.conf
sudo sed -i 's/nage.example.com/你的真实域名/g' /etc/nginx/sites-available/nage.conf

# 启用站点
sudo ln -s /etc/nginx/sites-available/nage.conf /etc/nginx/sites-enabled/

# 验证配置
sudo nginx -t

# 申请证书（certbot 会自动改 nginx 配置加上 SSL 段）
sudo certbot --nginx -d 你的真实域名

# 重启
sudo systemctl reload nginx
```

## 自动续期

Certbot 装好后会自带 systemd timer / cron，每天检查两次，过期前自动续。

验证：

```bash
sudo certbot renew --dry-run
```

## 验证

```bash
curl -I https://你的真实域名
# 期望：HTTP/2 200，有 X-Frame-Options / Strict-Transport-Security 头
```

## 日志

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```