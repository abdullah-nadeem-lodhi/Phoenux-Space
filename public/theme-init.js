'use strict';

(() => {
  try {
    const saved = localStorage.getItem('orbit_theme');
    const theme = saved === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = theme;
  } catch {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.themePreference = 'dark';
  }
})();
