/**
 * Fractional/lexicographic ranks (domain-model §cross-cutting, ui-ux-design.md §8).
 *
 * A rank is a string; rows sort by plain lexicographic order. To insert between
 * two neighbours we mint a new string strictly between their ranks — no
 * renumbering, so concurrent offline reorders on two devices don't collide under
 * LWW (worst case two rows tie and fall back to id order).
 *
 * The digit alphabet is 62 chars in ascending ASCII order, so string comparison
 * matches digit-index order. Never hand `rankBetween` the boundary: a rank of a
 * single smallest digit ('0') has nothing below it. Fresh ranks come from
 * `rankBetween(null, null)`, which returns a mid-alphabet token with room on
 * both sides.
 */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const FIRST = 0;
const PAST_LAST = DIGITS.length; // one past the largest digit (unbounded-above sentinel)

function digitAt(s: string, i: number): number {
  return i < s.length ? DIGITS.indexOf(s[i]!) : FIRST;
}

/**
 * A rank strictly between `before` and `after` (lexicographically). `null` means
 * unbounded: `rankBetween(null, x)` ranks before x, `rankBetween(x, null)` after
 * x, `rankBetween(null, null)` is the first rank.
 */
export function rankBetween(before: string | null, after: string | null): string {
  const lo = before ?? "";
  const hi = after ?? "";
  let result = "";
  let i = 0;
  let hiOpen = hi === "";
  for (;;) {
    const loD = digitAt(lo, i);
    const hiD = hiOpen || i >= hi.length ? PAST_LAST : DIGITS.indexOf(hi[i]!);
    if (hiD - loD > 1) {
      // Room for a digit strictly between the bounds — place the midpoint.
      result += DIGITS[Math.floor((loD + hiD) / 2)];
      return result;
    }
    // Bounds are equal or adjacent: keep the lower digit and descend a place.
    result += DIGITS[loD];
    // Once we've taken a digit below `hi`, the rest is unbounded above.
    if (loD < hiD) hiOpen = true;
    i++;
  }
}

/**
 * Order two ranks. Ranks must compare by **codepoint** (the digit alphabet runs
 * digits → uppercase → lowercase in ascending ASCII), so a plain `<`/`>` is
 * correct and `String.localeCompare` is **not** — locale collation reorders case
 * (e.g. it can place `'k'` before `'V'`), which scrambles a list once ranks cross
 * the upper/lower boundary (as `rankAfter` does when appending). Always sort ranks
 * through this comparator.
 */
export function compareRank(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Append a new rank after the current maximum (e.g. adding at the end of a list). */
export function rankAfter(maxRank: string | null): string {
  return rankBetween(maxRank, null);
}

/** Mint a new rank before the current minimum (e.g. pinning to the top). */
export function rankBefore(minRank: string | null): string {
  return rankBetween(null, minRank);
}
