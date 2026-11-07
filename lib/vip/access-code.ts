/** Caractères sans ambiguïté (ni 0/O, ni 1/I/L) : le code se lit et se recopie sans erreur. */
export const ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Forme canonique ABCD-EFGH-JKMN, ou null si la saisie ne ressemble pas à un code généré. Sans effet sur un mot de passe existant. */
export function normalizeAccessCode(value: string): string | null {
  const compact = value.toUpperCase().replace(/[\s-]/g, "");
  if (compact.length !== 12) return null;
  for (const char of compact) {
    if (!ACCESS_CODE_ALPHABET.includes(char)) return null;
  }
  return compact.replace(/(.{4})(?=.)/g, "$1-");
}
