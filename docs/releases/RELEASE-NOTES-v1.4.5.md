# v1.4.5 (2026-11-10) — 位置记忆 + 侧栏固定 + Docker Hub 仓库改名

v1.4.4 后的 UX 增强与布局修复，外加一次 Docker Hub 仓库改名。**0 数据库 schema 变化，0 数据迁移**。

## ✨ 新增

### 添加物品弹窗记住上次选的位置

两个添加入口——右下角悬浮「+」快速添加（`quick-add-item-dialog.tsx`）、物品列表页「添加物品」完整表单（`item-form.tsx`）——现在都会**预选上次选过的位置**。

**行为**：

| 场景 | 结果 |
|---|---|
| 快速添加选位置 X → 关闭 → 再打开 | 还是 X |
| 完整表单选 X → 取消 → 再打开 | 还是 X |
| 任一弹窗选 X → 切到另一弹窗 | 也是 X（共享同一份记忆） |
| 选 X → 删掉位置 X → 再打开 | 回落「不选」 |
| 切到另一个空间 → 打开 | 回落「不选」（id 不在当前空间的位置列表里） |
| 编辑物品时改位置 | **不**覆盖这份记忆（编辑不算"添加"） |
| 选完直接取消 / 不提交 | 仍然记住（选择即写入，不依赖提交成功） |

**实现**（commit `f5b8b52`）：

- 新增 `src/lib/storage/last-add-location.ts`，两个弹窗共用一份读写 helper
- localStorage key：`nage-last-add-location`，值是 JSON 正整数（locationId）
- 写入时机是 `onChange`（选择时）而非提交成功时——语义是"上次**选择**的位置"，取消后重开仍保留
- 读取时校验该 id **仍在传入的 `locations` 列表里**，否则回落 `null`。这样切空间、删位置都不会拿到死链
- `null` 表示「不选位置」，写入时直接 `removeItem`；读写都 try/catch 静默吞掉 private mode / quota 错误
- 编辑模式（`mode === "edit"`）只有初始值读 `item.locationId`，`onChange` 不写 localStorage

**验证**：新增 `scripts/test-location-memory.ts`（Playwright + 系统 Chrome），覆盖 5 个断言——Dialog A 记住 / Dialog B 共享 / Dialog B 写入 / 重开恢复 / 跨弹窗共享。

## 🐛 Bug 修复

### 1. 侧栏跟着主区一起滚动

**症状**：物品列表页物品多到出现滚动条时，PC 端左侧导航栏会跟着主区一起滚走，导航项滚出视野。

**根因**：`<aside>` 是普通 flex 子项，没有 `position: sticky`。而且 flex 容器默认 `align-items: stretch` 会把它的高度拉成跟主区一样高——即使加了 `sticky`，拉伸后的高度超出视口，sticky 也不会把它固定住。

**修复**（commit `06129be` + `3433bc1`）：

```diff
- <aside className="hidden md:flex w-56 shrink-0 border-r py-4 pr-2 flex-col">
+ <aside className="hidden md:flex w-56 shrink-0 border-r py-4 pr-2 flex-col sticky top-14 self-start h-[calc(100dvh-3.5rem)]">
```

- `sticky` + `top-14`：header 是 h-14（56px），侧栏黏在 header 正下方
- `self-start`：覆盖 flex 默认的 `stretch`（stretch 会让 sticky 失效）
- `h-[calc(100dvh-3.5rem)]`：强制填满视口剩余高度。最初用的是 `max-h-`，只设上限、内容少时侧栏只有内容高度、底部留一大片空白（实测 340px vs 应有 744px），改成 `h-` 才对

**验证**：`scripts/test-sidebar-sticky.ts`（Playwright）双断言——侧栏高度 == 视口 − header，滚动 600px 后 `rect.top` 不变。

### 2. dev console 报 `eval() is not supported`

**症状**：开发模式下控制台一直报 `eval() is not supported in this environment`，并弹出 Next.js error overlay。

**根因**：v1.4.4 加的 CSP `script-src 'self' 'unsafe-inline'` 缺 `'unsafe-eval'`，而 React 19 dev mode 用 eval 重建 callstack（生产 bundle 不调 eval）。

**修复**（commit `1cbcc04`）：`next.config.ts` 按 `NODE_ENV` 区分——dev 的 `script-src` 加 `'unsafe-eval'`，**生产保持严格**。

**验证**：dev 控制台错误从 2 类降到 1 类（剩下的是 next-themes `ThemeToggle` 的 SSR/CSR `aria-checked` 不一致，next-themes 已知 dev-only 行为，生产无影响，不修）。

## ⚠️ 变更：Docker Hub 镜像仓库改名

**本项目镜像从 `faninx/nage` 迁到 `faninx/nage-legacy`。**

**为什么不能直接改名**：Docker Hub **不支持重命名仓库**（官方文档原话：*"You can't rename a Docker Hub repository once it's created."*）。唯一的途径是"新建仓库 + 重推 tag"。

**改了什么**（commit `f746e8b` + `a7ff3fd`）：

- `.github/workflows/docker-publish.yml`：`DH_IMAGE` 从 `docker.io/faninx/nage` 改成 `docker.io/faninx/nage-legacy`
- `README.md`：Docker badge 指向新仓库
- `CLAUDE.md`：CI/CD 描述同步
- 新增 `scripts/migrate-image-tags.sh`：如需把历史 tag 也复制到新仓库

**GHCR 不变**：`ghcr.io/${{ github.repository }}` 跟随 GitHub 仓库名，GitHub 仓库还叫 `faninx/Nage`，所以 GHCR 镜像名仍是 `ghcr.io/faninx/nage`。

**对使用者的影响**：

| 版本 | 拉取命令 |
|---|---|
| v1.4.5 及以后 | `docker pull faninx/nage-legacy:1.4.5` |
| v1.4.4 及以前 | `docker pull faninx/nage:1.4.4`（历史 tag 不迁移） |
| GHCR 全版本 | `docker pull ghcr.io/faninx/nage:1.4.5` |

已有部署如果 `docker-compose.yml` 里写的是 `faninx/nage`，需改成 `faninx/nage-legacy:1.4.5`。

**迁移脚本**（可选，本次未执行）：

```bash
bash scripts/migrate-image-tags.sh
```

用 `docker buildx imagetools create` 在 registry 层直接复制 manifest index——不下载任何镜像层，完整保留多架构（amd64/arm64）和 SBOM/provenance attestation manifest。普通 `docker pull`/`tag`/`push` 只能搬本机架构那一层，attestation 会丢。

## 📦 副作用

- 0 schema 变化 / 0 数据迁移 / 0 API 变化
- localStorage 新增 1 个 key：`nage-last-add-location`
- 生产 CSP **未放宽**（`unsafe-eval` 只在 dev 生效）

## 📦 升级指引

```bash
cd /opt/nage
git fetch origin
git checkout v1.4.5
# 改 docker-compose.yml 的 image: faninx/nage-legacy:1.4.5
docker compose pull
docker compose up -d
```

只换镜像，0 配置变化（除镜像地址）。

## 🧪 验证

```bash
# 镜像地址（Docker Hub）
docker pull faninx/nage-legacy:1.4.5
docker pull faninx/nage-legacy:1.4
docker pull faninx/nage-legacy:latest

# 多架构还在（应该同时列出 amd64 和 arm64）
docker buildx imagetools inspect faninx/nage-legacy:1.4.5

# 位置记忆：加一个物品选位置 → 关掉 → 再开，应该预选同一个位置
# 侧栏：物品列表滚到底，左侧导航栏应该原地不动

# 生产 CSP 仍然是严格的（不应该出现 unsafe-eval）
curl -sI https://nage.example.com/login | grep -i content-security-policy
# 默认-src 'self'; script-src 'self' 'unsafe-inline'; ...（没有 unsafe-eval）
```

CI 推送 tag `v1.4.5` 后自动构建并 push：
- `ghcr.io/faninx/nage:1.4.5` / `:1.4` / `:v1.4.5` / `:latest`
- `faninx/nage-legacy:1.4.5` / `:1.4` / `:v1.4.5` / `:latest`

## 📚 文档

- `CHANGELOG.md` — 1.4.5 段
- `docs/releases/RELEASE-NOTES-v1.4.5.md` — 本文件

## 📊 变更

7 个 commit（自 v1.4.4 tag）：

| Commit | 类型 | 内容 |
|---|---|---|
| `f5b8b52` | feat(ux) | 添加物品弹窗记住上次位置（共享 localStorage） |
| `50e24e9` | test | 位置记忆 Playwright smoke 测试 + playwright devDep |
| `06129be` | fix(layout) | 侧栏 sticky，不再跟随主区滚动 |
| `3433bc1` | fix(layout) | 侧栏改 `h-` 强制填满视口高度 |
| `1cbcc04` | fix(security) | dev 模式 CSP script-src 加 `unsafe-eval`（生产不变） |
| `f746e8b` | ci(docker) | Docker Hub 镜像改推 `faninx/nage-legacy` + 迁移脚本 |
| `a7ff3fd` | fix(scripts) | 迁移脚本改用 `buildx imagetools create`，保多架构 + attestation |