# v1.4.2 (2026-07-02) — 主题修复 + Docker compose 清理

v1.4.1 后的 4 个小修复合集，全部是 v1.4.0 / v1.4.1 部署后用户报告的运行问题。**0 数据库 schema 变化，0 数据迁移**。

## 🐛 Bug 修复

### 1. PWA 在 Android 桌面图标打开后强制 light 模式

**症状**：把 Nage "添加到主屏幕"（WebAPK）后，无论系统主题是暗黑还是设了 dark 模式，app 总是渲染成 light 模式。

**根因**：`public/manifest.json` 缺 `color_scheme` 字段。MDN 规定：未指定 `color_scheme` 时，UA 默认按 `normal` 处理——**强制 light 模式**，不受 `prefers-color-scheme` 影响。Android Chrome 用 manifest 的 `background_color` 作为 WebAPK 的初始渲染提示，又没声明支持 dark scheme → 整页按 light 渲染。

**修复**（commit `8299cb0`）：
- `manifest.json` 加 `"color_scheme": "light dark"`
- `src/app/layout.tsx` 的 `viewport.themeColor` 改为 media-query 响应式（light=`#fafafa` / dark=`#0f172a`）
- `viewport.colorScheme: "light dark"` 也加上

### 2. PC 浏览器暗黑模式刷新后跳回 light（item 详情 / members 列表尤其明显）

**症状**：在 PC 浏览器设了暗黑模式后，刷新物品详情页 / 成员列表页 → 整页跳回 light 模式。其他页面不明显或只是闪一下。

**根因**：`ThemeScript` 之前放在 `<body>` 里、children 之前。理论上同步 inline script 仍该在 children 解析前执行，但 Next.js 16 在某些页面（item detail / admin members）会把 script 视为可优化目标**推迟执行**——body 已经按 light CSS 渲染完，`.dark` 后到时整页看起来已经在 light 模式。

生产环境比 dev 严重（dev 没这个问题），因为：
- prod 用 build-time 预渲染的静态 HTML
- PWA service worker 缓存页面，inline script 的执行受缓存层干扰
- prod 优化器比 dev 激进

**修复**（commit `ca82a15`）：把 `ThemeScript` 从 `<body>` 移到 `<head>`，是 canonical next-themes 模式。head 级 inline script 必然在 body 解析前执行完，`<html class="dark">` 在 body 第一个子元素出现前就加好。

**与 PWA fix 的关系**：两者互补——
- `8299cb0` 修 WebAPK 桌面图标场景（manifest color_scheme 缺省）
- `ca82a15` 修常规 HTML 解析场景（ThemeScript 位置）

### 3. `docker-compose.yml` 的 `nage-uploads` 死 volume

**症状**：`docker compose up` 后 `nage-uploads` volume 被创建但永远不被应用层使用，浪费磁盘空间 + 误导用户。

**根因**：v1.4.0 M10 安全修复把 uploads 从 `public/uploads/` 迁到 `data/uploads/`，但 `docker-compose.yml` 没同步——还挂着 `- nage-uploads:/app/public/uploads`。M10 修复后那行挂载就成死代码了。

**修复**（commit `65442d3`）：删 `nage-uploads` 挂载 + 删 `volumes.nage-uploads` 声明 + 改注释说明 `nage-data` 同时承担 DB + uploads。

### 4. 文档 stale 引用 `public/uploads/`

M10 修复后 DEPLOY.md / PRD.md / CLAUDE.md / README.md 里的 `public/uploads` 引用没同步。

**修复**（commit `ea09f25`）：
- `DEPLOY.md`：卷映射表 / 7.7 排错段
- `PRD.md`：技术栈图片路径 / 备份指引（data/ 整体备份）
- `CLAUDE.md`：仓库根描述 / WAL reset pitfall
- `README.md`：目录结构图

历史 `public/uploads` 引用（CHANGELOG / RELEASE-NOTES 里的 M10 描述 / "从 public/uploads/ 迁出" 字样）保留——它们是讲历史变更的正确上下文。

## 📦 副作用

- 0 schema 变化 / 0 数据迁移 / 0 API 变化 / 0 配置变化
- Docker 镜像大小无变化（compose 改动不影响镜像构建）
- PWA 图标缓存需要清一下（manifest 改了）—— 升级指引里会说明

## 📦 升级指引

```bash
cd /opt/nage
git fetch origin
git checkout v1.4.2
docker compose pull
docker compose up -d
```

只换镜像 + 重新 `git checkout` 拿新 compose（`nage-uploads` volume 在 `docker compose down` 后会被自动清理）。**WebAPK 用户**需要在 Chrome 设置里清一下应用存储（manifest 改了浏览器会缓存老的）。

## 🧪 验证

```bash
# Docker 部署
docker build -t nage:1.4.2 .
docker run --rm -p 3000:3000 nage:1.4.2

# 主题验证
# 1. PC 浏览器：http://localhost:3000/login → 设暗黑模式
# 2. 进物品详情页 / 成员列表页 → F5 刷新 → 应保持暗黑
# 3. Android Chrome → 添加到主屏幕 → 打开 Nage → 跟随系统暗黑模式

# PWA manifest 验证
curl -s http://localhost:3000/manifest.json | jq .color_scheme
# "light dark"
```

CI 推送 tag `v1.4.2` 后自动构建并 push：
- `ghcr.io/faninx/nage:1.4.2`
- `faninx/nage:1.4.2`

## 📚 文档

- `CHANGELOG.md` — 1.4.2 段
- `docs/releases/RELEASE-NOTES-v1.4.2.md` — 本文件
- `DEPLOY.md` / `PRD.md` / `CLAUDE.md` / `README.md` — uploads 路径同步

## 📊 变更

4 个 commit（自 v1.4.1 tag）：

| Commit | 类型 | 内容 |
|---|---|---|
| `65442d3` | fix(docker-compose) | 删 nage-uploads 死 volume |
| `ea09f25` | docs | 同步 uploads 路径（4 份文档） |
| `8299cb0` | fix(pwa) | manifest 加 color_scheme: light dark |
| `ca82a15` | fix(ui) | ThemeScript 从 body 移到 head |