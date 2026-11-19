interface DisplayNameInput {
  name: string | null;
  bagSizeGrams: number | null;
  coffee: { name: string } | null;
  grind: { name: string } | null;
}

/** `250 g`, `1 kg`, `1.5 kg`, `2.27 kg`. Integer maths so there is no float rounding. */
export function formatBagSize(grams: number): string {
  if (grams < 1000) return `${grams} g`;
  const whole = Math.floor(grams / 1000);
  const fraction = String(grams % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''} kg`;
}

/** Coffee products: `<coffee> — <size> — <grind>`; other products use their name. */
export function productDisplayName(p: DisplayNameInput): string {
  if (p.coffee && p.bagSizeGrams !== null && p.grind) {
    return `${p.coffee.name} — ${formatBagSize(p.bagSizeGrams)} — ${p.grind.name}`;
  }
  return p.name ?? '';
}
