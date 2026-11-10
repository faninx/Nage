#!/usr/bin/env bash
# 把 Docker Hub 上 faninx/nage 的历史 tag 复制到 faninx/nage-legacy
#
# 背景：Docker Hub 不支持重命名仓库，镜像改名的唯一途径是「新建仓库 + 重推 tag」。
# 新仓库建好后跑这个脚本，把旧 tag 补过去，让 faninx/nage-legacy:1.4.4 这类
# 历史版本在新仓库里也能拉到。
#
# 为什么不用 docker pull/tag/push：
#   faninx/nage 的镜像是多架构 OCI index（linux/amd64 + linux/arm64），
#   并且带 SBOM / provenance 的 attestation manifest（platform=unknown/unknown）。
#   pull/tag/push 只能搬本机架构那一层，attestation 直接丢失。
#   docker buildx imagetools create 走的是 registry 层的 manifest 复制，
#   不下载任何镜像层，完整保留多架构 + attestation。
#
# 前置条件：
#   1. hub.docker.com 已手动创建 faninx/nage-legacy 仓库（public）
#   2. 本机已 docker login，账号对两个仓库都有 write 权限
#      docker login   # 用户名 + Access Token（hub.docker.com/settings/security）
#
# 用法：
#   bash scripts/migrate-image-tags.sh              # 迁移全部历史 tag
#   bash scripts/migrate-image-tags.sh 1.4.4        # 只迁移指定 tag
#   DRY_RUN=1 bash scripts/migrate-image-tags.sh    # 只打印结果，不真推
#
# 幂等：已存在的 tag 会被覆盖，不报错。

set -euo pipefail

SRC="${SRC_REPO:-faninx/nage}"
DST="${DST_REPO:-faninx/nage-legacy}"

# 历史 tag 清单（写死而不是从 API 拉，避免依赖 jq / curl 解析差异）
ALL_TAGS=(
  latest
  v1.4.4 1.4 1.4.4
  v1.4.3 1.4.3
  v1.4.2 1.4.2
  v1.4.1 1.4.1
  v1.4.0 1.4.0
  v1.3.0 1.3 1.3.0
  v1.2.1 1.2 1.2.1
  v1.2.0 1.2 1.2.0
  v1.1.1 1.1 1.1.1
)

if [ $# -gt 0 ]; then
  TAGS=("$@")
else
  TAGS=("${ALL_TAGS[@]}")
fi

echo "源仓库 : $SRC"
echo "目标库 : $DST"
echo "tag 数 : ${#TAGS[@]}"
if [ "${DRY_RUN:-0}" = "1" ]; then echo "模式   : DRY-RUN（不实际推送）"; fi
echo

for tag in "${TAGS[@]}"; do
  printf '%-10s -> %s:%s ... ' "$tag" "$DST" "$tag"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    docker buildx imagetools create --dry-run -t "$DST:$tag" "$SRC:$tag" >/dev/null
  else
    docker buildx imagetools create -t "$DST:$tag" "$SRC:$tag" >/dev/null
  fi
  echo "✓"
done

echo
echo "完成。新仓库 tag 列表："
curl -s "https://hub.docker.com/v2/repositories/$DST/tags?page_size=100" \
  | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"//' | sort -V
