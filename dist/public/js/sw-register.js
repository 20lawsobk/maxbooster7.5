if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(registration) {
        console.log('[PWA] Service Worker registered:', registration.scope);
        registration.update();
      })
      .catch(function(error) {
        console.log('[PWA] Service Worker registration failed:', error);
      });
  });
}
