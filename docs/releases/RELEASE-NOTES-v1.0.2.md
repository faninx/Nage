# v1.0.2 (2026-06-14) — 编辑物品支持调整图片顺序

小特性版本，部署侧无任何变化，纯前端 + server action 加了一个图片重排能力。

## ✨ 变更

- **编辑物品时支持调整已上传图片的顺序**：`ImageField` 每张已上传图上新增 `↑` / `↓` 按钮（边界 disabled、悬停 / 聚焦显现），首张图标记「封面」角标。提交时 `imageOrder` 字段把新顺序发给服务端，服务端校验 permutation（多 / 少 / 重复 / 外来 id 一律拒）后逐条 `UPDATE sortOrder = 数组下标`。`queryItems` / `queryItemById` 一直按 `sortOrder ASC` 取首张作封面，所以列表 / 详情 / 详情页轮播图首张自动跟着走，无需额外改动
- **新上传的图仍走 `max(sortOrder) + 1` 追加到末尾**，跟重排互不干扰
- **单图时（`existing.length === 1`）不显示箭头按钮**（重排无意义）
- **版本号**：1.0.1 → 1.0.2

## 📦 部署（已用 v1.0.1 的用户）

无任何 breaking change：

```bash
cd /opt/nage
git pull
docker compose up -d
```

升级后现有物品的图片顺序保持原样（sortOrder 没动），需要调整的话进编辑页用 ↑ / ↓ 重排保存即可。

## 🆕 新部署

跟 v1.0.1 完全一致，参考 [RELEASE-NOTES-v1.0.1.md](./RELEASE-NOTES-v1.0.1.md) 或 [DEPLOY.md](../../DEPLOY.md)。

## 🐛 修

无。

## 🧪 验证

- `pnpm typecheck` / `pnpm lint` / `pnpm build` 全过
- E2E 脚本未受影响（重排是纯增能力，老测试用例照旧通过）
- 手动验证：编辑一物品（≥2 张图）→ 调 ↑ / ↓ → 保存 → 列表封面 / 详情轮播图首张按新顺序展示

## 📋 文档

- [CHANGELOG.md](./CHANGELOG.md) - `[1.0.2]` 段已加
- 无 README / DEPLOY 改动（功能完全在 UI 内可见，不需要文档补充）

## 🛣 下一步

- v1.1 计划未变：借出归还 / 保质期增强 / PWA
- 详情见 [PRD.md §10](./PRD.md)

## 📄 许可

GPL v3
