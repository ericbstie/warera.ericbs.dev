import { useEffect, useState } from "react";

const SPECIALIZATION_BONUS: Record<number, number> = { 1: 10, 2: 30 };
const CONCURRENCY = 8;

export type Taxes = { income: number; market: number; selfWork: number };

export type Country = {
  _id: string;
  name: string;
  taxes: Taxes;
  specializedItem?: string;
  rulingParty?: string;
  strategicResources?: { bonuses?: { productionPercent?: number } };
};

export type Placement = {
  country: string;
  strategicBonus: number;
  specializationBonus: number;
  totalBonus: number;
  taxes: Taxes;
};

export async function fetchCountries(): Promise<Country[]> {
  const res = await fetch("https://api2.warera.io/trpc/country.getAllCountries?input=%7B%7D");
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return Object.values(json.result.data);
}

export async function fetchIndustrialism(countries: Country[]): Promise<Record<string, number>> {
  const specializing = countries.filter(country => country.specializedItem && country.rulingParty);
  const levels: Record<string, number> = {};
  let next = 0;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < specializing.length) {
        const country = specializing[next++]!;
        const input = encodeURIComponent(JSON.stringify({ partyId: country.rulingParty }));
        try {
          const res = await fetch(`https://api2.warera.io/trpc/party.getById?input=${input}`);
          const json = await res.json();
          levels[country._id] = json.result?.data?.ethics?.industrialism ?? 0;
        } catch {
          levels[country._id] = 0;
        }
      }
    }),
  );

  return levels;
}

export function rankPlacements(
  countries: Country[],
  industrialism: Record<string, number>,
  itemCode: string,
  limit = 10,
): Placement[] {
  return countries
    .map(country => {
      const strategicBonus = country.strategicResources?.bonuses?.productionPercent ?? 0;
      const specializationBonus =
        country.specializedItem === itemCode
          ? (SPECIALIZATION_BONUS[industrialism[country._id] ?? 0] ?? 0)
          : 0;
      return {
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
  const [industrialism, setIndustrialism] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCountries()
      .then(async list => {
        if (cancelled) return;
        const levels = await fetchIndustrialism(list);
        if (cancelled) return;
        setCountries(list);
        setIndustrialism(levels);
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
