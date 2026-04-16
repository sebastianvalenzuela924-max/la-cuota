import { HandCoins } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { TipType, Currency } from '@/lib/types';
import { formatCurrency, roundValue } from '@/lib/bill-utils';

interface Props {
  tipType: TipType;
  tipValue: number;
  subtotal: number;
  currency: Currency;
  onTypeChange: (t: TipType) => void;
  onValueChange: (v: number) => void;
}

export default function TipSection({ tipType, tipValue, subtotal, currency, onTypeChange, onValueChange }: Props) {
  const val = tipType === 'percent' ? subtotal * tipValue / 100 : tipValue;
  const tipAmount = roundValue(val, currency);

  const fmt = (n: number) => formatCurrency(n, currency);
  const symbol = currency === 'BRL' ? 'R$' : '$';

  return (
    <section className="rounded-2xl bg-card p-5 card-shadow animate-fade-in-up border border-border">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <HandCoins className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-bold text-foreground">Propina</h2>
      </div>

      <div className="flex gap-2 mb-4">
        <Button
          variant={tipType === 'percent' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onTypeChange('percent')}
          className="text-xs rounded-xl font-semibold"
        >
          Porcentaje %
        </Button>
        <Button
          variant={tipType === 'fixed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onTypeChange('fixed')}
          className="text-xs rounded-xl font-semibold"
        >
          Monto fijo {symbol}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Input
          type="number"
          value={tipValue || ''}
          onChange={e => onValueChange(parseFloat(e.target.value) || 0)}
          placeholder={tipType === 'percent' ? 'Ej: 10' : 'Ej: 5000'}
          className="w-32 text-sm rounded-xl h-10"
          inputMode="numeric"
        />
        {tipValue > 0 && (
          <span className="text-sm text-muted-foreground font-medium">
            = {fmt(tipAmount)}
          </span>
        )}
      </div>

      <div className="flex gap-2 mt-3">
        {tipType === 'percent' && [5, 10, 15, 20].map(v => (
          <button
            key={v}
            onClick={() => onValueChange(v)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
              tipValue === v
                ? 'bg-primary text-primary-foreground'
                : 'bg-accent text-muted-foreground hover:text-primary'
            }`}
          >
            {v}%
          </button>
        ))}
      </div>
    </section>
  );
}
