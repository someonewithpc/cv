/**
 * Space Builder's distance formatting (utils/unitTranslation.js), for the sizes on the
 * card: 182cm reads as 1.8m or 6' depending on the units, rounded the way the product
 * rounds. The catalog stores sizes as the product's own metric strings; parse() reads
 * them back into centimetres, as the product's reverseDistanceToHuman does.
 */
export type Units = 'metric' | 'imperial';

const SI_PER_CM: Record<string, number> = { mm: 0.1, cm: 1, dm: 10, m: 100 };

/** One distance of a stored size string, in centimetres. */
export function parseDistance(text: string): number | null {
  const si = text.match(/(?<number>(\d+[.,])?\d+)(?<unit>mm|cm|dm|m(?!m))/i);
  if (si?.groups) {
    return Math.round(Number(si.groups.number.replace(',', '.')) * SI_PER_CM[si.groups.unit.toLowerCase()]);
  }
  const imperial = text.match(/((?<feet>(\d+[.,])?\d+)(ft|'))? ?((?<inches>(\d+[.,])?\d+)(in|"))?/);
  if (imperial?.groups && imperial[0] !== '') {
    return Math.round(
      Number(imperial.groups.feet?.replace(',', '.') ?? 0) * 30.48
      + Number(imperial.groups.inches?.replace(',', '.') ?? 0) * 2.54,
    );
  }
  return null;
}

/** Every distance of a "w x d x h" size string, in centimetres. */
export function parseSize(size: string): number[] {
  return size.split('x').map((part) => parseDistance(part.trim()))
    .filter((cm): cm is number => cm !== null);
}

export function distanceToHumanSI(cm: number): string {
  const d = Math.abs(cm);
  if (d < 10) return `${Math.round(cm * 10) / 10}cm`;
  if (d < 100) return `${Math.round(cm)}cm`;
  if (d < 1000) return `${Math.round(cm / 10) / 10}m`;
  return `${Math.round(cm / 100)}m`;
}

function cmToFeetInches(cm: number) {
  const preciseInches = (cm / 2.54) % 12;
  let inches = Math.round(preciseInches);
  let feet = Math.floor(cm / 2.54 / 12);

  // Nudge toward a whole foot, as the product does, so 182cm lands on 6' and not 5'12".
  const distanceToMultipleOfTen = (feet * 12 + preciseInches) % 10;
  const toleranceInches = 1.5;
  if (distanceToMultipleOfTen < toleranceInches && inches > toleranceInches) {
    inches -= 1;
  } else if (distanceToMultipleOfTen > 12 - toleranceInches) {
    inches += 1;
  }

  if (inches === 12) {
    inches = 0;
    feet += 1;
  }
  if (feet === 0 && inches === 0) {
    inches = Math.round(((cm / 2.54) % 12) * 100) / 100;
  }
  return { feet, inches };
}

export function distanceToHumanImperial(cm: number): string {
  const { feet, inches } = cmToFeetInches(cm);
  if (feet === 0 && inches === 0) return '0"';
  if (feet * 12 + inches < 72) return `${feet * 12 + inches}"`;
  if (inches === 0) return `${feet}'`;
  return feet !== 0 ? `${feet}'${inches}"` : `${inches}"`;
}

export function distanceToHuman(cm: number, units: Units): string {
  return units === 'imperial' ? distanceToHumanImperial(cm) : distanceToHumanSI(cm);
}

/** A stored size, printed in the given units with the product's rounding. */
export function formatSize(size: string, units: Units): string {
  return parseSize(size).map((cm) => distanceToHuman(Math.floor(cm), units)).join(' x ');
}

/**
 * Imperial for a visitor whose language names one of the three countries on it, or plain
 * US English; metric otherwise. The browser has no better signal for units.
 */
export function unitsFor(language: string | undefined): Units {
  const tag = (language ?? '').trim();
  if (!tag) return 'metric';
  const region = tag.split(/[-_]/)[1]?.toUpperCase();
  if (region && ['US', 'LR', 'MM'].includes(region)) return 'imperial';
  return 'metric';
}
