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
  MoreVertical, Pencil, Filter, LayoutDashboard, User, Share2, Copy
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
import { useExchangeRates } from '@/lib/currency';
import { CurrencyConverter } from '@/components/CurrencyConverter';

const CREATE_NEW = '__create__';
const SKIP = '__skip__';
type Assignment = { parsedName: string; amount: number; target: string };

interface Props {
  groupId: string;
  onBack: () => void;
  pendingImportText?: string | null;
  onClearPendingImport?: () => void;
  billData?: string | null;
}

export default function SaldamosGroupDetail({ 
  groupId, onBack, pendingImportText, onClearPendingImport, billData 
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
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

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
  const [displayCurrency, setDisplayCurrency] = useState<string>(group?.currency ?? 'CLP');
  const [showConverter, setShowConverter] = useState(false);
  const [expandedExpenses, setExpandedExpenses] = useState<Set<string>>(new Set());
  const [myMemberId, setMyMemberId] = useState<string | null>(() => localStorage.getItem(`saldamos_id_${groupId}`));
  const { convert, loading: ratesLoading, error: ratesError, fetchedAt } = useExchangeRates(group?.currency ?? 'CLP');

  const load = async () => {
    try {
      setLoading(true);
      const [g, m, e, c] = await Promise.all([
        saldamosSupabase.from('groups').select('id, name, currency, owner_id').eq('id', groupId).maybeSingle(),
        saldamosSupabase.from('group_members').select('id, name, joined_at').eq('group_id', groupId).order('joined_at', { ascending: true }),
        saldamosSupabase.from('expenses').select('id, description, total_amount, expense_date, is_settlement, is_personal, category_id, track_payments, created_at, expense_contributions(id, member_id, amount_paid, amount_owed, is_settled)').eq('group_id', groupId).order('expense_date', { ascending: false }),
        saldamosSupabase.from('expense_categories' as any).select('id, name, is_default').eq('group_id', groupId),
      ]);
      
      if (g.error) throw g.error;
      if (m.error) throw m.error;
      
      setGroup(g.data ?? null);
      setMembers(m.data ?? []);
      if (e.data) {
        const mappedExpenses = e.data.map((ex: any) => ({
          ...ex,
          contributions: ex.expense_contributions || []
        }));
        setExpenses(mappedExpenses);
      }
      if (c.data) setCategories(c.data);
    } catch (err: any) {
      console.error('Error loading group:', err);
      toast.error('Error al cargar datos: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const LOCAL_KEY = `saldamos_activity_${groupId}`;

  const loadActivities = async () => {
    try {
      setLoadingActivities(true);
      
      // Always load from localStorage first (always works, no RLS issues)
      let localLogs: any[] = [];
      try {
        const stored = localStorage.getItem(LOCAL_KEY);
        if (stored) localLogs = JSON.parse(stored);
      } catch { /* ignore parse errors */ }

      // Try to also fetch from Supabase (may fail due to RLS)
      let supabaseLogs: any[] = [];
      try {
        const { data } = await saldamosSupabase
          .from('group_activity' as any)
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (data) supabaseLogs = data;
      } catch { /* ignore — RLS or network issue */ }

      // Merge: deduplicate by id, prefer localStorage for freshness
      const allById = new Map<string, any>();
      supabaseLogs.forEach(a => allById.set(a.id, a));
      localLogs.forEach(a => allById.set(a.id, a)); // local wins on conflict
      
      const merged = Array.from(allById.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);
      
      setActivities(merged);
    } catch (err) {
      console.error('Error loading activities:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  const logActivity = async (action: string, details: any = {}) => {
    try {
      const { data: sess } = await saldamosSupabase.auth.getSession();
      const user = sess.session?.user;
      
      let userName = user?.email || 'Sin nombre';
      if (!user && myMemberId) {
        const m = members.find(mem => mem.id === myMemberId);
        if (m) userName = m.name;
      }

      const entry = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        group_id: groupId,
        user_id: user?.id || null,
        user_name: userName,
        action,
        details,
        created_at: new Date().toISOString(),
      };

      // Save to localStorage immediately (always works)
      try {
        const stored = localStorage.getItem(LOCAL_KEY);
        const existing: any[] = stored ? JSON.parse(stored) : [];
        existing.unshift(entry);
        localStorage.setItem(LOCAL_KEY, JSON.stringify(existing.slice(0, 100)));
      } catch { /* ignore storage errors */ }

      // Update UI immediately without waiting for network
      setActivities(prev => [entry, ...prev].slice(0, 50));

      // Also try to persist to Supabase (may silently fail due to RLS)
      saldamosSupabase.from('group_activity' as any).insert({
        group_id: groupId,
        user_id: user?.id || null,
        user_name: userName,
        action,
        details
      }).then(({ error }) => {
        if (error) console.warn('Could not persist activity to Supabase (RLS?):', error.message);
      });

    } catch (err) {
      console.error('Error logging activity:', err);
    }
  };

  useEffect(() => { 
    load(); 
  }, [groupId]);

  useEffect(() => {
    if (activeTab === 'actividad') loadActivities();
  }, [activeTab]);

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
  
  const fmt = (n: number, curr?: string) => {
    const target = curr || (showConverter ? displayCurrency : currency);
    if (target === currency) return formatMoney(n, currency);
    const converted = convert(n, target);
    if (converted == null) return formatMoney(n, currency);
    return formatMoney(converted, target);
  };

  const addMember = async () => {
    if (!memberName.trim()) return;
    setSavingMember(true);
    const { error } = await saldamosSupabase.from('group_members').insert({ group_id: groupId, name: memberName.trim() });
    setSavingMember(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${memberName.trim()} agregado`);
    await logActivity('MEMBER_ADDED', { name: memberName.trim() });
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
    const textToImport = billData || pendingImportText;
    if (textToImport) {
      setImportTextForDialog(textToImport);
      setSelectedExpense(null);
      setExpenseOpen(true);
      if (pendingImportText && onClearPendingImport) onClearPendingImport();
      toast.success(billData ? 'Importando datos de "Dividir" automáticamente' : 'Importando resumen detectado');
    } else {
      setImportOpen(true);
    }
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
    await logActivity('EXPENSE_IMPORTED', { count: assignments.length, total });
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
    await logActivity('PAYMENT_REGISTERED', { from: fromName, to: toName, amount });
    setPayFrom(''); setPayTo(''); setPayAmount('');
    load();
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('¿Seguro quieres borrar este gasto?')) return;
    
    const expenseToDelete = expenses.find(e => e.id === id);
    const { error } = await saldamosSupabase.from('expenses').delete().eq('id', id);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Gasto eliminado');
      await logActivity('EXPENSE_DELETED', { 
        id, 
        description: expenseToDelete?.description || 'Gasto sin nombre',
        amount: expenseToDelete?.total_amount
      });
      load();
    }
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedExpenses);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedExpenses(next);
  };

  const handleViewDetail = (id: string) => {
    setActiveTab('historial');
    setExpandedExpenses(prev => new Set(prev).add(id));
    setTimeout(() => {
      const el = document.getElementById(`expense-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  };

  const toggleExpandAll = () => {
    if (expandedExpenses.size >= filteredExpenses.length && filteredExpenses.length > 0) {
      setExpandedExpenses(new Set());
    } else {
      setExpandedExpenses(new Set(filteredExpenses.map(ex => ex.id)));
    }
  };

  const toggleSettlement = async (contribution: any, currentStatus: boolean, expense: any) => {
    const contributionId = contribution.id;
    const { error } = await saldamosSupabase
      .from('expense_contributions')
      .update({ is_settled: !currentStatus })
      .eq('id', contributionId);
    
    if (error) {
      toast.error(error.message);
    } else {
      // If marking as paid, register a REAL settlement to update global balance
      if (!currentStatus) {
        const fromName = members.find(m => m.id === contribution.member_id)?.name ?? '?';
        const payerContrib = expense.contributions.find((c: any) => c.amount_paid > 0);
        const toName = members.find(m => m.id === (payerContrib?.member_id || myMemberId))?.name ?? '?';
        const payerId = payerContrib?.member_id || myMemberId;

        const { data: exp, error: expErr } = await saldamosSupabase
          .from('expenses')
          .insert({ 
            group_id: groupId, 
            description: `Reconciliación: ${fromName} → ${toName} (${expense.description})`, 
            total_amount: contribution.amount_owed, 
            is_settlement: true 
          })
          .select('id').single();
        
        if (!expErr && exp) {
          await saldamosSupabase.from('expense_contributions').insert([
            { expense_id: (exp as any).id, member_id: contribution.member_id, amount_paid: contribution.amount_owed, amount_owed: 0 },
            { expense_id: (exp as any).id, member_id: payerId, amount_paid: 0, amount_owed: contribution.amount_owed },
          ]);
        }
      }

      toast.success(!currentStatus ? 'Marcado como pagado y balance actualizado' : 'Marcado como pendiente');
      load(); // Reload to refresh everything correctly
    }
  };

  const inviteCollaborator = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      // First, we need to find if there's a user with that email. 
      // Supabase client doesn't allow searching users by email easily without a service role.
      // But we can insert into collaborators and let a trigger/logic handle it, 
      // OR we just tell the user to share the link.
      // For now, we'll try to insert and see if it works (assuming a trigger exists)
      // Actually, let's just use the link sharing as primary.
      
      // If we don't have user_id, we can't insert into group_collaborators Row which requires user_id.
      // I'll check if I can use a generic invite table, but I don't see one.
      // I'll stick to a "Copy Link" feature with a message.
      toast.success('¡Enlace listo para compartir!');
      setShareOpen(false);
    } finally {
      setInviting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  const handleSetIdentity = (id: string) => {
    const finalId = id === 'none' ? null : id;
    setMyMemberId(finalId);
    if (finalId) localStorage.setItem(`saldamos_id_${groupId}`, finalId);
    else localStorage.removeItem(`saldamos_id_${groupId}`);
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
    <div className="space-y-6 animate-fade-in-up pb-10">
      {/* Top Nav Bar */}
      <div className="flex items-center justify-between -mx-4 px-4 py-2 sticky top-[80px] bg-background/95 backdrop-blur-md z-[5] border-b border-border/40 gap-2">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold text-foreground hover:text-violet-600 transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4 stroke-[3px]" /> Volver
        </button>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* Add Expense — primary */}
          <Button
            size="sm"
            className="rounded-xl h-8 px-3 text-[11px] gap-1.5 bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-sm shrink-0"
            onClick={() => { setSelectedExpense(null); setExpenseOpen(true); }}
          >
            <Plus className="w-3.5 h-3.5" /> Gasto
          </Button>
          {/* Import — secondary, small */}
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl h-8 px-2.5 text-[11px] gap-1 border-violet-200 text-violet-600 hover:bg-violet-50 shrink-0"
            onClick={handleImportClick}
          >
            <Sparkles className="w-3 h-3" /> Importar
          </Button>
          {/* Add member */}
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl h-8 px-2.5 text-[11px] gap-1 shrink-0"
            onClick={() => setMemberOpen(true)}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Persona</span>
          </Button>
          {/* Share */}
          <Button
            size="sm"
            variant="ghost"
            className="rounded-xl h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-violet-600"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight leading-none text-foreground break-words bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">
            {group?.name || 'Cargando...'}
          </h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase tracking-wider">
              {currency}
            </span>
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1">
              <Users className="w-3 h-3" /> {members?.length || 0} Miembros
            </span>
            <div className="ml-auto">
              <Select value={myMemberId || 'none'} onValueChange={handleSetIdentity}>
                <SelectTrigger className="h-7 text-[10px] rounded-lg bg-violet-50 border-violet-100 text-violet-700 font-bold px-2 gap-1.5 min-w-[100px]">
                  <User className="w-3 h-3" />
                  <SelectValue placeholder="¿Quién eres tú?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">(Nadie)</SelectItem>
                  {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 rounded-xl bg-muted/60 p-1 h-12">
          <TabsTrigger value="balances" className="rounded-lg text-[11px] font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-violet-700 data-[state=active]:font-black text-muted-foreground">
            <LayoutDashboard className="w-3.5 h-3.5" /> Balances
          </TabsTrigger>
          <TabsTrigger value="historial" className="rounded-lg text-[11px] font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-violet-700 data-[state=active]:font-black text-muted-foreground">
            <History className="w-3.5 h-3.5" /> Gastos
          </TabsTrigger>
          <TabsTrigger value="mi-actividad" className="rounded-lg text-[11px] font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-violet-700 data-[state=active]:font-black text-muted-foreground">
            <User className="w-3.5 h-3.5" /> Mi Hist.
          </TabsTrigger>
          <TabsTrigger value="actividad" className="rounded-lg text-[11px] font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-violet-700 data-[state=active]:font-black text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5" /> Actividad
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
                  <button 
                    key={ct.id} 
                    onClick={() => setHistoryCategory(ct.id)}
                    className="shrink-0 bg-card border border-border/50 rounded-xl px-3 py-2 text-center min-w-[100px] hover:border-violet-300 hover:bg-violet-50/30 transition-all active:scale-95"
                  >
                    <p className="text-[9px] text-muted-foreground uppercase font-bold">{ct.name}</p>
                    <p className="text-xs font-bold text-violet-600">{fmt(ct.total)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {filteredExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10 italic">No se encontraron gastos.</p>
            ) : (
              filteredExpenses.map((ex) => {
                const isExpanded = expandedExpenses.has(ex.id);
                const isSettlement = ex.is_settlement;
                
                // My relation with this expense
                const myContrib = ex.contributions?.find((c: any) => c.member_id === myMemberId);
                const iPaid = (myContrib?.amount_paid || 0) > (myContrib?.amount_owed || 0);
                const iOwe = (myContrib?.amount_owed || 0) > (myContrib?.amount_paid || 0);
                
                // Pending payments detection
                const hasPendingCollections = iPaid && ex.contributions?.some((c: any) => c.amount_owed > 0 && !c.is_settled && c.member_id !== myMemberId);
                const hasPendingDebt = iOwe && myContrib && !myContrib.is_settled;
                
                const showYellow = ex.track_payments && hasPendingCollections;
                const allSettled = !ex.contributions?.some((c: any) => c.amount_owed > 0 && !c.is_settled);

                return (
                  <div 
                    key={ex.id} 
                    id={`expense-${ex.id}`}
                    className={`group relative rounded-2xl border transition-all duration-300 ${
                      isExpanded ? 'bg-card shadow-lg ring-1 ring-primary/10' : 
                      showYellow ? 'bg-amber-50/50 border-amber-200' :
                      'bg-card/50 hover:bg-card hover:shadow-md'
                    }`}
                  >
                    <div 
                      className="flex items-center justify-between p-4 cursor-pointer"
                      onClick={() => toggleExpand(ex.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-xl shrink-0 ${
                          isSettlement ? 'bg-emerald-100 text-emerald-600' : 
                          showYellow ? 'bg-amber-100 text-amber-600' :
                          'bg-violet-100 text-violet-600'
                        }`}>
                          {isSettlement ? <HandCoins className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold truncate pr-2">
                            {ex.description || (isSettlement ? 'Pago/Ajuste' : 'Gasto sin descripción')}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                              {new Date(ex.expense_date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                            </span>
                            {!isSettlement && ex.category_id && (
                              <>
                                <span className="text-[10px] text-muted-foreground/30">•</span>
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                                  {categories.find(c => c.id === ex.category_id)?.name}
                                </span>
                              </>
                            )}
                            {showYellow && (
                              <span className="flex items-center gap-1 text-[10px] text-amber-600 font-bold bg-amber-100 px-1.5 py-0.5 rounded-full animate-pulse">
                                COBRO PENDIENTE
                              </span>
                            )}
                            {allSettled && !isSettlement && !isSettlement && (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold bg-emerald-100 px-1.5 py-0.5 rounded-full">
                                SALDADO
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right shrink-0 flex flex-col items-end">
                          <p className={`text-sm font-black tabular-nums ${isSettlement ? 'text-emerald-600' : ''}`}>
                            {formatMoney(ex.total_amount, group?.currency)}
                          </p>
                          {myContrib && !isSettlement && (() => {
                            const net = (myContrib.amount_paid || 0) - (myContrib.amount_owed || 0);
                            if (net > 0.01) return (
                              <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">
                                +{formatMoney(net, group?.currency)} te deben
                              </p>
                            );
                            if (net < -0.01) return (
                              <p className="text-[9px] font-bold text-red-500 uppercase tracking-tighter">
                                {formatMoney(Math.abs(net), group?.currency)} debes
                              </p>
                            );
                            return (
                              <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">
                                ✓ saldado
                              </p>
                            );
                          })()}
                          <p className="text-[9px] text-muted-foreground font-medium tabular-nums mt-0.5 uppercase">
                            {ex.contributions?.length || 0} pers.
                          </p>
                        </div>
                        <ArrowRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-t mt-2 pt-4 border-dashed">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Distribución y Pagos</p>
                          <div className="space-y-1.5">
                            {ex.contributions?.map((c: any) => {
                              const m = members.find(mem => mem.id === c.member_id);
                              const isMe = c.member_id === myMemberId;
                              const isPayer = c.amount_paid > 0;
                              const owesMe = iPaid && c.amount_owed > 0 && c.member_id !== myMemberId;
                              
                              return (
                                <div key={c.member_id} className={`flex items-center justify-between p-2 rounded-xl text-xs ${c.is_settled ? 'bg-emerald-50/50' : 'bg-muted/30'}`}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isPayer ? 'bg-violet-500' : 'bg-muted-foreground/30'}`} />
                                    <span className={`truncate font-medium ${isMe ? 'text-violet-600 font-bold' : ''}`}>
                                      {m?.name || 'Desconocido'}
                                    </span>
                                    {isPayer && <span className="text-[9px] bg-violet-100 text-violet-600 px-1 rounded uppercase font-bold">Pagó</span>}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-right tabular-nums">
                                      {c.amount_paid > 0 && <p className="text-violet-600 font-bold">+{formatMoney(c.amount_paid, group?.currency)}</p>}
                                      {c.amount_owed > 0 && <p className={c.is_settled ? 'text-emerald-600 line-through' : 'text-red-500'}>-{formatMoney(c.amount_owed, group?.currency)}</p>}
                                    </div>
                                    
                                    {owesMe && (
                                      <Button
                                        size="sm"
                                        variant={c.is_settled ? "ghost" : "outline"}
                                        className={`h-7 px-2 rounded-lg text-[10px] font-bold ${c.is_settled ? 'text-emerald-600' : 'text-amber-600 border-amber-200 bg-amber-50'}`}
                                        onClick={(e) => { e.stopPropagation(); toggleSettlement(c, c.is_settled, ex); }}
                                      >
                                        {c.is_settled ? <CheckCircle2 className="w-3 h-3 mr-1" /> : null}
                                        {c.is_settled ? 'PAGADO' : 'MARCAR PAGO'}
                                      </Button>
                                    )}
                                    {!owesMe && c.amount_owed > 0 && c.is_settled && (
                                      <div className="flex items-center text-emerald-600 gap-1 text-[10px] font-bold pr-1">
                                        <CheckCircle2 className="w-3 h-3" />
                                        PAGADO
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="pt-2 mt-2 border-t border-border/40 flex justify-end gap-2">
                          {!ex.is_settlement && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 rounded-lg text-[10px] gap-1.5 hover:bg-violet-100 hover:text-violet-700" 
                              onClick={(e) => { e.stopPropagation(); setSelectedExpense(ex); setExpenseOpen(true); }}
                            >
                              <Pencil className="w-3 h-3" /> Editar
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 rounded-lg text-[10px] gap-1.5 text-red-500 hover:bg-red-50 hover:text-red-600" 
                            onClick={(e) => { e.stopPropagation(); deleteExpense(ex.id); }}
                          >
                            <Trash2 className="w-3 h-3" /> Eliminar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="mi-actividad" className="pt-4">
          <PersonalHistory 
            members={members} 
            expenses={expenses} 
            categories={categories} 
            currency={currency} 
            selectedId={myMemberId}
            onSelectedIdChange={handleSetIdentity}
            onViewDetail={handleViewDetail}
          />
        </TabsContent>

        <TabsContent value="actividad" className="space-y-4 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Log de actividad</h3>
            <Button variant="ghost" size="sm" className="h-7 text-[10px] rounded-lg" onClick={loadActivities} disabled={loadingActivities}>
              {loadingActivities ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refrescar'}
            </Button>
          </div>

          <div className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10 italic">No hay actividad registrada aún.</p>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="flex gap-3 items-start p-3 rounded-xl bg-card border border-border/50">
                  <div className={`mt-1 p-1.5 rounded-lg ${
                    a.action.includes('DELETED') ? 'bg-red-50 text-red-500' : 
                    a.action.includes('ADDED') || a.action.includes('IMPORTED') ? 'bg-emerald-50 text-emerald-500' :
                    'bg-violet-50 text-violet-500'
                  }`}>
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      <span className="font-bold">{a.user_name.split('@')[0]}</span>{' '}
                      {a.action === 'EXPENSE_ADDED' && `añadió el gasto "${a.details?.description || 'sin nombre'}"`}
                      {a.action === 'EXPENSE_UPDATED' && `editó el gasto "${a.details?.description || 'sin nombre'}"`}
                      {a.action === 'EXPENSE_DELETED' && `eliminó el gasto "${a.details?.description || 'sin nombre'}"`}
                      {a.action === 'MEMBER_ADDED' && `agregó a ${a.details?.name || 'alguien'}`}
                      {a.action === 'PAYMENT_REGISTERED' && `registró un pago de ${a.details?.from} a ${a.details?.to}`}
                      {a.action === 'EXPENSE_IMPORTED' && `importó ${a.details?.count} consumos por ${formatMoney(a.details?.total || 0, currency)}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(a.created_at).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
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
        onSaved={async (expense) => {
          await logActivity(selectedExpense ? 'EXPENSE_UPDATED' : 'EXPENSE_ADDED', { 
            id: expense.id, 
            description: expense.description,
            amount: expense.total_amount 
          });
          load();
        }} 
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

      {/* Share/Invite Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-violet-500" /> Compartir grupo
            </DialogTitle>
            <DialogDescription>
              Cualquiera con el enlace podrá ver los gastos. Para que otros puedan editar, deben iniciar sesión.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Enlace del grupo</Label>
              <div className="flex gap-2">
                <Input 
                  readOnly 
                  value={window.location.origin + '/?group=' + groupId} 
                  className="rounded-xl text-xs font-mono bg-muted/30" 
                />
                <Button size="icon" variant="outline" className="rounded-xl shrink-0" onClick={() => copyToClipboard(window.location.origin + '/?group=' + groupId)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label>Invitar por Email (Gmail)</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="ejemplo@gmail.com" 
                  value={inviteEmail} 
                  onChange={e => setInviteEmail(e.target.value)}
                  className="rounded-xl text-sm"
                />
                <Button className="rounded-xl bg-violet-600 text-white" onClick={() => {
                  const subject = encodeURIComponent(`Te invito al grupo ${group?.name} en La Cuota`);
                  const body = encodeURIComponent(`Hola! Únete al grupo para gestionar los gastos juntos: ${window.location.origin}/?group=${groupId}`);
                  window.location.href = `mailto:${inviteEmail}?subject=${subject}&body=${body}`;
                  setShareOpen(false);
                }}>
                  Enviar
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground italic">Se abrirá tu aplicación de correo para enviar la invitación.</p>
            </div>
          </div>
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
