/**
 * Write the Linux kernel highlight card into site.json from the personal list
 * (https://personal.hsal.es, read with the `personal` CLI on PATH).
 *
 * A patch is listed when its item carries a Kernel theme and is merged, or when a
 * maintainer gave it a Reviewed-by, which the site's watcher logs on the item. Merged
 * patches come first, newest first, then the reviewed ones. Open patches without a
 * tag stay off the card, since the list changes every week.
 *
 * Usage: npm run sync:linux-highlight
 *
 * Re-run it when a kernel patch is merged or reviewed, and commit the site.json change.
 */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteFile = path.resolve(root, 'src/components/OpenSourceContributions/site.json');

const personal = (...args) =>
  JSON.parse(execFileSync('personal', ['--json', ...args], { encoding: 'utf8' }));

const kernelItems = personal('ls', '--kind', 'pr', '--all').filter(
  (item) => item.theme?.startsWith('Kernel/') && item.url && item.state !== 'closed',
);

const reviewed = /reviewed-by/i;
const patches = kernelItems
  .map((item) => {
    const shown = personal('show', String(item.id));
    const watcher = (shown.log ?? []).filter((line) => line.who === 'watcher');
    return {
      ...item,
      merged: item.state === 'merged',
      reviewed: item.state === 'merged' || watcher.some((line) => reviewed.test(line.text)),
    };
  })
  .filter((item) => item.reviewed)
  .sort((a, b) => {
    if (a.merged !== b.merged) return a.merged ? -1 : 1;
    return (b.closed_at ?? b.updated_at).localeCompare(a.closed_at ?? a.updated_at);
  });

const merged = patches.filter((item) => item.merged).length;
const onlyReviewed = patches.length - merged;
const patchWord = merged === 1 ? 'patch is' : 'patches are';

const highlight = {
  title: 'Linux kernel',
  role: 'Contributor',
  roleJp: 'コントリビューター',
  description:
    'Patches to the amdgpu display driver and the DRM client helpers, from bugs met on an ' +
    'ASUS ROG Flow X13: a 3840x2400 eDP panel that came back scaled into a corner after ' +
    'resume, a firmware backlight table that could overrun its 99 points, panel ' +
    'self-refresh left on across a modeset. Each went to amd-gfx or dri-devel with the ' +
    'measurement that found it and KUnit tests where the code allows. ' +
    `${merged} ${patchWord} in AMD's drm-next tree on the way to mainline and ` +
    `${onlyReviewed} more carry a maintainer's Reviewed-by`,
  repository: 'torvalds/linux',
  commits: `${merged} merged`,
  period: '2026',
  links: patches.map((item) => ({
    label: item.title.replace(/^\[PATCH[^\]]*\]\s*/, ''),
    url: item.url,
  })),
  tags: ['linux', 'c'],
};

const site = JSON.parse(await readFile(siteFile, 'utf8'));
const at = site.highlights.findIndex((entry) => entry.title === highlight.title);
if (at === -1) site.highlights.unshift(highlight);
else site.highlights[at] = highlight;

await writeFile(siteFile, `${JSON.stringify(site, null, 2)}\n`);
console.log(`${patches.length} patches on the card: ${merged} merged, ${onlyReviewed} reviewed`);
