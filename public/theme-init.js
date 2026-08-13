'use strict';

(() => {
  try {
    const saved = localStorage.getItem('orbit_theme');
    const theme = saved === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = theme;
  } catch {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.themePreference = 'light';
  }
})();
