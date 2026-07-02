# syntax=docker/dockerfile:1.7

# ─── Stage 1: 安装依赖（含 native 编译工具）─────────────────────────
FROM node:24-bookworm-slim AS deps

# better-sqlite3 / sharp 在 pnpm install 时会触发原生编译
# 用 pnpm 11 锁版本，配合 frozen lockfile
# corepack 默认从 registry.npmjs.org 拉 pnpm 元数据，国内网络经常 timeout，
# 用 npmmirror.com 替代，corepack 官方支持 COREPACK_NPM_REGISTRY env 覆盖
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
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
# 强制 pnpm 装 Linux x64 的原生 binding（@img/sharp-linux-x64 / esbuild 等）。
# 不写的话，如果 pnpm-lock.yaml 是在 Windows / macOS host 上生成的，会装那个
# 平台的 binary → Linux 容器跑 'Could not load sharp module'。
#
# 注意：不能用 --frozen-lockfile！lockfile 是 host 生成的，可能只有 win32/darwin 的
# optional dep 路径；frozen-lockfile 严格按 lockfile 装，platform 换了也拒绝重新 resolve。
# 这里 drop frozen-lockfile，让 pnpm 根据 target-platform=linux 重新 resolve optional deps
# （会把 @img/sharp-linux-x64 加进 lockfile，但 Docker 里 lockfile 改动不传回 host）。
ENV npm_config_target_platform=linux
ENV npm_config_target_cpu=x64
# 强制 pnpm 装 Linux x64 的原生 binding（@img/sharp-linux-x64 / esbuild 等）。
# 不写的话，如果 pnpm-lock.yaml 是在 Windows / macOS host 上生成的，会装那个
# 平台的 binary → Linux 容器跑 'Could not load sharp module'。
#
# 注意：不能用 --frozen-lockfile！lockfile 是 host 生成的，可能只有 win32/darwin 的
# optional dep 路径；frozen-lockfile 严格按 lockfile 装，platform 换了也拒绝重新 resolve。
# 这里 drop frozen-lockfile，让 pnpm 根据 target-platform=linux 重新 resolve optional deps
# （会把 @img/sharp-linux-x64 加进 lockfile，但 Docker 里 lockfile 改动不传回 host）。
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked     pnpm config set registry https://registry.npmmirror.com     && pnpm install --prefer-offline

# ─── Stage 2: 构建 Next.js 应用 ─────────────────────────────────
FROM node:24-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@11 --activate

WORKDIR /app

# 同 deps 阶段：让 corepack 走 npmmirror
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建时跳过 instrumentation 里的 env 检查
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

# drizzle 迁移文件由 host 提供，随 image 一起打包
# runtime 启动时由 instrumentation.ts 调 migrate() 建表
RUN pnpm build

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

# ─── 用 .next/standalone 替代 node_modules + .next + src + next.config.ts ───
# standalone 是 Next.js 静态分析后输出的最小运行时（自带 server.js + 最小 node_modules +
# .next/server + package.json）。原 node_modules ~656MB → 这里通常只剩 100-150MB。
# 原 src / next.config.ts 都被编译进 standalone,不需要再单独 COPY。
COPY --from=builder --chown=nage:nage /app/.next/standalone ./
# .next/static 不在 standalone 里（客户端 chunks、CSS、图片等静态资源）
COPY --from=builder --chown=nage:nage /app/.next/static ./.next/static
# public/ 也不在 standalone 里
COPY --from=builder --chown=nage:nage /app/public ./public

# 备份/恢复脚本(用户 docker exec 调用,DEPLOY.md 提到)
COPY --from=builder --chown=nage:nage /app/scripts ./scripts

# drizzle 迁移(bootstrap 启动时跑 migrate 建表)
COPY --from=builder --chown=nage:nage /app/drizzle ./drizzle

# ─── 补充 Next.js outputFileTracingIncludes 漏掉的 transitive deps ───
# better-sqlite3 依赖 `bindings`（require('bindings') 加载 .node binding），pnpm 不把
# transitive deps hoist 到顶层 node_modules/，所以 Next 的 tracing 抓不到 → Docker 启动
# 报 'Cannot find module bindings'。bindings 又依赖 file-uri-to-path。
# 显式从 deps 阶段拷贝（从 pnpm 安装目录平铺进 standalone 的 node_modules/）。
# 之前试过在 next.config.ts 用 outputFileTracingIncludes 配 .pnpm/ 路径，
# 但 standalone output 仍没把 bindings 平铺到顶层 — 不可靠。
COPY --from=deps --chown=nage:nage /app/node_modules/bindings ./node_modules/bindings
# file-uri-to-path 是 bindings 的 transitive dep，pnpm 不 hoist 到顶层 node_modules/，
# 实际位置：.pnpm/bindings@<ver>/node_modules/file-uri-to-path/（symlink 指向真正目录）
# 直接从 bindings 的 node_modules 取是最稳的（不受 pnpm dedupe 策略影响）
COPY --from=deps --chown=nage:nage /app/node_modules/.pnpm/bindings@*/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
# detect-libc 是 sharp 的 transitive dep，同理不 hoist。访问 /settings/mcp 等用 sharp
# 处理图片缩略图的页面会报 'Cannot find module detect-libc'。
COPY --from=deps --chown=nage:nage /app/node_modules/.pnpm/detect-libc@*/node_modules/detect-libc ./node_modules/detect-libc
# semver 是 sharp 的 transitive dep，sharp/libvips.js 走 sub-path require
# （semver/functions/coerce 等），跟 detect-libc 同根因。直接 COPY sharp 用的版本（7.8.3）。
COPY --from=deps --chown=nage:nage /app/node_modules/.pnpm/semver@7.8.3/node_modules/semver ./node_modules/semver
# @img/* 是 sharp 的 namespace 下所有依赖（@img/colour / sharp-linux-x64 / sharp-libvips-*）。
# pnpm 都不 hoist 到顶层 node_modules/@img/，全部装在 .pnpm/@img+*@*/node_modules/@img/ 下。
# next.config.ts 的 './node_modules/@img/**/*' 规则在顶层匹配不到 → standalone 漏掉。
#
# 之前 f05d415 只 COPY sharp-linux-x64、0101732 只 COPY libvips .so，但 0101732 之后
# 启动又报 'Cannot find module @img/colour' —— whack-a-mole 不是办法。
# 改成一次性 COPY 所有 @img/* runtime 包到顶层：pnpm glob 展开成 @img+colour / +sharp-* 等
# （注意：* 不跨 /，所以能匹 @img+colour 跟 @img+sharp-* 但 @img+sharp+libvips-* 这种
# 双 + 不会出现，因为 npm 包名合法字符不含 +，pnpm 只在第一段替换 /）。
COPY --from=deps --chown=nage:nage /app/node_modules/.pnpm/@img+*@*/node_modules/@img /app/node_modules/@img
# @img/sharp-libvips-linux-x64 的 .so 文件（libvips-cpp.so.8.17.3 等）需要 dlopen 找得到。
# 上面那行把 sharp-libvips-linux-x64 也 COPY 到顶层 node_modules/@img/ 了，但 .so 在它
# 的 lib/ 子目录里，dlopen 默认不会搜这里。COPY .so 到 /usr/lib/x86_64-linux-gnu/（debian
# 系统 lib 目录，动态链接器默认搜这里）。比设 LD_LIBRARY_PATH 干净。包是 self-contained，
# 依赖（glib/expat 等）都静态链了，不用单独 apt install libvips。
COPY --from=deps --chown=nage:nage /app/node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/lib/ /usr/lib/x86_64-linux-gnu/

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
# standalone 入口是 server.js,不再走 next start
CMD ["node", "server.js"]
