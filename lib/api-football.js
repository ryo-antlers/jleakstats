const BASE_URL = 'https://v3.football.api-sports.io'

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

export async function fetchFixtures() {
  return apiFetch('/fixtures?league=98&season=2026')
}

export async function fetchFixturesBySeason(season) {
  return apiFetch(`/fixtures?league=98&season=${season}`)
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

export async function fetchStandings() {
  return apiFetch('/standings?league=98&season=2026')
}

export async function fetchPlayersByTeam(teamId, season = 2026, page = 1) {
  return apiFetch(`/players?team=${teamId}&season=${season}&page=${page}`)
}
