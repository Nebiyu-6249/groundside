// Great circle distance and compensation band (Art 7(1), 7(4); C-559/16 Bossen).

import type { Airport } from "./airports";
import { step } from "./trace";
import type { Band, TraceStep } from "./types";

export const EARTH_RADIUS_KM = 6371.0;
export const DISTANCE_FORMULA = "haversine, earth radius 6371.0 km, rounded down to whole km";

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Haversine distance in whole km (rounded down). */
export function greatCircleKm(a: Pick<Airport, "lat" | "lon">, b: Pick<Airport, "lat" | "lon">): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.floor(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h))));
}

export function isIntraCommunity(from: Airport, to: Airport): boolean {
  return from.scope === "EU261" && to.scope === "EU261";
}

export function bandFor(distanceKm: number, intraCommunity: boolean): Band {
  if (distanceKm <= 1500) return "B1";
  if (intraCommunity || distanceKm <= 3500) return "B2";
  return "B3";
}

export const BAND_AMOUNT_CENTS: Record<Band, number> = { B1: 25_000, B2: 40_000, B3: 60_000 };

/** Distance from the first departure to the final destination of the booking, with its trace. */
export function journeyDistance(firstDeparture: Airport, finalDestination: Airport) {
  const distanceKm = greatCircleKm(firstDeparture, finalDestination);
  const intraCommunity = isIntraCommunity(firstDeparture, finalDestination);
  const band = bandFor(distanceKm, intraCommunity);
  const trace: TraceStep[] = [
    step(
      "REG-2-H",
      { finalDestination: finalDestination.icao },
      `Final destination is ${finalDestination.iata} (${finalDestination.city}), the destination of the last flight in the booking`,
    ),
    step(
      "CJEU-C-559-16",
      { from: firstDeparture.icao, to: finalDestination.icao },
      "Distance is measured from the first departure airport to the final destination, not the sum of the legs",
    ),
    step(
      "REG-7-4",
      { from: firstDeparture.icao, to: finalDestination.icao, formula: DISTANCE_FORMULA, earthRadiusKm: EARTH_RADIUS_KM, distanceKm },
      `Great circle distance ${firstDeparture.iata} to ${finalDestination.iata}: ${distanceKm} km`,
    ),
    step(
      "REG-7-1",
      { distanceKm, intraCommunity, band, amountEur: BAND_AMOUNT_CENTS[band] / 100 },
      `${distanceKm} km, ${intraCommunity ? "intra-Community" : "not intra-Community"}: band ${band}, ${BAND_AMOUNT_CENTS[band] / 100} EUR`,
    ),
  ];
  return { distanceKm, intraCommunity, band, trace };
}

/** Article 6 and 7(2) thresholds by band, in minutes (2, 3 or 4 hours). */
export const BAND_THRESHOLD_MINUTES: Record<Band, number> = { B1: 120, B2: 180, B3: 240 };
