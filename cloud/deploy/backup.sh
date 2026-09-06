#!/usr/bin/env bash
set -euo pipefail
umask 077
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
backup_file="${1:?Usage: backup.sh /secure/path/backup.tar.gz}"
if [[ -e "$backup_file" ]]; then echo 'Refusing to overwrite an existing backup' >&2; exit 1; fi
compose=(docker compose -p soroticket -f "$deploy_dir/compose.yaml")
"${compose[@]}" stop api
trap '"${compose[@]}" start api >/dev/null' EXIT
"${compose[@]}" run --rm --no-deps --entrypoint tar api -C /data -czf - . > "$backup_file"
echo "Backup saved to $backup_file (contains private database and encryption keys)."
