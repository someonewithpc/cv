/**
 * What the sheets show, all of it from this CV's own source so the content is real.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The live sheet's buffer: a whole component, frontmatter, markup and a SCSS style block.
 * The style block has no ranges inside it, so it keeps only the rule for the element that
 * holds the expression. The rest of the file is as it stands.
 */
export const bufferFile = 'WipStamp.astro';
const keptRule = '.wip-stamp__text {';

export async function readBuffer() {
  const source = await readFile(path.join(process.cwd(), 'src/components', bufferFile), 'utf8');
  const styleTag = '<style lang="scss">\n';
  const open = source.indexOf(styleTag) + styleTag.length;
  const close = source.indexOf('</style>', open);
  const start = source.indexOf(keptRule, open);
  const end = source.indexOf('\n}\n', start) + 3;
  if (open < styleTag.length || start < 0 || end > close) {
    throw new Error(`${bufferFile}: no ${keptRule} rule in its style block`);
  }
  return source.slice(0, open) + source.slice(start, end) + source.slice(close);
}

/**
 * The ranges sheet's line, from PostIt.astro: an element-owned interpolation holding an
 * expression, JSX, and a second interpolation inside that.
 */
export const interpolation = {
  file: 'PostIt.astro',
  line: 3,
  indent: 2,
  text: '{Astro.props.title && <h3>{Astro.props.title}</h3>}',
};

/**
 * The depth sheet's stylesheet: the note-fold rules TechnicalDrawing/Page.astro carried
 * until the sheet got a data-note attribute (the :has() made every sheet an invalidation
 * anchor), trimmed to one nested rule. One selector reaches depth 4; the nested ones start
 * again at 0.
 */
export const depthSample = {
  file: 'TechnicalDrawing/Page.astro',
  text: `section {
  .aside:not(:has(.note-card > *)) .note-fold {
    display: none;
  }

  &:not(:has(.note-card > *)) {
    .content {
      grid-column: 1 / -1;
    }
  }
}
`,
};
