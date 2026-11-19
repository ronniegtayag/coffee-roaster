const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** Removes whitespace; the stored form is 11 digits with no spaces. */
export function normaliseAbn(input: string): string {
  return input.replace(/\s+/g, '');
}

export function isAbnFormat(abn: string): boolean {
  return /^\d{11}$/.test(abn);
}

/** ATO checksum: subtract 1 from the first digit, weight the digits, total must divide by 89. */
export function isAbnChecksumValid(abn: string): boolean {
  if (!isAbnFormat(abn)) return false;
  const digits = [...abn].map(Number);
  digits[0] -= 1;
  const sum = digits.reduce((total, d, i) => total + d * WEIGHTS[i], 0);
  return sum % 89 === 0;
}
