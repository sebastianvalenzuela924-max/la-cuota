import { useState, useEffect, useMemo } from 'react';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  ArrowLeft, Coins, TrendingUp, TrendingDown,
  Loader2, User, CheckCircle2, ChevronDown, ChevronUp, AlertCircle,
  CreditCard, Plus, Trash2, Banknote, Wallet, UserCheck, Pencil, Check
} from 'lucide-react';
import { formatMoney, computeBalances, simplifyDebts } from '@/lib/balances';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Group {
  id: string;
  name: string;
  currency: string;
  owner_id: string;
}

interface Member {
  id: string;
  name: string;
  group_id: string;
}

interface GroupSummary {
  group: Group;
  myMemberId: string | null;
  myMemberName: string;
  spent: number;
  balance: number;
  debtsToPay: { toName: string; amount: number }[];
  debtsToReceive: { fromName: string; amount: number }[];
  membersList: Member[];
}

interface PaymentMethodSummary {
  method: string; // 'Efectivo', card names, or 'Sin etiqueta'
  type: 'cash' | 'card' | 'untagged';
  currency: string;
  total: number;
}

interface MyProfileDashboardProps {
  onBack: () => void;
}

// Helper to parse payment method from expense description
function parsePaymentMethod(description: string): { type: 'cash' | 'card' | 'untagged'; label: string } {
  const cashMatch = description.match(/\[Efectivo\]/i);
  const cardMatch = description.match(/\[Tarjeta:\s*([^\]]+)\]/i);
  if (cashMatch) return { type: 'cash', label: 'Efectivo' };
  if (cardMatch) return { type: 'card', label: cardMatch[1].trim() };
  return { type: 'untagged', label: 'Sin etiqueta' };
}

export default function MyProfileDashboard({ onBack }: MyProfileDashboardProps) {
  const { user } = useSaldamosAuth();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [identities, setIdentities] = useState<Record<string, string>>({}); // groupId -> memberId
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Cards state
  const [savedCards, setSavedCards] = useState<string[]>([]);
  const [newCardName, setNewCardName] = useState('');
  const [cardsExpanded, setCardsExpanded] = useState(true);
  const [paymentExpanded, setPaymentExpanded] = useState(true);

  // Global name state
  const [globalName, setGlobalName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const globalNameKey = user?.id ? `saldamos_my_name_${user.id}` : 'saldamos_my_name';

  useEffect(() => {
    if (!user?.id) return;
    const saved = localStorage.getItem(globalNameKey);
    if (saved) setGlobalName(saved);
  }, [user?.id]);

  const saveGlobalName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(globalNameKey, trimmed);
    setGlobalName(trimmed);
    setEditingName(false);

    // Auto-assign identity in groups where a member name matches
    let assigned = 0;
    groups.forEach(g => {
      if (identities[g.id]) return; // Skip if already assigned
      const groupMembers = members.filter(m => m.group_id === g.id);
      const match = groupMembers.find(m =>
        m.name.toLowerCase() === trimmed.toLowerCase() ||
        m.name.toLowerCase().startsWith(trimmed.toLowerCase()) ||
        trimmed.toLowerCase().startsWith(m.name.toLowerCase())
      );
      if (match) {
        localStorage.setItem(`saldamos_id_${g.id}`, match.id);
        setIdentities(prev => ({ ...prev, [g.id]: match.id }));
        assigned++;
      }
    });

    toast.success(`✅ Nombre guardado${assigned > 0 ? ` · Asignado en ${assigned} grupo${assigned > 1 ? 's' : ''}` : ''}`);
  };

  const cardsKey = user?.id ? `saldamos_user_cards_${user.id}` : 'saldamos_user_cards';

  // Load cards
  useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = localStorage.getItem(cardsKey);
      setSavedCards(stored ? JSON.parse(stored) : []);
    } catch {
      setSavedCards([]);
    }
  }, [user?.id, cardsKey]);

  const saveCards = (cards: string[]) => {
    setSavedCards(cards);
    localStorage.setItem(cardsKey, JSON.stringify(cards));
  };

  const handleAddCard = () => {
    const trimmed = newCardName.trim();
    if (!trimmed) return;
    if (savedCards.includes(trimmed)) {
      toast.error('Ya existe una tarjeta con ese nombre');
      return;
    }
    const updated = [...savedCards, trimmed];
    saveCards(updated);
    setNewCardName('');
    toast.success(`Tarjeta "${trimmed}" agregada`);
  };

  const handleDeleteCard = (card: string) => {
    const updated = savedCards.filter(c => c !== card);
    saveCards(updated);
    toast.success(`Tarjeta "${card}" eliminada`);
  };

  // Load identities from localStorage
  const loadIdentities = (groupList: Group[]) => {
    const ids: Record<string, string> = {};
    groupList.forEach(g => {
      const savedId = localStorage.getItem(`saldamos_id_${g.id}`);
      if (savedId) ids[g.id] = savedId;
    });
    setIdentities(ids);
  };

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch groups (RLS handles visibility)
      const { data: groupList, error: gErr } = await saldamosSupabase
        .from('groups')
        .select('id, name, currency, owner_id');
      if (gErr) throw gErr;
      
      const loadedGroups = groupList || [];
      setGroups(loadedGroups);
      loadIdentities(loadedGroups);

      if (loadedGroups.length > 0) {
        const groupIds = loadedGroups.map(g => g.id);

        // 2. Fetch members
        const { data: memberList, error: mErr } = await saldamosSupabase
          .from('group_members')
          .select('id, name, group_id')
          .in('group_id', groupIds);
        if (mErr) throw mErr;
        setMembers(memberList || []);

        // Auto-assign identity using global name for groups that don't have one yet
        const myName = localStorage.getItem(globalNameKey)?.trim().toLowerCase();
        if (myName) {
          const updatedIds: Record<string, string> = {};
          loadedGroups.forEach(g => {
            const existing = localStorage.getItem(`saldamos_id_${g.id}`);
            if (existing) {
              updatedIds[g.id] = existing;
            } else {
              const groupMembers = (memberList || []).filter((m: any) => m.group_id === g.id);
              const match = groupMembers.find((m: any) =>
                m.name.toLowerCase() === myName ||
                m.name.toLowerCase().startsWith(myName) ||
                myName.startsWith(m.name.toLowerCase())
              );
              if (match) {
                localStorage.setItem(`saldamos_id_${g.id}`, match.id);
                updatedIds[g.id] = match.id;
              }
            }
          });
          setIdentities(updatedIds);
        }

        // 3. Fetch expenses with contributions
        const { data: expenseList, error: eErr } = await saldamosSupabase
          .from('expenses')
          .select('id, description, total_amount, is_settlement, is_personal, group_id, expense_contributions(id, member_id, amount_paid, amount_owed, is_settled)')
          .in('group_id', groupIds);
        if (eErr) throw eErr;
        setExpenses(expenseList || []);
      }
    } catch (err: any) {
      console.error('Error loading profile dashboard:', err);
      toast.error('Error al cargar balances: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const handleSetIdentity = (groupId: string, memberId: string) => {
    if (memberId === 'none') {
      localStorage.removeItem(`saldamos_id_${groupId}`);
      setIdentities(prev => {
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
    } else {
      localStorage.setItem(`saldamos_id_${groupId}`, memberId);
      setIdentities(prev => ({ ...prev, [groupId]: memberId }));
    }
    toast.success('Identidad actualizada');
  };

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Compile calculations for each group
  const summaries = useMemo((): GroupSummary[] => {
    return groups.map(g => {
      const groupMembers = members.filter(m => m.group_id === g.id);
      const groupExpenses = expenses
        .filter(ex => ex.group_id === g.id)
        .map(ex => ({
          ...ex,
          contributions: ex.expense_contributions || []
        }));

      // Get identity
      const myId = identities[g.id] || null;
      const myMember = groupMembers.find(m => m.id === myId);
      const myName = myMember ? myMember.name : '(Sin seleccionar)';

      // Calculate total spent by user (sum of consumed share where c.member_id === myId)
      let totalSpent = 0;
      if (myId) {
        groupExpenses.forEach(ex => {
          if (ex.is_settlement) return;
          
          if (ex.is_personal) {
            // If it's a personal expense, the payer is the one who consumed it.
            const userContrib = ex.contributions.find((c: any) => c.member_id === myId);
            if (userContrib) {
              totalSpent += Number(ex.total_amount) || 0;
            }
            return;
          }
          
          const userContrib = ex.contributions.find((c: any) => c.member_id === myId);
          if (userContrib) {
            // Determine if there are specific non-zero owed amounts registered
            const sumOwed = ex.contributions.reduce((s: number, cc: any) => s + (Number(cc.amount_owed) || 0), 0);
            const useOwed = sumOwed > 0.01;
            
            // If specific owed amounts exist, use the user's specific amount_owed.
            // Otherwise, fallback to equal share of the total expense amount.
            const consumed = useOwed 
              ? (Number(userContrib.amount_owed) || 0) 
              : (ex.contributions.length > 0 ? (Number(ex.total_amount) / ex.contributions.length) : 0);
              
            totalSpent += consumed;
          }
        });
      }

      // Calculate balance using computeBalances
      const balances = computeBalances(groupMembers, groupExpenses);
      const myBalanceObj = balances.find(b => b.memberId === myId);
      const balance = myBalanceObj ? myBalanceObj.balance : 0;

      // Calculate specific debts to pay/receive
      const debtsToPay: { toName: string; amount: number }[] = [];
      const debtsToReceive: { fromName: string; amount: number }[] = [];

      if (myId) {
        const settlements = simplifyDebts(balances);
        settlements.forEach(s => {
          if (s.from === myId) {
            debtsToPay.push({ toName: s.toName, amount: s.amount });
          } else if (s.to === myId) {
            debtsToReceive.push({ fromName: s.fromName, amount: s.amount });
          }
        });
      }

      return {
        group: g,
        myMemberId: myId,
        myMemberName: myName,
        spent: totalSpent,
        balance,
        debtsToPay,
        debtsToReceive,
        membersList: groupMembers
      };
    });
  }, [groups, members, expenses, identities]);

  // Aggregate stats (separated by currency)
  const totalsByCurrency = useMemo(() => {
    const map: Record<string, { spent: number; positiveBalance: number; negativeBalance: number }> = {};
    
    summaries.forEach(s => {
      const cur = s.group.currency;
      if (!map[cur]) {
        map[cur] = { spent: 0, positiveBalance: 0, negativeBalance: 0 };
      }
      map[cur].spent += s.spent;
      if (s.balance > 0) {
        map[cur].positiveBalance += s.balance;
      } else if (s.balance < 0) {
        map[cur].negativeBalance += Math.abs(s.balance);
      }
    });

    return Object.entries(map).map(([currency, stats]) => ({
      currency,
      ...stats
    }));
  }, [summaries]);

  // Payment method spending breakdown
  // Reads from expense descriptions tagged with [Efectivo] or [Tarjeta: X]
  // Only includes expenses where myId was the payer (amount_paid > 0)
  const paymentMethodSummaries = useMemo((): PaymentMethodSummary[] => {
    const map: Record<string, { type: 'cash' | 'card' | 'untagged'; currency: string; total: number }> = {};

    expenses.forEach(ex => {
      const group = groups.find(g => g.id === ex.group_id);
      if (!group) return;
      const myId = identities[ex.group_id];
      if (!myId) return;

      const contributions = ex.expense_contributions || [];
      const myContrib = contributions.find((c: any) => c.member_id === myId);
      if (!myContrib || Number(myContrib.amount_paid) <= 0) return;

      const paidAmount = Number(myContrib.amount_paid) || 0;
      const { type, label } = parsePaymentMethod(ex.description || '');
      const key = `${label}||${group.currency}`;

      if (!map[key]) {
        map[key] = { type, currency: group.currency, total: 0 };
      }
      map[key].total += paidAmount;
    });

    return Object.entries(map)
      .map(([key, val]) => ({
        method: key.split('||')[0],
        type: val.type,
        currency: val.currency,
        total: val.total
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, groups, identities]);

  // Card-specific spending breakdown for the "Mis Tarjetas" section
  const cardSpendings = useMemo(() => {
    const spendings: Record<string, Record<string, number>> = {};
    
    // Initialize spendings for all saved cards
    savedCards.forEach(card => {
      spendings[card] = {};
    });

    expenses.forEach(ex => {
      const group = groups.find(g => g.id === ex.group_id);
      if (!group) return;
      
      const myId = identities[ex.group_id];
      if (!myId) return;

      const contributions = ex.expense_contributions || [];
      const myContrib = contributions.find((c: any) => c.member_id === myId);
      if (!myContrib || Number(myContrib.amount_paid) <= 0) return;

      const paidAmount = Number(myContrib.amount_paid) || 0;
      const { type, label } = parsePaymentMethod(ex.description || '');
      if (type === 'card' && label) {
        // Find if label matches one of our saved cards (case-insensitive) or use exact label
        const matchedCard = savedCards.find(c => c.toLowerCase() === label.toLowerCase()) || label;
        
        if (!spendings[matchedCard]) {
          spendings[matchedCard] = {};
        }
        if (!spendings[matchedCard][group.currency]) {
          spendings[matchedCard][group.currency] = 0;
        }
        spendings[matchedCard][group.currency] += paidAmount;
      }
    });

    return spendings;
  }, [expenses, groups, identities, savedCards]);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-24 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Cargando tu Perfil Global...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-left pb-12">
      {/* Header compact block */}
      <div className="relative overflow-hidden rounded-[24px] shadow-lg border border-white/10 bg-gradient-to-br from-purple-700 via-fuchsia-700 to-pink-700 text-white">
        {/* Background shapes */}
        <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px] pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
        
        <div className="relative z-10 p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <button 
              onClick={onBack} 
              className="flex items-center gap-1 text-white/80 hover:text-white transition-colors active:scale-95 shrink-0"
            >
              <ArrowLeft className="w-4 h-4 stroke-[3px]" /> 
              <span className="text-xs font-black uppercase tracking-wider">Volver</span>
            </button>
            <span className="px-2 py-0.5 rounded-lg bg-white/20 text-[9px] font-black uppercase tracking-wider">
              Control Global
            </span>
          </div>

          <div className="border-t border-white/10 border-dashed" />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl shrink-0">
              👤
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight leading-tight">Mi Perfil</h2>
              <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── MI NOMBRE GLOBAL ── */}
      <div className="bg-card border border-border/60 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Tu nombre en todos los grupos</p>
            {globalName && !editingName ? (
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-base font-black text-foreground truncate">{globalName}</p>
                <button
                  onClick={() => { setNameInput(globalName); setEditingName(true); }}
                  className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            ) : editingName ? (
              <div className="flex items-center gap-2 mt-1">
                <Input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveGlobalName(nameInput)}
                  placeholder="Tu nombre..."
                  className="h-8 rounded-xl text-sm font-bold flex-1"
                />
                <button
                  onClick={() => saveGlobalName(nameInput)}
                  className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 shrink-0"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setNameInput(''); setEditingName(true); }}
                className="mt-1 text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Configurar mi nombre
              </button>
            )}
          </div>
        </div>
        {globalName && !editingName && (
          <div className="px-4 pb-3">
            <p className="text-[10px] text-muted-foreground">
              Se usa para calcular tu balance en cada grupo donde aparezca ese nombre. Edita por grupo si hay ambigüedad.
            </p>
          </div>
        )}
      </div>

      {/* Global Stat Banners */}
      {totalsByCurrency.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Totales consolidados por moneda</h3>
          
          <div className="grid grid-cols-1 gap-3">
            {totalsByCurrency.map(t => (
              <div key={t.currency} className="bg-card border border-border/60 rounded-3xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-black text-foreground uppercase">Balances en {t.currency}</span>
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[9px] font-bold">{t.currency}</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="space-y-1">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                      <Coins className="w-4 h-4" />
                    </div>
                    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-wider">Gastado por ti</p>
                    <p className="text-xs font-black text-foreground">{formatMoney(t.spent, t.currency)}</p>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-wider">Te deben</p>
                    <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">{formatMoney(t.positiveBalance, t.currency)}</p>
                  </div>

                  <div className="space-y-1">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-wider">Debes</p>
                    <p className="text-xs font-black text-red-600 dark:text-red-400">{formatMoney(t.negativeBalance, t.currency)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MIS TARJETAS ── */}
      <div className="bg-card border border-border/60 rounded-3xl shadow-sm overflow-hidden">
        {/* Collapsible header */}
        <button
          className="w-full flex items-center justify-between p-4 select-none"
          onClick={() => setCardsExpanded(p => !p)}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-black text-foreground uppercase tracking-wider">Mis Tarjetas</span>
            {savedCards.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-black">{savedCards.length}</span>
            )}
          </div>
          {cardsExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {cardsExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* Card list */}
            {savedCards.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic text-center py-2">
                No tienes tarjetas guardadas. ¡Agrega una!
              </p>
            ) : (
              <div className="space-y-2">
                {savedCards.map(card => (
                  <div key={card} className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-muted/40 border border-border/30">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <CreditCard className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-foreground block">{card}</span>
                        {Object.keys(cardSpendings[card] || {}).length > 0 ? (
                          <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[8px] font-black uppercase text-indigo-600">Gastado:</span>
                            {Object.entries(cardSpendings[card]).map(([curr, amt]) => (
                              <span key={curr} className="bg-indigo-50 dark:bg-indigo-950/20 px-1 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-400 font-bold text-[9px]">
                                {formatMoney(amt, curr)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[9px] text-muted-foreground block mt-0.5">Sin gastos registrados</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteCard(card)}
                      className="w-6 h-6 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500/20 transition-colors active:scale-95"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new card */}
            <div className="flex gap-2 pt-1">
              <Input
                placeholder="Ej: Banco Estado, Santander..."
                value={newCardName}
                onChange={e => setNewCardName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCard()}
                className="rounded-xl h-9 text-xs font-semibold flex-1"
              />
              <Button
                onClick={handleAddCard}
                disabled={!newCardName.trim()}
                className="rounded-xl h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shrink-0 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── GASTOS POR MÉTODO DE PAGO ── */}
      {paymentMethodSummaries.length > 0 && (
        <div className="bg-card border border-border/60 rounded-3xl shadow-sm overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 select-none"
            onClick={() => setPaymentExpanded(p => !p)}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 flex items-center justify-center">
                <Wallet className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-black text-foreground uppercase tracking-wider">Gastos que pagué</span>
              <span className="text-[9px] text-muted-foreground font-bold">(por método de pago)</span>
            </div>
            {paymentExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {paymentExpanded && (
            <div className="px-4 pb-4 space-y-2 border-t border-border/30 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
              {paymentMethodSummaries.map((pm, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-muted/30 border border-border/20">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                      pm.type === 'cash' 
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : pm.type === 'card'
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                          : 'bg-slate-500/10 text-slate-500'
                    }`}>
                      {pm.type === 'cash' 
                        ? <Banknote className="w-3.5 h-3.5" />
                        : pm.type === 'card'
                          ? <CreditCard className="w-3.5 h-3.5" />
                          : <Wallet className="w-3.5 h-3.5" />
                      }
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{pm.method}</p>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase">{pm.currency}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-black tabular-nums ${
                    pm.type === 'cash' 
                      ? 'text-emerald-600 dark:text-emerald-400' 
                      : pm.type === 'card'
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-muted-foreground'
                  }`}>
                    {formatMoney(pm.total, pm.currency)}
                  </p>
                </div>
              ))}
              <p className="text-[9px] text-muted-foreground italic text-center pt-1">
                Solo incluye gastos donde fuiste el pagador con método registrado.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Group Breakdown Cards */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Desglose por grupos</h3>
        
        {summaries.length === 0 ? (
          <div className="bg-card border border-border/40 rounded-3xl p-8 text-center text-muted-foreground italic text-xs">
            No tienes ningún grupo registrado. ¡Crea uno en la pantalla principal para empezar!
          </div>
        ) : (
          summaries.map(s => {
            const isExpanded = expandedGroups.has(s.group.id);
            const isSettled = Math.abs(s.balance) < 0.1;
            const isCreditor = s.balance > 0.09;
            const isDebtor = s.balance < -0.09;

            const badgeStyle = isSettled
              ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
              : isCreditor
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
                : 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30';

            const badgeText = isSettled
              ? 'Al Día'
              : isCreditor
                ? `Te deben ${formatMoney(s.balance, s.group.currency)}`
                : `Debes ${formatMoney(Math.abs(s.balance), s.group.currency)}`;

            return (
              <div 
                key={s.group.id} 
                className="bg-card border border-border/60 rounded-3xl p-4 shadow-sm space-y-3 transition-all"
              >
                {/* Header of the Group Card */}
                <div 
                  className="flex items-center justify-between gap-3 cursor-pointer select-none" 
                  onClick={() => toggleGroupExpanded(s.group.id)}
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="font-black text-sm text-foreground flex items-center gap-1.5 flex-wrap">
                      <span>📂 {s.group.name}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                    </h4>
                    <div className="flex gap-2 items-center mt-0.5 text-[10px] font-bold text-muted-foreground">
                      <span>Moneda: {s.group.currency}</span>
                      <span>•</span>
                      <span>Identidad: <strong className="text-foreground">{s.myMemberName}</strong></span>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 text-[9px] font-black rounded-lg border uppercase tracking-wider ${badgeStyle}`}>
                    {badgeText}
                  </span>
                </div>

                {/* Always show spent amount summary */}
                <div className="bg-muted/30 p-2.5 rounded-2xl flex items-center justify-between text-xs font-bold text-muted-foreground">
                  <span>Gastado por ti en este grupo:</span>
                  <strong className="text-foreground tabular-nums">{formatMoney(s.spent, s.group.currency)}</strong>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div className="border-t border-border/40 pt-3.5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    
                    {/* Identity display (read-only, set via Mi Nombre global) */}
                    <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-muted/30 border border-border/20">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[10px] text-muted-foreground font-bold">Tú en este grupo:</span>
                      <span className="text-[11px] font-black text-foreground">{s.myMemberName}</span>
                    </div>

                    {/* Detailed debts */}
                    {s.myMemberId ? (
                      <div className="space-y-2 pt-1.5">
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Detalle de cuentas:</p>
                        
                        {s.debtsToPay.length === 0 && s.debtsToReceive.length === 0 ? (
                          <div className="flex items-center gap-1.5 p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                            <span>¡No debes ni te deben nada en este grupo! Todo al día.</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {/* Receivables */}
                            {s.debtsToReceive.map((dr, idx) => (
                              <div key={`rec-${idx}`} className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] text-xs font-bold">
                                <span className="text-emerald-700 dark:text-emerald-400">📥 {dr.fromName} te debe</span>
                                <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">{formatMoney(dr.amount, s.group.currency)}</strong>
                              </div>
                            ))}

                            {/* Payables */}
                            {s.debtsToPay.map((dp, idx) => (
                              <div key={`pay-${idx}`} className="flex items-center justify-between p-2.5 rounded-xl border border-red-500/10 bg-red-500/[0.03] text-xs font-bold">
                                <span className="text-red-700 dark:text-red-400">📤 Le debes a {dp.toName}</span>
                                <strong className="text-red-600 dark:text-red-400 tabular-nums">{formatMoney(dp.amount, s.group.currency)}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-[10px] font-bold text-amber-600 dark:text-amber-400 leading-tight">
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                        <span>Debes configurar tu persona en la opción de arriba para poder calcular cuánto has gastado y ver tu saldo en este grupo.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
