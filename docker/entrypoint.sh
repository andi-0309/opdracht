#!/bin/sh
set -eu
if [ -z "${APP_KEY:-}" ]; then
    echo 'APP_KEY fehlt. Zuerst docker/init-env.sh ausführen.' >&2
    exit 1
fi
mkdir -p /data storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
if [ ! -f "${DB_DATABASE:-/data/database.sqlite}" ]; then
    touch "${DB_DATABASE:-/data/database.sqlite}"
fi
chown -R www-data:www-data /data storage bootstrap/cache
gosu www-data php artisan migrate --force --no-interaction
gosu www-data php artisan config:cache
exec "$@"
