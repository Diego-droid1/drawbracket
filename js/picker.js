import { randomInt, shuffleArray } from './rng.js';

export function parseWeightedLine(line, useWeights = true) {
  const clean = String(line ?? '').trim();
  if (!clean) return null;

  if (!useWeights) {
    return { name: clean, weight: 1 };
  }

  const match = clean.match(/^(.*?)(?:\s+(?:x|\*)\s*(\d+)|\s*[|:,]\s*(\d+))$/i);
  if (match && match[1].trim()) {
    const rawWeight = Number.parseInt(match[2] || match[3], 10);
    const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? Math.min(rawWeight, 500) : 1;
    return { name: match[1].trim(), weight };
  }

  return { name: clean, weight: 1 };
}

export function pickWeightedWinners(weightedEntries, count = 1) {
  if (!Array.isArray(weightedEntries) || weightedEntries.length === 0) {
    return [];
  }

  const pool = weightedEntries
    .filter((item) => item && item.name && item.weight > 0)
    .map((item) => ({ name: item.name, weight: item.weight }));

  if (pool.length === 0) return [];

  const targetCount = Math.min(pool.length, Math.max(1, Number.parseInt(count, 10) || 1));
  const winners = [];

  for (let i = 0; i < targetCount; i++) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) break;

    let roll = randomInt(totalWeight);
    let chosenIdx = 0;

    for (let j = 0; j < pool.length; j++) {
      roll -= pool[j].weight;
      if (roll < 0) {
        chosenIdx = j;
        break;
      }
    }

    const [picked] = pool.splice(chosenIdx, 1);
    winners.push({
      name: picked.name,
      weight: picked.weight,
      totalWeight
    });
  }

  return winners;
}

export function pickWinners(entries, count = 1, { exclude = [] } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const excludedSet = new Set(
    Array.isArray(exclude)
      ? exclude.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      : []
  );

  const pool = excludedSet.size > 0
    ? entries.filter((item) => !excludedSet.has(String(item).trim().toLowerCase()))
    : entries;

  if (pool.length === 0) {
    return [];
  }

  const parsedCount = Number.parseInt(count, 10);
  const targetCount = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;
  const safeCount = Math.min(pool.length, targetCount);

  if (safeCount === 1) {
    return [pool[randomInt(pool.length)]];
  }

  return shuffleArray(pool).slice(0, safeCount);
}