const BASE_URL = 'https://v3.football.api-sports.io'

// API-Football の リーグID
//   J1 = 98
//   J2/J3百年構想 = 99 (DB上の league_id=2 に対応)
export const API_LEAGUE_J1 = 98
export const API_LEAGUE_J2 = 99
export const API_LEAGUES_ALL = [API_LEAGUE_J1, API_LEAGUE_J2]

// API-Football league ID → DB上の league_id
//   J1: 98 → 98, J2/J3百年構想: 99 → 2
export function apiLeagueToDbLeague(apiLeague) {
  if (apiLeague === API_LEAGUE_J1) return 98
  if (apiLeague === API_LEAGUE_J2) return 2
  throw new Error(`Unknown API-Football league: ${apiLeague}`)
}

async function apiFetch(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'x-apisports-key': process.env.API_FOOTBALL_KEY,
    },
  })
  if (!res.ok) throw new Error(`API-FOOTBALL error: ${res.status} ${endpoint}`)
  const data = await res.json()
  return data.response
}

export async function fetchFixtures(league = API_LEAGUE_J1) {
  return apiFetch(`/fixtures?league=${league}&season=2026`)
}

// 進行中(LIVE)の試合のみ返す。試合中以外は空配列
export async function fetchLiveFixtures(league = API_LEAGUE_J1) {
  return apiFetch(`/fixtures?league=${league}&live=all`)
}

export async function fetchFixturesBySeason(season, league = API_LEAGUE_J1) {
  return apiFetch(`/fixtures?league=${league}&season=${season}`)
}

export async function fetchPredictions(fixtureId) {
  return apiFetch(`/predictions?fixture=${fixtureId}`)
}

export async function fetchOdds(fixtureId) {
  return apiFetch(`/odds?fixture=${fixtureId}`)
}

export async function fetchHeadToHead(teamId1, teamId2) {
  return apiFetch(`/fixtures/headtohead?h2h=${teamId1}-${teamId2}&last=10`)
}

export async function fetchFixtureStatistics(fixtureId) {
  return apiFetch(`/fixtures/statistics?fixture=${fixtureId}`)
}

export async function fetchFixtureEvents(fixtureId) {
  return apiFetch(`/fixtures/events?fixture=${fixtureId}`)
}

export async function fetchFixtureLineups(fixtureId) {
  return apiFetch(`/fixtures/lineups?fixture=${fixtureId}`)
}

export async function fetchFixturePlayers(fixtureId) {
  return apiFetch(`/fixtures/players?fixture=${fixtureId}`)
}

export async function fetchStandings(league = API_LEAGUE_J1) {
  return apiFetch(`/standings?league=${league}&season=2026`)
}

export async function fetchPlayersByTeam(teamId, season = 2026, page = 1) {
  return apiFetch(`/players?team=${teamId}&season=${season}&page=${page}`)
}
