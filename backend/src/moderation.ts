// Conservative blacklist: only catch genuine slurs and hate speech.
// Edgy comedy is the product — don't false-positive on dark humor.
const BLACKLIST_PATTERNS: RegExp[] = [
  /\bn[i1]gg(?:er|a|ah|ers|as|ahs)\b/i,
  /\bf[a@]gg?(?:ot|ots|oted)\b/i,
  /\bk[i1]ke[s]?\b/i,
  /\bsp[i1]c[s]?\b/i,
  /\bch[i1]nk[s]?\b/i,
  /\bwetback[s]?\b/i,
  /\btr[a@]nn(?:y|ie|ies)\b/i,
  /\bheil\s+hitler\b/i,
  /\bwhite\s+power\b/i,
  /\bgas\s+the\b/i,
  /\bkill\s+all\s+(?:jews|blacks|whites|muslims|gays)\b/i,
];

export function isGhosted(text: string): boolean {
  return BLACKLIST_PATTERNS.some(p => p.test(text));
}
