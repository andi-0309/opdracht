#!/bin/sh
set -eu
container="opdracht-smoke-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT HUP INT TERM
APP_KEY="base64:$(openssl rand -base64 32)"
export APP_KEY
docker run -d --name "$container" -e APP_KEY -e APP_ENV=production -e APP_DEBUG=false -e DB_DATABASE=/data/database.sqlite "${1:-opdracht:ci}" >/dev/null
ready=false
for attempt in $(seq 1 30); do
    if docker exec "$container" curl -fsS http://localhost/up >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
done
if [ "$ready" != true ]; then docker logs "$container"; exit 1; fi
for path in login sw.js offline.html app.css app.js manifest.webmanifest icons/icon.svg icons/icon-192.png icons/icon-512.png icons/apple-touch-icon.png; do
    docker exec "$container" curl -fsS "http://localhost/$path" >/dev/null
done
for path in .env composer.json database/database.sqlite storage/logs/laravel.log; do
    status=$(docker exec "$container" curl -s -o /dev/null -w '%{http_code}' "http://localhost/$path")
    [ "$status" = 404 ] || { echo "Unexpected response for $path: $status"; exit 1; }
done
echo 'Docker smoke test passed (health, login, PWA assets, private paths).'
