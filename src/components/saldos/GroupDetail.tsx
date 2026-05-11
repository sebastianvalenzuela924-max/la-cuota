import { useState, useEffect, useMemo } from 'react';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, Plus, UserPlus, Loader2, CheckCircle2, ArrowRight,
  Trash2, Wand2, Sparkles, Users, HandCoins
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { parseLaCuotaMessage, findMemberMatch, type ParsedPerson } from '@/lib/lacuota-parser';

type Group = { id: string; name: string; currency: string; owner_id: string };
type Member = { id: string; name: string };
type Balance = { memberId: string; name: string; balance: number };
type Settlement = { fromName: string; toName: string; amount: number };

// Simple balance computation
function computeBalances(members: Member[], expenses: any[]): Balance[] {
  const bal: Record<string, number> = {};
  members.forEach(m => (bal[m.id] = 0));
  for (const exp of expenses) {
    for (const c of exp.contributions ?? []) {
      if (bal[c.member_id] !== undefined) {
        bal[c.member_id] += c.amount_paid - c.amount_owed;
      }
    }
  }
  return members.map(m => ({ memberId: m.id, name: m.name, balance: bal[m.id] ?? 0 }));
}

function simplifyDebts(balances: Balance[]): Settlement[] {
  const pos = balances.filter(b => b.balance > 0.01).map(b => ({ ...b }));
  const neg = balances.filter(b => b.balance < -0.01).map(b => ({ ...b }));
  const result: Settlement[] = [];
  let i = 0, j = 0;
  while (i < neg.length && j < pos.length) {
    const amount = Math.min(-neg[i].balance, pos[j].balance);
    if (amount > 0.01) result.push({ fromName: neg[i].name, toName: pos[j].name, amount });
    neg[i].balance += amount;
    pos[j].balance -= amount;
    if (Math.abs(neg[i].balance) < 0.01) i++;
    if (Math.abs(pos[j].balance) < 0.01) j++;
  }
  return result;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

// Assignment for the import dialog
const CREATE_NEW = '__create__';
const SKIP = '__skip__';
type Assignment = { parsedName: string; amount: number; target: string };

interface Props {
  groupId: string;
  onBack: () => void;
}

export default function SaldamosGroupDetail({ groupId, onBack }: Props) {
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [savingMember, setSavingMember] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importParsed, setImportParsed] = useState<ParsedPerson[] | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [importing, setImporting] = useState(false);
  const [payFrom, setPayFrom] = useState('');
  const [payTo, setPayTo] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  const load = async () => {
    setLoading(true);
    const [g, m, e] = await Promise.all([
      saldamosSupabase.from('groups').select('id, name, currency, owner_id').eq('id', groupId).maybeSingle(),
      saldamosSupabase.from('group_members').select('id, name').eq('group_id', groupId).order('joined_at', { ascending: true }),
      saldamosSupabase.from('expenses').select('id, description, total_amount, is_settlement, created_at, expense_contributions(member_id, amount_paid, amount_owed)').eq('group_id', groupId).order('created_at', { ascending: false }),
    ]);
    setGroup(g.data ?? null);
    setMembers((m.data ?? []).map((x: any) => ({ id: x.id, name: x.name })));
    setExpenses((e.data ?? []).map((ex: any) => ({
      ...ex,
      contributions: (ex.expense_contributions ?? []).map((c: any) => ({
        member_id: c.member_id,
        amount_paid: Number(c.amount_paid),
        amount_owed: Number(c.amount_owed),
      })),
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [groupId]);

  const balances = useMemo(() => computeBalances(members, expenses), [members, expenses]);
  const settlements = useMemo(() => simplifyDebts(balances), [balances]);
  const currency = group?.currency ?? 'CLP';
  const fmt = (n: number) => formatMoney(n, currency);

  const addMember = async () => {
    if (!memberName.trim()) return;
    setSavingMember(true);
    const { error } = await saldamosSupabase.from('group_members').insert({ group_id: groupId, name: memberName.trim() });
    setSavingMember(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${memberName.trim()} agregado`);
    setMemberName('');
    setMemberOpen(false);
    load();
  };

  // ─── IMPORT FROM LA CUOTA ────────────────────────────────────────────────────
  const handleParseImport = () => {
    if (!importText.trim()) { toast.error('Pega el mensaje de La Cuota primero.'); return; }
    const parsed = parseLaCuotaMessage(importText);
    if (parsed.length === 0) { toast.error('No se detectaron personas. Pega el resumen tal como lo genera La Cuota.'); return; }
    setImportParsed(parsed);
    setAssignments(
      parsed.map(p => ({
        parsedName: p.name,
        amount: p.amount,
        target: findMemberMatch(p.name, members) ?? CREATE_NEW,
      }))
    );
  };

  const handleApplyImport = async () => {
    if (!importParsed) return;
    setImporting(true);

    // 1. Create new members
    const toCreate = assignments
      .filter(a => a.target === CREATE_NEW)
      .map(a => a.parsedName.trim())
      .filter((n, i, arr) => n && arr.indexOf(n) === i);

    const createdMap: Record<string, string> = {};
    if (toCreate.length > 0) {
      const { data, error } = await saldamosSupabase
        .from('group_members')
        .insert(toCreate.map(name => ({ group_id: groupId, name })))
        .select('id, name');
      if (error || !data) { setImporting(false); toast.error('No se pudieron crear miembros'); return; }
      (data as any[]).forEach((m: any) => (createdMap[m.name] = m.id));
    }

    // 2. Build consumed map
    const consumed: Record<string, number> = {};
    for (const a of assignments) {
      if (a.target === SKIP) continue;
      const id = a.target === CREATE_NEW ? createdMap[a.parsedName.trim()] : a.target;
      if (!id) continue;
      consumed[id] = (consumed[id] ?? 0) + a.amount;
    }

    // 3. Create expense with individual contributions
    const total = Object.values(consumed).reduce((s, v) => s + v, 0);
    const { data: exp, error: expErr } = await saldamosSupabase
      .from('expenses')
      .insert({ group_id: groupId, description: 'Importado desde La Cuota', total_amount: total })
      .select('id').single();
    if (expErr || !exp) { setImporting(false); toast.error(expErr?.message ?? 'Error al crear gasto'); return; }

    // Each person: amount_paid = 0 (nobody "paid" the bill via the app), amount_owed = their share
    // The "payer" (who put their card) should be registered separately via "Registrar pago"
    const contribs = Object.entries(consumed).map(([member_id, amount]) => ({
      expense_id: (exp as any).id,
      member_id,
      amount_paid: 0,
      amount_owed: amount,
    }));
    const { error: cErr } = await saldamosSupabase.from('expense_contributions').insert(contribs);
    setImporting(false);
    if (cErr) { toast.error(cErr.message); return; }

    toast.success('✅ Consumos importados desde La Cuota');
    setImportOpen(false);
    setImportText('');
    setImportParsed(null);
    setAssignments([]);
    load();
  };

  // ─── REGISTER PAYMENT ────────────────────────────────────────────────────────
  const registerPayment = async () => {
    const amount = Number(payAmount);
    if (!payFrom || !payTo || !amount) { toast.error('Completa todos los campos'); return; }
    if (payFrom === payTo) { toast.error('El pagador y receptor no pueden ser el mismo'); return; }
    setSavingPayment(true);
    const fromName = members.find(m => m.id === payFrom)?.name ?? '?';
    const toName = members.find(m => m.id === payTo)?.name ?? '?';
    const { data: exp, error: expErr } = await saldamosSupabase
      .from('expenses')
      .insert({ group_id: groupId, description: `Pago: ${fromName} → ${toName}`, total_amount: amount, is_settlement: true })
      .select('id').single();
    if (expErr || !exp) { setSavingPayment(false); toast.error(expErr?.message ?? 'Error'); return; }
    await saldamosSupabase.from('expense_contributions').insert([
      { expense_id: (exp as any).id, member_id: payFrom, amount_paid: amount, amount_owed: 0 },
      { expense_id: (exp as any).id, member_id: payTo, amount_paid: 0, amount_owed: amount },
    ]);
    setSavingPayment(false);
    toast.success(`Pago de ${fmt(amount)} registrado`);
    setPayFrom(''); setPayTo(''); setPayAmount('');
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!group) return <div className="text-center py-8 text-muted-foreground">Grupo no encontrado. <button onClick={onBack} className="text-primary underline">Volver</button></div>;

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div>
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Mis grupos
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">{group.name}</h2>
            <p className="text-xs text-muted-foreground">{members.length} participantes · {currency}</p>
          </div>
          <div className="flex gap-1 flex-wrap justify-end">
            <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1" onClick={() => setMemberOpen(true)}>
              <UserPlus className="w-3.5 h-3.5" /> Persona
            </Button>
            <Button
              size="sm"
              className="rounded-xl text-xs gap-1 bg-gradient-to-r from-violet-500 to-indigo-600 text-white hover:opacity-90"
              onClick={() => { setImportText(''); setImportParsed(null); setAssignments([]); setImportOpen(true); }}
            >
              <Sparkles className="w-3.5 h-3.5" /> Importar de La Cuota
            </Button>
          </div>
        </div>
      </div>

      {/* Balances */}
      <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Balances</h3>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Agrega personas para ver los balances.</p>
        ) : balances.map(b => (
          <div key={b.memberId} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-accent-foreground">
                {b.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm font-medium">{b.name}</span>
            </div>
            <span className={`text-sm font-bold tabular-nums ${b.balance > 0.01 ? 'text-emerald-600' : b.balance < -0.01 ? 'text-red-500' : 'text-muted-foreground'}`}>
              {b.balance > 0.01 ? '+' : ''}{fmt(b.balance)}
            </span>
          </div>
        ))}
      </div>

      {/* Settlements */}
      {settlements.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Quién paga a quién</h3>
          {settlements.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-accent/40 px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-red-500">{s.fromName}</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-emerald-600">{s.toName}</span>
              </div>
              <span className="font-bold text-sm tabular-nums">{fmt(s.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Register payment */}
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <HandCoins className="w-3.5 h-3.5" /> Registrar pago
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Quien paga</Label>
            <Select value={payFrom} onValueChange={setPayFrom}>
              <SelectTrigger className="text-xs h-9 rounded-xl"><SelectValue placeholder="Pagador" /></SelectTrigger>
              <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id} disabled={m.id === payTo}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">A quien paga</Label>
            <Select value={payTo} onValueChange={setPayTo}>
              <SelectTrigger className="text-xs h-9 rounded-xl"><SelectValue placeholder="Receptor" /></SelectTrigger>
              <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id} disabled={m.id === payFrom}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Monto"
            value={payAmount}
            onChange={e => setPayAmount(e.target.value)}
            className="rounded-xl text-sm h-9 flex-1"
            inputMode="decimal"
          />
          <Button size="sm" onClick={registerPayment} disabled={savingPayment || !payFrom || !payTo || !payAmount} className="rounded-xl">
            {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar'}
          </Button>
        </div>
      </div>

      {/* Expense history */}
      {expenses.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Historial</h3>
          {expenses.map(ex => (
            <div key={ex.id} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${ex.is_settlement ? 'bg-emerald-500/10' : 'bg-accent/40'}`}>
              <div>
                <p className="font-medium text-foreground text-xs leading-tight">{ex.description}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(ex.created_at).toLocaleDateString('es-CL')}</p>
              </div>
              <span className={`font-bold text-sm tabular-nums ${ex.is_settlement ? 'text-emerald-600' : ''}`}>
                {fmt(ex.total_amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Add Member Dialog */}
      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva persona</DialogTitle>
            <DialogDescription>Solo participa en gastos creados después de ahora.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Nombre</Label>
            <Input value={memberName} onChange={e => setMemberName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMember()} placeholder="Ej: Cami" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMemberOpen(false)}>Cancelar</Button>
            <Button onClick={addMember} disabled={savingMember || !memberName.trim()}>
              {savingMember && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from La Cuota Dialog */}
      <Dialog open={importOpen} onOpenChange={v => { setImportOpen(v); if (!v) { setImportParsed(null); setImportText(''); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-violet-500" />
              Importar desde La Cuota
            </DialogTitle>
            <DialogDescription>
              Pega el mensaje del resumen que genera La Cuota. Detectaremos automáticamente a cada persona y su monto.
            </DialogDescription>
          </DialogHeader>

          {!importParsed ? (
            <div className="space-y-3">
              <Label>Mensaje de La Cuota</Label>
              <Textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={`👤 *Pedro*: $5.500\n   • Cerveza: $3.500\n   • Propina: $2.000\n\n👤 *Ana*: $7.200\n   • Sushi: $7.200`}
                className="min-h-[180px] font-mono text-xs rounded-xl"
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancelar</Button>
                <Button
                  onClick={handleParseImport}
                  disabled={!importText.trim()}
                  className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white hover:opacity-90"
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Detectar personas
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Confirma la asignación de cada persona detectada al miembro del grupo:</p>
              {assignments.map((a, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border bg-accent/30 p-3">
                  <div>
                    <p className="font-semibold text-sm">{a.parsedName}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{fmt(a.amount)}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">→</span>
                  <Select value={a.target} onValueChange={v => setAssignments(prev => prev.map((p, i) => i === idx ? { ...p, target: v } : p))}>
                    <SelectTrigger className="text-xs rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CREATE_NEW}>+ Crear "{a.parsedName}"</SelectItem>
                      <SelectItem value={SKIP}>Omitir</SelectItem>
                      {members.length > 0 && <><div className="my-1 border-t" />{members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</>}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="flex justify-between items-center bg-muted rounded-xl px-3 py-2 text-sm">
                <span className="text-muted-foreground">Total a importar</span>
                <span className="font-bold tabular-nums">{fmt(assignments.filter(a => a.target !== SKIP).reduce((s, a) => s + a.amount, 0))}</span>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setImportParsed(null)}>← Volver</Button>
                <Button onClick={handleApplyImport} disabled={importing} className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white hover:opacity-90">
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Importar consumos
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
