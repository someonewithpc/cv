export type TechTag = {
  icon: string;
  text: string;
};

export const TECH_TAGS: TechTag[] = [
  { icon: 'devicon:javascript', text: 'JavaScript' },
  { icon: 'devicon:typescript', text: 'TypeScript' },
  { icon: 'devicon:c', text: 'C' },
  { icon: 'devicon:cplusplus', text: 'C++' },
  { icon: 'devicon-plain:bash', text: 'Bash' },
  { icon: 'devicon:docker', text: 'Docker' },
  { icon: 'devicon:postgresql', text: 'PostgreSQL' },
  { icon: 'devicon:mysql', text: 'MySQL' },
  { icon: 'devicon:ruby', text: 'Ruby' },
  { icon: 'devicon:php', text: 'PHP' },
  { icon: 'devicon:perl', text: 'Perl' },
  { icon: 'devicon:python', text: 'Python' },
  { icon: 'devicon:rust', text: 'Rust' },
  { icon: 'devicon:symfony', text: 'Symfony' },
  { icon: 'devicon:haskell', text: 'Haskell' },
  { icon: 'devicon:prolog', text: 'Prolog' },
  { icon: 'devicon:nixos', text: 'Nix' },
  { icon: 'devicon:java', text: 'Java' },
  { icon: 'emacs', text: 'Emacs' },
  { icon: 'devicon:nasm', text: 'Nasm' },
  { icon: 'devicon:cmake', text: 'CMake' },
  { icon: 'devicon:vulkan', text: 'Vulkan' },
  { icon: 'devicon:blender', text: 'Blender' },
  { icon: 'freecad', text: 'FreeCAD' },
  { icon: 'devicon:linux', text: 'Linux' },
  { icon: 'devicon:gcc', text: 'GCC' },
  { icon: 'devicon:llvm', text: 'Clang' },
  { icon: 'kicad', text: 'KiCAD' },
  { icon: 'svg', text: 'SVG' },
  { icon: 'devicon:react', text: 'React' },
  { icon: 'devicon:redux', text: 'Redux' },
  { icon: 'devicon:vuejs', text: 'Vue' },
  { icon: 'devicon:astro', text: 'Astro' },
  { icon: 'devicon:sass', text: 'Sass' },
  { icon: 'devicon:css3', text: 'CSS' },
  { icon: 'devicon:git', text: 'git' },
  { icon: 'lisp', text: 'Lisp' },
  { icon: 'mold', text: 'Mold linker' },
  { icon: 'makefile', text: 'Make' },
];

const TECH_TAG_BY_TEXT = new Map(
  TECH_TAGS.map((tag) => [tag.text.toLowerCase(), tag]),
);

export const resolveTechTag = (text: string | null | undefined): TechTag | null => {
  if (!text) {
    return null;
  }

  return TECH_TAG_BY_TEXT.get(text.toLowerCase()) ?? null;
};
