import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Receipt, Tag, User, HandCoins } from "lucide-react";
import { formatMoney, type ExpenseWithContribs } from "@/lib/balances";
import type { Category } from "@/components/CategoryPicker";
import { useExchangeRates } from "@/lib/currency";
import { CurrencyConverter } from "@/components/CurrencyConverter";

type Member = { id: string; name: string };

type Props = {
  members: Member[];
  expenses: (ExpenseWithContribs & { category_id: string | null; is_personal?: boolean })[];
  categories: Category[];
  currency: string;
};

const SETTLEMENT_LABEL = "Pagos / Saldos";

export function PersonalHistory({ members, expenses, categories, currency }: Props) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [displayCurrency, setDisplayCurrency] = useState<string>(currency);
  const { convert, loading: ratesLoading, error: ratesError, fetchedAt } = useExchangeRates(currency);

  const fmt = (amount: number) => {
    if (displayCurrency === currency) return formatMoney(amount, currency);
    const converted = convert(amount, displayCurrency);
    if (converted == null) return formatMoney(amount, currency);
    return formatMoney(converted, displayCurrency);
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

  const filteredRows = useMemo(() => categoryFilter === "all" ? personalRows : personalRows.filter((r) => r.categoryName === categoryFilter), [personalRows, categoryFilter]);

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
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Seleccioná una persona..." /></SelectTrigger>
            <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedId && (
        <>
          <CurrencyConverter baseCurrency={currency} targetCurrency={displayCurrency} onTargetChange={setDisplayCurrency} loading={ratesLoading} error={ratesError} fetchedAt={fetchedAt} />
          <div className="grid grid-cols-2 gap-2">
            <Card className="rounded-2xl p-4">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Consumido</p>
              <p className="text-xl font-bold tabular-nums text-foreground">{fmt(totalConsumed)}</p>
            </Card>
            <Card className="rounded-2xl p-4 border-violet-500/20 bg-violet-500/5">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Gasto Personal</p>
              <p className="text-xl font-bold tabular-nums text-violet-600">{fmt(totalPersonal)}</p>
            </Card>
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
