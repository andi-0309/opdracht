# Opdracht

Eine kleine, selbst gehostete Laravel-Anwendung für Ziele, Tagesaufgaben und Fokuszeit. Inspiriert von den beobachteten Kernabläufen von Quest; eigenständige Implementierung ohne Quest-Code oder Quest-Dienste. Die Untersuchung nutzte [REA](https://github.com/morluto/rea).

## Enthalten

- Aufgaben anlegen, bearbeiten, einem Ziel und Tag zuordnen, erledigen und löschen.
- Tagesansicht, Wochenplanung, Ziele, Fokus-Timer und Wochenrückblick.
- Hell-/Dunkeldarstellung folgt automatisch dem System, ohne manuellen Umschalter. Größere Texte und mindestens 48 px hohe Aktionsflächen erleichtern die Bedienung am Handy.
- Desktopansichten nutzen die verfügbare Breite; insbesondere die Wochenplanung.
- Fokus als Startansicht mit derselben großen Timer-Oberfläche im normalen und bildschirmfüllenden Modus. Vollbild blendet nur Navigation und Rahmenelemente aus; Verlassen oder Escape stoppt keine laufende Fokuszeit.
- Benannte, abgestimmte Farbpalette für Quests und klare, lokal eingebundene SVG-Icons.
- Lokale Anmeldung oder optional Authentik über OpenID Connect. Aufgaben, Ziele und Fokuszeiten gehören jeweils einem Benutzer.
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

## Authentik-Anmeldung (optional)

Authentik entscheidet, wer Opdracht verwenden darf. Jede zugelassene Person erhält bei der ersten Anmeldung automatisch einen eigenen, getrennten Bereich; Opdracht benötigt keine zusätzliche E-Mail-Allowlist und keine vorherige Kontoanlage per CLI. Die Anwendung und Authentik müssen über HTTPS erreichbar sein.

In der Authentik-Administration eine Anwendung mit dem Slug `opdracht` und einem **OAuth2/OpenID Connect**-Provider anlegen. Folgende Einstellungen verwenden:

| Einstellung | Wert für Opdracht |
| --- | --- |
| Client type | `Confidential` |
| Grant type | Authorization code |
| Redirect URI | `Strict`: `https://opdracht.example.com/auth/oidc/callback` |
| Issuer mode | Eigener Issuer je Provider/Anwendungs-Slug |
| Signing Key | RSA-Schlüsselpaar für `RS256` |
| Encryption Key | Nicht setzen; verschlüsselte JWE-ID-Tokens werden nicht unterstützt |
| Scope mappings | `openid`, `profile`, `email`; Benutzer-Claims im ID-Token einschließen |

Redirect URI und Issuer müssen exakt stimmen, einschließlich Pfad und abschließendem Slash beim Issuer. Ohne Signing Key verwendet Authentik HS256; Opdracht erwartet RS256. Der empfohlene Issuer für dieses Beispiel lautet `https://auth.example.com/application/o/opdracht/`. Siehe die offiziellen Angaben zu [OAuth2/OIDC, Issuer und Signaturen](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/).

Die gewünschten Benutzer, Gruppen oder Policies unter **Policy / Group / User Bindings** an die Authentik-Anwendung binden. Ohne Bindings lässt Authentik standardmäßig alle seine Benutzer zu. Opdracht übernimmt die dort erteilte Zugangsentscheidung. Siehe [Authentik: Anwendungszugriff über Bindings](https://docs.goauthentik.io/add-secure-apps/applications/manage_apps/#use-bindings-to-control-access).

Client ID und Client Secret des Providers in der lokalen `.env` eintragen:

```dotenv
OIDC_ENABLED=true
OIDC_ISSUER=https://auth.example.com/application/o/opdracht/
OIDC_CLIENT_ID=deine-client-id
OIDC_CLIENT_SECRET=dein-client-secret
OIDC_REDIRECT_URI=https://opdracht.example.com/auth/oidc/callback
OIDC_LOCAL_LOGIN=true
```

`OIDC_REDIRECT_URI` darf leer bleiben, wenn `APP_URL` korrekt gesetzt ist: dann verwendet Opdracht `APP_URL` mit `/auth/oidc/callback`. Das Secret gehört ausschließlich in `.env`, niemals ins Repository. Nach Änderungen den Container neu erstellen, damit Umgebungswerte und Konfigurationscache aktualisiert werden:

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d --build --force-recreate app
```

Auf der Anmeldeseite **Mit Authentik anmelden** auswählen. Zuerst mit einem berechtigten und einem nicht berechtigten Authentik-Konto prüfen, ob die App-Policy wie gewünscht wirkt. Danach kann `OIDC_LOCAL_LOGIN=false` das lokale Passwortformular deaktivieren. Mit dieser Einstellung müssen auch Administratoren Authentik verwenden; Serverzugriff erlaubt, sie bei Bedarf wieder auf `true` zu setzen.

Die Zuordnung erfolgt dauerhaft über das Paar `iss` + `sub`, nicht über die E-Mail-Adresse. Ein vorhandenes lokales Konto mit derselben E-Mail wird **nicht automatisch verknüpft**; die Anmeldung zeigt in diesem Fall einen Konflikt. Bestehende lokale Konten lassen sich in dieser Version nicht per Oberfläche in SSO-Konten umwandeln. Issuer und Subject-Konfiguration nach der ersten Nutzung deshalb nicht ohne geplante Datenmigration wechseln.

Der Login verwendet Authorization Code mit PKCE S256, State und Nonce sowie eine Prüfung der RS256-Signatur. OIDC-Tokens werden nicht dauerhaft gespeichert. **Abmelden** beendet ausschließlich die Opdracht-Sitzung; die Authentik-Sitzung bleibt bestehen. Ein Zugriffs- oder Kontowiderruf in Authentik verhindert die nächste Anmeldung, beendet aber keine bereits laufende Opdracht-Sitzung: diese besteht bis zum Abmelden oder Sitzungsablauf weiter. Front-/Back-Channel-Logout und laufende Introspection sind nicht implementiert.

Die Authentik-Konfiguration muss auf deiner Instanz abschließend getestet werden. Die Implementierung wird automatisiert gegen simulierte OIDC-Antworten geprüft; eine reale Authentik-Instanz war bei der Entwicklung nicht verfügbar.

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

Für ein lokales Konto ist bei vergessenem Passwort nur Serverzugriff nötig; es gibt keinen E-Mail-Dienst. Passwörter von SSO-Konten werden in Authentik verwaltet:

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

## MCP: gemeinsam mit einem Assistenten planen

Der Streamable-HTTP-Endpunkt liegt unter `/mcp` (z. B. `https://opdracht.example.com/mcp`). Er verwendet `laravel/mcp` und benutzergebundene Sanctum-Bearer-Tokens. Authentik-Anmeldetokens sind hierfür kein Ersatz. Ein Browser-Login allein gewährt keinen MCP-Zugriff.

Nach der ersten Anmeldung in Opdracht ein Token auf dem Server erzeugen:

```sh
docker compose exec --user www-data app php artisan opdracht:mcp-token you@example.com --name=clawy --write --days=30
```

Beim Stack aus `docker-server` heißt der Dienst `opdracht` statt `app`; dort `docker compose --env-file ../../.env --env-file .env exec --user www-data opdracht ...` verwenden. Ohne `--write` ist das Token ausschließlich lesend. Die Gültigkeit beträgt standardmäßig 30 Tage und höchstens 365 Tage. Der Klartext wird nur einmal im Terminal angezeigt: im geschützten MCP-Client speichern, nicht in Git oder Chats. Der Server speichert nur den Token-Hash.

Den MCP-Client mit der Server-URL und dem Header `Authorization: Bearer <TOKEN>` konfigurieren. Verfügbare Werkzeuge:

- `read_planner`: eigene Aufgaben, Quests, aktuelle Fokuszeit und Wochenübersicht lesen.
- `plan_task`: eigene Aufgaben anlegen, terminieren, ändern und erledigen/wieder öffnen.
- `plan_quest`: eigene Ziele anlegen/ändern; neue Farben aus derselben abgestimmten Palette wie in der App.

Schreiboperationen benötigen `planner:write`, alle Zugriffe `planner:read`. Es gibt keine Löschwerkzeuge. Titel/Notizen sind Daten, keine Anweisungen an den Assistenten. Ein unklar bestätigtes Anlegen nicht blind wiederholen, sondern zuerst den Plan lesen.

Tokens ohne Klartext auflisten oder eine ID dieses Benutzers widerrufen:

```sh
php artisan opdracht:mcp-token you@example.com --list
php artisan opdracht:mcp-token you@example.com --revoke=12
```

In Docker diese Artisan-Befehle wie oben im App-Container ausführen. Abgelaufene oder widerrufene Tokens können nicht mehr zugreifen. Der Endpunkt ist auf 60 Anfragen pro Benutzer und Minute begrenzt; Antworten dürfen nicht geteilt zwischengespeichert werden. Caddy benötigt keine gesonderte Route, da der gesamte Host bereits an Opdracht weitergeleitet wird. Eine zusätzliche OAuth-/Passport-Integration für Clients ohne benutzerdefinierte Bearer-Header ist nicht enthalten.


## Wochenziele und Arbeitslogbuch

Quests trennen „Warum ist es wichtig?“ und „Worum geht es genau?“. Ein optionales Wochenziel in Stunden misst investierte Zeit, nicht die Anzahl erledigter Aufgaben. Der Rückblick zeigt gebuchte Fokusabschnitte als Zeitkalender und trennt Gesamtfokuszeit von Quest-Zeit. Wochen starten am Montag in der Serverzeitzone; die Kalenderzeiten werden in der Gerätezeitzone angezeigt. Der Wochenzielvergleich verwendet die aktuell eingestellten Ziele. Laufende Timer erscheinen im Logbuch erst nach dem Stoppen. Review-Notizen werden pro Benutzer und Woche gespeichert; Entwürfe bleiben während der Navigation erhalten, dauerhaft gespeichert wird mit „Review speichern“.

Aufgabenbeschreibungen unterstützen einen kleinen Markdown-Umfang: `**fett**`, `*kursiv*`, Code mit Backticks, Aufzählungen und nummerierte Listen sowie `[Titel](https://example.org)` und `mailto:`-Links. HTML wird als Text angezeigt, nicht ausgeführt. Die Wochenkarte zeigt eine Vorschau von drei Zeilen, Fokus zeigt Timer und Bedienung oben, darunter Titel und vollständige Beschreibung linksbündig in einem gemeinsamen scrollbaren Aufgabenbereich. Timer und Bedienelemente bleiben auch bei langen Inhalten sichtbar; Hintergrundaktualisierungen erhalten die Leseposition. In Heute öffnet „Aufgabe hinzufügen“ ein Modal mit vorausgewähltem heutigen Datum. Der Titel ist sofort fokussiert; Enter speichert den Titel, Strg/Cmd+Enter speichert aus jedem Feld, Escape schließt. Beschreibung und Quest sind direkt erreichbar, die Tastaturfokussierung kehrt nach dem Schließen zurück. In der Woche sind Tage mindestens 336 px breit; Abhaken und Wiederöffnen erfolgen dort ausschließlich im Bearbeitungsmodal.

## Reine Website-Hülle für Android, Windows und macOS

`apps/shell/` enthält ausschließlich eine Flutter-WebView für `https://opdracht.zerver.eu/`, ohne zweite Planungslogik oder native Datenbank. Als native Zusatzfunktion gibt es eine GitHub-Updateprüfung. Authentik bleibt für die Anmeldung innerhalb der WebView; externe HTTPS-Links öffnen den Systembrowser. Webänderungen sind sofort in der Hülle verfügbar. Anmeldedaten werden nicht eingebaut; die Website-Sitzung wird vom jeweiligen WebView-Profil verwaltet.

Der Workflow **Website shell** erzeugt bei `v*`-Tags oder manuellem Start mit Flutter **3.38.5** die nativen Runner aus `apps/shell/bootstrap.py`, prüft Dart-Code und Navigation und kompiliert:

- `Opdracht-Android.apk`: direkt installierbares Release-APK.
- `Opdracht-Windows-x64-Setup.exe`: Installer pro Benutzer mit Startmenü- und optionaler Desktop-Verknüpfung. Visual-C++-Laufzeitbibliotheken werden mitgeliefert; eine fehlende Microsoft Edge WebView2 Runtime wird bei bestehender Internetverbindung eingerichtet. Updates und Deinstallation lassen das WebView-Profil erhalten.
- `Opdracht-Windows-x64.zip`: weiterhin verfügbare portable Anwendung inklusive Laufzeitbibliotheken. Das ZIP vollständig entpacken; Microsoft Edge WebView2 Runtime muss installiert sein.
- `Opdracht-macOS-arm64.dmg` (und weiterhin `Opdracht-macOS-arm64.zip`): ad-hoc signierte `.app` ausschließlich für Apple Silicon (arm64), ohne Intel-Unterstützung, ohne Apple-Store-Veröffentlichung oder Notarisierung. macOS kann beim ersten Öffnen eine Bestätigung über Systemeinstellungen → Datenschutz & Sicherheit verlangen.

Die Desktop-Hüllen verwenden eine eigene kompakte Titelleiste mit dem Opdracht-Logo und der Website-Farbpalette; macOS behält die nativen Fensterknöpfe. Website, Systemflächen und native Dialoge folgen gemeinsam dem Hell-/Dunkelmodus des Betriebssystems, auch während die App geöffnet ist.

### App-Updates und Obtainium

Die Hülle prüft beim Start die neueste stabile GitHub-Veröffentlichung. Nur bei einer verfügbaren Aktualisierung erscheint ein Modal; es gibt keine zusätzliche Update-Leiste. Nur neuere Versionen mit vollständig hochgeladenem, passendem Plattform-Download werden angeboten; Vorabversionen und Downgrades nicht. Netzwerkfehler verhindern nicht die Nutzung der Website. „Update herunterladen“ lädt die Datei in der App herunter und öffnet sie ohne Browser. Android fragt vor der Installation und kann beim ersten Mal die Freigabe dieser Installationsquelle verlangen. Windows öffnet das Setup; die portable ZIP bleibt ein separater Download. Auf macOS Opdracht beenden und die App aus dem geöffneten Installationsabbild in „Programme“ ziehen. Es findet keine stille Installation statt. Das bestehende WebView-Profil bleibt erhalten; die App nicht vorher deinstallieren.

Android kann alternativ mit **Obtainium** aktualisiert werden. Quelle: `https://github.com/andi-0309/opdracht`. Das Repository veröffentlicht pro Release genau eine stabil signierte APK mit gleichbleibender Paketkennung `eu.zerver.opdracht` und steigendem Android-Versioncode. Der Android-Update-Dialog bietet „In Obtainium hinzufügen“ über den offiziellen HTTPS-Redirect mit Installationshinweis, falls Obtainium fehlt.

[In Obtainium hinzufügen](https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%257B%2522id%2522%253A%2522eu.zerver.opdracht%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fgithub.com%252Fandi-0309%252Fopdracht%2522%252C%2522author%2522%253A%2522andi-0309%2522%252C%2522name%2522%253A%2522Opdracht%2522%257D). Direkter Deep Link bei installiertem Obtainium: `obtainium://add/https://github.com/andi-0309/opdracht`.

Die Dateien landen als Actions-Artefakte und bei Tags zusätzlich am GitHub-Release. Für Android sind zwei Actions-Secrets notwendig: `OPDRACHT_ANDROID_KEYSTORE_BASE64` (Base64 des privaten PKCS12-Keystores mit Alias `opdracht`) und `OPDRACHT_ANDROID_KEYSTORE_PASSWORD`. Derselbe Schlüssel muss bei späteren Builds wiederverwendet und privat gesichert werden, damit Android die APK als Update akzeptiert. Es gibt keinen unsicheren Debug-Key-Fallback. Die CI entfernt die temporäre Schlüsseldatei nach jedem Android-Build.

Für lokale Builds Flutter 3.38.5 installieren und `python apps/shell/bootstrap.py` ausführen. Danach unter `apps/shell/build/native` `flutter pub get`, `flutter analyze`, `flutter test` und den gewünschten Plattform-Build ausführen. Android benötigt zusätzlich die beiden Umgebungsvariablen `OPDRACHT_KEYSTORE_PATH` und `OPDRACHT_KEYSTORE_PASSWORD`. Windows und macOS müssen auf ihrem jeweiligen Betriebssystem gebaut werden. Die Windows-Paketierung mit `apps/shell/windows/package.ps1` benötigt Inno Setup 6 und Visual-C++-Redistributables aus Visual Studio; sie prüft Neuinstallation, erneutes Setup und Deinstallation einschließlich Profilerhalt. Die generierten nativen Runner und private Signierdateien werden nicht versioniert und gelangen nicht ins Docker-Image.
