export function getCurrentFonts(): FontFace[] {
  return [...document.fonts];
}
