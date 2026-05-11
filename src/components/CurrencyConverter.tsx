import { ArrowLeftRight, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCY_OPTIONS } from "@/lib/currency";

type Props = {
  baseCurrency: string;
  targetCurrency: string;
  onTargetChange: (code: string) => void;
  loading?: boolean;
  error?: string | null;
  fetchedAt?: number | null;
};

export function CurrencyConverter({
  baseCurrency,
  targetCurrency,
  onTargetChange,
  loading,
  error,
  fetchedAt,
}: Props) {
  const baseOption =
    CURRENCY_OPTIONS.find((c) => c.code === baseCurrency) ?? {
      code: baseCurrency,
      label: baseCurrency,
    };

  const options = CURRENCY_OPTIONS.some((c) => c.code === baseCurrency)
    ? CURRENCY_OPTIONS
    : [baseOption, ...CURRENCY_OPTIONS];

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-4 w-4 shrink-0 text-violet-500" />
        <p className="text-sm font-medium">Ver en otra moneda</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
          {baseCurrency}
        </span>
        <span className="text-muted-foreground">→</span>
        <Select value={targetCurrency} onValueChange={onTargetChange}>
          <SelectTrigger className="h-8 w-auto min-w-[150px] rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={baseCurrency}>
              {baseOption.label} ({baseCurrency})
            </SelectItem>
            {options
              .filter((c) => c.code !== baseCurrency)
              .map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label} ({c.code})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {error && (
        <p className="mt-2 text-xs text-destructive">
          Error: {error}
        </p>
      )}
      {fetchedAt && targetCurrency !== baseCurrency && !error && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Actualizado: {new Date(fetchedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
