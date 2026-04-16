import type { Currency } from '@/lib/types';
import { getCurrencyFlag } from '@/lib/bill-utils';

interface Props {
  currency: Currency;
  onChange: (c: Currency) => void;
}

export default function CurrencySelector({ currency, onChange }: Props) {
  return (
    <div className="flex gap-1.5 bg-accent rounded-xl p-1">
      {(['CLP', 'BRL'] as Currency[]).map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            currency === c
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>{getCurrencyFlag(c)}</span>
          <span>{c}</span>
        </button>
      ))}
    </div>
  );
}
