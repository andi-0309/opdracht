'use strict';
(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function apply() {
        const theme = window.__opdrachtTheme === 'dark' || window.__opdrachtTheme === 'light'
            ? window.__opdrachtTheme : (media.matches ? 'dark' : 'light');
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171d19' : '#f7f8f2');
    }
    apply();
    document.addEventListener('DOMContentLoaded', apply);
    media.addEventListener('change', apply);
    window.addEventListener('opdracht:theme', apply);
})();
