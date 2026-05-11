import { useEffect, useState } from "react";

export const CURRENCY_OPTIONS: { code: string; label: string }[] = [
  { code: "ARS", label: "Peso argentino" },
  { code: "CLP", label: "Peso chileno" },
  { code: "BRL", label: "Real brasileño" },
  { code: "UYU", label: "Peso uruguayo" },
  { code: "PEN", label: "Sol peruano" },
  { code: "COP", label: "Peso colombiano" },
  { code: "MXN", label: "Peso mexicano" },
  { code: "BOB", label: "Boliviano" },
  { code: "PYG", label: "Guaraní" },
  { code: "VES", label: "Bolívar" },
  { code: "USD", label: "Dólar estadounidense" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "Libra esterlina" },
];

type RatesPayload = {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h
const cache = new Map<string, RatesPayload>();

async function fetchRates(base: string): Promise<RatesPayload> {
  const cached = cache.get(base);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  const stored = typeof window !== "undefined" ? window.localStorage.getItem(`fx_rates_${base}`) : null;
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as RatesPayload;
      if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
        cache.set(base, parsed);
        return parsed;
      }
    } catch { /* ignore */ }
  }

  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!res.ok) throw new Error(`No pudimos obtener tasas (${res.status})`);
  const data = await res.json();
  if (data.result !== "success" || !data.rates) {
    throw new Error("Respuesta de tasas inválida");
  }
  const payload: RatesPayload = {
    base,
    rates: data.rates as Record<string, number>,
    fetchedAt: Date.now(),
  };
  cache.set(base, payload);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(`fx_rates_${base}`, JSON.stringify(payload));
    } catch { /* ignore */ }
  }
  return payload;
}

export function useExchangeRates(base: string) {
  const [rates, setRates] = useState<Record<string, number> | null>(() => cache.get(base)?.rates ?? null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(() => cache.get(base)?.fetchedAt ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchRates(base)
      .then((p) => {
        if (!active) return;
        setRates(p.rates);
        setFetchedAt(p.fetchedAt);
      })
      .catch((e: Error) => {
        if (!active) return;
        setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [base]);

  const convert = (amount: number, target: string): number | null => {
    if (target === base) return amount;
    if (!rates) return null;
    const rate = rates[target];
    if (!rate) return null;
    return amount * rate;
  };

  return { rates, fetchedAt, loading, error, convert };
}
