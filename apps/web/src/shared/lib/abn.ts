/** Australian Business Number helpers. Stored as 11 digits without spaces (Customer.abn). */
const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** Strips spaces and returns the 11 digits, or null if it isn't 11 digits. */
export function normaliseAbn(input: string): string | null {
  const digits = input.replace(/\s+/g, '');
  return /^\d{11}$/.test(digits) ? digits : null;
}

/** ATO checksum: subtract 1 from the first digit, weight each digit, and the sum must divide by 89. */
export function isValidAbn(input: string): boolean {
  const abn = normaliseAbn(input);
  if (!abn) return false;
  const digits = abn.split('').map(Number);
  digits[0] -= 1;
  const sum = digits.reduce((acc, digit, i) => acc + digit * WEIGHTS[i], 0);
  return sum % 89 === 0;
}

/** "51824753556" → "51 824 753 556". Returns the input unchanged if it isn't 11 digits. */
export function formatAbn(input: string | null | undefined): string {
  if (!input) return '—';
  const abn = normaliseAbn(input);
  if (!abn) return input;
  return `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}`;
}
