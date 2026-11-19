/** Grams to kilograms for display, using integer maths: 14500 → "14.5 kg", 250 → "0.25 kg". */
export function formatKg(grams: number): string {
  const kg = Math.floor(grams / 1000);
  const rest = grams % 1000;
  const decimals = rest === 0 ? '' : `.${String(rest).padStart(3, '0').replace(/0+$/, '')}`;
  return `${kg}${decimals} kg`;
}
