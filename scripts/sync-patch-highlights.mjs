/**
 * Write the Linux kernel and GCC highlight cards into site.json from the personal list
 * (https://personal.hsal.es, read with the `personal` CLI on PATH).
 *
 * A card lists every patch Hugo mailed under its theme that is merged or still open:
 * merged first, then the ones the site's watcher logged a Reviewed-by on, then the rest,
 * newest first in each group. Closed and unsent items stay off, and so do other people's
 * patches and bug reports, which the hsal.es message id in the link tells apart.
 *
 * Usage: npm run sync:highlights
 *
 * Re-run it when a patch is sent, merged or reviewed, and commit the site.json change.
 */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteFile = path.resolve(root, 'src/components/OpenSourceContributions/site.json');

const personal = (...args) =>
  JSON.parse(execFileSync('personal', ['--json', ...args], { encoding: 'utf8' }));

const items = personal('ls', '--kind', 'pr', '--all');

const reviewedBy = /reviewed-by/i;

const patchesFor = (theme, { skip = /$^/ } = {}) =>
  items
    .filter(
      (item) =>
        theme.test(item.theme ?? '') &&
        ['open', 'merged'].includes(item.state) &&
        item.url?.includes('hsal.es') &&
        !skip.test(item.url),
    )
    .map((item) => {
      const watcher = (personal('show', String(item.id)).log ?? []).filter(
        (line) => line.who === 'watcher',
      );
      const merged = item.state === 'merged';
      const reviewed = !merged && watcher.some((line) => reviewedBy.test(line.text));
      return { ...item, merged, reviewed, rank: merged ? 0 : reviewed ? 1 : 2 };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (b.closed_at ?? b.created_at).localeCompare(a.closed_at ?? a.created_at),
    );

// "[PATCH 0/2] drm/client: …", "RFC: ACPI: …" and "… (RFC RFT)" print as the subject alone.
const subject = (title) =>
  title
    .replace(/^\[PATCH[^\]]*\]\s*/, '')
    .replace(/^RFC:\s*/, '')
    .replace(/\s*\((?:RFC|RFT)(?:\s+RFT)?\)$/, '');

// A lore link ends in the message id, which carries hsal.es; with a trailing slash it reads as
// a path, which contact-alias.spec.ts tells apart from an address spelled out.
const permalink = (url) => (url.endsWith('/') ? url : `${url}/`);

const patchLinks = (patches) =>
  patches.map((item) => ({ label: subject(item.title), url: permalink(item.url) }));

const count = (patches, test) => patches.filter(test).length;
const patchCount = (n) => `${n} ${n === 1 ? 'patch' : 'patches'}`;
const are = (n) => (n === 1 ? 'is' : 'are');

// IGT and NVIDIA's out-of-tree module carry Kernel themes but are not torvalds/linux.
const kernel = patchesFor(/^Kernel\//, { skip: /\/igt-dev\// });
const kernelMerged = count(kernel, (item) => item.merged);
const kernelReviewed = count(kernel, (item) => item.reviewed);
const kernelOpen = kernel.length - kernelMerged - kernelReviewed;

const kernelHighlight = {
  title: 'Linux kernel',
  role: 'Contributor',
  roleJp: 'コントリビューター',
  description:
    'Patches to the amdgpu display driver, the DRM client helpers, ACPI and intel_pstate. ' +
    'Most come from bugs met on an ASUS ROG Flow X13: a 3840x2400 eDP panel that came back ' +
    'scaled into a corner after resume, a firmware backlight table that could overrun its ' +
    '99 points, panel self-refresh left on across a modeset. Each went to its subsystem ' +
    'list with the measurement that found it and KUnit tests where the code allows. ' +
    `${patchCount(kernelMerged)} ${are(kernelMerged)} merged into maintainer trees on the way ` +
    `to mainline, ${kernelReviewed} more carry a Reviewed-by and ${kernelOpen} ${are(kernelOpen)} ` +
    'under review',
  repository: 'torvalds/linux',
  commits: `${kernelMerged} merged`,
  period: '2026',
  links: [],
  patches: patchLinks(kernel),
  tags: ['linux', 'c'],
};

const gcc = patchesFor(/\/GCC$/);
const gccLater = gcc.filter((item) => !item.title.includes('[PR127917]'));
const gccLaterMerged = count(gccLater, (item) => item.merged);

const gccHighlight = {
  title: 'GCC',
  role: 'Contributor',
  roleJp: 'コントリビューター',
  description:
    'FreeCAD on NixOS crashed on a boolean subtract of a cube and an inscribed cylinder. The ' +
    "crash led through OpenCascade 7.9.3's point classifier to a wrong-code bug in GCC 16, " +
    'where interprocedural constant propagation redirected a recursive call to a clone ' +
    'specialised for a different dynamic type, so the program ran the wrong virtual method. ' +
    'Bisected GCC to two January 2026 changes, reduced the miscompile to a C++ testcase of a ' +
    'few dozen lines, wrote the fix and a regression test, and bootstrapped and regtested ' +
    'GCC. The IPA maintainer reviewed it and pushed it to master the same day, then ' +
    'backported it to releases/gcc-16 for GCC 16.3. Around it, a nixpkgs workaround builds ' +
    'OpenCascade with `-fno-ipa-cp-clone` and fails the build if the miscompile returns, an ' +
    'OpenCascade issue asks for a 7.9 backport of its fix, and a FreeCAD PR backports ' +
    'OpenCascade 8 support to the 1.1 branch. ' +
    `${patchCount(gccLater.length)} to the C and C++ front ends followed on gcc-patches` +
    (gccLaterMerged ? `, ${gccLaterMerged} merged so far` : ` and ${are(gccLater.length)} under review`),
  repository: 'gcc.gnu.org',
  commits: `${count(gcc, (item) => item.merged)} merged`,
  period: '2026',
  patches: patchLinks(gcc),
  links: [
    { label: 'Commit', url: 'https://gcc.gnu.org/cgit/gcc/commit/?id=ebd81e6e396d3d50e4ac89404e45f5d2029a186d' },
    { label: 'Bug 127917', url: 'https://gcc.gnu.org/bugzilla/show_bug.cgi?id=127917' },
    { label: 'nixpkgs', url: 'https://github.com/NixOS/nixpkgs/pull/574647' },
    { label: 'OpenCascade', url: 'https://github.com/Open-Cascade-SAS/OCCT/issues/1637' },
    { label: 'FreeCAD', url: 'https://github.com/FreeCAD/FreeCAD/pull/33629' },
  ],
  tags: ['gcc', 'cplusplus'],
};

const site = JSON.parse(await readFile(siteFile, 'utf8'));

// The GCC card was titled after its one fix before it listed the later patches.
const place = (highlight, ...titles) => {
  const at = site.highlights.findIndex((entry) => [highlight.title, ...titles].includes(entry.title));
  if (at === -1) site.highlights.unshift(highlight);
  else site.highlights[at] = highlight;
};
place(gccHighlight, 'GCC 16 wrong-code fix');
place(kernelHighlight);

await writeFile(siteFile, `${JSON.stringify(site, null, 2)}\n`);
console.log(
  `Linux kernel: ${kernel.length} patches, ${kernelMerged} merged, ${kernelReviewed} reviewed, ${kernelOpen} open`,
);
console.log(`GCC: ${gcc.length} patches, ${count(gcc, (item) => item.merged)} merged`);
