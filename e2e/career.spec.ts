import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

type Edge = { date: string; label: string };
type Site = {
  experience: { id: string; org: string; from: Edge; to: Edge }[];
  education: { degree: string; minor: string; school: string; short: string; from: string; year: string };
  languages: { name: string }[];
  refs: { label: string; href: string }[];
};

// Read rather than imported: Node's ESM loader wants an import attribute on a JSON module.
const site: Site = JSON.parse(readFileSync(new URL('../src/components/Career/site.json', import.meta.url), 'utf8'));

/** A date as the drawing reads it: a bare year labelled "Summer" is June to September. */
const at = ({ date, label }: Edge, end = false) => {
  const [year, month] = date.split('-').map(Number);
  if (month) return year + (end ? month : month - 1) / 12;
  return year + (label.startsWith('Summer') ? (end ? 0.7 : 0.45) : end ? 1 : 0);
};

/**
 * The Career sheet is drawn from site.json, so what could break is the drawing itself: a row
 * or a bar that the data has and the sheet does not, a bar the wrong length, or a sheet that
 * no longer fits a phone.
 */

test('the revision table lists every role in the data, newest first', async ({ page }) => {
  await page.goto('/');

  const rows = page.locator('#career .row');
  await expect(rows).toHaveCount(site.experience.length);

  for (const [index, entry] of site.experience.entries()) {
    const row = rows.nth(index);
    await expect(row).toHaveId(`career-${entry.id}`);
    await expect(row.locator('h4')).toContainText(entry.org);
    await expect(row.locator('.period time').first()).toHaveAttribute('datetime', entry.from.date);
    await expect(row.locator('.period time').last()).toHaveAttribute('datetime', entry.to.date);
  }

  // The oldest job is revision 01 and the count runs down from the top.
  await expect(rows.first().locator('.rev')).toHaveText(String(site.experience.length).padStart(2, '0'));
  await expect(rows.last().locator('.rev')).toHaveText('01');
});

test('the title block cells carry the degree, the languages and the reference sheets', async ({ page }) => {
  await page.goto('/');

  const cells = page.locator('#career .cells');
  await expect(cells).toContainText(site.education.degree);
  await expect(cells).toContainText(site.education.school);
  for (const { name } of site.languages) {
    await expect(cells).toContainText(name);
  }

  for (const { label, href } of site.refs) {
    const link = cells.getByRole('link', { name: label });
    await expect(link).toHaveAttribute('href', href);
    await expect(page.locator(href)).toHaveCount(1);
  }
});

test('the elevation under the table draws one bar per job, as long as the job lasted', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const wide = page.locator('#career svg.wide');
  await expect(wide).toBeVisible();
  await expect(page.locator('#career svg.tall')).toBeHidden();

  for (const drawing of ['wide', 'tall']) {
    await expect(page.locator(`#career svg.${drawing} .job`)).toHaveCount(site.experience.length);
  }

  // Bar lengths against the axis: the wide drawing lays 12 years over its 908 units.
  const unit = 908 / 12;
  for (const [index, entry] of site.experience.entries()) {
    const job = wide.locator(`.job[data-job="${entry.id}"]`);
    const width = Number(await job.locator('.bar').getAttribute('width'));
    expect(width, `${entry.id} is the wrong length`).toBeCloseTo((at(entry.to, true) - at(entry.from)) * unit, 0);
    // The bubble carries the job's revision from the table.
    await expect(job.locator('.bubble-number')).toHaveText(String(site.experience.length - index).padStart(2, '0'));
  }

  // The jobs that ran at once stand in different lanes.
  const lanes = await wide.locator('.job').evaluateAll((jobs) => jobs.map((job) => [job.getAttribute('data-job'), job.getAttribute('data-lane')]));
  const lane = Object.fromEntries(lanes);
  expect(lane['gnu-social']).not.toBe(lane['protosyn']);
  expect(lane['gnu-social']).not.toBe(lane['leb']);

  // The drawing sits under the table and the cells, not beside them.
  const drawingTop = (await wide.boundingBox())!.y;
  for (const block of ['.table', '.cells']) {
    const box = (await page.locator(`#career ${block}`).boundingBox())!;
    expect(drawingTop, `the drawing starts above the end of ${block}`).toBeGreaterThan(box.y + box.height);
  }

  await expect(page.locator('#career .elevation figcaption')).toHaveCount(0);
  await expect(page.locator('#career')).not.toContainText('ELEVATION A');
});

test('the degree is an outline bar in the ground lane, under the jobs of its years', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const { degree, minor, short, from, year } = site.education;
  const unit = 908 / 12;

  const study = page.locator('#career svg.wide g.study');
  await expect(study).toHaveCount(1);
  await expect(study).toHaveAttribute('data-lane', '0');
  // Bare years, drawn as whole years: 2017 to 2022 is six of them.
  const width = Number(await study.locator('.bar').getAttribute('width'));
  expect(width).toBeCloseTo((Number(year) + 1 - Number(from)) * unit, 0);
  await expect(study.locator('.bar')).not.toHaveAttribute('fill', /hatch/);
  await expect(study).toContainText(`${from} to ${year}`);
  for (const part of [degree, minor, short]) await expect(study).toContainText(part);

  // The jobs of those years stand above it.
  const lanes = await page.locator('#career svg.wide .job').evaluateAll((jobs) => jobs.map((job) => Number(job.getAttribute('data-lane'))));
  expect(Math.min(...lanes)).toBeGreaterThan(0);

  await expect(page.locator('#career svg.tall g.study .bubble-number')).toHaveText('学');
});

for (const width of [390, 768, 1440]) {
  test(`at ${width}px the sheet fits the window and writes nothing under 8px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const sheet = page.locator('#career');
    await sheet.scrollIntoViewIfNeeded();

    // Under 44rem of sheet the drawing stands on end; 768 leaves the sheet 645px.
    await expect(sheet.locator(width < 900 ? 'svg.tall' : 'svg.wide')).toBeVisible();

    const measured = await sheet.evaluate((el) => {
      const right = el.getBoundingClientRect().right;
      let widest = 0;
      let smallest = Infinity;
      for (const node of [el, ...el.querySelectorAll('*')]) {
        widest = Math.max(widest, node.getBoundingClientRect().right);
        const size = parseFloat(getComputedStyle(node).fontSize);
        if (node.textContent?.trim()) smallest = Math.min(smallest, size);
      }
      // The drawing scales with the sheet, and its smallest lettering is 12 of its units.
      const shown = [...el.querySelectorAll('svg.drawing')].find((svg) => svg.getBoundingClientRect().width > 0)!;
      const scale = shown.getBoundingClientRect().width / Number(shown.getAttribute('viewBox')!.split(' ')[2]);
      return {
        right,
        widest,
        smallest: Math.min(smallest, 12 * scale),
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(measured.scrollWidth, 'the page scrolls sideways').toBeLessThanOrEqual(measured.clientWidth);
    expect(measured.widest, 'something on the sheet reaches past its edge').toBeLessThanOrEqual(measured.right + 1);
    expect(measured.smallest, 'a size below 8px').toBeGreaterThanOrEqual(8);
  });
}
