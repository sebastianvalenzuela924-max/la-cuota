import { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { 
  ArrowLeft, Plus, UserPlus, Loader2, CheckCircle2, ArrowRight,
  Trash2, Wand2, Sparkles, Users, HandCoins, History, Receipt,
  MoreVertical, Pencil, Filter, LayoutDashboard, User, Share2, Copy,
  Clock, Scale, ChevronDown, ChevronUp
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
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import type { Category } from '@/components/CategoryPicker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExchangeRates } from '@/lib/currency';
import { CurrencyConverter } from '@/components/CurrencyConverter';
import { QRCodeCanvas } from 'qrcode.react';

const launchCoins = (x = 0.5, y = 0.5) => {
  const defaults = {
    spread: 360,
    ticks: 50,
    gravity: 0.5,
    decay: 0.94,
    startVelocity: 30,
    colors: ['FFE400', 'FFBD00', 'E89400', 'FFCA52', 'AD7A00'],
    shapes: ['circle'] as any,
  };

  const shoot = () => {
    confetti({
      ...defaults,
      particleCount: 40,
      scalar: 1.2,
      shapes: ['circle'],
      origin: { x, y }
    });

    confetti({
      ...defaults,
      particleCount: 20,
      scalar: 0.75,
      shapes: ['circle'],
      origin: { x, y }
    });
  };

  setTimeout(shoot, 0);
  setTimeout(shoot, 100);
  setTimeout(shoot, 200);
};

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
  const [activeTab, setActiveTab] = useState<'balances' | 'history' | 'pending' | 'activity'>('history');
  const [showAllReconciliations, setShowAllReconciliations] = useState(false);

  const [memberOpen, setMemberOpen] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
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
  const [footballTotal, setFootballTotal] = useState('');

  const [payFrom, setPayFrom] = useState('');
  const [payTo, setPayTo] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const { user } = useSaldamosAuth();
  const frequentPeopleKey = user?.id ? `saldamos_frequent_people_${user.id}` : 'saldamos_frequent_people';
  const peopleGroupsKey = user?.id ? `saldamos_people_groups_${user.id}` : 'saldamos_people_groups';

  const [frequentPeople, setFrequentPeople] = useState<string[]>([]);
  const [peopleGroups, setPeopleGroups] = useState<Record<string, string[]>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(frequentPeopleKey);
      setFrequentPeople(saved ? JSON.parse(saved) : []);
    } catch {
      setFrequentPeople([]);
    }
    try {
      const saved = localStorage.getItem(peopleGroupsKey);
      setPeopleGroups(saved ? JSON.parse(saved) : {});
    } catch {
      setPeopleGroups({});
    }
  }, [frequentPeopleKey, peopleGroupsKey]);

  const groupEmoji = localStorage.getItem(`group_emoji_${groupId}`);
  const isFootball = groupEmoji === '⚽' || group?.name.toLowerCase().includes('futbol') || group?.name.toLowerCase().includes('fútbol');
  const rawGroupMode = localStorage.getItem(`group_mode_${groupId}`);
  const groupMode = rawGroupMode || (isFootball ? 'tracker' : 'balance');
  const hasTrackerExpenses = useMemo(() => expenses.some(ex => ex.track_payments), [expenses]);
  const isTracker = groupMode === 'tracker' || hasTrackerExpenses;

  // Filters and search
  const [historySearch, setHistorySearch] = useState('');
  const [historyCategory, setHistoryCategory] = useState('all');
  const [displayCurrency, setDisplayCurrency] = useState<string>(group?.currency ?? 'CLP');
  const [showConverter, setShowConverter] = useState(false);
  const [expandedExpenses, setExpandedExpenses] = useState<Set<string>>(new Set());
  const [myMemberId, setMyMemberId] = useState<string | null>(() => localStorage.getItem(`saldamos_id_${groupId}`));
  const [processingSettlements, setProcessingSettlements] = useState<Set<string>>(new Set());
  const [isCollaborator, setIsCollaborator] = useState<boolean>(false);
  const [joining, setJoining] = useState(false);
  const { convert, loading: ratesLoading, error: ratesError, fetchedAt } = useExchangeRates(group?.currency ?? 'CLP');

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [g, m, e, c] = await Promise.all([
        saldamosSupabase.from('groups').select('id, name, currency, owner_id').eq('id', groupId).maybeSingle(),
        saldamosSupabase.from('group_members').select('id, name, joined_at').eq('group_id', groupId).order('joined_at', { ascending: true }),
        saldamosSupabase.from('expenses').select('id, description, total_amount, expense_date, is_settlement, is_personal, category_id, track_payments, created_at, expense_contributions(id, member_id, amount_paid, amount_owed, is_settled)').eq('group_id', groupId).order('expense_date', { ascending: false }),
        saldamosSupabase.from('expense_categories' as any).select('id, name, is_default').eq('group_id', groupId),
      ]);
      
      if (g.error) throw g.error;
      if (m.error) throw m.error;
      
      if (g.data) {
        setGroup(g.data);
        const { data: sess } = await saldamosSupabase.auth.getSession();
        const userId = sess.session?.user?.id;
        
        if (userId) {
          const isOwner = g.data.owner_id === userId;
          const { data: collab } = await saldamosSupabase
            .from('group_collaborators')
            .select('id')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .maybeSingle();
          
          setIsCollaborator(isOwner || !!collab);
        }
      }
      
      setMembers(m.data ?? []);
      if (e.data) {
        const mappedExpenses = e.data.map((ex: any) => ({
          ...ex,
          contributions: ex.expense_contributions || []
        }));
        setExpenses(mappedExpenses);
      }
      if (c.data) setCategories(c.data as any);
    } catch (err: any) {
      console.error('Error loading group:', err);
      if (!silent) toast.error('Error al cargar datos: ' + (err.message || 'Error desconocido'));
    } finally {
      if (!silent) setLoading(false);
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
    if (activeTab === 'activity') loadActivities();
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
  
  const reconciliationExpenses = useMemo(() => 
    expenses.filter(ex => ex.is_settlement).sort((a, b) => 
      new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime()
    ), 
  [expenses]);

  const totalSettledAmount = useMemo(() => 
    reconciliationExpenses.reduce((sum, ex) => sum + ex.total_amount, 0),
  [reconciliationExpenses]);

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
    
    if (editingMemberId) {
      // Update existing
      const { error } = await saldamosSupabase
        .from('group_members')
        .update({ name: memberName.trim() })
        .eq('id', editingMemberId);
      
      if (error) { toast.error(error.message); setSavingMember(false); return; }
      toast.success('Nombre actualizado');
      await logActivity('MEMBER_UPDATED', { name: memberName.trim() });
    } else {
      // Add new
      const { data, error } = await saldamosSupabase
        .from('group_members')
        .insert({ group_id: groupId, name: memberName.trim() })
        .select()
        .single();
      
      if (error) { toast.error(error.message); setSavingMember(false); return; }
      
      // Update local state immediately
      const newMember = data as any;
      setMembers(prev => [...prev, newMember]);
      
      toast.success(`${memberName.trim()} agregado`);
      await logActivity('MEMBER_ADDED', { name: memberName.trim() });
      
      // Auto-save to frequent people (contacts)
      const saved = localStorage.getItem(frequentPeopleKey);
      const people: string[] = saved ? JSON.parse(saved) : [];
      if (!people.includes(memberName.trim())) {
        people.push(memberName.trim());
        localStorage.setItem(frequentPeopleKey, JSON.stringify(people));
        setFrequentPeople(people);
      }
    }
    
    setSavingMember(false);
    setMemberName('');
    setEditingMemberId(null);
    await load(true); // Silent reload to keep data in sync
  };

  const addMemberByName = async (name: string) => {
    if (!name.trim()) return;
    if (members.some(m => m.name.toLowerCase() === name.trim().toLowerCase())) {
      toast.info(`${name.trim()} ya está en el grupo`);
      return;
    }
    
    setSavingMember(true);
    const { data, error } = await saldamosSupabase
      .from('group_members')
      .insert({ group_id: groupId, name: name.trim() })
      .select()
      .single();
    
    if (error) { toast.error(error.message); setSavingMember(false); return; }
    
    setMembers(prev => [...prev, data as any]);
    toast.success(`${name.trim()} agregado`);
    await logActivity('MEMBER_ADDED', { name: name.trim() });
    
    setSavingMember(false);
    await load(true);
  };

  const deleteMember = async (id: string, name: string) => {
    // Check if member has expenses
    const hasExpenses = expenses.some(ex => ex.contributions.some((c: any) => c.member_id === id));
    if (hasExpenses) {
      toast.error(`No puedes eliminar a ${name} porque tiene gastos asociados.`, {
        description: "Primero elimina o edita los gastos donde participa."
      });
      return;
    }

    if (!confirm(`¿Seguro que quieres eliminar a ${name} del grupo?`)) return;

    setSavingMember(true);
    const { error } = await saldamosSupabase
      .from('group_members')
      .delete()
      .eq('id', id);
    
    setSavingMember(false);
    if (error) { toast.error(error.message); return; }
    
    toast.success(`${name} eliminado del grupo`);
    await logActivity('MEMBER_DELETED', { name });
    await load(true);
  };

  const startEditMember = (m: any) => {
    setEditingMemberId(m.id);
    setMemberName(m.name);
  };

  const bulkAddMembers = async (names: string[]) => {
    const toAdd = names.filter(n => !members.some(m => m.name.toLowerCase() === n.toLowerCase()));
    if (toAdd.length === 0) {
      toast.info('Todas estas personas ya están en el grupo');
      return;
    }

    setSavingMember(true);
    try {
      const { data, error } = await saldamosSupabase
        .from('group_members')
        .insert(toAdd.map(name => ({ group_id: groupId, name: name.trim() })))
        .select();
      
      if (error) throw error;
      
      const newMembers = data as any[];
      setMembers(prev => [...prev, ...newMembers]);
      toast.success(`${toAdd.length} personas agregadas`);
      await logActivity('MEMBERS_ADDED_BULK', { count: toAdd.length, names: toAdd });
    } catch (err: any) {
      toast.error('Error al agregar grupo: ' + err.message);
    } finally {
      setSavingMember(false);
      load(true);
    }
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
    
    // 🎉 Confetti for detection
    confetti({ 
      particleCount: 100, 
      spread: 70, 
      origin: { y: 0.6 },
      colors: ['#2563eb', '#10b981', '#f59e0b', '#3b82f6']
    });
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
      .insert({ 
        group_id: groupId, 
        description: 'Importado desde La Cuota', 
        total_amount: total,
        track_payments: isTracker 
      })
      .select('id').single();
    if (expErr || !exp) { setImporting(false); toast.error(expErr?.message ?? 'Error al crear gasto'); return; }

    // Each person: amount_paid = 0 (nobody "paid" the bill via the app), amount_owed = their share
    // In tracker mode, the payerId gets amount_paid = total
    const payerId = myMemberId || Object.keys(consumed)[0] || members[0]?.id;
    const contribsMap: Record<string, { amount_paid: number; amount_owed: number }> = {};
    
    Object.entries(consumed).forEach(([member_id, amount]) => {
      contribsMap[member_id] = {
        amount_paid: 0,
        amount_owed: amount,
      };
    });

    if (isTracker && payerId) {
      if (!contribsMap[payerId]) {
        contribsMap[payerId] = { amount_paid: total, amount_owed: 0 };
      } else {
        contribsMap[payerId].amount_paid = total;
      }
    }

    const contribs = Object.entries(contribsMap).map(([member_id, data]) => ({
      expense_id: (exp as any).id,
      member_id,
      amount_paid: data.amount_paid,
      amount_owed: data.amount_owed,
    }));
    const { error: cErr } = await saldamosSupabase.from('expense_contributions').insert(contribs);
    setImporting(false);
    if (cErr) { toast.error(cErr.message); return; }

    toast.success('✅ Consumos importados desde La Cuota');
    
    // 🎉 Success confetti
    confetti({ 
      particleCount: 150, 
      spread: 100, 
      origin: { y: 0.7 },
      colors: ['#2563eb', '#10b981', '#f59e0b', '#3b82f6']
    });

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
    
    // Check if it's an auto-generated reconciliation and unsettle original contribution
    if (expenseToDelete?.is_settlement && expenseToDelete.description.startsWith('Reconciliación: ')) {
      const match = expenseToDelete.description.match(/Reconciliación: .*? → .*? \((.*)\)/);
      if (match && match[1]) {
        const originalDesc = match[1];
        const originalExp = expenses.find(e => e.description === originalDesc && !e.is_settlement);
        if (originalExp) {
           const amount = expenseToDelete.total_amount;
           const contrib = originalExp.contributions.find((c: any) => c.amount_owed === amount && c.is_settled);
           if (contrib) {
             await saldamosSupabase.from('expense_contributions').update({ is_settled: false }).eq('id', contrib.id);
           }
        }
      }
    }

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
    setActiveTab('history');
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
    if (processingSettlements.has(contributionId)) return;
    
    setProcessingSettlements(prev => new Set(prev).add(contributionId));
    
    const newStatus = !currentStatus;

    // 1. Optimistic Update (Instant UI feedback)
    const previousExpenses = [...expenses];
    setExpenses(prev => prev.map(ex => {
      if (ex.id === expense.id) {
        return {
          ...ex,
          contributions: (ex.contributions || []).map((c: any) => 
            c.id === contributionId ? { ...c, is_settled: newStatus } : c
          )
        };
      }
      return ex;
    }));
    
    try {
      // 2. Perform DB Update
      const { error } = await saldamosSupabase
        .from('expense_contributions')
        .update({ is_settled: newStatus })
        .eq('id', contributionId);
      
      if (error) throw error;

      // 3. Handle Balance Reconciliations (Only in Balance Mode)
      if (newStatus && !isTracker) {
        const fromName = members.find(m => m.id === contribution.member_id)?.name ?? '?';
        const payerContrib = (expense.contributions || []).find((c: any) => c.amount_paid > 0);
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
        
        if (expErr) console.warn('Error creating reconciliation:', expErr);
        
        if (!expErr && exp) {
          await saldamosSupabase.from('expense_contributions').insert([
            { expense_id: (exp as any).id, member_id: contribution.member_id, amount_paid: contribution.amount_owed, amount_owed: 0 },
            { expense_id: (exp as any).id, member_id: payerId, amount_paid: 0, amount_owed: contribution.amount_owed },
          ]);
        }
      } else if (!newStatus && !isTracker) {
        // Un-toggling in balance mode: delete the auto-generated settlement
        const fromName = members.find(m => m.id === contribution.member_id)?.name ?? '?';
        const payerContrib = (expense.contributions || []).find((c: any) => c.amount_paid > 0);
        const toName = members.find(m => m.id === (payerContrib?.member_id || myMemberId))?.name ?? '?';
        const desc = `Reconciliación: ${fromName} → ${toName} (${expense.description})`;
        
        await saldamosSupabase
          .from('expenses')
          .delete()
          .eq('group_id', groupId)
          .eq('is_settlement', true)
          .eq('description', desc);
      }

      // Reload group data to update balances, settlements, and history
      await load(true);

      // Success messages
      if (newStatus) {
        toast.success(isTracker ? 'Marcado como pagado' : 'Pago marcado y balance actualizado');
      } else {
        toast.success('Marcado como pendiente');
      }

      // 4. Celebration logic
      if (newStatus) {
        // Compute allNowSettled based on the optimistic state directly
        const updatedContribs = (expense.contributions || []).map((c: any) =>
          c.id === contributionId ? { ...c, is_settled: true } : c
        );
        const allNowSettled = updatedContribs
          .filter((c: any) => c.amount_owed > 0)
          .every((c: any) => c.is_settled);

        if (isTracker) {
          if (allNowSettled) {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
          } else {
            launchCoins();
          }
        } else {
          // Balance mode zero-debt check
          const totalRemaining = (settlements || []).reduce((sum, s) => sum + s.amount, 0);
          if (totalRemaining - contribution.amount_owed <= 0.1) {
            confetti({ particleCount: 250, spread: 160, origin: { y: 0.6 }, colors: ['#FFD700', '#FFA500', '#FFFFFF', '#00FF00', '#0000FF'] });
            toast.success('🎉 ¡GRUPO SALDADO COMPLETAMENTE!', { duration: 5000 });
          } else if (allNowSettled) {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
          } else {
            launchCoins();
          }
        }
      }

    } catch (err: any) {
      console.error('Error toggling settlement:', err);
      toast.error('Error: ' + err.message);
      setExpenses(previousExpenses); // Revert on failure
    } finally {
      setProcessingSettlements(prev => {
        const next = new Set(prev);
        next.delete(contributionId);
        return next;
      });
    }
  };

  const joinGroup = async () => {
    const { data: sess } = await saldamosSupabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) { toast.error('Debes iniciar sesión para unirte'); return; }
    
    setJoining(true);
    // Cleanup URL immediately
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('group');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
    
    try {
      const { error } = await saldamosSupabase
        .from('group_collaborators')
        .insert({ group_id: groupId, user_id: userId });
      
      if (error) throw error;
      
      setIsCollaborator(true);
      toast.success('¡Te has unido al grupo!');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      
      // Cleanup URL after joining
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('group');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    } catch (err: any) {
      toast.error('Error al unirse: ' + err.message);
    } finally {
      setJoining(false);
    }
  };

  const inviteCollaborator = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
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

  return (
    <div className="space-y-5 animate-slide-right pb-10">
      {/* Unified Dashboard Header Card */}
      <div 
        className={`relative overflow-hidden rounded-[24px] shadow-lg border border-white/10 ${
          isFootball 
            ? 'text-white' 
            : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-800 text-white'
        }`}
        style={isFootball ? {
          background: 'linear-gradient(180deg, #166534 0%, #15803d 18%, #166534 36%, #15803d 54%, #166534 72%, #15803d 90%, #166534 100%)',
        } : undefined}
      >
        {/* Soccer field lines overlay if isFootball is true */}
        {isFootball && (
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
            {/* Center circle */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-2 border-white" />
              <div className="absolute w-1.5 h-1.5 rounded-full bg-white" />
            </div>
            {/* Center line */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
            {/* Left penalty box */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0 w-8 h-10 border-r-2 border-t-2 border-b-2 border-white rounded-r" />
            {/* Right penalty box */}
            <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-10 border-l-2 border-t-2 border-b-2 border-white rounded-l" />
          </div>
        )}

        <div className="relative z-10 p-5 space-y-4">
          {/* Top Bar: Nav Back & Secondary Actions */}
          <div className="flex items-center justify-between gap-3">
            <button 
              onClick={onBack} 
              className="flex items-center gap-1 text-white/80 hover:text-white transition-colors active:scale-95 shrink-0"
            >
              <ArrowLeft className="w-4 h-4 stroke-[3px]" /> 
              <span className="text-xs font-black uppercase tracking-wider">Volver</span>
            </button>

            <div className="flex items-center gap-1.5">
              {!isCollaborator && (
                <Button 
                  size="sm" 
                  onClick={joinGroup} 
                  disabled={joining}
                  className="h-7 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 text-[9px] shadow-sm animate-pulse hover:animate-none border-none shrink-0"
                >
                  {joining ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                  UNIRSE
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-xl px-2 text-[9px] gap-1 bg-white/10 hover:bg-white/20 border-none text-white font-bold shrink-0"
                onClick={handleImportClick}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Importar</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-xl px-2 text-[9px] gap-1 bg-white/10 hover:bg-white/20 border-none text-white font-bold shrink-0"
                onClick={() => setMemberOpen(true)}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Persona</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 rounded-xl bg-white/10 hover:bg-white/20 border-none text-white shrink-0"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Divider line inside card */}
          <div className="border-t border-white/10 border-dashed" />

          {/* Body: Group Information & Main Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl sm:text-3xl drop-shadow-sm font-black tracking-tight leading-tight block break-words">
                  {isFootball && <span className="mr-1">⚽</span>}
                  {group?.name || 'Cargando...'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-1.5 py-0.5 rounded-lg bg-white/20 text-white text-[9px] font-black uppercase tracking-wider">
                  {currency}
                </span>
                <span className="text-[9px] text-white/80 font-black uppercase tracking-widest flex items-center gap-1 bg-white/10 px-1.5 py-0.5 rounded-lg">
                  <Users className="w-3 h-3" /> 
                  {members?.length || 0} {isFootball ? 'Jugadores' : 'Miembros'}
                </span>
              </div>
            </div>

            {/* Main Primary Actions */}
            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <Button
                size="sm"
                className="rounded-xl h-8 px-4 text-xs font-black gap-1.5 bg-white text-blue-700 hover:bg-white/90 shadow-md border-none shrink-0"
                onClick={() => { setSelectedExpense(null); setExpenseOpen(true); }}
              >
                <Plus className="w-4 h-4 text-blue-700" /> GASTO
              </Button>
              
              <Select value={myMemberId || 'none'} onValueChange={handleSetIdentity}>
                <SelectTrigger className="h-8 text-[10px] rounded-xl bg-white/15 border-none hover:bg-white/25 text-white font-black px-3 gap-1.5 min-w-[110px] shadow-sm [&>svg]:text-white">
                  <User className="w-3 h-3 text-white/90" />
                  <SelectValue placeholder="¿Quién eres?" />
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



      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 rounded-xl bg-muted/60 p-1 h-12">
          <TabsTrigger value="history" className="rounded-lg text-[11px] font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-blue-700 data-[state=active]:font-black text-muted-foreground">
            <History className="w-3.5 h-3.5" /> Gastos
          </TabsTrigger>
          <TabsTrigger value="balances" className="rounded-lg text-[11px] font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-blue-700 data-[state=active]:font-black text-muted-foreground">
            <Scale className="w-3.5 h-3.5" /> {isTracker ? 'Pagos' : 'Balances'}
          </TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg text-[11px] font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-blue-700 data-[state=active]:font-black text-muted-foreground">
            <User className="w-3.5 h-3.5" /> Mi Hist.
          </TabsTrigger>
          <TabsTrigger value="activity" className="rounded-lg text-[11px] font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-blue-700 data-[state=active]:font-black text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5" /> Actividad
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="space-y-4 pt-4">
          {isTracker ? (
            <div className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-2xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl shrink-0">📋</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-400">Modo Cobros</p>
                  <p className="text-[10px] text-blue-600/80 dark:text-blue-500/60 leading-tight">Control individual de cada gasto sin balance total.</p>
                </div>
              </div>

              {/* Pending collections in tracker mode */}
              <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <HandCoins className="w-3.5 h-3.5" /> Cobros Pendientes
                </h3>
                {(() => {
                  const items = expenses.filter(ex => ex.track_payments).map(ex => {
                    const myContrib = ex.contributions.find(c => c.member_id === myMemberId);
                    const iPaid = myContrib && myContrib.amount_paid > 0;
                    if (!iPaid) return null;
                    
                    const pending = ex.contributions.filter(c => !c.is_settled && c.amount_owed > 0 && c.member_id !== myMemberId);
                    if (pending.length === 0) return null;

                    return (
                      <div key={ex.id} className="space-y-2 pb-2 border-b border-border/50 last:border-0 last:pb-0">
                        <p className="text-[10px] font-bold text-muted-foreground truncate">{ex.description}</p>
                        {pending.map(c => {
                          const m = members.find(mem => mem.id === c.member_id);
                          return (
                            <div key={c.id} className="flex items-center justify-between bg-emerald-500/5 dark:bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/10">
                              <span className="text-xs font-medium">{m?.name || 'Desconocido'}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{fmt(c.amount_owed)}</span>
                                <Button 
                                  size="sm" 
                                  disabled={processingSettlements.has(c.id)}
                                  className="h-6 px-2 rounded-lg text-[9px] bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                                  onClick={() => toggleSettlement(c, false, ex)}
                                >
                                  {processingSettlements.has(c.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : '¿PAGÓ?'}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }).filter(Boolean);

                  return items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      </div>
                      <p className="text-xs font-bold text-foreground">¡Todo cobrado!</p>
                      <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] leading-tight">No tienes cobros pendientes en este grupo.</p>
                    </div>
                  ) : <div className="space-y-2">{items}</div>;
                })()}
              </div>

              {/* Pending payments in tracker mode (What I owe others) */}
              <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-red-500" /> Pagos Pendientes (Tú debes)
                </h3>
                {(() => {
                  const items = expenses.filter(ex => ex.track_payments).map(ex => {
                    const myContrib = ex.contributions.find(c => c.member_id === myMemberId);
                    if (!myContrib || myContrib.is_settled || myContrib.amount_owed === 0) return null;
                    
                    const payer = ex.contributions.find(c => c.amount_paid > 0);
                    if (payer?.member_id === myMemberId) return null; // Avoid owing yourself

                    const payerName = members.find(m => m.id === payer?.member_id)?.name || 'alguien';

                    return (
                      <div key={ex.id} className="flex items-center justify-between bg-red-50 dark:bg-red-950/20 p-3 rounded-xl border border-red-100 dark:border-red-900/30">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-muted-foreground truncate">{ex.description}</p>
                          <p className="text-[11px] font-medium text-foreground">Debes a <span className="font-bold text-red-500">{payerName}</span></p>
                        </div>
                        <span className="text-sm font-black text-red-600 dark:text-red-400 tabular-nums">{fmt(myContrib.amount_owed)}</span>
                      </div>
                    );
                  }).filter(Boolean);

                  return items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                      <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                        <CheckCircle2 className="w-6 h-6 text-blue-500" />
                      </div>
                      <p className="text-xs font-bold text-foreground">Al día</p>
                      <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] leading-tight">¡Estás al día! No le debes nada a nadie en este grupo.</p>
                    </div>
                  ) : <div className="space-y-2">{items}</div>;
                })()}
              </div>
            </div>
          ) : (
            <>
              {isFootball && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-2xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-xl shrink-0">⚽</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Modo Partido</p>
                    <p className="text-[10px] text-emerald-600/80 dark:text-emerald-500/60 leading-tight">Enfócate en quién ya pagó su cuota del partido.</p>
                  </div>
                </div>
              )}
              <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
                {members.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                    <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                      <Users className="w-6 h-6 text-muted-foreground/60" />
                    </div>
                    <p className="text-xs font-bold text-foreground">Sin miembros</p>
                    <p className="text-[10px] text-muted-foreground mt-1 max-w-[220px] leading-tight">Agrega personas al grupo para comenzar a ver los balances.</p>
                  </div>
                ) : balances.map(b => (
                  <div key={b.memberId} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm font-medium">{b.name}</span>
                    <span className={`text-sm font-bold tabular-nums ${b.balance > 0.01 ? 'text-emerald-600' : b.balance < -0.01 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {b.balance > 0.01 ? '+' : ''}{fmt(b.balance)}
                    </span>
                  </div>
                ))}
              </div>

              {settlements.length > 0 && (
                <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase mb-3">Quién paga a quién</h3>
                  {settlements.map((s, i) => (
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
            </>
          )}

          {!isTracker && (
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
                <Button size="sm" onClick={registerPayment} disabled={savingPayment || !payFrom || !payTo || !payAmount} className="rounded-xl px-4 bg-blue-600 text-white">
                  {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Saldar'}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4 pt-4">

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
                    className="shrink-0 bg-card border border-border/50 rounded-xl px-3 py-2 text-center min-w-[100px] hover:border-blue-300 hover:bg-blue-50/30 transition-all active:scale-95"
                  >
                    <p className="text-[9px] text-muted-foreground uppercase font-bold">{ct.name}</p>
                    <p className="text-xs font-bold text-blue-600">{fmt(ct.total)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {filteredExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center bg-card/30 border border-dashed border-border/80 rounded-2xl p-6">
                <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                  <Receipt className="w-6 h-6 text-muted-foreground/60" />
                </div>
                <p className="text-xs font-bold text-foreground">Sin gastos</p>
                <p className="text-[10px] text-muted-foreground mt-1 max-w-[220px] leading-tight">
                  {historySearch || historyCategory !== 'all' 
                    ? 'No se encontraron gastos con los filtros aplicados.' 
                    : 'Aún no hay gastos registrados. Presiona "+ GASTO" para añadir uno.'}
                </p>
              </div>
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
                      showYellow ? 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/20 dark:border-amber-500/30 border-l-4 border-l-amber-400' :
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
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {isSettlement ? <HandCoins className="w-4 h-4" /> : <Receipt className={`w-4 h-4 ${showYellow ? 'animate-bounce' : ''}`} />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold truncate pr-2">
                            {ex.description || (isSettlement ? 'Pago/Ajuste' : 'Gasto sin descripción')}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 whitespace-nowrap overflow-hidden">
                            <div className="flex items-center gap-1 bg-muted/50 px-1.5 py-0.5 rounded-lg border border-border/50">
                              <span className="text-[10px] text-foreground font-black uppercase tracking-tighter">
                                {new Date(ex.expense_date).getDate()}
                              </span>
                              <span className="text-[8px] text-muted-foreground font-bold uppercase">
                                {new Date(ex.expense_date).toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')}
                              </span>
                            </div>
                            {!isSettlement && ex.category_id && (
                              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight truncate opacity-70">
                                {categories.find(c => c.id === ex.category_id)?.name}
                              </span>
                            )}
                            {showYellow && (
                              <span className="flex items-center gap-1 text-[9px] text-emerald-700 font-black bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                COBRO
                              </span>
                            )}
                            {allSettled && !isSettlement && (
                              <span className="flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full">
                                ✓
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
                            const originalNet = (myContrib.amount_paid || 0) - (myContrib.amount_owed || 0);
                            
                            if (originalNet > 0.01) {
                              // If I am the payer, calculate how much is still owed to me dynamically
                              const remainingToCollect = ex.contributions
                                .filter((c: any) => !c.is_settled && c.member_id !== myMemberId)
                                .reduce((sum: number, c: any) => sum + (c.amount_owed || 0), 0);

                              if (remainingToCollect > 0.01) {
                                return (
                                  <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">
                                    +{formatMoney(remainingToCollect, group?.currency)} te deben
                                  </p>
                                );
                              } else {
                                return (
                                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">
                                    ✓ saldado
                                  </p>
                                );
                              }
                            }
                            
                            if (originalNet < -0.01) {
                              if (myContrib.is_settled) {
                                return (
                                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">
                                    ✓ saldado
                                  </p>
                                );
                              }
                              return (
                                <p className="text-[9px] font-bold text-red-500 uppercase tracking-tighter">
                                  {formatMoney(Math.abs(originalNet), group?.currency)} debes
                                </p>
                              );
                            }
                            
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
                                <div key={c.member_id} className={`flex items-center justify-between p-2 rounded-xl text-xs ${
                                  c.is_settled 
                                    ? 'bg-emerald-500/10 border border-emerald-500/20' 
                                    : 'bg-muted/30'
                                }`}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isPayer ? 'bg-blue-500' : 'bg-muted-foreground/30'}`} />
                                    <span className={`truncate font-medium ${isMe ? 'text-blue-600 font-bold' : ''}`}>
                                      {m?.name || 'Desconocido'}
                                    </span>
                                    {isPayer && <span className="text-[9px] bg-blue-500/15 text-blue-500 dark:text-blue-400 px-1 rounded uppercase font-bold">Pagó</span>}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-right tabular-nums">
                                      {c.amount_paid > 0 && <p className="text-blue-500 dark:text-blue-400 font-bold">+{formatMoney(c.amount_paid, group?.currency)}</p>}
                                      {c.amount_owed > 0 && (
                                        <p className={c.is_settled ? 'text-emerald-500 dark:text-emerald-400 font-medium' : 'text-red-500 dark:text-red-400'}>
                                          {c.is_settled ? '✓ ' : '-'}{formatMoney(c.amount_owed, group?.currency)}
                                        </p>
                                      )}
                                    </div>
                                    
                                    {owesMe && (
                                      <Button
                                        size="sm"
                                        disabled={processingSettlements.has(c.id)}
                                        variant={c.is_settled ? "ghost" : "outline"}
                                        className={`h-7 px-2 rounded-lg text-[10px] font-bold ${
                                          c.is_settled 
                                            ? 'text-emerald-500 dark:text-emerald-400' 
                                            : 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30'
                                        }`}
                                        onClick={(e) => { e.stopPropagation(); toggleSettlement(c, c.is_settled, ex); }}
                                      >
                                        {processingSettlements.has(c.id) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : (c.is_settled ? <CheckCircle2 className="w-3 h-3 mr-1" /> : null)}
                                        {c.is_settled ? 'PAGADO' : 'MARCAR PAGO'}
                                      </Button>
                                    )}
                                    {!owesMe && c.amount_owed > 0 && c.is_settled && (
                                      <div className="flex items-center text-emerald-500 dark:text-emerald-400 gap-1 text-[10px] font-bold pr-1">
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
                              className="h-8 rounded-lg text-[10px] gap-1.5 hover:bg-blue-100 hover:text-blue-700" 
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

        <TabsContent value="pending" className="pt-4">
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

        <TabsContent value="activity" className="space-y-4 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Log de actividad</h3>
            <Button variant="ghost" size="sm" className="h-7 text-[10px] rounded-lg" onClick={loadActivities} disabled={loadingActivities}>
              {loadingActivities ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refrescar'}
            </Button>
          </div>

          <div className="space-y-3">
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center bg-card/30 border border-dashed border-border/80 rounded-2xl p-6">
                <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                  <History className="w-6 h-6 text-muted-foreground/60" />
                </div>
                <p className="text-xs font-bold text-foreground">Sin actividad</p>
                <p className="text-[10px] text-muted-foreground mt-1 max-w-[220px] leading-tight">No se ha registrado actividad reciente en este grupo.</p>
              </div>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="flex gap-3 items-start p-3 rounded-xl bg-card border border-border/50">
                  <div className={`mt-1 p-1.5 rounded-lg ${
                    a.action.includes('DELETED') ? 'bg-red-50 text-red-500' : 
                    a.action.includes('ADDED') || a.action.includes('IMPORTED') ? 'bg-emerald-50 text-emerald-500' :
                    'bg-blue-50 text-blue-500'
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
        mode={isTracker ? 'tracker' : 'balance'}
        myMemberId={myMemberId}
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

      {/* Manage Members Dialog */}
      <Dialog open={memberOpen} onOpenChange={(v) => { setMemberOpen(v); if(!v) { setEditingMemberId(null); setMemberName(''); } }}>
        <DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMemberId ? 'Editar persona' : 'Personas del grupo'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-2">
            <div className="space-y-4">
              {editingMemberId ? (
                <div className="space-y-2 bg-blue-50/50 p-4 rounded-2xl border border-blue-100 animate-in zoom-in-95">
                  <Label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest px-1">Editar nombre</Label>
                  <Input value={memberName} onChange={e => setMemberName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMember()} placeholder="Nuevo nombre" className="rounded-xl border-blue-200" autoFocus />
                  <div className="flex gap-2 pt-2">
                    <Button variant="ghost" className="flex-1 rounded-xl" onClick={() => { setEditingMemberId(null); setMemberName(''); }}>Cancelar</Button>
                    <Button onClick={addMember} disabled={savingMember || !memberName.trim()} className="flex-1 rounded-xl bg-blue-600 text-white">Guardar</Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Reorganized: Add manually at the top */}
                  <div className="space-y-2 bg-muted/20 p-3 rounded-2xl border border-border/50">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Agregar manualmente</Label>
                    <div className="flex gap-2">
                      <Input 
                        value={memberName} 
                        onChange={e => setMemberName(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && addMember()} 
                        placeholder="Ej: Cami" 
                        className="rounded-xl bg-background" 
                      />
                      <Button onClick={addMember} disabled={savingMember || !memberName.trim()} className="rounded-xl bg-blue-600 text-white px-6 shrink-0">
                        {savingMember ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Agregar'}
                      </Button>
                    </div>
                  </div>

                  {Object.keys(peopleGroups).length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest px-1">Importar grupo completo</Label>
                      <div className="flex flex-wrap gap-2">
                        {Object.keys(peopleGroups).map(gn => (
                          <button
                            key={gn}
                            type="button"
                            onClick={() => bulkAddMembers(peopleGroups[gn])}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black bg-blue-600 text-white shadow-md hover:bg-blue-700 transition-all active:scale-95 shrink-0"
                          >
                            <Users className="w-3 h-3" />
                            {gn} ({peopleGroups[gn].length})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {frequentPeople.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Tus Frecuentes (Click para agregar)</Label>
                      <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                        {frequentPeople.map(p => {
                          const alreadyIn = members.some(m => m.name.toLowerCase() === p.toLowerCase());
                          return (
                            <button
                              key={p}
                              type="button"
                              disabled={alreadyIn || savingMember}
                              onClick={() => addMemberByName(p)}
                              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                                alreadyIn 
                                  ? 'opacity-40 bg-muted cursor-not-allowed grayscale' 
                                  : 'bg-white border-blue-100 text-blue-600 hover:border-blue-300 hover:bg-blue-50 active:scale-95'
                              }`}
                            >
                              {alreadyIn ? '✓ ' : '+ '}{p}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-border/50 my-2" />

                  {/* Members list at the bottom */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Personas en este grupo ({members.length})</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {members.map(m => (
                        <div key={m.id} className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/50 hover:border-blue-200 transition-all group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-black group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              {m.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-bold text-foreground">{m.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg text-blue-600 hover:bg-blue-100"
                              onClick={() => startEditMember(m)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50"
                              onClick={() => deleteMember(m.id, m.name)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {members.length === 0 && (
                        <p className="text-center py-6 text-xs text-muted-foreground italic bg-muted/10 rounded-2xl border border-dashed">No hay nadie en el grupo aún.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter className="border-t border-dashed pt-4">
            {!editingMemberId && <Button variant="outline" className="w-full rounded-xl h-12 font-bold" onClick={() => setMemberOpen(false)}>Listo / Cerrar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share/Invite Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white text-xl">
                <Share2 className="w-6 h-6" /> Compartir grupo
              </DialogTitle>
              <DialogDescription className="text-blue-100 mt-2">
                Invita a tus amigos para que todos puedan ver y gestionar los gastos de "{group?.name}".
              </DialogDescription>
            </DialogHeader>
          </div>

          <Tabs defaultValue="link" className="w-full">
            <div className="px-6 pt-4">
              <TabsList className="grid grid-cols-3 w-full rounded-xl bg-muted/50">
                <TabsTrigger value="link" className="rounded-lg text-xs font-bold">Enlace</TabsTrigger>
                <TabsTrigger value="whatsapp" className="rounded-lg text-xs font-bold">WhatsApp</TabsTrigger>
                <TabsTrigger value="qr" className="rounded-lg text-xs font-bold">QR</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6">
              <TabsContent value="link" className="mt-0 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Enlace directo</Label>
                  <div className="flex gap-2">
                    <Input 
                      readOnly 
                      value={`${window.location.origin}/?group=${groupId}`} 
                      className="rounded-xl text-xs font-mono bg-muted/30 border-dashed" 
                    />
                    <Button size="icon" className="rounded-xl shrink-0 bg-blue-600 hover:bg-blue-700" onClick={() => copyToClipboard(`${window.location.origin}/?group=${groupId}`)}>
                      <Copy className="w-4 h-4 text-white" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2 pt-2 border-t border-dashed">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Invitar por Email</Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="amigo@gmail.com" 
                      value={inviteEmail} 
                      onChange={e => setInviteEmail(e.target.value)}
                      className="rounded-xl text-sm"
                    />
                    <Button variant="outline" className="rounded-xl border-blue-200 text-blue-600 font-bold px-4" onClick={() => {
                      const subject = encodeURIComponent(`Te invito al grupo ${group?.name} en La Cuota`);
                      const body = encodeURIComponent(`¡Hola! Únete al grupo para gestionar los gastos juntos:\n\n${window.location.origin}/?group=${groupId}`);
                      window.location.href = `mailto:${inviteEmail}?subject=${subject}&body=${body}`;
                    }}>
                      Invitar
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="whatsapp" className="mt-0 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex flex-col items-center text-center py-4 space-y-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-10 h-10 text-green-600 fill-current">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">Compartir por WhatsApp</h3>
                    <p className="text-xs text-muted-foreground mt-1 px-4">
                      Envía el enlace directamente a tu grupo de amigos o pareja.
                    </p>
                  </div>
                  <Button 
                    className="w-full rounded-2xl bg-green-500 hover:bg-green-600 text-white font-black py-6 text-base"
                    onClick={() => {
                      const text = encodeURIComponent(`¡Hola! Únete al grupo "${group?.name}" en La Cuota para gestionar nuestros gastos juntos: ${window.location.origin}/?group=${groupId}`);
                      window.open(`https://wa.me/?text=${text}`, '_blank');
                    }}
                  >
                    Abrir WhatsApp
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="qr" className="mt-0 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex flex-col items-center py-4 space-y-6">
                  <div className="p-4 bg-white rounded-3xl shadow-xl border-8 border-blue-50">
                    <QRCodeCanvas 
                      value={`${window.location.origin}/?group=${groupId}`} 
                      size={180}
                      level="H"
                      includeMargin={false}
                      imageSettings={{
                        src: "/favicon.ico",
                        x: undefined,
                        y: undefined,
                        height: 40,
                        width: 40,
                        excavate: true,
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground">Escanea para unirte</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest font-black">Escanea con la cámara de tu celular</p>
                  </div>
                  <Button variant="ghost" size="sm" className="rounded-xl text-blue-600 font-bold" onClick={() => window.print()}>
                    Imprimir QR
                  </Button>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="bg-muted/30 p-4">
            <Button variant="ghost" className="w-full rounded-xl h-10 font-bold text-muted-foreground" onClick={() => setShareOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from La Cuota Dialog */}
      <Dialog open={importOpen} onOpenChange={v => { setImportOpen(v); if (!v) { setImportParsed(null); setImportText(''); setFootballTotal(''); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-blue-500" /> Importar</DialogTitle>
          </DialogHeader>

          {!importParsed ? (
            <div className="space-y-3">
              <Textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={`Pega el mensaje de La Cuota:\n👤 *Pedro*: $5.500\n\nO una lista de fútbol:\nMartes 21.10\ncanchas 6 $6.000\n1. Neto\n2. Rodo\n3. Iván`}
                className="min-h-[180px] font-mono text-xs rounded-xl"
              />
              <DialogFooter>
                <Button onClick={handleParseImport} disabled={!importText.trim()} className="bg-blue-600 text-white rounded-xl w-full">⚡ Detectar personas</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Football mode: amounts are 0, ask user for total */}
              {assignments.every(a => a.amount === 0) && (
                <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-3 space-y-2">
                  <p className="text-xs font-bold text-green-700 dark:text-green-400 flex items-center gap-1.5">
                    ⚽ Lista de jugadores detectada — {assignments.length} personas
                  </p>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      placeholder="Total a dividir ($)"
                      value={footballTotal}
                      onChange={e => {
                        setFootballTotal(e.target.value);
                        const total = Number(e.target.value);
                        if (total > 0) {
                          const share = Math.round(total / assignments.length);
                          setAssignments(prev => prev.map(a => ({ ...a, amount: share })));
                        }
                      }}
                      className="rounded-xl text-sm h-9 flex-1"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">
                      {footballTotal && Number(footballTotal) > 0
                        ? `= $${Math.round(Number(footballTotal) / assignments.length).toLocaleString('es-CL')} c/u`
                        : 'por persona'}
                    </span>
                  </div>
                </div>
              )}

              {assignments.map((a, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border bg-accent/30 p-3">
                  <div>
                    <p className="font-semibold text-xs truncate">{a.parsedName}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{a.amount > 0 ? fmt(a.amount) : '—'}</p>
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
              <Button
                onClick={handleApplyImport}
                disabled={importing || assignments.every(a => a.amount === 0)}
                className="bg-blue-600 text-white rounded-xl w-full"
              >
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {assignments.every(a => a.amount === 0) ? 'Ingresa el total primero' : 'Importar consumos'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => { setSelectedExpense(null); setExpenseOpen(true); }}
        className="fixed bottom-[90px] right-6 z-50 w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 group ring-4 ring-white/50 dark:ring-background/50"
      >
        <span className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-300"></span>
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full animate-pulse border-2 border-white dark:border-background shadow-sm"></span>
        <p className="text-3xl font-black shadow-black/20 drop-shadow-md tracking-tighter pointer-events-none mt-[-2px]">
          $
        </p>
      </button>
    </div>
  );
}
