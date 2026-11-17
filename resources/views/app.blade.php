<!doctype html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#f7f8f2">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="description" content="Aufgaben, Quests und Fokuszeiten.">
    <link rel="manifest" href="/manifest.webmanifest?v=4">
    <link rel="icon" href="/icons/icon.svg?v=4" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=4">
    <script src="/theme.js?v=4"></script>
    <link rel="stylesheet" href="/app.css?v=4">
    <script src="/app.js?v=4" defer></script>
    <title>Opdracht</title>
</head>
<body>
<a class="skip" href="#content">Zum Inhalt</a>
<div class="app-layout">
    <aside class="sidebar">
        <a class="brand" href="#today" aria-label="Opdracht Start"><span class="brand-mark">o</span>opdracht<span class="brand-dot">.</span></a>
        <nav class="nav" aria-label="Hauptnavigation">
            <a href="#today" data-page="today"><span aria-hidden="true">◉</span> Heute</a>
            <a href="#week" data-page="week"><span aria-hidden="true">▦</span> Woche</a>
            <a href="#quests" data-page="quests"><span aria-hidden="true">◇</span> Quests</a>
            <a href="#focus" data-page="focus"><span aria-hidden="true">◷</span> Fokus</a>
            <a href="#review" data-page="review"><span aria-hidden="true">↗</span> Rückblick</a>
        </nav>
        <div class="sidebar-bottom"><form action="/logout" method="post">@csrf<button class="text-button" type="submit">Abmelden <span aria-hidden="true">↗</span></button></form></div>
    </aside>
    <main id="content" tabindex="-1">
        <div class="topbar"><span id="date-label">Opdracht</span><div class="topbar-actions"><label class="theme-picker"><span class="sr-only">Darstellung</span><select data-theme-select aria-label="Darstellung"><option value="system">System</option><option value="light">Hell</option><option value="dark">Dunkel</option></select></label><button id="install" class="text-button" hidden>Installieren ↗</button><span class="connection"><i></i><span id="connection-text">Verbunden</span></span><form class="mobile-logout" action="/logout" method="post">@csrf<button class="icon-button" type="submit" aria-label="Abmelden" title="Abmelden">↗</button></form></div></div>
        <div id="notice" class="notice" role="alert" hidden></div><div id="pwa-notice" class="notice" role="status" hidden></div>
        <div id="screen" aria-live="polite"><div class="empty"><div class="empty-symbol">◌</div><p>Aufgaben werden geladen …</p></div></div>
    </main>
</div>
<dialog id="editor" aria-labelledby="editor-title"><form id="editor-form"><div class="dialog-header"><h2 id="editor-title"></h2><button type="button" class="icon-button" data-close aria-label="Dialog schließen">×</button></div><div id="editor-fields"></div><p id="editor-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button subtle" data-close>Abbrechen</button><button type="submit" class="button primary">Speichern</button></div></form></dialog>
<dialog id="confirm-dialog" aria-labelledby="confirm-title"><form method="dialog"><h2 id="confirm-title">Wirklich löschen?</h2><p id="confirm-text"></p><div class="dialog-actions"><button class="button subtle" value="cancel">Abbrechen</button><button class="button danger" value="delete">Löschen</button></div></form></dialog>
</body>
</html>
