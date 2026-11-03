(() => {
  let choice = "system";
  try {
    choice = localStorage.getItem("quasar-web-theme") || "system";
  } catch {}
  const media = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    document.documentElement.dataset.theme =
      choice === "light" || choice === "dark"
        ? choice
        : media.matches
          ? "dark"
          : "light";
  };
  apply();
  media.addEventListener("change", apply);
  document.addEventListener("DOMContentLoaded", () => {
    const select = document.querySelector("[data-theme-choice]");
    if (!select) return;
    select.value = choice;
    select.addEventListener("change", () => {
      choice = select.value;
      try {
        localStorage.setItem("quasar-web-theme", choice);
      } catch {}
      apply();
    });
  });
})();
