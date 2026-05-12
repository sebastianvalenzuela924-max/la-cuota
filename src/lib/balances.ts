// Lógica de balances y simplificación de deudas para Saldamos.
export type Member = { id: string; name: string };

export type ExpenseWithContribs = {
  id: string;
  description: string;
  total_amount: number;
  expense_date: string;
  created_at?: string;
  is_settlement: boolean;
  is_personal?: boolean;
  track_payments?: boolean;
  contributions: { id?: string; member_id: string; amount_paid: number; amount_owed: number; is_settled?: boolean }[];
};

export type Balance = { memberId: string; name: string; balance: number };

export function computeBalances(
  members: Member[],
  expenses: ExpenseWithContribs[],
): Balance[] {
  const map = new Map<string, number>();
  for (const m of members) map.set(m.id, 0);

  for (const exp of expenses) {
    if (exp.is_personal) continue; // gastos personales no afectan balance grupal
    const participants = exp.contributions;
    if (participants.length === 0) continue;
    
    // Si hay algún "consumió" registrado (distinto de 0), se usa eso. Sino, fallback a partes iguales.
    const hasSpecificOwed = participants.some(c => Math.abs(c.amount_owed) > 0.01);
    const equalShare = exp.total_amount / participants.length;
    
    for (const c of participants) {
      const owed = hasSpecificOwed ? (Number(c.amount_owed) || 0) : equalShare;
      const current = map.get(c.member_id) ?? 0;
      map.set(c.member_id, current + (Number(c.amount_paid) - owed));
    }
  }

  return members.map((m) => ({
    memberId: m.id,
    name: m.name,
    balance: round2(map.get(m.id) ?? 0),
  }));
}

export type Settlement = { from: string; fromName: string; to: string; toName: string; amount: number };

export function simplifyDebts(balances: Balance[]): Settlement[] {
  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ ...b, balance: -b.balance }))
    .sort((a, b) => b.balance - a.balance);
  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance);

  const result: Settlement[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amount = Math.min(d.balance, c.balance);
    if (amount > 0.01) {
      result.push({
        from: d.memberId,
        fromName: d.name,
        to: c.memberId,
        toName: c.name,
        amount: round2(amount),
      });
    }
    d.balance -= amount;
    c.balance -= amount;
    if (d.balance < 0.01) i++;
    if (c.balance < 0.01) j++;
  }
  return result;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('es-CL')}`;
  }
}
