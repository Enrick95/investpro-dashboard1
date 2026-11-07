/**
 * Lettres et chiffres sans ambiguïté (ni I/O, ni i/l/o, ni 0/1) : 55 signes possibles.
 * Majuscules et minuscules comptent : le code se recopie tel qu'il est reçu.
 */
export const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Forme canonique Ab3d-Ef7g-Hk9m (casse conservée), ou null si la saisie ne ressemble pas à un code généré. Sans effet sur un mot de passe existant. */
export function normalizeAccessCode(value: string): string | null {
  const compact = value.replace(/[\s-]/g, "");
  if (compact.length !== 12) return null;
  for (const char of compact) {
    if (!ACCESS_CODE_ALPHABET.includes(char)) return null;
  }
  return compact.replace(/(.{4})(?=.)/g, "$1-");
}
