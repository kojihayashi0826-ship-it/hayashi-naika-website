// Keep footer and header logos equal, including mobile header flex shrink.
(() => {
  const headerLogo = document.querySelector(".site-header .brand-logo");
  const footerLogo = document.querySelector(".site-footer .brand-logo");
  if (!headerLogo || !footerLogo) return;

  const matchLogoSize = () => {
    const width = headerLogo.getBoundingClientRect().width;
    if (width > 0) footerLogo.style.width = width + "px";
  };
  matchLogoSize();
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(matchLogoSize);
    observer.observe(headerLogo);
  } else {
    window.addEventListener("resize", matchLogoSize, { passive: true });
  }
})();
