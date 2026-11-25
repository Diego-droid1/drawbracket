import { shuffleArray } from './rng.js';

function nextPowerOfTwo(n) {
  let power = 1;
  while (power < n) {
    power *= 2;
  }
  return power;
}

function getRoundName(matchCount, roundIndex, totalRounds) {
  if (roundIndex === totalRounds - 1 || matchCount === 1) return 'Final';
  if (matchCount === 2) return 'Semifinals';
  if (matchCount === 4) return 'Quarterfinals';
  if (matchCount === 8) return 'Round of 16';
  if (matchCount === 16) return 'Round of 32';
  return `Round ${roundIndex + 1}`;
}

export function buildBracket(participants, { seeding = 'random', bestOf = 1, thirdPlace = false } = {}) {
  if (!Array.isArray(participants) || participants.length < 2) {
    return { rounds: [], bestOf: 1, thirdPlaceMatch: null };
  }

  const seriesLength = [1, 3, 5].includes(Number(bestOf)) ? Number(bestOf) : 1;
  const winsNeeded = Math.ceil(seriesLength / 2);

  const ordered = seeding === 'seeded'
    ? Array.from(participants)
    : shuffleArray(participants);

  const bracketSize = nextPowerOfTwo(ordered.length);
  const byeCount = bracketSize - ordered.length;
  const matchCountR1 = bracketSize / 2;

  const round1Matches = Array.from({ length: matchCountR1 }, (_, m) => ({
    id: `r0-m${m}`,
    slots: [null, null],
    scores: [0, 0],
    winner: null
  }));

  let pIdx = 0;
  for (let m = 0; m < matchCountR1 && pIdx < ordered.length; m++) {
    round1Matches[m].slots[0] = ordered[pIdx++];
  }

  for (let m = matchCountR1 - 1; m >= 0 && pIdx < ordered.length; m--) {
    if (round1Matches[m].slots[1] === null) {
      round1Matches[m].slots[1] = ordered[pIdx++];
    }
  }

  let placedByes = 0;
  for (let m = matchCountR1 - 1; m >= 0 && placedByes < byeCount; m--) {
    if (round1Matches[m].slots[0] !== null && round1Matches[m].slots[1] === null) {
      round1Matches[m].slots[1] = 'BYE';
      placedByes++;
    }
  }

  for (let m = 0; m < matchCountR1 && placedByes < byeCount; m++) {
    if (round1Matches[m].slots[0] === null) {
      round1Matches[m].slots[0] = 'BYE';
      placedByes++;
    }
    if (placedByes < byeCount && round1Matches[m].slots[1] === null) {
      round1Matches[m].slots[1] = 'BYE';
      placedByes++;
    }
  }

  round1Matches.forEach((match) => {
    const [a, b] = match.slots;
    if (a && a !== 'BYE' && b === 'BYE') {
      match.winner = a;
      match.scores = [winsNeeded, 0];
    } else if (b && b !== 'BYE' && a === 'BYE') {
      match.winner = b;
      match.scores = [0, winsNeeded];
    }
  });

  const rounds = [];
  const totalRounds = Math.log2(bracketSize);
  let currentMatchCount = matchCountR1;

  for (let r = 0; r < totalRounds; r++) {
    const matches = r === 0
      ? round1Matches
      : Array.from({ length: currentMatchCount }, (_, m) => ({
          id: `r${r}-m${m}`,
          slots: [null, null],
          scores: [0, 0],
          winner: null
        }));

    rounds.push({
      name: getRoundName(currentMatchCount, r, totalRounds),
      matches
    });
    currentMatchCount /= 2;
  }

  for (let r = 0; r < rounds.length - 1; r++) {
    rounds[r].matches.forEach((match, mIdx) => {
      if (match.winner) {
        const nextMatch = rounds[r + 1].matches[Math.floor(mIdx / 2)];
        const targetSlot = mIdx % 2;
        nextMatch.slots[targetSlot] = match.winner;
      }
    });
  }

  const thirdPlaceMatch = thirdPlace && totalRounds >= 2
    ? { id: 'bronze-m0', slots: [null, null], scores: [0, 0], winner: null }
    : null;

  if (thirdPlaceMatch) {
    syncThirdPlaceSlots(rounds, thirdPlaceMatch);
  }

  return { rounds, bestOf: seriesLength, thirdPlaceMatch };
}

function syncThirdPlaceSlots(rounds, thirdPlaceMatch) {
  if (!thirdPlaceMatch || rounds.length < 2) return;
  const semiRound = rounds[rounds.length - 2];
  semiRound.matches.forEach((semi, idx) => {
    let loser = null;
    if (semi.winner) {
      loser = semi.slots.find((s) => s && s !== 'BYE' && s !== semi.winner) || null;
    }
    if (thirdPlaceMatch.slots[idx] !== loser) {
      thirdPlaceMatch.slots[idx] = loser;
      thirdPlaceMatch.scores = [0, 0];
      thirdPlaceMatch.winner = null;
    }
  });
}

export function cloneBracket(bracket) {
  if (!bracket || !Array.isArray(bracket.rounds)) {
    return { rounds: [], bestOf: 1, thirdPlaceMatch: null };
  }
  return {
    bestOf: bracket.bestOf || 1,
    rounds: bracket.rounds.map((round) => ({
      name: round.name,
      matches: round.matches.map((match) => ({
        id: match.id,
        slots: [...match.slots],
        scores: [...(match.scores || [0, 0])],
        winner: match.winner
      }))
    })),
    thirdPlaceMatch: bracket.thirdPlaceMatch
      ? {
          id: bracket.thirdPlaceMatch.id,
          slots: [...bracket.thirdPlaceMatch.slots],
          scores: [...(bracket.thirdPlaceMatch.scores || [0, 0])],
          winner: bracket.thirdPlaceMatch.winner
        }
      : null
  };
}

function clearDownstreamSlot(rounds, roundIndex, matchIndex, slotIndex) {
  if (roundIndex < 0 || roundIndex >= rounds.length) return;
  const targetMatch = rounds[roundIndex].matches[matchIndex];
  if (!targetMatch) return;

  const removedParticipant = targetMatch.slots[slotIndex];
  if (targetMatch.winner === removedParticipant) {
    targetMatch.winner = null;
  }
  targetMatch.slots[slotIndex] = null;
  targetMatch.scores = [0, 0];

  if (removedParticipant && removedParticipant !== 'BYE' && roundIndex + 1 < rounds.length) {
    const nextMatchIndex = Math.floor(matchIndex / 2);
    const nextSlotIndex = matchIndex % 2;
    const nextMatch = rounds[roundIndex + 1].matches[nextMatchIndex];
    if (nextMatch && nextMatch.slots[nextSlotIndex] === removedParticipant) {
      clearDownstreamSlot(rounds, roundIndex + 1, nextMatchIndex, nextSlotIndex);
    }
  }
}

export function scoreMatchSlot(bracket, roundIndex, matchIndex, slotIndex, delta = 1, isBronze = false) {
  const next = cloneBracket(bracket);
  const winsNeeded = Math.ceil((next.bestOf || 1) / 2);

  if (isBronze) {
    const match = next.thirdPlaceMatch;
    if (!match) return next;
    const participant = match.slots[slotIndex];
    if (!participant || participant === 'BYE') return next;

    if (next.bestOf === 1) {
      const toggle = match.winner === participant ? null : participant;
      match.winner = toggle;
      match.scores = toggle ? (slotIndex === 0 ? [1, 0] : [0, 1]) : [0, 0];
      return next;
    }

    const updatedScore = Math.max(0, Math.min(winsNeeded, (match.scores[slotIndex] || 0) + delta));
    match.scores[slotIndex] = updatedScore;
    if (updatedScore >= winsNeeded) {
      match.winner = participant;
    } else if (match.winner === participant) {
      match.winner = null;
    }
    return next;
  }

  const round = next.rounds[roundIndex];
  if (!round) return next;
  const match = round.matches[matchIndex];
  if (!match) return next;

  const participant = match.slots[slotIndex];
  if (!participant || participant === 'BYE') return next;

  const previousWinner = match.winner;

  if (next.bestOf === 1) {
    match.winner = previousWinner === participant ? null : participant;
    match.scores = match.winner ? (slotIndex === 0 ? [1, 0] : [0, 1]) : [0, 0];
  } else {
    const updatedScore = Math.max(0, Math.min(winsNeeded, (match.scores[slotIndex] || 0) + delta));
    match.scores[slotIndex] = updatedScore;
    if (updatedScore >= winsNeeded) {
      match.winner = participant;
    } else if (match.winner === participant) {
      match.winner = null;
    }
  }

  if (roundIndex + 1 < next.rounds.length) {
    const nextMatchIndex = Math.floor(matchIndex / 2);
    const nextSlotIndex = matchIndex % 2;
    const nextMatch = next.rounds[roundIndex + 1].matches[nextMatchIndex];

    if (previousWinner && previousWinner !== match.winner && nextMatch.slots[nextSlotIndex] === previousWinner) {
      clearDownstreamSlot(next.rounds, roundIndex + 1, nextMatchIndex, nextSlotIndex);
    }

    nextMatch.slots[nextSlotIndex] = match.winner;
    if (!match.winner) {
      nextMatch.scores = [0, 0];
    }
  }

  if (next.thirdPlaceMatch) {
    syncThirdPlaceSlots(next.rounds, next.thirdPlaceMatch);
  }

  return next;
}

export function formatBracketText(bracket) {
  if (!bracket || !Array.isArray(bracket.rounds) || !bracket.rounds.length) {
    return '';
  }

  const sections = bracket.rounds.map((round) => {
    const lines = round.matches.map((match, idx) => {
      const [a, b] = match.slots.map((s) => s || 'TBD');
      const scoreTag = bracket.bestOf > 1 ? ` (${match.scores[0]}-${match.scores[1]})` : '';
      const winTag = match.winner ? ` -> ${match.winner}` : '';
      return `  Match ${idx + 1}: ${a} vs ${b}${scoreTag}${winTag}`;
    });
    return `${round.name}\n${lines.join('\n')}`;
  });

  if (bracket.thirdPlaceMatch) {
    const m = bracket.thirdPlaceMatch;
    const [a, b] = m.slots.map((s) => s || 'TBD');
    const scoreTag = bracket.bestOf > 1 ? ` (${m.scores[0]}-${m.scores[1]})` : '';
    const winTag = m.winner ? ` -> 3rd: ${m.winner}` : '';
    sections.push(`3rd Place Match\n  ${a} vs ${b}${scoreTag}${winTag}`);
  }

  return sections.join('\n\n');
}