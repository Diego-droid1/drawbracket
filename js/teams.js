import { shuffleArray } from './rng.js';

export function splitIntoTeams(entries, { mode = 'count', value = 2, teamNames = [] } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const cleanEntries = entries
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);

  if (cleanEntries.length === 0) {
    return [];
  }

  const shuffled = shuffleArray(cleanEntries);
  const total = shuffled.length;
  const parsedValue = Number.parseInt(value, 10);

  let teamCount;
  if (mode === 'size') {
    const squadSize = Number.isFinite(parsedValue) && parsedValue > 0
      ? Math.min(total, parsedValue)
      : 1;
    teamCount = Math.max(1, Math.ceil(total / squadSize));
  } else {
    const requestedTeams = Number.isFinite(parsedValue) && parsedValue > 0
      ? parsedValue
      : 2;
    teamCount = Math.max(1, Math.min(total, requestedTeams));
  }

  const buckets = Array.from({ length: teamCount }, (_, index) => {
    const customName = Array.isArray(teamNames) && typeof teamNames[index] === 'string'
      ? teamNames[index].trim()
      : '';
    return {
      name: customName || `Team ${index + 1}`,
      members: []
    };
  });

  shuffled.forEach((member, idx) => {
    buckets[idx % teamCount].members.push(member);
  });

  return buckets.map((bucket) => bucket.members);
}

export function splitIntoNamedTeams(entries, { mode = 'count', value = 2, teamNames = [] } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const cleanEntries = entries
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);

  if (cleanEntries.length === 0) {
    return [];
  }

  const shuffled = shuffleArray(cleanEntries);
  const total = shuffled.length;
  const parsedValue = Number.parseInt(value, 10);

  let teamCount;
  if (mode === 'size') {
    const squadSize = Number.isFinite(parsedValue) && parsedValue > 0
      ? Math.min(total, parsedValue)
      : 1;
    teamCount = Math.max(1, Math.ceil(total / squadSize));
  } else {
    const requestedTeams = Number.isFinite(parsedValue) && parsedValue > 0
      ? parsedValue
      : 2;
    teamCount = Math.max(1, Math.min(total, requestedTeams));
  }

  const teams = Array.from({ length: teamCount }, (_, index) => {
    const customName = Array.isArray(teamNames) && typeof teamNames[index] === 'string'
      ? teamNames[index].trim()
      : '';
    return {
      id: index + 1,
      name: customName || `Team ${index + 1}`,
      members: []
    };
  });

  shuffled.forEach((member, idx) => {
    teams[idx % teamCount].members.push(member);
  });

  return teams;
}

export function formatTeamsText(teams) {
  if (!Array.isArray(teams) || teams.length === 0) {
    return '';
  }

  return teams
    .map((team, idx) => {
      if (Array.isArray(team)) {
        return `Team ${idx + 1} (${team.length}):\n${team.map((m) => `- ${m}`).join('\n')}`;
      }
      const name = team?.name || `Team ${idx + 1}`;
      const members = Array.isArray(team?.members) ? team.members : [];
      return `${name} (${members.length}):\n${members.map((m) => `- ${m}`).join('\n')}`;
    })
    .join('\n\n');
}