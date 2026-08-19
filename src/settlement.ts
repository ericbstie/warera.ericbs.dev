import { useEffect, useState } from "react";
import { isFiniteNumber } from "./hooks";

const SPECIALIZATION_BONUS: Record<number, number> = { 1: 10, 2: 30 };
const CONCURRENCY = 8;

export type Taxes = { income: number; market: number; selfWork: number };

export type Country = {
  _id: string;
  name: string;
  taxes?: Taxes;
  specializedItem?: string;
  rulingParty?: string;
  strategicResources?: { bonuses?: { productionPercent?: number } };
};

export type Placement = {
  /** The country's own id: two countries can share a display name, or lack one. */
  id: string;
  country: string;
  strategicBonus: number;
  specializationBonus: number;
  totalBonus: number;
  taxes?: Taxes;
};

/**
 * `complete` is false when some level had to be assumed rather than read. The
 * assumed value is 0, which is also a real industrialism level, so without this
 * flag a total outage and a world where nobody specializes look identical.
 */
export type Industrialism = { levels: Record<string, number>; complete: boolean };

export async function fetchCountries(): Promise<Country[]> {
  const res = await fetch("/api/trpc/country.getAllCountries?input=%7B%7D");
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const data = json?.result?.data;
  if (typeof data !== "object" || data === null) throw new Error("Country list came back in an unexpected shape");
  return Object.values(data);
}

/**
 * One request for the whole grid. Falls back to asking per country so the page
 * still fills in if the aggregate is unavailable.
 */
export async function fetchIndustrialism(countries: Country[]): Promise<Industrialism> {
  try {
    const res = await fetch("/api/industrialism");
    if (res.ok) {
      const levels = await res.json();
      // An aggregate that isn't a plain object of levels is no better than none.
      if (typeof levels === "object" && levels !== null && !Array.isArray(levels) && !levels.error) {
        return { levels, complete: true };
      }
    }
  } catch {
    // fall through to the per-country requests below
  }
  return fetchIndustrialismPerCountry(countries);
}

export async function fetchIndustrialismPerCountry(countries: Country[]): Promise<Industrialism> {
  const specializing = countries.filter(country => country.specializedItem && country.rulingParty);
  const levels: Record<string, number> = {};
  let missing = 0;
  let next = 0;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < specializing.length) {
        const country = specializing[next++]!;
        const input = encodeURIComponent(JSON.stringify({ partyId: country.rulingParty }));
        try {
          const res = await fetch(`/api/trpc/party.getById?input=${input}`);
          if (!res.ok) throw new Error(`party.getById responded ${res.status}`);
          const json = await res.json();
          const level = json?.result?.data?.ethics?.industrialism;
          // A party with no ethics genuinely sits at 0; anything unreadable does not.
          if (level === undefined || level === null) {
            levels[country._id] = 0;
          } else if (isFiniteNumber(level)) {
            levels[country._id] = level;
          } else {
            throw new Error("industrialism was not a number");
          }
        } catch {
          levels[country._id] = 0;
          missing++;
        }
      }
    }),
  );

  return { levels, complete: missing === 0 };
}

export function rankPlacements(
  countries: Country[],
  industrialism: Record<string, number>,
  itemCode: string,
  limit = 10,
): Placement[] {
  return countries
    .map(country => {
      // ?? 0 would pass a numeric string straight through, and "10" + 0 is "100".
      const percent = country.strategicResources?.bonuses?.productionPercent;
      const strategicBonus = isFiniteNumber(percent) ? percent : 0;
      const specializationBonus =
        country.specializedItem === itemCode
          ? (SPECIALIZATION_BONUS[industrialism[country._id] ?? 0] ?? 0)
          : 0;
      return {
        id: country._id,
        country: country.name,
        strategicBonus,
        specializationBonus,
        totalBonus: strategicBonus + specializationBonus,
        taxes: country.taxes,
      };
    })
    .sort((a, b) => b.totalBonus - a.totalBonus)
    .slice(0, limit);
}

export function useSettlementData() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [industrialism, setIndustrialism] = useState<Industrialism>({ levels: {}, complete: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCountries()
      .then(async list => {
        if (cancelled) return;
        const result = await fetchIndustrialism(list);
        if (cancelled) return;
        setCountries(list);
        setIndustrialism(result);
      })
      .catch(err => {
        if (!cancelled) setError(err as Error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { countries, industrialism, loading, error };
}
