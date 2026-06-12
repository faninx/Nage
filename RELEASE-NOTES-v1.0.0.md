# v1.0.0 (2026-06-12) — 首次正式发布

🎉 **纳格 1.0.0 来了**。5 个里程碑（M1-M5）全部完成，端到端测试 63/63 全过。

## ✨ 核心特性

- 📦 **物品管理** — 图片、价格、描述、数量、过期时间，列表/卡片双视图
- 🌲 **5 级位置树** — 父级折叠、跨级拖拽排序
- 🏷 **彩色标签** — 多对多关联
- ⏰ **过期提醒** — 仪表盘「快过期」卡片，30/7/已过期三档颜色
- 📱 **移动端优先** — 底部 Tab + 触控 ≥44px，PC 端侧栏
- 🔍 **搜索 + 筛选** — 跨字段模糊 + 多维筛选 + 排序分页
- 📷 **二维码** — 每件物品一个，扫码直达
- 📥 **数据导入导出** — JSON 格式，跨实例可迁移
- 🔐 **管理员模式** — 无公开注册，bcrypt + JWT + 5 次失败锁 10 分钟
- 🐳 **一键部署** — 单 VPS + Docker Compose + Caddy 自动 HTTPS
- 💾 **热备份** — `sqlite3 .backup` 在线备份 + 30 天滚动

## 📦 部署

```bash
git clone https://github.com/faninx/Nage.git
cd Nage
cp .env.local.example .env       # 改 ADMIN_PASSWORD / JWT_SECRET
docker compose up -d --build
```

第一次登录用 `.env` 里的管理员账号。详见 [DEPLOY.md](./DEPLOY.md)。

## 🐛 v1.0 收口修复

- 列表/卡片视图删除反馈统一
- localStorage 视图偏好持久化
- 过期桶逻辑统一抽 `src/lib/expiry.ts`
- bootstrap 密码生成不再被 username 缺失短路覆盖
- Dockerfile 字体本地化（构建不再需要外网）
- Dockerfile pnpm 走 npmmirror（80x 加速）

## 🧪 测试

- 4 个 E2E 脚本 / 63 项全过
- `pnpm typecheck` / `pnpm lint` / `pnpm build` 全过

## 📋 文档

- [README.md](./README.md) — 项目介绍 + 快速开始
- [DEPLOY.md](./DEPLOY.md) — 部署指南（9 项故障 + 8 项安全清单）
- [PRD.md](./PRD.md) — 产品规范（v1.0/v1.1/v2.0）
- [CHANGELOG.md](./CHANGELOG.md) — 完整变更历史
- [CLAUDE.md](./CLAUDE.md) — 协作规范

## 🛣 v1.1 路线图（未做）

- 借出归还
- 保质期增强（剩余天数提醒 + 批量处理）
- 暗黑模式
- PWA 离线
- 多语言

## 🤝 贡献

PR 模板见 [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md)。
按 [CLAUDE.md](./CLAUDE.md) 增量开发守则提交。

## 📄 许可

MIT
