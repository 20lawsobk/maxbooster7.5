(function() {
  window.__MB_BOOT = Date.now();

  var bar   = document.getElementById('mb-loader-bar-fill');
  var msg   = document.getElementById('mb-loader-msg');
  var sub   = document.getElementById('mb-loader-sub');
  var btn   = document.getElementById('mb-loader-reload');
  var gone  = false;

  if (btn) { btn.addEventListener('click', function() { location.reload(); }); }

  function setProgress(pct) {
    if (bar && !gone) bar.style.width = pct + '%';
  }
  function setMsg(text) {
    if (msg && !gone) msg.textContent = text;
  }
  function setSub(text) {
    if (sub && !gone) sub.textContent = text;
  }
  function showReload() {
    if (btn && !gone) btn.style.display = 'inline-block';
  }

  var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  var conn     = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var isSlow   = conn && (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || conn.saveData);

  setProgress(12);
  setTimeout(function() { setProgress(30); setMsg('Initializing\u2026'); }, 1200);
  setTimeout(function() { setProgress(52); }, 3000);
  setTimeout(function() { setProgress(68); setMsg('Almost ready\u2026'); }, 5500);
  setTimeout(function() { setProgress(82); }, 8000);
  setTimeout(function() { setProgress(91); setMsg('Finishing up\u2026'); }, 11000);

  var warnMs = isMobile ? 8000 : 12000;
  if (isSlow) warnMs = 5000;

  setTimeout(function() {
    if (gone) return;
    if (isSlow) {
      setSub('Slow connection detected \u2014 this may take a moment.');
    } else if (isMobile) {
      setSub('First-time visits cache the app for faster loads next time.');
    }
  }, warnMs);

  var reloadMs = isMobile ? 15000 : 20000;
  setTimeout(function() {
    if (gone) return;
    setMsg('Taking a bit longer than usual');
    setSub('Your connection may be slow. Reloading often helps.');
    showReload();
  }, reloadMs);

  setTimeout(function() {
    if (gone) return;
    setMsg('Still loading \u2014 hang tight');
    setSub('If this continues, try closing other tabs or switching to Wi-Fi.');
  }, 30000);

  window.addEventListener('error', function(e) {
    if (document.getElementById('root') && document.getElementById('root').children.length <= 1) {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;padding:20px;z-index:99999;text-align:center;';
      var inner = document.createElement('div');
      inner.style.cssText = 'max-width:500px';
      var h = document.createElement('h1');
      h.style.cssText = 'font-size:20px;color:#f87171;margin-bottom:12px';
      h.textContent = 'Loading Error';
      var p1 = document.createElement('p');
      p1.style.cssText = 'margin-bottom:8px;font-size:14px;line-height:1.5';
      p1.textContent = e.message || 'Unknown error';
      var p2 = document.createElement('p');
      p2.style.cssText = 'font-size:12px;color:#94a3b8;margin-bottom:16px';
      p2.textContent = (e.filename || '') + (e.lineno ? ':' + e.lineno : '');
      var reloadBtn = document.createElement('button');
      reloadBtn.style.cssText = 'background:#3b82f6;color:white;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px';
      reloadBtn.textContent = 'Reload';
      reloadBtn.addEventListener('click', function() { location.reload(); });
      inner.appendChild(h); inner.appendChild(p1); inner.appendChild(p2); inner.appendChild(reloadBtn);
      d.appendChild(inner);
      document.body.appendChild(d);
    }
  });

  var observer = new MutationObserver(function() {
    var root = document.getElementById('root');
    if (root && root.firstElementChild && root.firstElementChild.id !== 'mb-initial-loader') {
      gone = true;
      observer.disconnect();

      if (window.__MB_BOOT) {
        var bootMs = Date.now() - window.__MB_BOOT;
        console.log('[MB] App hydrated in ' + bootMs + ' ms');
      }

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        var scripts = Array.from(document.querySelectorAll('script[src]'))
          .map(function(s) { return s.src; })
          .filter(function(s) { return s.includes('/assets/') && (s.includes('vendor-react') || s.includes('/index-') || s.includes('vendor-state') || s.includes('vendor-ui')); });
        var styles = Array.from(document.querySelectorAll('link[rel=stylesheet][href]'))
          .map(function(l) { return l.href; })
          .filter(function(h) { return h.includes('/assets/'); });
        var chunks = scripts.concat(styles);
        if (chunks.length > 0) {
          navigator.serviceWorker.controller.postMessage({
            type: 'PRECACHE_APP_CHUNKS',
            chunks: chunks
          });
        }
      }
    }
  });
  observer.observe(document.getElementById('root'), { childList: true, subtree: false });
})();
