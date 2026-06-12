/**
 * 防 FOUC：在 React hydration 之前同步读 localStorage 决定 .dark class
 * 必须放在 <head> 里，且 <html> 上要 suppressHydrationWarning
 */
const SCRIPT = `(function(){
  try {
    var t = localStorage.getItem('nage-theme') || 'system';
    var isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
