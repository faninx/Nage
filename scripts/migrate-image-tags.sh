#!/usr/bin/env bash
# 把 Docker Hub 上 faninx/nage 的历史 tag 复制到 faninx/nage-legacy
#
# 背景：Docker Hub 不支持重命名仓库，镜像改名的唯一途径是「新建仓库 + 重推 tag」。
# 新仓库建好后跑这个脚本，把旧 tag 补过去，让 faninx/nage-legacy:1.4.4 这类
# 历史版本在新仓库里也能拉到（否则新仓库只有下一个版本之后的 tag）。
#
# 前置条件：
#   1. hub.docker.com 已手动创建 faninx/nage-legacy 仓库（public）
#   2. 本机已 docker login，账号对两个仓库都有 write 权限
#      docker login   # 用户名 + Access Token（hub.docker.com/settings/security）
#
# 用法：
#   bash scripts/migrate-image-tags.sh            # 迁移全部历史 tag
#   bash scripts/migrate-image-tags.sh 1.4.4      # 只迁移指定 tag
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
echo

# 首选 skopeo：直接复制 manifest list，不依赖本机 daemon 的架构支持，
# 多架构（amd64/arm64）原样保留。
# 退路 docker pull/tag/push：需要本机 daemon 支持多架构存储
# （Docker Engine 29+ 默认 containerd image store 可以；经典存储只能带单架构）。
if command -v skopeo >/dev/null 2>&1; then
  USE_SKOPEO=1
else
  USE_SKOPEO=0
  echo "⚠ 没找到 skopeo，退回 docker pull/tag/push。"
  echo "  如果本机是经典（非 containerd）镜像存储，多架构 tag 可能只推上去单架构。"
  echo "  装 skopeo 可避免：https://github.com/containers/skopeo/releases"
  echo
fi

for tag in "${TAGS[@]}"; do
  echo "── $tag ──"
  if [ "$USE_SKOPEO" = "1" ]; then
    skopeo copy --all "docker://$SRC:$tag" "docker://$DST:$tag"
  else
    docker pull --platform linux/amd64,linux/arm64 "$SRC:$tag" >/dev/null
    docker tag "$SRC:$tag" "$DST:$tag"
    docker push "$DST:$tag" >/dev/null
  fi
  echo "  ✓ $DST:$tag"
done

echo
echo "完成。新仓库 tag 列表："
curl -s "https://hub.docker.com/v2/repositories/$DST/tags?page_size=100" \
  | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"//' | sort -V