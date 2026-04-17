import { Receipt, Copy, Share2, TrendingUp, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useState, useEffect, useCallback } from 'react';
import type { Product, Person, TipType, PersonTotal, BankData, Currency } from '@/lib/types';
import { formatCurrency, PERSON_COLORS, getInitials, generateSummaryText, roundValue } from '@/lib/bill-utils';
import { toast } from 'sonner';

interface Props {
  products: Product[];
  people: Person[];
  totals: Record<string, PersonTotal>;
  tipType: TipType;
  tipValue: number;
  bankData: Partial<BankData>;
  currency: Currency;
}

export default function SummarySection({ products, people, totals, tipType, tipValue, bankData, currency }: Props) {
  const [showConversion, setShowConversion] = useState(false);
  const [targetCurrency, setTargetCurrency] = useState<Currency>(currency === 'BRL' ? 'CLP' : 'BRL');
  const [exchangeRate, setExchangeRate] = useState(currency === 'BRL' ? 175 : 0.0057);
  const [isAutoRate, setIsAutoRate] = useState(true);
  const [isLoadingRate, setIsLoadingRate] = useState(false);

  // Reset target if base currency changes to be the same
  useEffect(() => {
    if (targetCurrency === currency) {
      setTargetCurrency(currency === 'BRL' ? 'CLP' : 'BRL');
    }
  }, [currency, targetCurrency]);

  const fetchLiveRate = useCallback(async () => {
    setIsLoadingRate(true);
    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${currency}`);
      const data = await response.json();
      if (data.result === 'success' && data.rates[targetCurrency]) {
        const rate = data.rates[targetCurrency];
        setExchangeRate(targetCurrency === 'CLP' ? Math.round(rate) : parseFloat(rate.toFixed(4)));
      }
    } catch (error) {
      toast.error('No se pudo obtener el cambio en vivo');
      setIsAutoRate(false);
    } finally {
      setIsLoadingRate(false);
    }
  }, [currency, targetCurrency]);

  useEffect(() => {
    if (showConversion && isAutoRate) {
      fetchLiveRate();
    }
  }, [showConversion, isAutoRate, fetchLiveRate]);

  const fmt = (n: number) => formatCurrency(n, currency);
  const fmtTarget = (n: number) => formatCurrency(n * exchangeRate, targetCurrency);
  
  const subtotal = products.reduce((s, p) => s + p.price * p.quantity, 0);
  
  const val = tipType === 'percent' ? subtotal * tipValue / 100 : tipValue;
  const tipAmount = roundValue(val, currency);
  const grandTotal = roundValue(subtotal + tipAmount, currency);

  const hasPeople = people.some(p => totals[p.id]?.total > 0);

  if (!hasPeople) return null;

  const summaryText = generateSummaryText(
    products, 
    people, 
    totals, 
    tipType, 
    tipValue, 
    bankData, 
    currency, 
    targetCurrency,
    showConversion ? exchangeRate : undefined
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      toast.success('Resumen copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(summaryText)}`, '_blank');
  };

  return (
    <section className="rounded-2xl bg-card p-5 card-shadow-lg animate-fade-in-up border border-primary/20">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Receipt className="w-4 h-4 text-primary-foreground" />
        </div>
        <h2 className="font-bold text-foreground">Resumen</h2>
      </div>

      <div className="flex justify-between items-center mb-1.5 text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-semibold text-foreground">{fmt(subtotal)}</span>
      </div>
      {tipAmount > 0 && (
        <div className="flex justify-between items-center mb-1.5 text-sm">
          <span className="text-muted-foreground">Propina</span>
          <span className="font-semibold text-foreground">{fmt(tipAmount)}</span>
        </div>
      )}
      <div className="flex justify-between items-center mb-5 text-base border-t border-border pt-3 mt-2">
        <div className="flex flex-col">
          <span className="font-bold text-foreground">Total</span>
          {showConversion && (
            <span className="text-sm text-primary font-bold">Equiv. {fmtTarget(grandTotal)}</span>
          )}
        </div>
        <span className="font-extrabold text-primary text-xl">{fmt(grandTotal)}</span>
      </div>

      {currency === 'BRL' && (
        <div className="mb-6 p-3.5 bg-primary/5 rounded-2xl border border-primary/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <Label htmlFor="conversion-toggle" className="text-sm font-bold cursor-pointer">Modo Turista (CLP)</Label>
            </div>
            <Switch 
              id="conversion-toggle" 
              checked={showConversion} 
              onCheckedChange={setShowConversion}
            />
          </div>
          {showConversion && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Convertir a</span>
                <div className="flex flex-wrap gap-2">
                  {(['CLP', 'BRL', 'USD', 'EUR'] as Currency[]).map((cur) => {
                    if (cur === currency) return null;
                    const isActive = targetCurrency === cur;
                    return (
                      <button
                        key={cur}
                        onClick={() => setTargetCurrency(cur)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                          isActive 
                            ? 'bg-primary text-primary-foreground border-primary' 
                            : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                        }`}
                      >
                        <span className="text-sm">
                          {cur === 'CLP' ? '🇨🇱' : cur === 'BRL' ? '🇧🇷' : cur === 'USD' ? '🇺🇸' : '🇪🇺'}
                        </span>
                        {cur}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Configuración de cambio</span>
                <div className="flex items-center gap-2">
                  <span className={isAutoRate ? "text-[10px] font-bold text-primary" : "text-[10px] font-medium text-muted-foreground"}>
                    {isAutoRate ? 'En vivo' : 'Manual'}
                  </span>
                  <Switch 
                    className="h-4 w-7 scale-75"
                    checked={isAutoRate} 
                    onCheckedChange={(checked) => {
                      setIsAutoRate(checked);
                      if (checked) fetchLiveRate();
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">1 {currency === 'BRL' ? 'Real' : currency} =</span>
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-bold">
                    {targetCurrency === 'EUR' ? '€' : '$'}
                  </span>
                  <Input 
                    type="number"
                    value={exchangeRate}
                    onChange={e => {
                      setExchangeRate(parseFloat(e.target.value) || 0);
                      setIsAutoRate(false);
                    }}
                    className={`h-8 text-xs pl-5 rounded-lg transition-colors ${isAutoRate ? 'bg-primary/5 border-primary/20 font-bold text-primary' : ''}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-medium mr-1">{targetCurrency}</span>
                {isAutoRate && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-7 w-7 rounded-lg ${isLoadingRate ? 'animate-spin' : ''}`}
                    onClick={fetchLiveRate}
                    disabled={isLoadingRate}
                  >
                    <RefreshCcw className="h-3.5 w-3.5 text-primary" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 mb-5">
        {people.map(person => {
          const pt = totals[person.id];
          if (!pt || pt.total === 0) return null;
          const color = PERSON_COLORS[person.colorIndex];

          return (
            <div key={person.id} className="bg-accent/50 rounded-xl p-3.5 animate-scale-in">
              <div className="flex items-center gap-2.5 mb-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: color.bg, color: color.fg }}
                >
                  {getInitials(person.name)}
                </div>
                <span className="font-semibold text-foreground text-sm flex-1">{person.name}</span>
                  <div className="flex flex-col items-end">
                    <span className="font-bold text-foreground text-base leading-none">{fmt(pt.total)}</span>
                    {showConversion && (
                      <span className="text-xs text-primary font-bold mt-1">~ {fmtTarget(pt.total)}</span>
                    )}
                  </div>
              </div>
              <div className="pl-10 space-y-0.5">
                {pt.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-[10px] leading-tight text-muted-foreground">
                    <span className="flex-1 mr-2">
                      {item.name} 
                      {item.tipAmount > 0 && (
                        <span className="block text-[9px] opacity-70">
                          ({fmt(item.baseAmount)} + {fmt(item.tipAmount)} propina)
                        </span>
                      )}
                    </span>
                    <span className="font-medium shrink-0 self-start">{fmt(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1 text-xs gap-1.5 rounded-xl font-semibold">
          <Copy className="w-3.5 h-3.5" />
          Copiar
        </Button>
        <Button size="sm" onClick={handleWhatsApp} className="flex-1 text-xs gap-1.5 rounded-xl font-semibold bg-[hsl(142,70%,40%)] hover:bg-[hsl(142,70%,35%)] text-primary-foreground">
          <Share2 className="w-3.5 h-3.5" />
          WhatsApp
        </Button>
      </div>
    </section>
  );
}
