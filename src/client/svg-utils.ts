import chunk from 'lodash/chunk';

type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PathCommand = {
  type: string;
  values: number[];
};

type Transformer = (values: number[]) => number[];

export function transformPath(pathData: PathCommand[], fromViewBox: ViewBox, toViewBox: ViewBox): PathCommand[] {
  const mapWidthRelative = (x: number) => (x / fromViewBox.width) * toViewBox.width;
  const mapHeightRelative = (y: number) => (y / fromViewBox.height) * toViewBox.height;
  const mapWidthAbsolute = (x: number) => ((x - fromViewBox.x) / fromViewBox.width) * toViewBox.width + toViewBox.x;
  const mapHeightAbsolute = (y: number) => ((y - fromViewBox.y) / fromViewBox.height) * toViewBox.height + toViewBox.y;

  const map0: Transformer = (values) => values;
  const map1WidthAbsolute: Transformer = (values) => values.map((width) => mapWidthAbsolute(width));
  const map1HeightAbsolute: Transformer = (values) => values.map((height) => mapHeightAbsolute(height));
  const map2Absolute: Transformer = (values) => chunk(values, 2).flatMap((pair) => {
    const [width, height] = pair as [number, number];
    return [mapWidthAbsolute(width), mapHeightAbsolute(height)];
  });
  const map2sAbsolute: Transformer = (values) => chunk(values, 2).flatMap(map2Absolute);
  const mapArcAbsolute: Transformer = (values) => chunk(values, 7).flatMap((arc) => {
    const [radiusX, radiusY, angle, largeArc, sweep, x, y] = arc as [number, number, number, number, number, number, number];
    return [mapWidthRelative(radiusX), mapHeightRelative(radiusY), angle, largeArc, sweep, mapWidthAbsolute(x), mapHeightAbsolute(y)];
  });

  const map1WidthRelative: Transformer = (values) => values.map((width) => mapWidthRelative(width));
  const map1HeightRelative: Transformer = (values) => values.map((height) => mapHeightRelative(height));
  const map2Relative: Transformer = (values) => chunk(values, 2).flatMap((pair) => {
    const [width, height] = pair as [number, number];
    return [mapWidthRelative(width), mapHeightRelative(height)];
  });
  const map2sRelative: Transformer = (values) => chunk(values, 2).flatMap(map2Relative);
  const mapArcRelative: Transformer = (values) => chunk(values, 7).flatMap((arc) => {
    const [radiusX, radiusY, angle, largeArc, sweep, x, y] = arc as [number, number, number, number, number, number, number];
    return [mapWidthRelative(radiusX), mapHeightRelative(radiusY), angle, largeArc, sweep, mapWidthRelative(x), mapHeightRelative(y)];
  });

  const transformers: Record<string, Transformer> = {
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

  const thrower = (type: string): never => { throw new Error(`No transformer for '${type}'`); };

  return pathData.map(({ type, values }) => ({
    type,
    values: (transformers[type] ?? thrower(type))(values),
  }));
}

export function pathDataToString(pathData: PathCommand[]): string {
  return pathData.reduce((acc, { type, values }) => acc + `${type} ${values.join(' ')} `, '');
}
