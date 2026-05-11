import type { Currency } from '@/lib/types';
import { getCurrencyFlag, getCurrencyLabel } from '@/lib/bill-utils';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  currency: Currency;
  onChange: (c: Currency) => void;
}

const ALL_CURRENCIES: Currency[] = ['CLP', 'ARS', 'COP', 'PEN', 'MXN', 'UYU', 'VES', 'BRL', 'USD', 'EUR'];

export default function CurrencySelector({ currency, onChange }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 bg-accent px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-accent/80 transition-all border border-border/50 outline-none focus-visible:ring-2 ring-primary">
          <Globe className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">{getCurrencyLabel(currency)}</span>
          <span className="sm:hidden">{currency}</span>
          <span>{getCurrencyFlag(currency)}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px] rounded-2xl p-2 shadow-2xl border-border/50 bg-card">
        {ALL_CURRENCIES.map(c => (
          <DropdownMenuItem
            key={c}
            onClick={() => onChange(c)}
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer outline-none transition-colors ${
              currency === c 
                ? 'bg-primary text-primary-foreground font-bold shadow-md' 
                : 'text-foreground hover:bg-accent focus:bg-accent'
            }`}
          >
            <span>{getCurrencyLabel(c)}</span>
            <span className="text-lg">{getCurrencyFlag(c)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
