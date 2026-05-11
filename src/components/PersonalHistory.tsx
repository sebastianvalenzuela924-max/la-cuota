import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Receipt, Tag, User, HandCoins, Filter, Search } from "lucide-react";
import { formatMoney, type ExpenseWithContribs } from "@/lib/balances";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category } from "@/components/CategoryPicker";
import { useExchangeRates } from "@/lib/currency";
import { CurrencyConverter } from "@/components/CurrencyConverter";

type Member = { id: string; name: string };

type Props = {
  members: Member[];
  expenses: (ExpenseWithContribs & { category_id: string | null; is_personal?: boolean })[];
  categories: Category[];
  currency: string;
  selectedId?: string | null;
  onSelectedIdChange?: (id: string) => void;
};

const SETTLEMENT_LABEL = "Pagos / Saldos";

export function PersonalHistory({ members, expenses, categories, currency, selectedId: propSelectedId, onSelectedIdChange }: Props) {
  const [localSelectedId, setLocalSelectedId] = useState<string>("");
  const selectedId = propSelectedId !== undefined ? propSelectedId || "" : localSelectedId;

  const handleSelectedIdChange = (id: string) => {
    if (onSelectedIdChange) onSelectedIdChange(id);
    else setLocalSelectedId(id);
  };
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [displayCurrency, setDisplayCurrency] = useState<string>(currency);
  const [showConverter, setShowConverter] = useState(false);
  const { convert, loading: ratesLoading, error: ratesError, fetchedAt } = useExchangeRates(currency);

  const fmt = (amount: number) => {
    const target = showConverter ? displayCurrency : currency;
    if (target === currency) return formatMoney(amount, currency);
    const converted = convert(amount, target);
    if (converted == null) return formatMoney(amount, currency);
    return formatMoney(converted, target);
  };

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const defaultCategory = useMemo(() => categories.find((c) => c.is_default) ?? null, [categories]);
  const otrosName = defaultCategory?.name ?? "Otros";

  const memberNameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const personalRows = useMemo(() => {
    if (!selectedId) return [];
    const rows: {
      expense: ExpenseWithContribs & { category_id: string | null; is_personal?: boolean };
      paid: number;
      consumed: number;
      total: number;
      categoryName: string;
      isSettlement: boolean;
      isPersonal: boolean;
      settlementDirection?: "sent" | "received";
      counterpartyName?: string;
    }[] = [];
    for (const ex of expenses) {
      const c = ex.contributions.find((x) => x.member_id === selectedId);
      if (!c) continue;

      if (ex.is_settlement) {
        const isPayer = c.amount_paid > 0;
        const isReceiver = c.amount_owed > 0;
        if (!isPayer && !isReceiver) continue;
        const other = ex.contributions.find((x) => x.member_id !== selectedId);
        const otherName = other ? memberNameById.get(other.member_id) ?? "?" : "?";
        rows.push({
          expense: ex,
          paid: c.amount_paid,
          consumed: 0,
          total: ex.total_amount,
          categoryName: SETTLEMENT_LABEL,
          isSettlement: true,
          isPersonal: false,
          settlementDirection: isPayer ? "sent" : "received",
          counterpartyName: otherName,
        });
        continue;
      }

      if (ex.is_personal) {
        const catName = ex.category_id ? categoryById.get(ex.category_id)?.name ?? otrosName : otrosName;
        rows.push({
          expense: ex,
          paid: ex.total_amount,
          consumed: ex.total_amount,
          total: ex.total_amount,
          categoryName: catName,
          isSettlement: false,
          isPersonal: true,
        });
        continue;
      }

      const sumOwed = ex.contributions.reduce((s, cc) => s + (cc.amount_owed || 0), 0);
      const useOwed = sumOwed > 0.01;
      const consumed = useOwed ? c.amount_owed || 0 : ex.total_amount / ex.contributions.length;
      const catName = ex.category_id ? categoryById.get(ex.category_id)?.name ?? otrosName : otrosName;
      rows.push({
        expense: ex,
        paid: c.amount_paid,
        consumed,
        total: ex.total_amount,
        categoryName: catName,
        isSettlement: false,
        isPersonal: false,
      });
    }
    return rows;
  }, [selectedId, expenses, categoryById, otrosName, memberNameById]);

  const totalConsumedShared = personalRows.filter((r) => !r.isPersonal && !r.isSettlement).reduce((s, r) => s + r.consumed, 0);
  const totalPersonal = personalRows.filter((r) => r.isPersonal).reduce((s, r) => s + r.expense.total_amount, 0);
  const totalConsumed = totalConsumedShared + totalPersonal;
  const totalPaid = personalRows.reduce((s, r) => s + r.paid, 0);

  const availableCategoryNames = useMemo(() => Array.from(new Set(personalRows.map((r) => r.categoryName))).sort(), [personalRows]);

  const filteredRows = useMemo(() => {
    return personalRows.filter((r) => {
      const matchesCategory = categoryFilter === "all" || r.categoryName === categoryFilter;
      const matchesSearch = r.expense.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (r.counterpartyName || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [personalRows, categoryFilter, searchQuery]);

  const personalCategoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of personalRows) {
      if (r.isSettlement) continue;
      const current = map.get(r.categoryName) ?? 0;
      map.set(r.categoryName, current + r.consumed);
    }
    return Array.from(map.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }, [personalRows]);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-violet-500" /> Mi historial
          </CardTitle>
          <CardDescription className="text-xs">Elegí tu nombre para ver tus estadísticas.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedId} onValueChange={handleSelectedIdChange}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Seleccioná una persona..." /></SelectTrigger>
            <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedId && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estadísticas</h3>
            <Button 
              variant="ghost" 
              size="sm" 
              className={`h-7 text-[10px] rounded-lg gap-1.5 ${showConverter ? 'bg-violet-100 text-violet-700' : 'text-muted-foreground'}`}
              onClick={() => setShowConverter(!showConverter)}
            >
              <HandCoins className="w-3 h-3" />
              {showConverter ? 'Ocultar conversor' : 'Ver en otra moneda'}
            </Button>
          </div>

          {showConverter && (
            <CurrencyConverter 
              baseCurrency={currency} 
              targetCurrency={displayCurrency} 
              onTargetChange={setDisplayCurrency} 
              loading={ratesLoading} 
              error={ratesError} 
              fetchedAt={fetchedAt} 
            />
          )}
          <div className="grid grid-cols-3 gap-2">
            <Card className="rounded-2xl p-3 border-emerald-500/20 bg-emerald-500/5">
              <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight">Total Aportado</p>
              <p className="text-lg font-bold tabular-nums text-emerald-600">{fmt(totalPaid)}</p>
            </Card>
            <Card className="rounded-2xl p-3">
              <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight">Consumido Total</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{fmt(totalConsumed)}</p>
            </Card>
            <Card className="rounded-2xl p-3 border-violet-500/20 bg-violet-500/5">
              <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight">Gasto Personal</p>
              <p className="text-lg font-bold tabular-nums text-violet-600">{fmt(totalPersonal)}</p>
            </Card>
          </div>

          {personalCategoryTotals.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {personalCategoryTotals.map(ct => (
                <button 
                  key={ct.name} 
                  onClick={() => setCategoryFilter(categoryFilter === ct.name ? 'all' : ct.name)}
                  className={`shrink-0 bg-card border rounded-xl px-3 py-2 text-center min-w-[100px] transition-all active:scale-95 ${categoryFilter === ct.name ? 'border-violet-600 bg-violet-50' : 'border-border/50 hover:border-violet-300'}`}
                >
                  <p className="text-[9px] text-muted-foreground uppercase font-bold">{ct.name}</p>
                  <p className={`text-xs font-bold ${categoryFilter === ct.name ? 'text-violet-600' : ''}`}>{fmt(ct.total)}</p>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Buscar en historial..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="rounded-xl pl-9 h-10 text-sm"
                />
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[140px] rounded-xl h-10 text-xs">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {availableCategoryNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="rounded-2xl">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-1.5"><Receipt className="w-4 h-4" /> Detalle de gastos</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {filteredRows.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">Sin gastos registrados.</p> : 
                filteredRows.map(r => (
                  <div key={r.expense.id} className={`p-3 rounded-xl border flex justify-between items-center ${r.isSettlement ? 'bg-emerald-50 border-emerald-100' : r.isPersonal ? 'bg-violet-50 border-violet-100' : 'bg-card'}`}>
                    <div>
                      <p className="text-xs font-semibold truncate max-w-[150px]">{r.isSettlement ? (r.settlementDirection === 'sent' ? `Pagaste a ${r.counterpartyName}` : `${r.counterpartyName} te pagó`) : r.expense.description}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(r.expense.expense_date).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums">{fmt(r.isSettlement ? r.expense.total_amount : r.consumed)}</p>
                      <p className="text-[9px] text-muted-foreground">Tu parte</p>
                    </div>
                  </div>
                ))
              }
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
