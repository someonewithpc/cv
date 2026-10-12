export function isSceneChrome(target: EventTarget | null, selector = '.sidebar, button, input, label, details') {
  return target instanceof Element && target.closest(selector);
}
