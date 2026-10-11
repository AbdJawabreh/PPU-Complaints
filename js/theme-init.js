/* يُنفّذ قبل تحميل CSS لمنع وميض الألوان عند فتح الصفحة. */
(function () {
  var preference;
  try { preference = localStorage.getItem('ppu-theme'); } catch (error) { /* المتصفح قد يمنع التخزين. */ }
  var dark = preference ? preference === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
