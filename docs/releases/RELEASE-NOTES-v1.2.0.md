# v1.2.0 (2026-06-17) — 详情页图片全屏查看 + 标签/表单优化

v1.1.1 让 Docker 镜像瘦到了 510MB；v1.2.0 把使用体验再往"顺手"推一档：详情页点图放大（滚轮缩放 + 拖拽平移 + 重置 + 缩略图条切图），标签选择器选中后直接显示在输入框里，物品描述从 1 行 Input 变成 3 行 Textarea。**功能侧都是 UX 微调，0 数据库 schema 变化，0 数据迁移**。

## ✨ 新增

### 详情页图片点击全屏查看

之前：详情页图片 carousel 只能小图浏览，要看清细节只能下载原图或外部打开。

现在：点击 carousel 任意图片 → 全屏 Dialog（黑色背景，sm:max-w-none 强制全屏）。

**核心交互**：

| 能力 | 实现 |
|---|---|
| 滚轮缩放 | 指数级（`Math.exp(-deltaY * 0.002)`），clamp [0.1, 10]；**缩放点跟着鼠标**（`newPan = cursor - (cursor - oldPan) / oldScale * newScale`），鼠标位置稳定 |
| 拖拽平移 | Pointer Events + `setPointerCapture`，鼠标/触摸/笔统一；松手 release |
| 1:1 重置 | 顶栏 `↺` 图标（`RotateCcw`）点击 = `fitTo1to1()` = scale=1 + 图片居中露出中间 |
| 缩略图条切图 | 底部居中横排所有图缩略图，当前高亮白边，点任意缩略图切图 |
| 键盘导航 | ←/→ wrap-around（最后一张 → 第一张） |
| 侧栏按钮 | 上下张按钮 wrap-around，禁用态 + `aria-label` 完整 |
| a11y | `DialogTitle` sr-only（`1/N 名称`），screen reader 友好 |

**顶栏布局**：

```
┌──────────────────────────────────────────────────────┐
│ 1/3 物品名              100%  ↺                  ×  │
│ ↑ flex-1                 ↑ 居中            ↑ flex-1 │
└──────────────────────────────────────────────────────┘
```

- 左：1/N + 名称（`flex-1` 占满左半，名称 `truncate`）
- 中：100% + 重置按钮（用两侧 `flex-1` 夹击真正水平居中）
- 右：X 关闭按钮（`flex-1 justify-end` 推到最右）

**底部缩略图条**：

- 容器 `rounded-xl` (12px) `bg-black/60 backdrop-blur-sm`
- 缩略图 `rounded-md` (6px) `size-16 object-cover`（背景比缩略图大 4px 圆角）
- 当前图：`!border-white`（透明边框 + 选中时白边，避免尺寸跳变）
- 其他图：`border-transparent opacity-60`，hover 时 `opacity-100`
- 移动端 `inset-x-4` 贴边 + `overflow-x-auto`（图多了能横滚）
- `aria-current="true"` 标记当前

## 🔧 优化

### 标签选择器：选中直接显示

之前：`TagsMultiSelect` 选中后只显示"已选 N 个"数字，标签名要展开下拉才能看到。

现在：trigger 内部直接展示已选标签的 chip 列表（圆角 + 颜色边框 + 名称 + X 单删按钮），跟 Notion / Linear 的多选模式一致。

**实现细节**：

- 删掉内部 `draft` 状态，直接用 `value`（受控）
- 新增 `commit(next)`：去重 + 排序后再传给父组件（避免无意义 re-render）
- 触发器：`role="combobox" aria-expanded aria-controls`（screen reader 知道这是个下拉触发器）
- 每个 chip 的 X：`e.stopPropagation() + e.preventDefault()`（点 X 不展开下拉）+ `onMouseDown stopPropagation`（mousedown 不抢 trigger 的 focus）
- 没传 `spaceId` 时 placeholder 变成"搜索标签…"，不显示"新建"入口

### 物品描述：Input → Textarea

之前：描述是 1 行 `Input`，写多行得在保存后看效果。

现在：`Textarea rows={3} maxLength={2000}`，可写 3 行，溢出自动滚动。

**坑**：

- shadcn 的 `textarea.tsx` 默认有 `field-sizing-content`（CSS 新属性，让表单元素自适应内容），会**覆盖 `rows={3}`**——初始状态还是只显示 1 行
- 解决：去掉 `field-sizing-content`，让 `rows` 正常生效

新增文件：`src/components/ui/textarea.tsx`（shadcn 标准 textarea，去 `field-sizing-content`）。

## 📦 没变

- 数据库 schema 0 变化（无新迁移）
- 反代配置 0 变化
- 启动 / 备份 / 恢复脚本 0 变化
- E2E 测试 0 变化（这版没动测试，下次发版时一起补全屏查看的 E2E）
- Docker 镜像 0 变化（继承 v1.1.1 的 510MB standalone 镜像）

## 🧪 验证

- `pnpm typecheck` / `pnpm lint` / `pnpm build` 全过
- 本地手测：3 张图的物品 → 全屏 → 滚轮缩放到 200% → 拖拽看角落 → `↺` 重置 → 点第 2 张缩略图 → `←` 切到第 1 张
- v1.1.x 升级到 v1.2.0 无任何数据迁移

## 📦 升级指引

**源码用户**：

```bash
cd /opt/nage
git pull
git checkout v1.2.0
docker compose build app
docker compose up -d
```

启动时 `bootstrap` 不会跑任何新迁移（v1.1.0 的 9 张表已建好）。

**ghcr.io / Docker Hub 镜像用户**：

```bash
# 编辑 docker-compose.yml，把 image 改成 :1.2.0
docker compose pull
docker compose up -d
```

## 🚀 新部署

跟 v1.1.0/v1.1.1 完全一致，参考 [DEPLOY.md](../../DEPLOY.md)。无配置层面变化。

## 🛣 下一步（v1.3 计划）

- 借出 / 归还流程（F13）
- 保质期增强：仪表盘「快过期」分组卡片（F14 收口）
- PWA 离线（F16）
- 多语言 i18n（F18）
- 全屏查看 E2E 测试补齐

## 📄 许可

GPL v3
