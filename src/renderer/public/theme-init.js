// Runs before CSS and React. Legacy preference key retained for existing users.
(() => {
  let saved;
  try {
    saved = localStorage.getItem("sezaam-theme");
  } catch {}
  document.documentElement.dataset.theme =
    saved === "dark" || saved === "light"
      ? saved
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
})();
