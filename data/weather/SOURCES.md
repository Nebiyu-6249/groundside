# Weather sources

Checked 2026-11-04.

## Archived METAR: Iowa Environmental Mesonet (IEM)

- Service: `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py` (help: `?help`). GET only. Parameters used: `station`, `data=metar`, `tz=UTC`, `format=onlycomma`, `sts`, `ets` (ISO times, UTC).
- Rate limit: IEM throttles to one request per second per IP and answers 429 after bursts. `scripts/fetch-weather.ts` waits 5 seconds between requests.
- Terms: https://mesonet.agron.iastate.edu/disclaimer.php. IEM states that its materials are in the public domain and may be used freely for any lawful purpose; attribution to the Iowa Environmental Mesonet of Iowa State University is appreciated. Data comes without warranty of accuracy.
- Shown in the UI as: "Real archived weather report, retrieved {date} from the Iowa Environmental Mesonet (Iowa State University)".

## Archived TAF: not available

- IEM's TAF service (`/cgi-bin/request/taf.py`) returned no TAFs for EDDF on the scenario A date; it appears to hold US forecasts only.
- Ogimet's TAF display returned no reports for a scripted request. It was not pursued further.
- Decision (SPEC 7.1): **the demo scenarios use METAR only.** The UI says "Forecasts (TAF) not available for this archived date; observations (METAR) only". The parser and fact builder support TAF for live data and for eval cases.

## Live METAR/TAF (optional, later)

- aviationweather.gov Data API, for an optional "check now" button. Not used yet.

## Fixtures

`data/weather/<scenario>/<ICAO>-METAR.txt`: one report per line, prefixed by IEM's archive timestamp. Each has a JSON sidecar with the exact query URL, retrieval time, SHA-256 of the file and the SPEC 7.3 windows it covers. Fixtures are never edited; `npm run weather:fetch -- --scenario=A --force` replaces them.

## Date search

`npm run weather:dates -- <IEM CSV>` ranks dates against `docs/DEMO.md` 2.1. Run on 2025-11-01 to 2026-02-28:
- Scenario A: 12 dates qualified. 2026-01-24 was chosen: CAVOK at EDDF and OMDB in every report, and LEMD 9999 with FEW or SCT cloud only.
- Scenario B: 2026-01-22 was the only date that qualified.
