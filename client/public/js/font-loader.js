(function () {
  var l = document.getElementById("gfonts-preload");
  if (l) {
    l.onload = function () {
      l.rel = "stylesheet";
      l.onload = null;
    };
  }
})();
