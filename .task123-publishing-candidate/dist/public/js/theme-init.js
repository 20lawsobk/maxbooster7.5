(function () {
  var theme = "dark";
  try { theme = localStorage.getItem("max-booster-theme") || "dark"; } catch {}
  if (!["dark", "light", "system"].includes(theme)) theme = "dark";
  document.documentElement.classList.remove("dark", "light");
  if (
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.add("light");
  }
})();
