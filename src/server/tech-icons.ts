export type Tech = {
  icon: string;
  text: string;
  /** CAD, electronics, and other physical/hands-on tools, as opposed to software. */
  hardware?: boolean;
};

export const TECH_ICONS: Tech[] = [
  { icon: 'javascript', text: 'JavaScript' },
  { icon: 'typescript', text: 'TypeScript' },
  { icon: 'c', text: 'C' },
  { icon: 'cplusplus', text: 'C++' },
  { icon: 'bash', text: 'Bash' },
  { icon: 'docker', text: 'Docker' },
  { icon: 'postgresql', text: 'PostgreSQL' },
  { icon: 'mysql', text: 'MySQL' },
  { icon: 'ruby', text: 'Ruby' },
  { icon: 'rails', text: 'Ruby on Rails' },
  { icon: 'php', text: 'PHP' },
  { icon: 'perl', text: 'Perl' },
  { icon: 'python', text: 'Python' },
  { icon: 'rust', text: 'Rust' },
  { icon: 'symfony', text: 'Symfony' },
  { icon: 'haskell', text: 'Haskell' },
  { icon: 'prolog', text: 'Prolog' },
  { icon: 'nixos', text: 'Nix' },
  { icon: 'java', text: 'Java' },
  { icon: 'emacs', text: 'Emacs' },
  { icon: 'nasm', text: 'Nasm' },
  { icon: 'cmake', text: 'CMake' },
  { icon: 'vulkan', text: 'Vulkan' },
  { icon: 'blender', text: 'Blender', hardware: true },
  { icon: 'threejs', text: 'Three.js' },
  { icon: 'freecad', text: 'FreeCAD', hardware: true },
  { icon: 'linux', text: 'Linux' },
  { icon: 'gcc', text: 'GCC' },
  { icon: 'llvm', text: 'Clang' },
  { icon: 'kicad', text: 'KiCAD', hardware: true },
  { icon: 'bambustudio', text: 'Bambu Studio', hardware: true },
  { icon: '3d-printing', text: '3D Printing', hardware: true },
  { icon: 'arduino', text: 'Arduino', hardware: true },
  { icon: 'esp32', text: 'ESP32', hardware: true },
  { icon: 'raspberrypi', text: 'Raspberry Pi', hardware: true },
  { icon: 'oscilloscope', text: 'Oscilloscope', hardware: true },
  { icon: 'multimeter', text: 'Multimeter', hardware: true },
  { icon: 'home-server', text: 'Home Server', hardware: true },
  { icon: 'mosquitto', text: 'Mosquitto MQTT', hardware: true },
  { icon: 'ubiquiti', text: 'Ubiquiti', hardware: true },
  { icon: 'svg', text: 'SVG' },
  { icon: 'react', text: 'React' },
  { icon: 'redux', text: 'Redux' },
  { icon: 'vuejs', text: 'Vue' },
  { icon: 'astro', text: 'Astro' },
  { icon: 'sass', text: 'Sass' },
  { icon: 'css3', text: 'CSS' },
  { icon: 'git', text: 'git' },
  { icon: 'lisp', text: 'Lisp' },
  { icon: 'mold', text: 'Mold linker' },
  { icon: 'makefile', text: 'Make' },
  { icon: 'leaflet', text: 'Leaflet' },
  { icon: 'reactnative-wordmark', text: 'React Native' },
  { icon: 'cursor', text: 'Cursor' },
  { icon: 'claude-code', text: 'Claude Code' },
  { icon: 'cloudflare', text: 'Cloudflare' },
  { icon: 'aws', text: 'AWS' },
  { icon: 'kubernetes', text: 'Kubernetes' },
  { icon: 'letsencrypt', text: "Let's Encrypt" },
  { icon: 'treesitter', text: 'TreeSitter' },
  { icon: 'latex', text: 'LaTeX' },
  { icon: 'openwrt', text: 'OpenWrt', hardware: true },
  { icon: 'tikz', text: 'TikZ' },
  { icon: '8311', text: '8311 firmware', hardware: true },
];

export const iconSuffix = (iconId: string): string => {
  const colon = iconId.lastIndexOf(':');

  return colon === -1 ? iconId : iconId.slice(colon + 1);
};

const TECH_BY_TEXT = new Map(
  TECH_ICONS.map((tech) => [tech.text.toLowerCase(), tech]),
);

const TECH_BY_ICON_SUFFIX = new Map(
  TECH_ICONS.map((tech) => [iconSuffix(tech.icon).toLowerCase(), tech]),
);

export const resolveTech = (text: string | null | undefined): Tech | null => {
  if (!text) {
    return null;
  }

  const key = text.toLowerCase();

  return TECH_BY_TEXT.get(key) ?? TECH_BY_ICON_SUFFIX.get(key) ?? null;
};

export const resolveTechByIconSuffix = (suffix: string | null | undefined): Tech | null => {
  if (!suffix) {
    return null;
  }

  return TECH_BY_ICON_SUFFIX.get(suffix.toLowerCase()) ?? null;
};

export const resolveTechs = (
  keys: string | readonly string[] | null | undefined,
): Tech[] => {
  const list = keys == null ? [] : Array.isArray(keys) ? keys : [keys];

  return list
    .map((key) => (resolveTech(key)))
    .filter((tech): tech is Tech => (tech != null));
};
