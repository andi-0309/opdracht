<!doctype html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#f7f8f2">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="description" content="Aufgaben, Quests und Fokuszeiten.">
    <link rel="manifest" href="/manifest.webmanifest?v=7">
    <link rel="icon" href="/icons/icon.svg?v=7" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=7">
    <script src="/theme.js?v=7"></script>
    <link rel="stylesheet" href="/app.css?v=24">
    <script src="/app.js?v=24" defer></script>
    <title>Opdracht</title>
</head>
<body>
<a class="skip" href="#content">Zum Inhalt</a>
<div class="app-layout">
    <aside class="sidebar">
        <a class="brand" href="#focus" aria-label="Opdracht Start – Fokus"><img class="brand-mark" src="/icons/icon.svg?v=7" alt="" width="36" height="36">opdracht<span class="brand-dot">.</span></a>
        <nav class="nav" aria-label="Hauptnavigation">
            <a class="nav-focus" href="#focus" data-page="focus"><svg class="ui-icon" aria-hidden="true" focusable="false"><use href="/icons/ui.svg?v=6#timer"></use></svg> Fokus</a>
            <a href="#today" data-page="today"><svg class="ui-icon" aria-hidden="true" focusable="false"><use href="/icons/ui.svg?v=6#sun"></use></svg> Heute</a>
            <a href="#week" data-page="week"><svg class="ui-icon" aria-hidden="true" focusable="false"><use href="/icons/ui.svg?v=6#calendar-days"></use></svg> Woche</a>
            <a href="#review" data-page="review"><svg class="ui-icon" aria-hidden="true" focusable="false"><use href="/icons/ui.svg?v=6#chart-column"></use></svg> Rückblick</a>
            <a href="#quests" data-page="quests"><svg class="ui-icon" aria-hidden="true" focusable="false"><use href="/icons/ui.svg?v=6#target"></use></svg> Quests</a>
        </nav>
        <div class="sidebar-bottom"><form action="/logout" method="post">@csrf<button class="text-button" type="submit">Abmelden <svg class="ui-icon" aria-hidden="true" focusable="false"><use href="/icons/ui.svg?v=6#log-out"></use></svg></button></form></div>
    </aside>
    <main id="content" tabindex="-1">
        <div class="topbar"><span id="date-label">Opdracht</span><div class="topbar-actions"><button id="install" class="text-button" hidden>Installieren ↗</button><span class="connection"><i></i><span id="connection-text">Verbunden</span></span><form class="mobile-logout" action="/logout" method="post">@csrf<button class="icon-button" type="submit" aria-label="Abmelden" title="Abmelden"><svg class="ui-icon" aria-hidden="true" focusable="false"><use href="/icons/ui.svg?v=6#log-out"></use></svg></button></form></div></div>
        <div id="notice" class="notice" role="alert" hidden></div><div id="pwa-notice" class="notice" role="status" hidden></div>
        <p id="reorder-help" class="sr-only">Aufgabenkarte ziehen, um zu sortieren oder auf einen anderen Tag zu verschieben. Auf Touchscreens kurz halten, dann ziehen; direktes Wischen scrollt. Zum Bearbeiten den Titel antippen. Mit der Tastatur: Aufgabenkarte fokussieren und Pfeil nach oben oder unten drücken.</p><p id="reorder-status" class="sr-only" role="status" aria-live="polite"></p>
        <div id="screen"><div class="empty"><div class="empty-symbol">◌</div><p>Aufgaben werden geladen …</p></div></div>
    </main>
</div>
<dialog id="editor" aria-labelledby="editor-title"><form id="editor-form"><div class="dialog-header"><h2 id="editor-title"></h2><button type="button" class="icon-button" data-close aria-label="Dialog schließen"><svg class="ui-icon" aria-hidden="true" focusable="false"><use href="/icons/ui.svg?v=6#x"></use></svg></button></div><div id="editor-fields"></div><p id="editor-error" class="form-error" role="alert" tabindex="-1" hidden></p><div class="dialog-actions editor-actions">
    <div id="editor-secondary-action"></div>
    <div class="editor-save-actions">
        <button type="button" class="button subtle" data-close>Abbrechen</button>
        <button type="submit" class="button primary" aria-keyshortcuts="Control+Enter Meta+Enter">Speichern</button>
    </div>
</div></form></dialog>
<dialog id="confirm-dialog" aria-labelledby="confirm-title"><form method="dialog"><h2 id="confirm-title">Wirklich löschen?</h2><p id="confirm-text"></p><div class="dialog-actions"><button class="button subtle" value="cancel">Abbrechen</button><button class="button danger" value="delete">Löschen</button></div></form></dialog>
</body>
</html>
