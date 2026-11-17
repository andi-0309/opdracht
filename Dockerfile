# syntax=docker/dockerfile:1
FROM php:8.5-apache AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends libicu-dev libonig-dev libsqlite3-dev libzip-dev curl sqlite3 gosu \
    && docker-php-ext-install -j"$(nproc)" pdo_sqlite mbstring intl zip \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*
# Debian maps /icons/ to Apache assets by default; serve the PWA icons instead.
RUN rm /etc/apache2/mods-enabled/alias.conf
WORKDIR /var/www/html
COPY docker/apache.conf /etc/apache2/sites-available/000-default.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/opdracht.ini

FROM base AS dependencies
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction --no-progress
COPY . .
RUN mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && composer dump-autoload --no-dev --classmap-authoritative --no-interaction \
    && php artisan view:cache

FROM base AS app
COPY --from=dependencies --chown=www-data:www-data /var/www/html /var/www/html
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/opdracht-entrypoint
RUN mkdir -p /data && chown www-data:www-data /data
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS http://127.0.0.1/up || exit 1
ENTRYPOINT ["opdracht-entrypoint"]
CMD ["apache2-foreground"]
