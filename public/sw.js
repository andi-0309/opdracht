'use strict';
const CACHE = 'opdracht-static-v28';
const OFFLINE_URL = '/offline.html?v=7';
const ASSETS = [OFFLINE_URL, '/icons/ui.svg?v=6', '/app.css?v=28', '/app.js?v=28', '/theme.js?v=7', '/icons/icon.svg?v=7', '/icons/icon-192.png?v=7', '/icons/icon-512.png?v=7', '/icons/apple-touch-icon.png?v=7', '/manifest.webmanifest?v=7'];
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, {cache: 'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('opdracht-static-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
    if (event.request.mode === 'navigate') {
        event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
        return;
    }
    if (ASSETS.includes(url.pathname + url.search)) {
        event.respondWith(fetch(event.request, {cache: 'no-cache'}).then(response => {
            if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
            return response;
        }).catch(() => caches.match(event.request)));
    }
});
