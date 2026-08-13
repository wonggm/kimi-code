(function () {
  try {
    var currentFontSizeKey = 'kimi-web.ui-font-size';
    var legacyFontSizeKey = 'kimi-web.font-size';
    if (localStorage.getItem(currentFontSizeKey) === null) {
      var legacyFontSize = localStorage.getItem(legacyFontSizeKey);
      if (legacyFontSize !== null) {
        localStorage.setItem(currentFontSizeKey, legacyFontSize);
      }
    }

    var v = localStorage.getItem('kimi-web.color-scheme');
    if (v === 'light' || v === 'dark' || v === 'system') {
      document.documentElement.dataset.colorScheme = v;
    }
  } catch {
    /* ignore */
  }
})();
