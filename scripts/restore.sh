#!/usr/bin/env bash
# 纳格 SQLite 恢复
#
# 用法：
#   bash scripts/restore.sh                              # 恢复最新的备份
#   bash scripts/restore.sh backups/20260611-030000      # 指定某个时间戳的备份
#   bash scripts/restore.sh --yes                       # 跳过确认（cron/自动化用）
#
# 容器里跑：
#   docker exec nage-app bash /app/scripts/restore.sh [路径]
#
# ⚠️  恢复会覆盖现有数据库，务必先停 app 容器

set -euo pipefail

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
NC=$'\033[0m'

DB_PATH="${DB_PATH:-./data/nage.db}"
BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
ASSUME_YES="false"

# ─── 1. 解析参数 ─────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES="true" ;;
    --help|-h)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *)
      BACKUP_DIR="$arg"
      ;;
  esac
done

# 没指定就用最新的
if [[ -z "${BACKUP_DIR:-}" ]]; then
  if [[ ! -d "$BACKUP_ROOT" ]]; then
    echo "${RED}ERROR: 备份目录不存在：$BACKUP_ROOT${NC}" >&2
    exit 1
  fi
  BACKUP_DIR=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | sort -r | head -1)
  if [[ -z "$BACKUP_DIR" ]]; then
    echo "${RED}ERROR: 备份目录里没有任何备份：$BACKUP_ROOT${NC}" >&2
    exit 1
  fi
  echo "未指定备份，使用最新：$BACKUP_DIR"
fi

SOURCE_DB="$BACKUP_DIR/nage.db"
if [[ ! -f "$SOURCE_DB" ]]; then
  echo "${RED}ERROR: 备份文件不存在：$SOURCE_DB${NC}" >&2
  exit 1
fi

# ─── 2. 显示元信息 ───────────────────────────────────────────
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  源备份：$SOURCE_DB"
echo "  目标 DB：$DB_PATH"
if [[ -f "$BACKUP_DIR/meta.txt" ]]; then
  echo
  echo "  备份元信息："
  sed 's/^/    /' "$BACKUP_DIR/meta.txt"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# ─── 3. 确认 ─────────────────────────────────────────────────
if [[ "$ASSUME_YES" != "true" ]]; then
  echo "${YELLOW}⚠️  恢复会覆盖现有数据库文件！${NC}"
  read -rp "确认恢复？输入 yes 继续： " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "已取消"
    exit 0
  fi
fi

# ─── 4. 备份当前 DB（防止误操作回不去）────────────────────────
if [[ -f "$DB_PATH" ]]; then
  SAFETY_DIR="${BACKUP_ROOT}/pre-restore-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$SAFETY_DIR"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$SAFETY_DIR/nage.db'"
  else
    cp -p "$DB_PATH" "$SAFETY_DIR/nage.db"
  fi
  echo "${GREEN}✓ 现有 DB 已另存到 $SAFETY_DIR${NC}"
fi

# 清掉 WAL 残留（-wal / -shm）
rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"

# 拷贝
cp -p "$SOURCE_DB" "$DB_PATH"

echo "${GREEN}✓ 恢复完成。${NC}"
echo "  下一步：重启 app 容器 → docker compose restart app"
