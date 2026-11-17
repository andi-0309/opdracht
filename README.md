# Opdracht

Eine kleine, selbst gehostete Laravel-Anwendung für Ziele, Tagesaufgaben und Fokuszeit. Inspiriert von den beobachteten Kernabläufen von Quest; eigenständige Implementierung ohne Quest-Code oder Quest-Dienste. Die Untersuchung nutzte [REA](https://github.com/morluto/rea).

## Enthalten

- Aufgaben anlegen, bearbeiten, einem Ziel und Tag zuordnen, erledigen und löschen.
- Tagesansicht, Wochenplanung, Ziele, Fokus-Timer und Wochenrückblick.
- Anmeldung ohne öffentliche Registrierung. Aufgaben und Ziele gehören jeweils einem Benutzer.
- Fokuszeiten auf dem Server: Ein laufender Timer bleibt bei Neuladen und Gerätewechsel erhalten.
- Installierbare PWA für Mobilgeräte mit Offline-Hinweis. Lesen und Änderungen an persönlichen Daten benötigen eine Verbindung; persönliche Inhalte werden nicht im Service Worker zwischengespeichert.
- Laravel 13, PHP 8.5, SQLite, einfache JavaScript-/CSS-Oberfläche. Keine externen Schriftarten, Analyse- oder Cloud-Dienste nötig.

## Lokal mit Docker starten

Voraussetzung: Docker mit Compose v2 und OpenSSL. Für das HTTPS-Overlay ist Compose mindestens 2.24.4 erforderlich.

```sh
git clone https://github.com/andi-0309/opdracht.git
cd opdracht
./docker/init-env.sh
docker compose up -d --build
docker compose exec --user www-data app php artisan opdracht:user you@example.com --name="Dein Name"
```

Der letzte Befehl fragt dein Passwort verdeckt ab. Es gibt keine Standard-Zugangsdaten. Öffne anschließend <http://localhost:8080>. Port 8080 ist bewusst nur auf dem Rechner selbst erreichbar. `APP_PORT` und `APP_URL` in `.env` bei einem anderen Port gemeinsam anpassen.

`docker/init-env.sh` legt `.env` an und erzeugt einmalig den Verschlüsselungsschlüssel. Ein vorhandener Schlüssel bleibt erhalten. Bewahre `.env` sicher auf und committe sie nicht. SQLite und Laufzeitdateien liegen in benannten Docker-Volumes und bleiben beim normalen Neuerstellen des Containers erhalten. Migrationen laufen beim Start automatisch.

## Auf dem Server mit HTTPS und Handy-PWA

Eine eigene Domain muss per DNS auf den Server zeigen. TCP-Port 80 und 443 müssen erreichbar sein; ein vorhandener Reverse Proxy darf diese Ports nicht gleichzeitig belegen. Setze in `.env`:

```dotenv
APP_DOMAIN=opdracht.example.com
APP_URL=https://opdracht.example.com
```

Starte auf dem Server mit beiden Compose-Dateien:

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d --build
docker compose -f compose.yaml -f compose.https.yaml exec --user www-data app php artisan opdracht:user you@example.com --name="Dein Name"
```

Caddy beschafft und erneuert das TLS-Zertifikat. Der App-Container veröffentlicht in dieser Konfiguration keinen eigenen Port. Sichere Session-Cookies und die internen Proxy-Header werden automatisch aktiviert. **Bei allen weiteren Serverbefehlen dieselben beiden `-f`-Optionen verwenden.** Die Kurzbefehle unten beziehen sich auf den lokalen Betrieb.

Öffne die HTTPS-Adresse am Handy und melde dich an:

- iPhone/iPad: Safari → Teilen → Zum Home-Bildschirm.
- Android: Chrome → Menü → App installieren / Zum Startbildschirm hinzufügen.

HTTPS ist für die PWA-Installation am Handy erforderlich; eine unverschlüsselte LAN-IP genügt nicht. Die Desktop-Ausnahme `localhost` gilt nur auf dem jeweiligen Gerät. Beim ersten Besuch muss eine Verbindung bestehen. Offline wird ein Hinweis angezeigt; Änderungen werden nicht stillschweigend vorgemerkt.

Bei einem bestehenden Reverse Proxy die Standardinstallation auf `127.0.0.1:8080` verwenden, `APP_URL` auf die öffentliche HTTPS-Adresse und `SESSION_SECURE_COOKIE=true` setzen. `TRUSTED_PROXIES` nur für die tatsächlichen Proxy-Adressen konfigurieren. Ein Proxy in einem anderen Container benötigt ein gemeinsames Docker-Netzwerk; dessen `localhost` ist nicht der Host.

## Backup und Wiederherstellung

Eine konsistente SQLite-Sicherung im laufenden Betrieb erstellen:

```sh
mkdir -p backups
docker compose exec -T --user www-data app sqlite3 /data/database.sqlite ".backup '/data/backup.sqlite'"
docker compose cp app:/data/backup.sqlite backups/database.sqlite
```

Zusätzlich `.env` außerhalb des Git-Repositories sichern. Das `storage`-Volume enthält Laufzeitdaten; die fachlichen Daten dieser Version liegen vollständig in SQLite. Sicherungen enthalten persönliche Aufgaben und Anmeldedaten-Hashes und gehören nicht ins öffentliche Repository.

Wiederherstellung ersetzt die aktuelle Datenbank. Vorher eine eigene Sicherung erstellen, alle Nutzer abmelden lassen und dann:

```sh
docker compose stop app
docker compose run --rm --no-deps --entrypoint sh -v "$PWD/backups:/backup:ro" app -c \
  'rm -f /data/database.sqlite-wal /data/database.sqlite-shm; cp /backup/database.sqlite /data/database.sqlite; chown www-data:www-data /data/database.sqlite'
docker compose up -d app
```

Den ursprünglichen `APP_KEY` beibehalten. `docker compose down` behält Daten; **`docker compose down -v` löscht Volumes einschließlich der Datenbank.**

## Passwort zurücksetzen

Bei vergessenem Passwort ist nur Serverzugriff nötig; es gibt keinen E-Mail-Dienst:

```sh
docker compose exec --user www-data app php artisan opdracht:user you@example.com --reset-password
```

Das neue Passwort wird verdeckt abgefragt. Bestehende Sitzungen dieses Kontos werden beendet.

## Updates und Diagnose

Vor Updates ein Backup anlegen:

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

`/up` ist der Healthcheck. `APP_DEBUG` bleibt in Docker aus. Für einen Rollback vorherigen Git-Stand bauen und bei inkompatiblen Datenbankänderungen das passende Backup zurückspielen. Diese SQLite-Konfiguration ist für eine einzelne App-Instanz gedacht, nicht für mehrere Replikate.

## Entwicklung und Tests

Mit PHP 8.5, Composer und SQLite-Erweiterung:

```sh
composer install
./docker/init-env.sh
touch database/database.sqlite
php artisan migrate
php artisan opdracht:user you@example.com --name="Dein Name"
php artisan serve --port=8080
php artisan test --compact
```

Die Oberfläche wird direkt aus `public/` ausgeliefert, daher ist kein Node-Build erforderlich. Tests benutzen eine getrennte SQLite-Datenbank im Arbeitsspeicher. Das Produktionsimage installiert nur Laufzeitabhängigkeiten; Tests lokal mit den Entwicklungsabhängigkeiten ausführen.

## Bewusster Umfang

Kein Quest-Datenimport, keine Kalender-Synchronisierung, keine Wiederholungsregeln, keine Push-Benachrichtigungen und keine Offline-Synchronisierung. Es gibt keine Verbindung zu deinem Quest-Konto. Die App ist eine eigenständige kleine Alternative für den persönlichen Alltag.

## Grundlage der Umsetzung

Untersucht wurde die installierte Quest-Version **0.8.4** (`@quest/app`, Native Build 64). Die lokale statische Analyse mit **REA 6.9.0** untersuchte `package.json` und `out/main/index.js`; ergänzend wurden die Wochenplanung mit Tagesaufgaben und Zielzuordnung, aktive/abgeschlossene Ziele sowie Starten und Abschließen im Fokusmodus in der Oberfläche beobachtet. Daraus entstand eine eigene, vereinfachte Implementierung. Quest-Code, Quest-Assets und private Nutzerdaten sind nicht Teil dieses Repositories.

REA-Quellstand: [`05be423acbdf3a56673bdbd3004e4b500c0f5217`](https://github.com/morluto/rea/commit/05be423acbdf3a56673bdbd3004e4b500c0f5217). Die Analyse inventarisierte 4.515 Dateien und parste eine JavaScript-Datei; 4.513 Dateien blieben außerhalb der semantischen Untersuchung. Dies ist keine vollständige Rekonstruktion. Die vollständigen Analyseartefakte verbleiben lokal außerhalb des Repositories.

- Evidence: `ev_0ca091e1e974028378df89f28c035a5953f13aac1e3fdf2d8ca6066b5ee832f4`
- Paket-SHA256: `5b3299d95b89db1db2b652e536860e1465b3c540e8852b0b517842242e205373`
