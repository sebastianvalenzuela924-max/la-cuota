import { useState, useEffect, useMemo } from 'react';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Coins, TrendingUp, TrendingDown, Scale, 
  Loader2, User, CheckCircle2, ChevronDown, ChevronUp, AlertCircle 
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

interface MyProfileDashboardProps {
  onBack: () => void;
}

export default function MyProfileDashboard({ onBack }: MyProfileDashboardProps) {
  const { user } = useSaldamosAuth();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [identities, setIdentities] = useState<Record<string, string>>({}); // groupId -> memberId
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

      // Calculate total spent by user (sum of amount_owed where c.member_id === myId)
      let totalSpent = 0;
      if (myId) {
        groupExpenses.forEach(ex => {
          if (ex.is_personal || ex.is_settlement) return;
          const userContrib = ex.contributions.find((c: any) => c.member_id === myId);
          if (userContrib) {
            totalSpent += Number(userContrib.amount_owed) || 0;
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
                    
                    {/* Identity setting/change selector */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">¿Quién eres tú en este grupo?</label>
                      <Select 
                        value={s.myMemberId || 'none'} 
                        onValueChange={(val) => handleSetIdentity(s.group.id, val)}
                      >
                        <SelectTrigger className="h-8 text-[11px] rounded-xl bg-muted/40 border-none font-semibold">
                          <User className="w-3.5 h-3.5 text-muted-foreground mr-1 shrink-0" />
                          <SelectValue placeholder="Configura tu persona" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="none">(Nadie - Omitir balance)</SelectItem>
                          {s.membersList.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
