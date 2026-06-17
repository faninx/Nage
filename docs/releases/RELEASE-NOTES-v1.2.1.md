# v1.2.1 (2026-06-17) — 移动端 UX 修复 + 位置拖动 buildTree bug

v1.2.0 上线后用移动端自测，发现 4 类 UX 问题，全部在 v1.2.1 修掉。同时修了一个潜伏已久的 `buildTree` 渲染 bug——拖动后 UI 显示的位置关系错乱（DB 实际是对的）。**功能侧都是 UX 修复，0 数据库 schema 变化，0 数据迁移**。

## 🐛 Bug 修复

### 1. 位置拖动后 UI 位置关系错乱（critical）

**症状**：拖动 A 到 P2 中段想让它成为 P2 的子位置，结果 A 跟 A 的子节点一起"跑到根级"了，P2 自己单独在根。看起来像"拖动没生效 + 其他位置的关系变了"。

**根因**：`buildTree` 假设 DB fetch 顺序里父节点一定先于子节点出现。拖动后子节点被服务端分配 `sortOrder=(i+1)*10=10`，而 P2 作为根自己的 `sortOrder` 通常 ≥20，`ORDER BY sortOrder, id` 把子节点排在 P2 前面 → `buildTree` 遍历子节点时 P2 还没进 map → `map.has(parent) === false` → 子节点被当成孤儿挂到根。

**修复**：

```ts
// 原版：按 list 顺序遍历，假设父先出现
for (const l of list) {
  if (l.parentId && map.has(l.parentId)) attach
  else roots.push(node)  // ← 父子顺序一反就掉这里
}

// 修复：递归 visit + visited set 保证父先处理，迭代顺序不变
function visit(node) {
  if (visited.has(node.id)) return
  visited.add(node.id)
  if (!node.parentId || !map.has(node.parentId)) {
    roots.push(node); node.depth = 0
  } else {
    visit(map.get(node.parentId)!)
    node.depth = parent.depth + 1
    parent.children.push(node)
  }
}
```

DB 端从来没有错，纯粹是渲染 bug。

### 2. 移动端位置列表无法拖动

**症状**：iOS Safari / Android Chrome 不响应 HTML5 `draggable` 元素的 touch 事件（这是浏览器历史问题，不是我代码 bug）。

**修复**：自实现 touch 拖动，复用桌面端的 before/after/child 视觉和 `reorderLocationAction`。

**关键技术点**：

| 问题 | 解决 |
|---|---|
| React 合成 touchmove 默认 `passive: true`，`preventDefault` 无效 | 用 `addEventListener` + `{ passive: false }` 全局注册 |
| 全局 listener 闭包拿到首次 render 的 `performDrop`（`draggingId` 是 null） | `performDropRef` 始终指向最新版本 |
| iOS 长按 `draggable` 元素触发"拖图副本"和我们 touch 冲突 | `(pointer: coarse)` 媒体查询在移动端关掉 `draggable` |
| 页面滚动会抢触摸事件 | `select-none touch-callout-none` + 激活阈值 8→12px |
| touchend 时最后一次 `touchmove` 已过去几帧，手指 ≠ 上次 setState 的位置 | touchend 用 `changedTouches[0]` 重跑一次 hit-test，`flushSync` 强制同步提交 state 再调 `performDrop` |

### 3. 移动端列表 hover-only 操作按钮看不见

**症状**：物品 / 位置 / 分类列表的操作 Icon 只在 PC 端 `group-hover` 才显示，移动端没 hover 所以看不见，没法操作。

**修复**：Tailwind 类 `opacity-0 group-hover:opacity-100 focus-within:opacity-100` → `opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100`。移动端常显、PC 端保持 hover。

### 4. 弹窗按钮文案和标题动词不对齐

**症状**：标题"新建位置"但按钮叫"创建"；标题"新增成员"但按钮叫"新增"（这个一致）；标题"快速添加物品"按钮叫"录入"。

**修复**：

| 对话框 | 标题 | 按钮（修后） |
|---|---|---|
| 新建位置 | 新建位置 | **新建** |
| 新建分类 | 新建分类 | **新建** |
| 新建标签 | 新建标签 | **新建** |
| 新增成员 | 新增成员 | **新增** |
| 快速添加物品 | 快速添加物品 | **添加** |
| 编辑物品 | 编辑物品 | **保存**（保持） |
| 重命名 | 重命名 | **保存**（保持） |

实现：`<ItemForm>` 加可选 `submitLabel` prop，传给 DialogFooter 内的 Button。

### 5. 移动端 Emoji 下拉无法滚动

**症状**：编辑分类时点 Emoji 按钮，下拉里的 emoji 网格在移动端无法上下滚动。

**修复**：网格容器加 `touch-pan-y`（`touch-action: pan-y`）+ `overscroll-contain` + `onTouchMove stopPropagation`，`PopoverContent` 加 `max-w-[calc(100vw-2rem)]`。

**首次尝试的失误**：把 `max-h-72` (288px) 改成 `max-h-[60vh]` (~400px) 想"给大点更好滚"——结果整个 popover 太长，把移动端底部导航 Tab 都遮住了。回退到 `max-h-72`，**`touch-pan-y` 才是关键**，高度不影响能否滚动只影响一次能看多少。

### 6. README GitHub Release badge 404

**症状**：README 顶部的 GitHub Release badge 图标显示破了。

**根因**：badge URL 用了大写 `faninx/Nage`，shields.io 走 GitHub API 是大小写敏感的，404。但项目实际仓库名是 `nage`（小写，跟 package.json / Docker 镜像名一致）。

**修复**：`faninx/Nage` → `faninx/nage`（badge URL 和点击跳转链接都改）。

## 🎨 文案 / 微调

- 全局"快速录入物品" → "快速添加物品"（dialog 标题 / 按钮 / page.tsx 仪表盘空状态提示文案）
- `<ItemForm>` 加 `submitLabel?` prop，调用方覆盖默认按钮文案

## 📦 没变

- 数据库 schema 0 变化（无新迁移）
- 反代配置 0 变化
- 启动 / 备份 / 恢复脚本 0 变化
- E2E 测试 0 变化（这版没补测试，下次发版时一起补移动端拖动的 E2E）
- Docker 镜像 0 变化（继承 v1.1.1 的 510MB standalone 镜像）
- package.json 版本号 0 变化（同步手动改到 1.2.1）

## 🧪 验证

- `pnpm typecheck` / `pnpm lint` / `pnpm build` 全过
- 本地手测：
  - 移动端：新建根位置 → 拖到另一个根中段 → UI 正确显示成子位置（之前会变成同级）
  - 移动端：拖带子位置的 A 到新父 P → A 和它的子树都正确迁移
  - PC 端：拖动排序不受影响（中段判定改成 25/50/25 后稍微宽一点，但 before/after 边界还在 1/4 处）
  - 移动端：分类编辑 → Emoji 下拉可正常竖向 pan
  - 移动端：物品列表操作按钮全部可见

## 📦 升级指引

**源码用户**：

```bash
cd /opt/nage
git pull
git checkout v1.2.1
docker compose build app
docker compose up -d
```

启动时 `bootstrap` 不会跑任何新迁移（v1.1.0 的 9 张表已建好）。**如果你之前在 v1.2.0 拖动过位置**——DB 里的 `parentId` / `sortOrder` 其实都是对的，UI 渲染错乱是 buildTree bug，升级后刷新页面会显示正确的关系树。

**ghcr.io / Docker Hub 镜像用户**：

```bash
# 编辑 docker-compose.yml，把 image 改成 :1.2.1
docker compose pull
docker compose up -d
```

## 🚀 新部署

跟 v1.2.0 完全一致，参考 [DEPLOY.md](../../DEPLOY.md)。无配置层面变化。

## 🛣 下一步（v1.3 计划）

- 借出 / 归还流程（F13）
- 保质期增强：仪表盘「快过期」分组卡片（F14 收口）
- PWA 离线（F16）
- 多语言 i18n（F18）
- 全屏查看 E2E + 移动端拖动 E2E 补齐

## 📄 许可

GPL v3
