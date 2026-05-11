import { useState, useEffect, useMemo } from 'react';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { 
  ArrowLeft, Plus, UserPlus, Loader2, CheckCircle2, ArrowRight,
  Trash2, Wand2, Sparkles, Users, HandCoins, History, Receipt,
  MoreVertical, Pencil, Filter, LayoutDashboard, User
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parseLaCuotaMessage, findMemberMatch, type ParsedPerson } from '@/lib/lacuota-parser';
import { computeBalances, simplifyDebts, formatMoney, type ExpenseWithContribs, type Member, type Balance, type Settlement } from '@/lib/balances';
import { ExpenseDialog } from '@/components/ExpenseDialog';
import { PersonalHistory } from '@/components/PersonalHistory';
import type { Category } from '@/components/CategoryPicker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CREATE_NEW = '__create__';
const SKIP = '__skip__';
type Assignment = { parsedName: string; amount: number; target: string };

interface Props {
  groupId: string;
  onBack: () => void;
  pendingImportText?: string | null;
  onClearPendingImport?: () => void;
}

export default function SaldamosGroupDetail({ 
  groupId, onBack, pendingImportText, onClearPendingImport 
}: Props) {
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('balances');

  const [memberOpen, setMemberOpen] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [savingMember, setSavingMember] = useState(false);

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [importTextForDialog, setImportTextForDialog] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importParsed, setImportParsed] = useState<ParsedPerson[] | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [importing, setImporting] = useState(false);

  const [payFrom, setPayFrom] = useState('');
  const [payTo, setPayTo] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Filters and search
  const [historySearch, setHistorySearch] = useState('');
  const [historyCategory, setHistoryCategory] = useState('all');

  const load = async () => {
    try {
      setLoading(true);
      const [g, m, e, c] = await Promise.all([
        saldamosSupabase.from('groups').select('id, name, currency, owner_id').eq('id', groupId).maybeSingle(),
        saldamosSupabase.from('group_members').select('id, name, joined_at').eq('group_id', groupId).order('joined_at', { ascending: true }),
        saldamosSupabase.from('expenses').select('id, description, total_amount, expense_date, is_settlement, is_personal, category_id, created_at, expense_contributions(member_id, amount_paid, amount_owed)').eq('group_id', groupId).order('expense_date', { ascending: false }),
        saldamosSupabase.from('expense_categories' as any).select('id, name, is_default').eq('group_id', groupId),
      ]);
      
      if (g.error) throw g.error;
      if (m.error) throw m.error;
      
      setGroup(g.data ?? null);
      setMembers(m.data ?? []);
      setExpenses((e.data ?? []).map((ex: any) => ({
        ...ex,
        contributions: (ex.expense_contributions ?? []).map((c: any) => ({
          member_id: c.member_id,
          amount_paid: Number(c.amount_paid || 0),
          amount_owed: Number(c.amount_owed || 0),
        })),
      })));
      setCategories(c.data ?? []);
    } catch (err: any) {
      console.error('Error loading group:', err);
      toast.error('Error al cargar datos: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [groupId]);

  // Auto-trigger import if pending text exists
  useEffect(() => {
    if (!loading && members.length > 0 && pendingImportText && onClearPendingImport) {
      setImportTextForDialog(pendingImportText);
      setSelectedExpense(null);
      setExpenseOpen(true);
      onClearPendingImport();
    }
  }, [loading, members, pendingImportText]);

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

  const filteredExpenses = useMemo(() => {
    return expenses.filter(ex => {
      const matchesSearch = (ex.description || '').toLowerCase().includes(historySearch.toLowerCase());
      const matchesCategory = historyCategory === 'all' || ex.category_id === historyCategory;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, historySearch, historyCategory]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const ex of expenses) {
      if (ex.is_settlement) continue;
      const catId = ex.category_id || 'others';
      const current = map.get(catId) ?? 0;
      map.set(catId, current + (ex.total_amount || 0));
    }
    return Array.from(map.entries()).map(([id, total]) => ({
      id,
      name: categories.find(c => c.id === id)?.name ?? 'Otros',
      total
    })).sort((a, b) => b.total - a.total);
  }, [expenses, categories]);

  const handleImportClick = () => {
    if (pendingImportText) {
      setImportTextForDialog(pendingImportText);
      if (onClearPendingImport) onClearPendingImport();
    } else {
      setImportTextForDialog(null);
      // If no pending text, we can still open the old import dialog or just let user paste in ExpenseDialog
      // The user wants it to work like "Guardar en mis saldos", so let's just open the expense dialog 
      // but maybe they want to paste there.
    }
    setSelectedExpense(null);
    setExpenseOpen(true);
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

  const deleteExpense = async (id: string) => {
    if (!confirm('¿Seguro quieres borrar este gasto?')) return;
    const { error } = await saldamosSupabase.from('expenses').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Gasto eliminado');
      load();
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!group) return <div className="text-center py-8 text-muted-foreground">Grupo no encontrado. <button onClick={onBack} className="text-primary underline">Volver</button></div>;

  // Defensive check for computed values
  let currentBalances: Balance[] = [];
  let currentSettlements: Settlement[] = [];
  try {
    currentBalances = balances;
    currentSettlements = settlements;
  } catch (e) {
    console.error("Error computing balances:", e);
  }

  return (
    <div className="space-y-4 animate-fade-in-up pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver
        </button>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="rounded-xl h-8 text-[10px]" onClick={() => setMemberOpen(true)}>
            <UserPlus className="w-3 h-3 mr-1" /> Persona
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight break-words">{group?.name || 'Cargando...'}</h2>
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{currency} · {members?.length || 0} Miembros</p>
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="rounded-xl h-10 px-4 text-xs font-semibold gap-2 border-violet-200 hover:bg-violet-50" 
            onClick={handleImportClick}
          >
            <Sparkles className="w-4 h-4 text-violet-500" />
            Importar
          </Button>
          <Button 
            size="sm" 
            className="rounded-xl h-10 px-6 text-xs font-bold gap-2 bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-lg shadow-violet-200" 
            onClick={() => { setSelectedExpense(null); setExpenseOpen(true); }}
          >
            <Plus className="w-4 h-4" />
            Añadir Gasto
          </Button>
        </div>
      </div>

      <Tabs defaultValue="balances" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 rounded-xl bg-muted/50 p-1 h-11">
          <TabsTrigger value="balances" className="rounded-lg text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <LayoutDashboard className="w-3.5 h-3.5" /> Balances
          </TabsTrigger>
          <TabsTrigger value="historial" className="rounded-lg text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <History className="w-3.5 h-3.5" /> Gastos
          </TabsTrigger>
          <TabsTrigger value="mi-actividad" className="rounded-lg text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <User className="w-3.5 h-3.5" /> Mi Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="space-y-4 pt-4">
          <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Agrega personas para ver los balances.</p>
            ) : currentBalances.map(b => (
              <div key={b.memberId} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <span className="text-sm font-medium">{b.name}</span>
                <span className={`text-sm font-bold tabular-nums ${b.balance > 0.01 ? 'text-emerald-600' : b.balance < -0.01 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {b.balance > 0.01 ? '+' : ''}{fmt(b.balance)}
                </span>
              </div>
            ))}
          </div>

          {currentSettlements.length > 0 && (
            <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase mb-3">Quién paga a quién</h3>
              {currentSettlements.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-accent/40 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm truncate mr-2">
                    <span className="font-semibold text-red-500 truncate">{s.fromName}</span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-emerald-600 truncate">{s.toName}</span>
                  </div>
                  <span className="font-bold text-sm tabular-nums shrink-0">{fmt(s.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
              <HandCoins className="w-3.5 h-3.5" /> Registrar pago
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Select value={payFrom} onValueChange={setPayFrom}>
                <SelectTrigger className="text-xs h-9 rounded-xl"><SelectValue placeholder="De..." /></SelectTrigger>
                <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={payTo} onValueChange={setPayTo}>
                <SelectTrigger className="text-xs h-9 rounded-xl"><SelectValue placeholder="A..." /></SelectTrigger>
                <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input type="number" placeholder="Monto" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="rounded-xl text-sm h-9" />
              <Button size="sm" onClick={registerPayment} disabled={savingPayment || !payFrom || !payTo || !payAmount} className="rounded-xl px-4 bg-violet-600 text-white">
                {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Saldar'}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="historial" className="space-y-4 pt-4">
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Buscar gasto..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  className="rounded-xl pl-9 h-10 text-sm"
                />
                <Filter className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
              <Select value={historyCategory} onValueChange={setHistoryCategory}>
                <SelectTrigger className="w-[140px] rounded-xl h-10 text-xs">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {categoryTotals.length > 0 && historyCategory === 'all' && (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {categoryTotals.map(ct => (
                  <div key={ct.id} className="shrink-0 bg-card border rounded-xl px-3 py-2 text-center min-w-[100px]">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold">{ct.name}</p>
                    <p className="text-xs font-bold">{fmt(ct.total)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {filteredExpenses.length === 0 ? <p className="text-sm text-muted-foreground text-center py-10">No se encontraron gastos.</p> :
              filteredExpenses.map(ex => (
                <div key={ex.id} className={`p-4 rounded-2xl border flex justify-between items-start ${ex.is_settlement ? 'bg-emerald-50 border-emerald-100' : ex.is_personal ? 'bg-violet-50 border-violet-100' : 'bg-card'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="font-bold text-sm break-words leading-tight">{ex.description}</p>
                      {ex.is_personal && <span className="px-1.5 py-0.5 rounded-full bg-violet-200 text-violet-700 text-[8px] font-bold uppercase">Personal</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{new Date(ex.expense_date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right mr-1">
                      <p className="text-sm font-bold tabular-nums">{fmt(ex.total_amount)}</p>
                      <p className="text-[9px] text-muted-foreground">{ex.is_settlement ? 'Pago' : 'Total'}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full ml-1"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        {!ex.is_settlement && (
                          <DropdownMenuItem onClick={() => { setSelectedExpense(ex); setExpenseOpen(true); }}>
                            <Pencil className="w-3.5 h-3.5 mr-2" /> Editar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-red-500" onClick={() => deleteExpense(ex.id)}>
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            }
          </div>
        </TabsContent>

        <TabsContent value="mi-actividad" className="pt-4">
          <PersonalHistory 
            members={members} 
            expenses={expenses} 
            categories={categories} 
            currency={currency} 
          />
        </TabsContent>
      </Tabs>

      <ExpenseDialog 
        open={expenseOpen} 
        onOpenChange={(v) => { setExpenseOpen(v); if(!v) setImportTextForDialog(null); }} 
        groupId={groupId} 
        members={members} 
        currency={currency} 
        categories={categories} 
        existing={selectedExpense} 
        initialImportText={importTextForDialog}
        onSaved={load} 
        onCategoriesChanged={load} 
      />

      {/* Add Member Dialog */}
      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Nueva persona</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Nombre</Label>
            <Input value={memberName} onChange={e => setMemberName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMember()} placeholder="Ej: Cami" className="rounded-xl" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setMemberOpen(false)}>Cancelar</Button>
            <Button onClick={addMember} disabled={savingMember || !memberName.trim()} className="rounded-xl bg-violet-600 text-white">
              {savingMember && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from La Cuota Dialog */}
      <Dialog open={importOpen} onOpenChange={v => { setImportOpen(v); if (!v) { setImportParsed(null); setImportText(''); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-violet-500" /> Importar</DialogTitle>
          </DialogHeader>

          {!importParsed ? (
            <div className="space-y-3">
              <Textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Pega el mensaje de La Cuota aquí..." className="min-h-[180px] font-mono text-xs rounded-xl" />
              <DialogFooter>
                <Button onClick={handleParseImport} disabled={!importText.trim()} className="bg-violet-600 text-white rounded-xl w-full">Detectar personas</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((a, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border bg-accent/30 p-3">
                  <div>
                    <p className="font-semibold text-xs truncate">{a.parsedName}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{fmt(a.amount)}</p>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <Select value={a.target} onValueChange={v => setAssignments(prev => prev.map((p, i) => i === idx ? { ...p, target: v } : p))}>
                    <SelectTrigger className="text-xs rounded-xl h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CREATE_NEW}>+ Crear "{a.parsedName}"</SelectItem>
                      <SelectItem value={SKIP}>Omitir</SelectItem>
                      {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <Button onClick={handleApplyImport} disabled={importing} className="bg-violet-600 text-white rounded-xl w-full">
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Importar consumos
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
