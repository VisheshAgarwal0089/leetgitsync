export function observeNavigation({ window, document, onNavigate }) {
  let current = window.location.href;
  const check = () => {
    if (window.location.href !== current) { current = window.location.href; onNavigate(current); }
  };
  window.addEventListener('popstate', check);
  const observer = new window.MutationObserver(check);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => { window.removeEventListener('popstate', check); observer.disconnect(); };
}
