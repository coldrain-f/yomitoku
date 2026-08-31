#!/usr/bin/env sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file="$project_dir/.env.production"
backup_dir=${BACKUP_DIR:-"$project_dir/backups"}

if [ ! -f "$env_file" ]; then
    echo "Missing $env_file" >&2
    exit 1
fi

mkdir -p "$backup_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_dir/yomitoku-$timestamp.sql.gz"
temporary_dump=$(mktemp "$backup_dir/.yomitoku-dump.XXXXXX")

cleanup() {
    rm -f "$temporary_dump"
}
trap cleanup EXIT HUP INT TERM

docker compose --env-file "$env_file" \
    -f "$project_dir/deploy/docker-compose.production.yml" \
    exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    > "$temporary_dump"

gzip -c "$temporary_dump" > "$backup_file"

echo "Created $backup_file"
