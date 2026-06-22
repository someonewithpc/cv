import chunk from 'lodash/chunk';

export function transformPath(pathData, fromViewBox, toViewBox) {
  const mapWidthRelative = (x) => (x / fromViewBox.width) * toViewBox.width;
  const mapHeightRelative = (y) => (y / fromViewBox.height) * toViewBox.height;
  const mapWidthAbsolute = (x) => ((x - fromViewBox.x) / fromViewBox.width) * toViewBox.width + toViewBox.x;
  const mapHeightAbsolute = (y) => ((y - fromViewBox.y) / fromViewBox.height) * toViewBox.height + toViewBox.y;

  const map0 = (vals) => vals;
  const map1WidthAbsolute = (vals) => vals.map((w) => mapWidthAbsolute(w));
  const map1HeightAbsolute = (vals) => vals.map((h) => mapHeightAbsolute(h));
  const map2Absolute = (vals) => chunk(vals, 2).flatMap(([w, h]) => [mapWidthAbsolute(w), mapHeightAbsolute(h)]);
  const map2sAbsolute = (vals) => chunk(vals, 2).flatMap(map2Absolute);
  const mapArcAbsolute = (vals) => chunk(vals, 7).flatMap(([rx, ry, angle, largeArc, sweep, x, y]) => [mapWidthRelative(rx), mapHeightRelative(ry), angle, largeArc, sweep, mapWidthAbsolute(x), mapHeightAbsolute(y)]);

  const map1WidthRelative = (vals) => vals.map((w) => mapWidthRelative(w));
  const map1HeightRelative = (vals) => vals.map((h) => mapHeightRelative(h));
  const map2Relative = (vals) => chunk(vals, 2).flatMap(([w, h]) => [mapWidthRelative(w), mapHeightRelative(h)]);
  const map2sRelative = (vals) => chunk(vals, 2).flatMap(map2Relative);
  const mapArcRelative = (vals) => chunk(vals, 7).flatMap(([rx, ry, angle, largeArc, sweep, x, y]) => [mapWidthRelative(rx), mapHeightRelative(ry), angle, largeArc, sweep, mapWidthRelative(x), mapHeightRelative(y)]);

  const transformers = {
    m: map2Relative, M: map2Absolute,
    l: map2Relative, L: map2Absolute,
    h: map1WidthRelative, H: map1WidthAbsolute,
    v: map1HeightRelative, V: map1HeightAbsolute,
    c: map2sRelative, C: map2sAbsolute,
    s: map2sRelative, S: map2sAbsolute,
    a: mapArcRelative, A: mapArcAbsolute,
    z: map0, Z: map0,
    q: map2sRelative, Q: map2sAbsolute,
    t: map2Relative, T: map2Absolute,
  };

  const thrower = (type) => { throw new Error(`No transformer for '${type}'`); };

  return pathData.map(({ type, values }) => ({
    type,
    values: (transformers[type] ?? thrower(type))(values),
  }));
}

export function pathDataToString(pathData) {
  return pathData.reduce((acc, { type, values }) => acc + `${type} ${values.join(' ')} `, '');
}
