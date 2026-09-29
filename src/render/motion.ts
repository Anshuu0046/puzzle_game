/** Animation timings (seconds) and eases. Nothing moves linearly. */
export const MOTION = {
  swap: 0.15,
  swapEase: 'power2.inOut',
  rejectBack: 0.18,
  rejectEase: 'back.out(2)',
  matchPulse: 0.09,
  clear: 0.2,
  clearEase: 'back.in(2)',
  /** Fall time = fallBase + fallPerRow * sqrt(rows): accelerates like gravity. */
  fallBase: 0.12,
  fallPerRow: 0.09,
  fallEase: 'power2.in',
  landSquash: 0.08,
  /** Matched pieces sliding into the special they form. */
  merge: 0.16,
  /** Gap between chained special activations. */
  chainStep: 0.12,
  shuffle: 0.45,
  shuffleEase: 'power3.inOut',
} as const;
