#!/usr/bin/env bash
# 纳格 SQLite 热备份（sqlite3 .backup 命令对运行中的数据库是安全的）
#
# 用法：
#   bash scripts/backup.sh                 # 备份当前 ./data/nage.db 到 ./backups/
#   bash scripts/backup.sh /path/to/db     # 指定 DB 路径
#   BACKUP_KEEP_DAYS=60 bash scripts/backup.sh   # 自定义保留天数（默认 30）
#
# 容器里跑：
#   docker exec nage-app bash /app/scripts/backup.sh
#
# 定时（主机 crontab）：
#   0 3 * * * cd /opt/nage && bash scripts/backup.sh >> logs/backup.log 2>&1

set -euo pipefail

# ─── 参数 ─────────────────────────────────────────────────────
DB_PATH="${1:-./data/nage.db}"
BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
TS="$(date +%Y%m%d-%H%M%S)"
DEST_DIR="${BACKUP_ROOT}/${TS}"
DEST_FILE="${DEST_DIR}/nage.db"

# 颜色（终端输出友好，cron 里也无所谓）
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
NC=$'\033[0m'

log() { echo "[$(date '+%F %T')] $*"; }
err() { echo "${RED}[$(date '+%F %T')] ERROR: $*${NC}" >&2; }

# ─── 1. 检查依赖 ─────────────────────────────────────────────
if ! command -v sqlite3 >/dev/null 2>&1; then
  err "sqlite3 命令找不到。请安装：apt-get install sqlite3 / apk add sqlite"
  exit 1
fi

# ─── 2. 检查源文件 ───────────────────────────────────────────
if [[ ! -f "$DB_PATH" ]]; then
  err "数据库文件不存在：$DB_PATH"
  exit 1
fi

# WAL 模式下还有 -wal / -shm 文件，一起拷走，restore 时用 .backup 输出已经合并
mkdir -p "$DEST_DIR"
log "备份源：$DB_PATH"
log "备份到：$DEST_FILE"

# ─── 3. 热备份（核心：sqlite3 .backup 拿的是一致快照）────────
# 即使 app 正在写 DB，.backup 也会在源端加共享锁等当前事务结束
sqlite3 "$DB_PATH" ".backup '$DEST_FILE'"

if [[ ! -s "$DEST_FILE" ]]; then
  err "备份文件为空或创建失败"
  rm -rf "$DEST_DIR"
  exit 1
fi

# 顺手存一下 schema 版本信息（方便日后排错）
SCHEMA_HASH=$(sha256sum "$DEST_FILE" | awk '{print $1}')
SIZE=$(du -h "$DEST_FILE" | awk '{print $1}')

cat > "${DEST_DIR}/meta.txt" <<EOF
timestamp=${TS}
source=${DB_PATH}
sha256=${SCHEMA_HASH}
size=${SIZE}
hostname=$(hostname)
nage_version=$(grep -E '"version"' package.json 2>/dev/null | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "unknown")
EOF

log "${GREEN}✓ 备份完成：${NC}${DEST_FILE} (${SIZE}, sha256=${SCHEMA_HASH:0:12}…)"

# ─── 4. 清理过期备份（滚动保留 KEEP_DAYS 天）────────────────
if [[ -d "$BACKUP_ROOT" ]]; then
  DELETED=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+${KEEP_DAYS}" -print -exec rm -rf {} + 2>/dev/null | wc -l || true)
  if [[ "$DELETED" -gt 0 ]]; then
    log "${YELLOW}清理了 ${DELETED} 个超过 ${KEEP_DAYS} 天的旧备份${NC}"
  fi
  REMAINING=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | wc -l)
  log "当前保留备份数：${REMAINING}"
fi

log "${GREEN}done.${NC}"
