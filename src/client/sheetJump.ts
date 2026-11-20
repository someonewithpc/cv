/**
 * Follows same-page links to the sheets by hand.
 *
 * A followed fragment scrolls to its sheet and then focuses it, since the sheets take
 * tabindex="-1". On a busy page the focus can come before the scroll settles, and focus()
 * centres an element taller than the window, which left a phone thousands of pixels down
 * in the middle of Open Source. Here the hash is recorded, the sheet's top scrolled in (its
 * scroll-margin-top still applies) and the sheet focused without scrolling.
 *
 * Only plain primary clicks are taken over, so a modified click still opens a tab or window.
 * An access key's activation arrives as a plain click too.
 */
export function followSheetLinks(container: Element): void {
  container.addEventListener('click', (event) => {
    if (!(event instanceof MouseEvent)) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    const sheet = link && document.getElementById(link.hash.slice(1));
    if (!link || !sheet) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    sheet.scrollIntoView({ block: 'start' });
    sheet.focus({ preventScroll: true });
  });
}
