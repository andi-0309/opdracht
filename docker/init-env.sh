#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
command -v openssl >/dev/null 2>&1 || { echo 'OpenSSL wird zur Schlüsselerzeugung benötigt.' >&2; exit 1; }
umask 077
if [ ! -f .env ]; then
    cp .env.example .env
fi
if grep -q '^APP_KEY=.' .env; then
    echo '.env enthält bereits einen APP_KEY; unverändert.'
    exit 0
fi
temporary=$(mktemp .env.XXXXXX)
trap 'rm -f "$temporary"' EXIT HUP INT TERM
while IFS= read -r line || [ -n "$line" ]; do
    if [ "$line" = 'APP_KEY=' ]; then
        printf 'APP_KEY=base64:'
        openssl rand -base64 32
    else
        printf '%s\n' "$line"
    fi
done < .env > "$temporary"
mv "$temporary" .env
echo '.env mit dauerhaftem APP_KEY eingerichtet. Diese Datei sicher aufbewahren.'
