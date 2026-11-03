// npm run airports:build -- <path to OurAirports airports.csv>
// Builds data/airports.json: a curated subset of OurAirports (public domain,
// https://ourairports.com/data/) with an EU261 scope flag and an IANA time zone.
// OurAirports has no time zones, so they are set here by hand.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scopeForCountry } from "../src/lib/engine/airports";

const SOURCE_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";

// ICAO code and IANA zone. Scenario airports first, then airports used in engine tests
// and the manifest's onward destinations, then a few out-of-scope examples.
const CURATED: Record<string, string> = {
  EDDF: "Europe/Berlin", OMDB: "Asia/Dubai", LEMD: "Europe/Madrid", LIMC: "Europe/Rome",
  LPPT: "Europe/Lisbon", LOWW: "Europe/Vienna", LCLK: "Asia/Nicosia", EFHK: "Europe/Helsinki",
  GCLP: "Atlantic/Canary", HAAB: "Africa/Addis_Ababa", HKJK: "Africa/Nairobi", VABB: "Asia/Kolkata",
  EDDM: "Europe/Berlin", LFPG: "Europe/Paris", EHAM: "Europe/Amsterdam", LEBL: "Europe/Madrid",
  LIRF: "Europe/Rome", EBBR: "Europe/Brussels", EKCH: "Europe/Copenhagen", ESSA: "Europe/Stockholm",
  EIDW: "Europe/Dublin", EPWA: "Europe/Warsaw", LKPR: "Europe/Prague", LHBP: "Europe/Budapest",
  LGAV: "Europe/Athens", LROP: "Europe/Bucharest", LPMA: "Atlantic/Madeira",
  ENGM: "Europe/Oslo", BIKF: "Atlantic/Reykjavik", LSZH: "Europe/Zurich", LSGG: "Europe/Zurich",
  EGLL: "Europe/London", KJFK: "America/New_York", LTFM: "Europe/Istanbul", OTHH: "Asia/Qatar",
  HECA: "Africa/Cairo", GMMN: "Africa/Casablanca",
};

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error("Pass the path to OurAirports airports.csv");
  const [header, ...rows] = parseCsv(readFileSync(csvPath, "utf8"));
  const col = (name: string) => header.indexOf(name);
  const idx = { icao: col("icao_code"), ident: col("ident"), iata: col("iata_code"), name: col("name"), city: col("municipality"), country: col("iso_country"), lat: col("latitude_deg"), lon: col("longitude_deg") };

  const airports = [];
  for (const [icao, tz] of Object.entries(CURATED)) {
    const r = rows.find((row) => (row[idx.icao] || row[idx.ident]) === icao);
    if (!r) throw new Error(`${icao} not found in OurAirports`);
    airports.push({
      icao,
      iata: r[idx.iata],
      name: r[idx.name],
      city: r[idx.city],
      country: r[idx.country],
      lat: Number(r[idx.lat]),
      lon: Number(r[idx.lon]),
      tz,
      scope: scopeForCountry(r[idx.country]),
    });
  }
  const out = {
    source: "OurAirports (public domain)",
    sourceUrl: SOURCE_URL,
    licenseUrl: "https://ourairports.com/data/",
    retrievedAt: new Date().toISOString(),
    note: "Curated subset. Time zones and the EU261 scope flag are added by scripts/build-airports.ts.",
    airports,
  };
  writeFileSync(path.join(process.cwd(), "data", "airports.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`${airports.length} airports written`);
}

main();
