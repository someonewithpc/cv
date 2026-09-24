/**
 * What the sheets show, all of it from this CV's own source so the content is real.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** The live sheet's buffer: a whole component, frontmatter, markup and a SCSS style block. */
export const bufferFile = 'WipStamp.astro';

export async function readBuffer() {
  return readFile(path.join(process.cwd(), 'src/components', bufferFile), 'utf8');
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
 * The depth sheet's stylesheet: the note-fold rules from TechnicalDrawing/Page.astro
 * (lines 673 to 685, under the `section` rule at 203), trimmed to one nested rule. One
 * selector reaches depth 4; the nested ones start again at 0.
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
