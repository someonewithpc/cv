// A hand writes a small count out in words; only a stack deeper than a dozen gets a digit
const inWords = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

export const peelHint = (sheetsBelow: number) =>
  `${inWords[sheetsBelow] ?? sheetsBelow} more sheets, peel this corner`;
