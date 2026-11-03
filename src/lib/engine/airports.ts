// Airport scope (docs/SPEC.md 2): EU member states plus Iceland, Norway, Liechtenstein and
// Switzerland are in scope; UK airports are marked unsupported; everything else is out of scope.

export type AirportScope = "EU261" | "OUT_OF_SCOPE" | "UK261_UNSUPPORTED";

export interface Airport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  scope: AirportScope;
}

const EU_MEMBER_STATES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];
const EEA_AND_CH = ["IS", "NO", "LI", "CH"];
const IN_SCOPE = new Set([...EU_MEMBER_STATES, ...EEA_AND_CH]);

export function scopeForCountry(iso2: string): AirportScope {
  if (IN_SCOPE.has(iso2)) return "EU261";
  if (iso2 === "GB") return "UK261_UNSUPPORTED";
  return "OUT_OF_SCOPE";
}
