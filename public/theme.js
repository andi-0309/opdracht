'use strict';
(() => {
    const key = 'opdracht-theme';
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const valid = value => ['system', 'light', 'dark'].includes(value) ? value : 'system';
    let preference = 'system';
    try { preference = valid(localStorage.getItem(key)); } catch {}

    function apply() {
        const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171d19' : '#f7f8f2');
        document.querySelectorAll('[data-theme-select]').forEach(select => { select.value = preference; });
    }

    apply();
    document.addEventListener('DOMContentLoaded', apply);
    document.addEventListener('change', event => {
        if (!event.target.matches('[data-theme-select]')) return;
        preference = valid(event.target.value);
        try { localStorage.setItem(key, preference); } catch {}
        apply();
    });
    media.addEventListener('change', () => { if (preference === 'system') apply(); });
    window.addEventListener('storage', event => {
        if (event.key === key || event.key === null) {
            preference = valid(event.newValue);
            apply();
        }
    });
})();
