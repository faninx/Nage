## 改了什么

<!-- 简明描述这次 PR 的目的 -->

## 关联 Issue

<!-- 关联的 issue 编号，例如 Fixes #123, Closes #456 -->

## 类型

- [ ] 新功能
- [ ] Bug 修复
- [ ] 重构（无功能变更）
- [ ] 文档
- [ ] 构建 / 工具链
- [ ] 依赖升级

## 改动清单

<!--
逐条列出，reviewer 看这个就能知道改了什么
- 新增 X（src/lib/expiry.ts）
- 改 Y（src/app/...）
- 删 Z
-->

## 截图 / 录屏（如适用）

<!-- UI 改动附截图，行为改动可附 GIF -->

## 验证

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm build` 通过
- [ ] 跑了 `scripts/test-items.ts` 等 E2E 脚本（63 项全过）
- [ ] 手动验证了关键路径（哪几条）
- [ ] 新增/修改了数据库 schema → 同步更新了 `PRD.md` §5
- [ ] 新增/修改了 E2E 覆盖

## 部署注意（如适用）

- [ ] 改了 `.env` 必需变量
- [ ] 改了 Dockerfile
- [ ] 改了 drizzle 迁移（需要 `pnpm db:generate` 重新生成）

## Checklist

- [ ] 没动无关代码（CLAUDE.md 增量开发守则）
- [ ] 没在文件里写 emoji（除非是 UI 上必要的图标）
- [ ] commit message 用中文 / 描述清楚「为什么」而不只是「做了什么」
