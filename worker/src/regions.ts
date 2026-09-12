import type { RegionInfo } from "./types.js";

/** Maps a Cloudflare-detected city to a DNO regionid. Coverage is partial - unmatched cities fall back to nation. */
const CITY_TO_REGION_ID: Record<string, number> = {
  // 1: North Scotland
  aberdeen: 1,
  inverness: 1,
  perth: 1,
  dundee: 1,
  elgin: 1,
  "fort william": 1,
  oban: 1,
  wick: 1,
  thurso: 1,
  stornoway: 1,
  kirkwall: 1,
  lerwick: 1,

  // 2: South Scotland
  glasgow: 2,
  edinburgh: 2,
  ayr: 2,
  dumfries: 2,
  stirling: 2,
  falkirk: 2,
  paisley: 2,
  "east kilbride": 2,
  kilmarnock: 2,
  motherwell: 2,
  livingston: 2,
  hamilton: 2,

  // 3: North West England
  manchester: 3,
  preston: 3,
  blackpool: 3,
  blackburn: 3,
  bolton: 3,
  oldham: 3,
  stockport: 3,
  salford: 3,
  wigan: 3,
  carlisle: 3,
  lancaster: 3,
  rochdale: 3,
  bury: 3,

  // 4: North East England
  newcastle: 4,
  "newcastle upon tyne": 4,
  sunderland: 4,
  durham: 4,
  middlesbrough: 4,
  gateshead: 4,
  "south shields": 4,
  darlington: 4,
  hartlepool: 4,
  "stockton-on-tees": 4,

  // 5: Yorkshire
  leeds: 5,
  sheffield: 5,
  bradford: 5,
  hull: 5,
  "kingston upon hull": 5,
  york: 5,
  wakefield: 5,
  huddersfield: 5,
  doncaster: 5,
  rotherham: 5,
  harrogate: 5,

  // 6: North Wales, Merseyside and Cheshire
  liverpool: 6,
  chester: 6,
  wrexham: 6,
  bangor: 6,
  birkenhead: 6,
  wallasey: 6,
  "st helens": 6,
  warrington: 6,
  crewe: 6,
  llandudno: 6,

  // 7: South Wales
  cardiff: 7,
  swansea: 7,
  newport: 7,
  "merthyr tydfil": 7,
  bridgend: 7,

  // 8: West Midlands
  birmingham: 8,
  coventry: 8,
  wolverhampton: 8,
  dudley: 8,
  walsall: 8,
  solihull: 8,
  "stoke-on-trent": 8,

  // 9: East Midlands
  nottingham: 9,
  leicester: 9,
  derby: 9,
  northampton: 9,
  lincoln: 9,

  // 10: East England
  norwich: 10,
  ipswich: 10,
  cambridge: 10,
  colchester: 10,
  peterborough: 10,
  chelmsford: 10,
  "southend-on-sea": 10,

  // 11: South West England
  bristol: 11,
  plymouth: 11,
  exeter: 11,
  bath: 11,
  gloucester: 11,
  truro: 11,

  // 12: South England
  southampton: 12,
  portsmouth: 12,
  bournemouth: 12,
  reading: 12,
  oxford: 12,
  winchester: 12,
  basingstoke: 12,

  // 13: London
  london: 13,
  croydon: 13,
  westminster: 13,

  // 14: South East England
  brighton: 14,
  canterbury: 14,
  maidstone: 14,
  dover: 14,
  guildford: 14,
  crawley: 14,
  hastings: 14,
};

/** Looks up the DNO regionid for a city name, if it's in the table. */
export function regionIdForCity(city: string | undefined): number | undefined {
  if (!city) return undefined;
  return CITY_TO_REGION_ID[city.trim().toLowerCase()];
}

const NATIONS = new Set(["England", "Scotland", "Wales"]);

/** Only usable as a nation when it's exactly one of GB's three - anything else (a county, a US state) is ignored. */
export function nationFromRegionName(region: string | undefined): RegionInfo["nation"] {
  if (region && NATIONS.has(region)) return region as RegionInfo["nation"];
  return undefined;
}

/** IATA colo codes map onto city names, so a colo can reuse CITY_TO_REGION_ID too - it's the weakest signal though, since the network's routing choice isn't the visitor's actual location. */
const COLO_TO_CITY: Record<string, string> = {
  LHR: "London",
  MAN: "Manchester",
  BHX: "Birmingham",
  EDI: "Edinburgh",
  GLA: "Glasgow",
  CWL: "Cardiff",
};

/** Looks up the city for a Cloudflare colo (edge data center) code, if it's in the table. */
export function cityForColo(colo: string | undefined): string | undefined {
  if (!colo) return undefined;
  return COLO_TO_CITY[colo.trim().toUpperCase()];
}

export function regionInfoFromNation(nation: RegionInfo["nation"]): RegionInfo {
  return nation ? { nation, unknown: false } : { unknown: true };
}
