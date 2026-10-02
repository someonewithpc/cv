import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

type Edge = { date: string; label: string };
type Site = {
  experience: { id: string; org: string; from: Edge; to?: Edge }[];
  learning: { label: string; from: string };
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

/** Where a job ends: a job still going runs to the end of the current month. */
const today = new Date();
const until = (to?: Edge) => (to ? at(to, true) : today.getFullYear() + (today.getMonth() + 1) / 12);

/** How far a job's bar, or the pieces of a broken one, reach along the time axis. */
const extent = (bars: SVGGraphicsElement[]) => {
  const boxes = bars.map((bar) => bar.getBBox());
  return { from: Math.min(...boxes.map((b) => b.x)), to: Math.max(...boxes.map((b) => b.x + b.width)) };
};

/** The axis ticks, one a year: where the first year starts and how long a year is. */
const axis = (svg: SVGSVGElement) => {
  const ticks = [...svg.querySelectorAll<SVGPathElement>(':scope > path.tick')].map((tick) => tick.getBBox().x + 3.5);
  return { origin: ticks[0], unit: ticks[1] - ticks[0] };
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
    if (entry.to) await expect(row.locator('.period time').last()).toHaveAttribute('datetime', entry.to.date);
    else await expect(row.locator('.period .to')).toHaveText('to present');
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

  const { unit } = await wide.evaluate(axis);
  for (const [index, entry] of site.experience.entries()) {
    const job = wide.locator(`.job[data-job="${entry.id}"]`);
    const { from, to } = await job.locator('.bar').evaluateAll(extent);
    expect(to - from, `${entry.id} is the wrong length`).toBeCloseTo((until(entry.to) - at(entry.from)) * unit, 0);
    // The bubble carries the job's revision from the table.
    await expect(job.locator('.bubble-number')).toHaveText(String(site.experience.length - index).padStart(2, '0'));
  }

  // The drawing sits under the table and the cells, not beside them.
  const drawingTop = (await wide.boundingBox())!.y;
  for (const block of ['.table', '.cells']) {
    const box = (await page.locator(`#career ${block}`).boundingBox())!;
    expect(drawingTop, `the drawing starts above the end of ${block}`).toBeGreaterThan(box.y + box.height);
  }

  await expect(page.locator('#career .elevation figcaption')).toHaveCount(0);
  await expect(page.locator('#career')).not.toContainText('ELEVATION A');
});

test('the degree is an outline bar in the lowest lane, under the jobs of its years', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const { degree, minor, short, from, year } = site.education;
  const { unit } = await page.locator('#career svg.wide').evaluate(axis);

  const study = page.locator('#career svg.wide g.study');
  await expect(study).toHaveCount(1);
  await expect(study).toHaveAttribute('data-lane', '0');
  // Bare years, drawn as whole years: 2017 to 2022 is six of them.
  const { from: left, to: right } = await study.locator('.bar').evaluateAll(extent);
  const width = right - left;
  expect(width).toBeCloseTo((Number(year) + 1 - Number(from)) * unit, 0);
  await expect(study.locator('.bar')).not.toHaveAttribute('fill', /hatch/);
  await expect(study).toContainText(`${from} to ${year}`);
  for (const part of [degree, minor, short]) await expect(study).toContainText(part);

  // Labelled as the jobs are: a bubble and a leader to lettering outside the bar.
  await expect(study.locator('.bubble-number')).toHaveText('B');
  await expect(study.locator('.leader')).toHaveCount(1);
  const bar = (await study.locator('.bar').boundingBox())!;
  const label = (await study.locator('text.label').boundingBox())!;
  expect(label.y + label.height, 'the degree is lettered inside its bar').toBeLessThanOrEqual(bar.y);
  await expect(study.locator('text.label')).toHaveClass(/typewriter/);

  // The jobs of those years stand above it.
  const during = site.experience.filter((entry) => at(entry.from) < Number(year) + 1 && Number(from) < until(entry.to));
  for (const { id } of during) {
    expect(Number(await page.locator(`#career svg.wide .job[data-job="${id}"]`).getAttribute('data-lane')), id).toBeGreaterThan(0);
  }

  await expect(page.locator('#career svg.tall g.study .bubble-number')).toHaveText('B');
});

test('where two bars overlap, the one that started later sits lower', async ({ page }) => {
  for (const [drawing, width] of [['wide', 1440], ['tall', 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const svg = page.locator(`#career svg.${drawing}`);
    await expect(svg).toBeVisible();

    // Wide, a lower lane is further down; tall, it is nearer the datum on the left.
    const height = async (id: string) => {
      const box = (await svg.locator(`g[data-job="${id}"] .bar`).first().boundingBox())!;
      return drawing === 'wide' ? -box.y : box.x;
    };
    const jobs = site.experience.map((entry) => ({ id: entry.id, from: at(entry.from), to: until(entry.to) }));
    for (const [i, a] of jobs.entries()) {
      for (const b of jobs.slice(i + 1)) {
        if (!(a.from < b.to && b.from < a.to)) continue;
        const [early, late] = a.from < b.from ? [a, b] : [b, a];
        expect(await height(late.id), `${drawing}: ${late.id} started after ${early.id} and sits lower`).toBeLessThan(await height(early.id));
      }
    }
    expect(await height('protosyn'), drawing).toBeLessThan(await height('gnu-social'));
    expect(await height('gnu-social'), drawing).toBeLessThan(await height('leb'));
  }
});

test('the leader to a bar under another bends around it at right angles', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const svg = page.locator('#career svg.wide');
  const bar = (id: string) =>
    svg.locator(`g[data-job="${id}"] .bar`).first().evaluate((el) => {
      const b = (el as SVGGraphicsElement).getBBox();
      return { left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height };
    });
  const over = await bar('gnu-social');
  const under = await bar('protosyn');
  expect(under.left).toBeGreaterThan(over.left);
  expect(under.right).toBeLessThan(over.right);

  // Down from the bubble clear of the GNU social bar, then along the lane to ProtoSyn's end.
  const points = await svg.locator('g[data-job="protosyn"] .leader').evaluate((el) => [...(el as SVGPolylineElement).points].map(({ x, y }) => [x, y]));
  expect(points).toHaveLength(3);
  const [[downX], [turnX, turnY], [tipX, tipY]] = points;
  expect(downX).toBe(turnX);
  expect(turnY).toBe(tipY);
  expect(turnX < over.left || turnX > over.right, 'the leader turns clear of the GNU social bar').toBe(true);
  expect(tipY).toBeCloseTo((under.top + under.bottom) / 2, 0);
  expect(Math.min(Math.abs(tipX - under.left), Math.abs(tipX - under.right))).toBeLessThanOrEqual(2);

  // Tall, it comes in across the lanes and down the bar's centre line to its end.
  await page.setViewportSize({ width: 390, height: 900 });
  const tall = page.locator('#career svg.tall');
  await expect(tall).toBeVisible();
  const end = await tall.locator('g[data-job="protosyn"] .leader').evaluate((el) => [...(el as SVGPolylineElement).points].slice(-3).map(({ x, y }) => [x, y]));
  const box = await tall.locator('g[data-job="protosyn"] .bar').evaluate((el) => {
    const { x, y, width, height } = (el as SVGGraphicsElement).getBBox();
    return { x, y, width, height };
  });
  expect(end[0][1]).toBe(end[1][1]);
  expect(end[1][0]).toBe(end[2][0]);
  expect(end[2][0]).toBeCloseTo(box.x + box.width / 2, 0);
  expect(Math.min(Math.abs(end[2][1] - box.y), Math.abs(end[2][1] - box.y - box.height))).toBeLessThanOrEqual(2);
});

test(`every leader but ProtoSyn's ends on its bar's dimension line`, async ({ page }) => {
  for (const [drawing, width] of [['wide', 1440], ['tall', 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const svg = page.locator(`#career svg.${drawing}`);
    await expect(svg).toBeVisible();
    const tips = await svg.locator('g[data-job]').evaluateAll((groups) =>
      groups.map((g) => {
        const points = [...(g.querySelector('polyline.leader') as SVGPolylineElement).points];
        const { x, y } = points[points.length - 1];
        const dim = g.querySelector('line.dim') as SVGLineElement;
        const [x1, y1, x2, y2] = [dim.x1, dim.y1, dim.x2, dim.y2].map((v) => v.baseVal.value);
        return { id: (g as SVGGElement).dataset.job!, x, y, x1, y1, x2, y2 };
      }),
    );
    expect(tips).toHaveLength(site.experience.length + 2);
    for (const { id, x, y, x1, y1, x2, y2 } of tips) {
      // ProtoSyn's leader bends round the bar over it into the bar's end instead.
      if (id === 'protosyn') continue;
      const [along, across, from, to] = drawing === 'wide' ? [x, y, x1, x2] : [y, x, y1, y2];
      expect(across, `${drawing}: the ${id} leader ends on its dimension line`).toBeCloseTo(drawing === 'wide' ? y1 : x1, 1);
      expect(along, `${drawing}: the ${id} leader lands within its dimension`).toBeGreaterThan(from);
      expect(along, `${drawing}: the ${id} leader lands within its dimension`).toBeLessThan(to);
    }
  }
});

/** Leaders that cross a bar, a label or each other, and labels that overlap, in the drawing on show. */
const collisions = (svg: SVGSVGElement) => {
  type Box = { left: number; top: number; right: number; bottom: number };
  const inset = (r: DOMRect, by: number): Box => ({ left: r.left + by, top: r.top + by, right: r.right - by, bottom: r.bottom - by });
  const overlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  // Liang-Barsky: does the segment enter the box?
  const crosses = ([x1, y1, x2, y2]: number[], box: Box) => {
    let t0 = 0;
    let t1 = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    for (const [p, q] of [[-dx, x1 - box.left], [dx, box.right - x1], [-dy, y1 - box.top], [dy, box.bottom - y1]]) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
    return true;
  };
  const ctm = svg.getScreenCTM()!;
  const point = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(ctm);
  const groups = [...svg.querySelectorAll<SVGGElement>('g[data-job]')];
  const found: string[] = [];
  const labels = groups.flatMap((g) => [...g.querySelectorAll('text.label, text.small, circle.bubble')].map((el) => ({ id: g.dataset.job!, box: inset(el.getBoundingClientRect(), 1) })));
  const spans = groups.flatMap((g) => [...g.querySelectorAll('text.span')].map((el) => ({ id: g.dataset.job!, box: inset(el.getBoundingClientRect(), 1) })));
  const bars = groups.flatMap((g) => [...g.querySelectorAll('.bar')].map((el) => ({ id: g.dataset.job!, box: inset(el.getBoundingClientRect(), 1) })));
  // Do two segments cross, strictly?
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  const cut = ([a, b, c, d]: number[], [e, f, g, h]: number[]) =>
    side(a, b, c, d, e, f) * side(a, b, c, d, g, h) < 0 && side(e, f, g, h, a, b) * side(e, f, g, h, c, d) < 0;
  const legs: { id: string; segment: number[] }[] = [];
  for (const g of groups) {
    const leader = g.querySelector<SVGPolylineElement>('polyline.leader')!;
    const points = [...leader.points].map(({ x, y }) => point(x, y));
    // Trimmed at both ends: it starts at its bubble and its arrow touches its own dimension line or bar.
    const trim = (from: DOMPoint, to: DOMPoint, by: number) => {
      const len = Math.hypot(to.x - from.x, to.y - from.y);
      return new DOMPoint(from.x + ((to.x - from.x) * by) / len, from.y + ((to.y - from.y) * by) / len);
    };
    points[0] = trim(points[0], points[1], 12);
    points[points.length - 1] = trim(points[points.length - 1], points[points.length - 2], 3);
    for (const [i, a] of points.slice(0, -1).entries()) {
      const b = points[i + 1];
      const segment = [a.x, a.y, b.x, b.y];
      for (const bar of bars) if (crosses(segment, bar.box)) found.push(`${g.dataset.job} leader crosses the ${bar.id} bar`);
      for (const label of labels) if (label.id !== g.dataset.job && crosses(segment, label.box)) found.push(`${g.dataset.job} leader crosses the ${label.id} label`);
      for (const span of spans) if (crosses(segment, span.box)) found.push(`${g.dataset.job} leader crosses the ${span.id} span`);
      legs.push({ id: g.dataset.job!, segment });
    }
  }
  for (const [i, one] of legs.entries()) {
    for (const other of legs.slice(i + 1)) if (one.id !== other.id && cut(one.segment, other.segment)) found.push(`${one.id} and ${other.id} leaders cross`);
  }
  for (const [i, one] of labels.entries()) {
    for (const other of labels.slice(i + 1)) if (one.id !== other.id && overlap(one.box, other.box)) found.push(`${one.id} and ${other.id} labels overlap`);
    for (const bar of bars) if (overlap(one.box, bar.box)) found.push(`${one.id} label overlaps the ${bar.id} bar`);
  }
  return found;
};

for (const [drawing, width] of [['wide', 1440], ['wide', 900], ['tall', 390], ['tall', 768]] as const) {
  test(`in the ${drawing} drawing at ${width}px no leader crosses a bar, a label or another leader`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const svg = page.locator(`#career svg.${drawing}`);
    await expect(svg).toBeVisible();
    await svg.scrollIntoViewIfNeeded();
    expect(await svg.evaluate(collisions)).toEqual([]);
  });
}

test('the continuous learning line starts the axis and stays open at the present', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const { label, from } = site.learning;
  const svg = page.locator('#career svg.wide');
  const { origin } = await svg.evaluate(axis);
  await expect(svg.locator('.year').first()).toHaveText(from);

  const line = svg.locator('g.learning');
  await expect(line).toHaveCount(1);
  await expect(line.locator('text.label')).toHaveText(label);
  await expect(line.locator('.leader')).toHaveCount(1);
  await expect(line).toContainText(`since ${from}`);

  const { from: left, to: right } = await line.locator('.bar').evaluateAll(extent);
  expect(left, 'the line starts where the axis starts').toBeCloseTo(origin, 0);
  // It runs to the present, past the newest job's end or level with a job still going, and
  // ends in an arrowhead: one tick at its start and none at its end.
  const newest = await svg.locator('.job').evaluateAll((jobs) => Math.max(...jobs.flatMap((job) => [...job.querySelectorAll<SVGGraphicsElement>('.bar')].map((bar) => bar.getBBox().x + bar.getBBox().width))));
  expect(right).toBeGreaterThan(newest - 0.5);
  await expect(line.locator('.tick')).toHaveCount(1);
  const tip = await line.locator('.bar').evaluate((path) => (path as SVGPathElement).getAttribute('d')!.split(' L').length);
  expect(tip, 'an arrowhead at the open end').toBe(7);

  // Under every job and the degree.
  const lineTop = (await line.locator('.bar').boundingBox())!.y;
  for (const bar of await svg.locator('.job .bar, .study .bar').all()) {
    const box = (await bar.boundingBox())!;
    expect(box.y + box.height).toBeLessThan(lineTop);
  }

  // The drawing gives the year Hugo started, never the year he was born.
  await expect(page.locator('body')).not.toContainText('1999');
});

test('on a narrow sheet the drawing stands on end and time flows down', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');

  const svg = page.locator('#career svg.tall');
  await expect(svg).toBeVisible();

  const years = await svg.locator('.year').evaluateAll((labels) => labels.map((label) => [Number(label.textContent), (label as SVGGraphicsElement).getBBox().y]));
  expect(years[0][0]).toBe(Number(site.learning.from));
  for (const [i, [year, top]] of years.slice(1).entries()) expect(top, `${year} sits below ${years[i][0]}`).toBeGreaterThan(years[i][1]);

  // The oldest job is nearest the top, the newest nearest the bottom.
  const top = async (id: string) => (await svg.locator(`g[data-job="${id}"] .bar`).first().boundingBox())!.y;
  const oldest = site.experience[site.experience.length - 1].id;
  const newest = site.experience[0].id;
  expect(await top(oldest)).toBeLessThan(await top(newest));

  // The learning line starts at the top and its arrowhead points down at the present.
  const line = svg.locator('g.learning .bar');
  const box = (await line.boundingBox())!;
  const first = (await svg.locator('.year').first().boundingBox())!;
  expect(box.y).toBeLessThan(first.y);
  const tip = await line.evaluate((path) => {
    const points = path.getAttribute('d')!.slice(1).split(' L').map((pair) => pair.trim().split(' ').map(Number));
    return { tip: points[3][1], lowest: Math.max(...points.map(([, y]) => y)) };
  });
  expect(tip.tip, 'the arrowhead is the lowest point').toBe(tip.lowest);
  await expect(svg.locator('g.learning .tick')).toHaveCount(1);
});

test('the table service summers break off at each winter with a round bar break', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const catering = site.experience.find((entry) => entry.from.label.startsWith('Summer'))!;
  const summers = Number(catering.to!.date) - Number(catering.from.date) + 1;
  for (const drawing of ['wide', 'tall']) {
    const pieces = page.locator(`#career svg.${drawing} .job[data-job="${catering.id}"] .bar`);
    await expect(pieces, `${drawing}: one piece per summer`).toHaveCount(summers);
    // Every cut end is the S of a round bar's break, two curves where a straight end has none,
    // and shows its cut face: one hatched lobe per cut end.
    const curves = await pieces.evaluateAll((paths) => paths.map((path) => (path.getAttribute('d')!.match(/C/g) ?? []).length));
    expect(curves, drawing).toEqual(curves.map((_, i) => 2 * ((i > 0 ? 1 : 0) + (i < curves.length - 1 ? 1 : 0))));
    const faces = page.locator(`#career svg.${drawing} .job[data-job="${catering.id}"] .break-face`);
    await expect(faces, drawing).toHaveCount(2 * (summers - 1));
    await expect(faces.first()).toHaveAttribute('fill', /-cut\)/);
  }

  // In the wide drawing each break falls inside the winter between two summers.
  const { unit } = await page.locator('#career svg.wide').evaluate(axis);
  const gaps = await page.locator(`#career svg.wide .job[data-job="${catering.id}"] .bar`).evaluateAll((paths) => {
    const boxes = paths.map((path) => (path as SVGGraphicsElement).getBBox());
    return boxes.slice(1).map((box, i) => [boxes[i].x + boxes[i].width, box.x]);
  });
  const start = await page.locator(`#career svg.wide .job[data-job="${catering.id}"] .bar`).first().evaluate((path) => (path as SVGGraphicsElement).getBBox().x);
  for (const [i, [end, next]] of gaps.entries()) {
    const year = Number(catering.from.date) + i;
    const toYears = (v: number) => at(catering.from) + (v - start) / unit;
    expect(toYears(end), `break ${i + 1} starts before summer ${year} ends`).toBeGreaterThan(year + 0.7);
    expect(toYears(next), `break ${i + 1} ends after summer ${year + 1} starts`).toBeLessThan(year + 1.45);
  }
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
