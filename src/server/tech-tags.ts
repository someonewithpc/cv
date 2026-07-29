export type TechTag = {
  icon: string;
  text: string;
};

export const TECH_TAGS: TechTag[] = [
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
  { icon: 'blender', text: 'Blender' },
  { icon: 'threejs', text: 'Three.js' },
  { icon: 'freecad', text: 'FreeCAD' },
  { icon: 'linux', text: 'Linux' },
  { icon: 'gcc', text: 'GCC' },
  { icon: 'llvm', text: 'Clang' },
  { icon: 'kicad', text: 'KiCAD' },
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
];

export const iconSuffix = (iconId: string): string => {
  const colon = iconId.lastIndexOf(':');

  return colon === -1 ? iconId : iconId.slice(colon + 1);
};

const TECH_TAG_BY_TEXT = new Map(
  TECH_TAGS.map((tag) => [tag.text.toLowerCase(), tag]),
);

const TECH_TAG_BY_ICON_SUFFIX = new Map(
  TECH_TAGS.map((tag) => [iconSuffix(tag.icon).toLowerCase(), tag]),
);

export const resolveTechTag = (text: string | null | undefined): TechTag | null => {
  if (!text) {
    return null;
  }

  return TECH_TAG_BY_TEXT.get(text.toLowerCase()) ?? null;
};

export const resolveTechTagByIconSuffix = (suffix: string | null | undefined): TechTag | null => {
  if (!suffix) {
    return null;
  }

  return TECH_TAG_BY_ICON_SUFFIX.get(suffix.toLowerCase()) ?? null;
};
