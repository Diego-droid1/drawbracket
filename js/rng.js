const UINT32_RANGE = 0x100000000;
const hasCryptoRandom = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
const scratchUint32 = hasCryptoRandom ? new Uint32Array(1) : null;

export function randomInt(max) {
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError('max must be a positive integer');
  }

  if (max === 1) return 0;

  if (hasCryptoRandom) {
    const unbiasedLimit = UINT32_RANGE - (UINT32_RANGE % max);
    let sample = 0;

    do {
      crypto.getRandomValues(scratchUint32);
      sample = scratchUint32[0];
    } while (sample >= unbiasedLimit);

    return sample % max;
  }

  return Math.floor(Math.random() * max);
}

export function shuffleArray(items) {
  if (!Array.isArray(items) && typeof items?.[Symbol.iterator] !== 'function') {
    return [];
  }

  const result = Array.from(items);
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (i !== j) {
      const temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
  }
  return result;
}

export function pickRandomItem(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }
  return items[randomInt(items.length)];
}