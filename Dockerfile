# syntax=docker/dockerfile:1.7

# ─── Stage 1: 安装依赖（含 native 编译工具）─────────────────────────
FROM node:24-bookworm-slim AS deps

# better-sqlite3 / sharp 在 pnpm install 时会触发原生编译
# 用 pnpm 11 锁版本，配合 frozen lockfile
RUN corepack enable && corepack prepare pnpm@11 --activate

WORKDIR /app

# 切到 USTC 镜像源（国内网络访问 deb.debian.org 慢/不可达）
# 覆盖：docker build --build-arg APT_MIRROR=deb.debian.org .
ARG APT_MIRROR=mirrors.ustc.edu.cn
RUN for f in /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list; do \
      if [ -f "$f" ]; then \
        sed -i "s|deb\.debian\.org|${APT_MIRROR}|g; s|security\.debian\.org|${APT_MIRROR}|g" "$f"; \
      fi; \
    done

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
# cache mount：跨 build 复用 pnpm store，避免重下大 binary 包（@esbuild、sharp、geist）
# 用 npmmirror.com（国内 CDN）替代默认 registry——默认 registry 在构建容器内下载慢到 27 KiB/s，
# 经常 timeout；npmmirror 实测 2 MB/s
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked     pnpm config set registry https://registry.npmmirror.com/     && pnpm install --frozen-lockfile --prefer-offline

# ─── Stage 2: 构建 Next.js 应用 ─────────────────────────────────
FROM node:24-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@11 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建时跳过 instrumentation 里的 env 检查
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

# drizzle 迁移文件由 host 提供，随 image 一起打包
# runtime 启动时由 instrumentation.ts 调 migrate() 建表
RUN pnpm build

# 砍掉 devDependencies（typescript/eslint/drizzle-kit/tsx/@types/...）
# runtime 只需要 better-sqlite3 / sharp / next / jose / bcryptjs 等
RUN pnpm prune --prod

# ─── Stage 3: 运行时（最小化） ─────────────────────────────────
FROM node:24-bookworm-slim AS runtime

# 切到 USTC 镜像源（同 deps 阶段）
ARG APT_MIRROR=mirrors.ustc.edu.cn
RUN for f in /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list; do \
      if [ -f "$f" ]; then \
        sed -i "s|deb\.debian\.org|${APT_MIRROR}|g; s|security\.debian\.org|${APT_MIRROR}|g" "$f"; \
      fi; \
    done

# sqlite3 CLI 给 backup.sh 用；curl 给 HEALTHCHECK 用；tini 给 PID 1 用
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    ca-certificates \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 非 root 用户跑应用
RUN groupadd --system --gid 1001 nage \
    && useradd --system --uid 1001 --gid nage --no-create-home --shell /usr/sbin/nologin nage \
    && mkdir -p /app/data /app/public/uploads /app/backups \
    && chown -R nage:nage /app

# 复制 production node_modules（builder 阶段已编过 better-sqlite3 / sharp，且 prune 砍了 devDeps）
COPY --from=builder --chown=nage:nage /app/package.json ./package.json
COPY --from=builder --chown=nage:nage /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=nage:nage /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=nage:nage /app/node_modules ./node_modules

# 复制 .next 构建产物和静态资源
COPY --from=builder --chown=nage:nage /app/.next ./.next
COPY --from=builder --chown=nage:nage /app/public ./public
COPY --from=builder --chown=nage:nage /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nage:nage /app/src ./src
COPY --from=builder --chown=nage:nage /app/drizzle.config.ts ./drizzle.config.ts

# 复制备份/恢复脚本
COPY --from=builder --chown=nage:nage /app/scripts ./scripts

# 复制 drizzle 迁移（bootstrap 启动时跑 migrate 建表）
COPY --from=builder --chown=nage:nage /app/drizzle ./drizzle

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

USER nage

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3000/login || exit 1

# tini 作 PID 1，正确转发 SIGTERM 给 next
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "node_modules/next/dist/bin/next", "start"]
