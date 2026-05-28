import { useState, useEffect, useRef, useMemo } from 'react';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { 
  Loader2, Check, ArrowRight, ArrowLeft, 
  Coins, ChevronRight, Tag, Sparkles, HandCoins, User, Users, Search
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';

interface Group {
  id: string;
  name: string;
  currency: string;
  owner_id: string;
  isOwner: boolean;
}

interface QuickExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: Group[];
  onSaved: () => void;
  fixedGroupId?: string;
}

interface Member {
  id: string;
  name: string;
}

const QUICK_CATEGORIES = [
  { id: 'food', name: 'Comida', emoji: '🍕', text: 'Comida' },
  { id: 'drinks', name: 'Bebidas', emoji: '🍺', text: 'Bebidas' },
  { id: 'field', name: 'Cancha', emoji: '⚽', text: 'Cancha / Fútbol' },
  { id: 'super', name: 'Súper', emoji: '🛒', text: 'Supermercado' },
  { id: 'transport', name: 'Transporte', emoji: '🚗', text: 'Transporte' },
  { id: 'home', name: 'Hogar', emoji: '🏠', text: 'Hogar' },
  { id: 'other', name: 'Otros', emoji: '📦', text: 'Otros' }
];

type GroupType = 'balance' | 'football' | 'personal';
type FlowMode = 'ipaid' | 'iowe'; // For personal groups

export default function QuickExpenseDialog({ open, onOpenChange, groups, onSaved, fixedGroupId }: QuickExpenseDialogProps) {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [payerId, setPayerId] = useState('');
  const [myMemberId, setMyMemberId] = useState('');
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());
  const [customOwed, setCustomOwed] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [savedCards, setSavedCards] = useState<string[]>([]);
  const { user } = useSaldamosAuth();

  // Personal flow states
  const [groupType, setGroupType] = useState<GroupType>('balance');
  const [flowMode, setFlowMode] = useState<FlowMode>('ipaid');
  const [iOweToId, setIOweToId] = useState<string>(''); // member id for personal "i owe" flow
  const [iOweToName, setIOweToName] = useState<string>(''); // free text if not in list
  const [frequentPeople, setFrequentPeople] = useState<string[]>([]);
  const [iOweSearchQuery, setIOweSearchQuery] = useState('');

  const amountInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLInputElement>(null);

  // Detect group type from localStorage
  const detectGroupType = (groupId: string): GroupType => {
    const saved = localStorage.getItem(`group_type_${groupId}`);
    if (saved === 'personal' || saved === 'football') return saved;
    // Fallback: detect from name
    const g = groups.find(g => g.id === groupId);
    if (g) {
      const n = g.name.toLowerCase();
      if (n.includes('fút') || n.includes('futbol') || n.includes('soccer')) return 'football';
    }
    return 'balance';
  };

  // For personal groups the step sequence is different
  // Standard (balance/football): 1=amount, 2=group(skip if fixed), 3=payer, 4=split, 5=payment, 6=desc
  // Personal: 1=amount, 2=group(skip if fixed), 3=flow(ipaid/iowe), 4=who(payer or debtor), 5=payment, 6=desc

  const isPersonal = groupType === 'personal';

  const userIsPayer = isPersonal 
    ? flowMode === 'ipaid' 
    : !!myMemberId && payerId === myMemberId;

  const displayStep = useMemo(() => {
    let currentStep = step;
    if (!userIsPayer && step === 6 && !isPersonal) {
      currentStep = 5;
    }
    if (fixedGroupId) {
      if (currentStep === 1) return 1;
      if (currentStep >= 3) return currentStep - 1;
    }
    return currentStep;
  }, [step, fixedGroupId, userIsPayer, isPersonal]);

  const totalSteps = useMemo(() => {
    const base = isPersonal ? (fixedGroupId ? 4 : 5) : (fixedGroupId ? 5 : 6);
    return (userIsPayer || isPersonal) ? base : base - 1;
  }, [isPersonal, fixedGroupId, userIsPayer]);

  // Reset state when opening dialog
  useEffect(() => {
    if (open) {
      setStep(1);
      setAmount('');
      setPayerId('');
      setMyMemberId('');
      setSplitMode('equal');
      setSelectedParticipants(new Set());
      setCustomOwed({});
      setDescription('');
      setSelectedCategory(null);
      setPaymentMethod(null);
      setSelectedCard(null);
      setFlowMode('ipaid');
      setIOweToId('');
      setIOweToName('');
      setIOweSearchQuery('');

      const freqKey = user?.id ? `saldamos_frequent_people_${user.id}` : 'saldamos_frequent_people';
      const savedFreq = localStorage.getItem(freqKey);
      setFrequentPeople(savedFreq ? JSON.parse(savedFreq) : []);

      const cardsKey = user?.id ? `saldamos_user_cards_${user.id}` : 'saldamos_user_cards';
      try {
        const stored = localStorage.getItem(cardsKey);
        setSavedCards(stored ? JSON.parse(stored) : []);
      } catch {
        setSavedCards([]);
      }

      if (fixedGroupId) {
        const grp = groups.find(g => g.id === fixedGroupId);
        if (grp) {
          setSelectedGroup(grp);
          const gt = detectGroupType(fixedGroupId);
          setGroupType(gt);
          loadMembers(grp);
        } else {
          setSelectedGroup(null);
          setMembers([]);
          setGroupType('balance');
        }
      } else {
        setSelectedGroup(null);
        setMembers([]);
        setGroupType('balance');
      }
      
      setTimeout(() => { amountInputRef.current?.focus(); }, 150);
    }
  }, [open, fixedGroupId, groups, user?.id]);

  useEffect(() => {
    if (step === 6) {
      setTimeout(() => { descInputRef.current?.focus(); }, 150);
    }
  }, [step]);

  useEffect(() => {
    if (step === 4) {
      setIOweSearchQuery(iOweToName || '');
    }
  }, [step, iOweToName]);

  const handleBack = () => {
    if (fixedGroupId && step === 3) {
      setStep(1);
    } else if (step === 6 && !isPersonal && !userIsPayer) {
      setStep(4);
    } else {
      setStep(prev => prev - 1);
    }
  };

  const loadMembers = async (group: Group) => {
    setLoadingMembers(true);
    try {
      const { data, error } = await saldamosSupabase
        .from('group_members')
        .select('id, name')
        .eq('group_id', group.id);
      
      if (error) throw error;
      
      const loadedMembers = data || [];
      setMembers(loadedMembers);
      
      const globalNameKey = user?.id ? `saldamos_my_name_${user.id}` : '';
      const myGlobalName = globalNameKey ? (localStorage.getItem(globalNameKey)?.trim() ?? '') : '';
      
      const savedMyId = localStorage.getItem(`saldamos_id_${group.id}`);
      let matchedMyId = '';
      if (savedMyId && loadedMembers.some(m => m.id === savedMyId)) {
        matchedMyId = savedMyId;
      } else if (myGlobalName) {
        const found = loadedMembers.find(m => m.name.toLowerCase() === myGlobalName.toLowerCase());
        if (found) {
          matchedMyId = found.id;
          localStorage.setItem(`saldamos_id_${group.id}`, found.id);
        }
      }
      
      if (matchedMyId) {
        setPayerId(matchedMyId);
        setMyMemberId(matchedMyId);
      } else {
        setMyMemberId('');
        if (loadedMembers.length > 0) {
          setPayerId(loadedMembers[0].id);
        }
      }
      
      setSelectedParticipants(new Set());
      
      const initialCustom: Record<string, string> = {};
      loadedMembers.forEach(m => { initialCustom[m.id] = ''; });
      setCustomOwed(initialCustom);
      
    } catch (err: any) {
      toast.error('Error al cargar contactos: ' + err.message);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleGroupSelect = (group: Group) => {
    setSelectedGroup(group);
    const gt = detectGroupType(group.id);
    setGroupType(gt);
    loadMembers(group);
    setStep(3);
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipants(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllParticipants = () => setSelectedParticipants(new Set(members.map(m => m.id)));
  const deselectAllParticipants = () => setSelectedParticipants(new Set());

  const handleCustomOwedChange = (memberId: string, val: string) => {
    setCustomOwed(prev => ({ ...prev, [memberId]: val }));
  };

  const numAmount = Number(amount) || 0;
  const participantCount = selectedParticipants.size;
  const equalShare = participantCount > 0 ? Math.floor(numAmount / participantCount) : 0;
  const equalRemainder = participantCount > 0 ? numAmount - (equalShare * participantCount) : 0;

  const totalAssignedCustom = Object.values(customOwed).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const isCustomValid = Math.abs(totalAssignedCustom - numAmount) < 0.1;

  const isStep4Valid = splitMode === 'equal' ? participantCount > 0 : isCustomValid;

  const selectCategory = (cat: typeof QUICK_CATEGORIES[0]) => {
    setSelectedCategory(cat.id);
    setDescription(cat.text);
  };

  // Payment method step: go to next (desc step)
  const descStep = isPersonal ? 5 : 6;
  const paymentStep = isPersonal ? 4 : 5;
  const whoStep = isPersonal ? 3 : 3; // payer or debtor selection

  const saveExpense = async () => {
    if (!selectedGroup || numAmount <= 0) return;
    setSaving(true);
    
    try {
      let finalDescription = description.trim() || 'Gasto Rápido ⚡';
      if (paymentMethod === 'cash') {
        finalDescription = `${finalDescription} [Efectivo]`;
      } else if (paymentMethod === 'card' && selectedCard) {
        finalDescription = `${finalDescription} [Tarjeta: ${selectedCard}]`;
      }

      if (isPersonal && flowMode === 'iowe') {
        // Tag as IOU
        const debtorName = iOweToId 
          ? (members.find(m => m.id === iOweToId)?.name ?? iOweToName)
          : iOweToName;
        finalDescription = `${finalDescription} [Deuda con: ${debtorName}]`;
      }

      const savedMode = localStorage.getItem(`group_mode_${selectedGroup.id}`);
      const groupTypeLoc = localStorage.getItem(`group_type_${selectedGroup.id}`);
      const isPersonalGroupType = groupTypeLoc === 'personal';
      const isFootball = selectedGroup.name.toLowerCase().includes('futbol') || selectedGroup.name.toLowerCase().includes('fútbol');
      const isTracker = savedMode === 'tracker' || (isFootball && savedMode !== 'balance') || isPersonalGroupType;

      // 1. Insert expense
      const { data: exp, error: expErr } = await saldamosSupabase
        .from('expenses')
        .insert({
          group_id: selectedGroup.id,
          description: finalDescription,
          total_amount: numAmount,
          category_id: null, // Never send non-UUID strings
          track_payments: isTracker,
          is_settlement: false,
          is_personal: false
        })
        .select('id')
        .single();

      if (expErr || !exp) throw expErr || new Error('No se pudo crear la transacción');

      // 2. Build contributions
      const contribs: any[] = [];

      if (isPersonal) {
        if (flowMode === 'ipaid') {
          // I paid the total — just record me as payer, select who consumed
          const myMemberId = payerId;
          if (myMemberId) {
            contribs.push({
              expense_id: exp.id,
              member_id: myMemberId,
              amount_paid: numAmount,
              amount_owed: numAmount, // personal: I spent it myself
              is_settled: paymentMethod !== null
            });
          } else {
            // Fallback: just record as personal with amount
            contribs.push({
              expense_id: exp.id,
              member_id: members[0]?.id ?? null,
              amount_paid: numAmount,
              amount_owed: numAmount,
              is_settled: paymentMethod !== null
            });
          }
        } else {
          // flowMode === 'iowe': someone else paid, I owe them
          let creditorId = iOweToId;
          if (!creditorId && iOweToName.trim()) {
            const existingMember = members.find(m => m.name.toLowerCase() === iOweToName.trim().toLowerCase());
            if (existingMember) {
              creditorId = existingMember.id;
            } else {
              // Create new member in the group
              const { data: newMem, error: newMemErr } = await saldamosSupabase
                .from('group_members')
                .insert({ group_id: selectedGroup.id, name: iOweToName.trim() })
                .select('id')
                .single();
              if (newMemErr) {
                throw new Error('No se pudo agregar a ' + iOweToName + ' al grupo: ' + newMemErr.message);
              }
              creditorId = newMem.id;
            }
          }

          let myId = payerId;
          if (!myId) {
            // Find me by global name
            const globalNameKey = user?.id ? `saldamos_my_name_${user.id}` : '';
            const myGlobalName = globalNameKey ? (localStorage.getItem(globalNameKey)?.trim() ?? '') : '';
            if (myGlobalName) {
              myId = members.find(m => m.name.toLowerCase() === myGlobalName.toLowerCase())?.id || '';
            }
            if (!myId && members.length > 0) {
              myId = members.find(m => m.id !== creditorId)?.id || members[0].id;
            }
          }

          if (creditorId && myId) {
            // Creditor paid
            contribs.push({
              expense_id: exp.id,
              member_id: creditorId,
              amount_paid: numAmount,
              amount_owed: 0,
              is_settled: false
            });
            // I owe
            contribs.push({
              expense_id: exp.id,
              member_id: myId,
              amount_paid: 0,
              amount_owed: numAmount,
              is_settled: false
            });

            // Auto-save to frequent people (contacts)
            if (iOweToName.trim()) {
              const freqKey = user?.id ? `saldamos_frequent_people_${user.id}` : 'saldamos_frequent_people';
              const savedFreq = localStorage.getItem(freqKey);
              let freqPeople: string[] = savedFreq ? JSON.parse(savedFreq) : [];
              if (!freqPeople.some(p => p.toLowerCase() === iOweToName.trim().toLowerCase())) {
                freqPeople.push(iOweToName.trim());
                localStorage.setItem(freqKey, JSON.stringify(freqPeople));
              }
            }
          } else {
            // Fallback
            contribs.push({
              expense_id: exp.id,
              member_id: members[0]?.id ?? null,
              amount_paid: numAmount,
              amount_owed: numAmount,
              is_settled: false
            });
          }
        }
      } else {
        // Standard balance/football flow
        const firstActiveId = members.find(m => selectedParticipants.has(m.id))?.id;

        if (splitMode === 'equal') {
          members.forEach(m => {
            const isParticipant = selectedParticipants.has(m.id);
            const isPayer = m.id === payerId;
            
            let amountOwed = 0;
            if (isParticipant) {
              amountOwed = equalShare;
              if (m.id === firstActiveId) amountOwed += equalRemainder;
            }

            let amountPaid = 0;
            if (isPayer) amountPaid = numAmount;

            if (amountOwed > 0 || amountPaid > 0) {
              contribs.push({
                expense_id: exp.id,
                member_id: m.id,
                amount_paid: amountPaid,
                amount_owed: amountOwed,
                is_settled: false
              });
            }
          });
        } else {
          members.forEach(m => {
            const amountOwed = Number(customOwed[m.id]) || 0;
            const isPayer = m.id === payerId;
            const amountPaid = isPayer ? numAmount : 0;

            if (amountOwed > 0 || amountPaid > 0) {
              contribs.push({
                expense_id: exp.id,
                member_id: m.id,
                amount_paid: amountPaid,
                amount_owed: amountOwed,
                is_settled: false
              });
            }
          });
        }
      }

      if (contribs.length > 0) {
        const { error: cErr } = await saldamosSupabase.from('expense_contributions').insert(contribs);
        if (cErr) throw cErr;
      }

      // Log activity
      try {
        await saldamosSupabase.from('group_activity' as any).insert({
          group_id: selectedGroup.id,
          user_name: 'Usuario',
          action: 'EXPENSE_ADDED',
          details: { id: exp.id, description: finalDescription, amount: numAmount }
        });
      } catch (e) {
        console.warn('Could not persist activity log:', e);
      }

      toast.success('⚡ ¡Gasto rápido agregado con éxito!');
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al guardar gasto: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const getGroupStyle = (groupId: string) => {
    const savedColor = localStorage.getItem(`group_color_${groupId}`);
    if (savedColor) return `bg-gradient-to-br ${savedColor}`;
    return 'bg-gradient-to-br from-blue-500 to-indigo-600';
  };

  const filteredMembers = useMemo(() => {
    if (!iOweSearchQuery.trim()) return members;
    return members.filter(m => m.name.toLowerCase().includes(iOweSearchQuery.toLowerCase()));
  }, [members, iOweSearchQuery]);

  const filteredFrequent = useMemo(() => {
    const memberNames = new Set(members.map(m => m.name.toLowerCase()));
    const matches = frequentPeople.filter(p => !memberNames.has(p.toLowerCase()));
    if (!iOweSearchQuery.trim()) return matches;
    return matches.filter(p => p.toLowerCase().includes(iOweSearchQuery.toLowerCase()));
  }, [frequentPeople, members, iOweSearchQuery]);

  const currency = selectedGroup?.currency ?? 'CLP';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[92vw] rounded-3xl p-4 sm:p-6 border-none shadow-2xl overflow-hidden max-h-[85dvh] sm:max-h-[85vh] flex flex-col gap-0 top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]">
        
        {/* Step progress bar */}
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-4 mt-1 shrink-0">
          <div 
            className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full transition-all duration-300"
            style={{ width: `${(displayStep / totalSteps) * 100}%` }}
          />
        </div>

        {/* Step Title Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
            Paso {displayStep} de {totalSteps}
          </span>
          {displayStep > 1 && (
            <button 
              onClick={handleBack}
              className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3 h-3" /> Atrás
            </button>
          )}
        </div>

        {/* Dynamic Step Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-1">
          
          {/* STEP 1: AMOUNT */}
          {step === 1 && (
            <div className="space-y-4 py-2 flex flex-col items-center">
              <div className="text-center space-y-1.5">
                <h3 className="text-lg font-black text-foreground">¿Cuánto gastaste? 💰</h3>
                <p className="text-xs text-muted-foreground">Digita el monto total de la compra o consumo</p>
              </div>

              <div className="relative w-full max-w-[280px]">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-muted-foreground/50">$</span>
                <Input
                  ref={amountInputRef}
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && numAmount > 0 && setStep(fixedGroupId ? 3 : 2)}
                  className="rounded-2xl h-16 pl-10 text-3xl font-black text-center focus:ring-2 focus:ring-indigo-500 border-border/80"
                />
              </div>

              <Button
                disabled={numAmount <= 0}
                onClick={() => setStep(fixedGroupId ? 3 : 2)}
                className="w-full max-w-[280px] rounded-2xl h-12 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* STEP 2: GROUP SELECT */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-black text-foreground">¿En qué grupo lo guardamos? 📂</h3>
                <p className="text-xs text-muted-foreground">Elige el grupo al que pertenece este gasto</p>
              </div>

              <div className="grid grid-cols-2 gap-3 py-2">
                {groups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => handleGroupSelect(g)}
                    className={`relative rounded-2xl p-4 min-h-[100px] flex flex-col justify-between text-left text-white shadow-md transition-all active:scale-[0.96] hover:shadow-lg overflow-hidden group ${getGroupStyle(g.id)}`}
                  >
                    <span className="text-xl">📂</span>
                    <div>
                      <p className="font-black text-xs leading-tight truncate">{g.name}</p>
                      <p className="text-[9px] text-white/70 font-bold mt-0.5">{g.currency}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── PERSONAL GROUP FLOW ─── */}

          {/* STEP 3 (Personal): ¿Pagué yo o le debo? */}
          {step === 3 && isPersonal && (
            <div className="space-y-4 py-2 flex flex-col items-center">
              <div className="text-center space-y-1.5">
                <h3 className="text-lg font-black text-foreground">¿Cómo fue este gasto? 🧾</h3>
                <p className="text-xs text-muted-foreground">Dinos si pagaste tú o si le debes a alguien</p>
              </div>

              <div className="flex flex-col gap-3 w-full max-w-[280px]">
                <button
                  onClick={() => { setFlowMode('ipaid'); setStep(paymentStep); }}
                  className={`w-full rounded-2xl p-4 border-2 text-left transition-all active:scale-[0.97] ${flowMode === 'ipaid' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20' : 'border-border bg-card hover:border-indigo-200'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-xl shrink-0">💵</div>
                    <div>
                      <p className="text-sm font-black text-foreground">Pagué yo</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Anotar este gasto en mi registro personal</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => { setFlowMode('iowe'); setStep(step + 1); }}
                  className={`w-full rounded-2xl p-4 border-2 text-left transition-all active:scale-[0.97] ${flowMode === 'iowe' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20' : 'border-border bg-card hover:border-indigo-200'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center text-xl shrink-0">🤝</div>
                    <div>
                      <p className="text-sm font-black text-foreground">Le debo a alguien</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Registrar una deuda para recordar pagarla</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3+1 (Personal iowe): ¿A quién le debo? */}
          {step === 4 && isPersonal && flowMode === 'iowe' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-black text-foreground">¿A quién le debes? 👤</h3>
                <p className="text-xs text-muted-foreground">Selecciona de tus contactos o escribe su nombre</p>
              </div>

              {loadingMembers ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Buscar o escribir nombre:</Label>
                    <div className="relative">
                      <Input
                        placeholder="Busca o escribe el nombre de la persona..."
                        value={iOweSearchQuery}
                        onChange={e => {
                          setIOweSearchQuery(e.target.value);
                          setIOweToName(e.target.value);
                          setIOweToId('');
                        }}
                        className="rounded-xl h-10 text-xs font-semibold pl-8"
                      />
                      <Search className="absolute left-2.5 top-3 w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {/* Miembros del grupo */}
                    {filteredMembers.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1">Miembros del grupo</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {filteredMembers.map(m => {
                            const isSelected = iOweToId === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setIOweToId(m.id);
                                  setIOweToName(m.name);
                                  setIOweSearchQuery(m.name);
                                }}
                                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                                  isSelected
                                    ? 'bg-red-500/10 border-red-400 text-red-700 dark:text-red-400'
                                    : 'bg-accent/30 border-border/40 text-foreground hover:border-red-200'
                                }`}
                              >
                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black ${isSelected ? 'bg-red-500/20 text-red-600' : 'bg-indigo-100 text-indigo-700'}`}>
                                  {m.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="truncate">{m.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Mis Contactos (Frecuentes) */}
                    {filteredFrequent.length > 0 && (
                      <div className="space-y-1.5 pt-1.5">
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1">Mis Contactos</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {filteredFrequent.map(p => {
                            const isSelected = !iOweToId && iOweToName.toLowerCase() === p.toLowerCase();
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => {
                                  setIOweToId('');
                                  setIOweToName(p);
                                  setIOweSearchQuery(p);
                                }}
                                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                                  isSelected
                                    ? 'bg-purple-500/10 border-purple-400 text-purple-700 dark:text-purple-400'
                                    : 'bg-accent/30 border-border/40 text-foreground hover:border-purple-200'
                                }`}
                              >
                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black ${isSelected ? 'bg-purple-500/20 text-purple-600' : 'bg-purple-100 text-purple-700'}`}>
                                  {p.charAt(0).toUpperCase()}
                                </div>
                                <span className="truncate">{p}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {filteredMembers.length === 0 && filteredFrequent.length === 0 && iOweSearchQuery.trim() && (
                      <div className="text-center py-4 bg-muted/20 border border-dashed rounded-xl">
                        <p className="text-[10px] text-muted-foreground">Presiona "Siguiente" para registrar el gasto a nombre de <strong>"{iOweSearchQuery}"</strong> (se agregará al grupo).</p>
                      </div>
                    )}
                  </div>

                  <Button
                    disabled={!iOweToId && !iOweToName.trim()}
                    onClick={() => setStep(descStep)}
                    className="w-full rounded-2xl h-11 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm mt-2"
                  >
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ─── STANDARD FLOW (balance / football) ─── */}

          {/* STEP 3 (standard): PAYER */}
          {step === 3 && !isPersonal && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-black text-foreground">¿Quién pagó el total? 👤</h3>
                <p className="text-xs text-muted-foreground">Selecciona la persona que desembolsó el dinero</p>
              </div>

              {loadingMembers ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
              ) : members.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-xs text-muted-foreground italic">Este grupo no tiene miembros todavía.</p>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => { onOpenChange(false); toast.info('Añade miembros ingresando al detalle del grupo.'); }}
                    className="rounded-xl"
                  >
                    Ir a agregar personas
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 py-2">
                  {members.map(m => {
                    const isSelected = payerId === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setPayerId(m.id); setStep(4); }}
                        className={`flex items-center gap-2.5 p-3 rounded-2xl border transition-all text-left font-black text-xs active:scale-[0.97] ${
                          isSelected 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                            : 'bg-accent/40 border-border/40 text-foreground hover:border-indigo-200'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ${isSelected ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate flex-1">{m.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 4 (standard): SPLIT */}
          {step === 4 && !isPersonal && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-black text-foreground">¿Quiénes consumieron? 👥</h3>
                <p className="text-xs text-muted-foreground">Define cómo se divide el monto de {amount} {currency}</p>
              </div>

              {/* Mode toggles */}
              <div className="grid grid-cols-2 gap-2 bg-muted/60 p-1 rounded-xl h-10">
                <button
                  type="button"
                  onClick={() => setSplitMode('equal')}
                  className={`text-[10px] font-black rounded-lg transition-all ${splitMode === 'equal' ? 'bg-card text-indigo-700 shadow-sm' : 'text-muted-foreground'}`}
                >
                  Partes Iguales
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode('custom')}
                  className={`text-[10px] font-black rounded-lg transition-all ${splitMode === 'custom' ? 'bg-card text-indigo-700 shadow-sm' : 'text-muted-foreground'}`}
                >
                  Montos Personalizados
                </button>
              </div>

              {splitMode === 'equal' ? (
                <div className="space-y-3">
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={selectAllParticipants} className="text-[9px] font-black uppercase tracking-wider text-indigo-600 hover:underline">Todos</button>
                    <span className="text-[9px] text-muted-foreground">•</span>
                    <button type="button" onClick={deselectAllParticipants} className="text-[9px] font-black uppercase tracking-wider text-muted-foreground hover:underline">Ninguno</button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                    {members.map(m => {
                      const isSelected = selectedParticipants.has(m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleParticipant(m.id)}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-[11px] font-bold text-left transition-all ${
                            isSelected 
                              ? 'bg-green-500/10 border-green-500 text-green-700 dark:text-green-400' 
                              : 'bg-accent/20 border-border/30 text-muted-foreground hover:border-border'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] ${isSelected ? 'bg-green-500 border-green-500 text-white' : 'border-muted-foreground/30'}`}>
                            {isSelected && '✓'}
                          </div>
                          <span className="truncate">{m.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100/40 text-center space-y-0.5">
                    <p className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">División Equitativa</p>
                    <p className="text-sm font-black text-indigo-950 dark:text-white">
                      {participantCount > 0 ? `$${equalShare.toLocaleString('es-CL')} c/u` : 'Selecciona participantes'}
                    </p>
                    {participantCount > 0 && (
                      <p className="text-[9px] text-indigo-600/70 dark:text-indigo-400/60 leading-none">
                        ({participantCount} {participantCount === 1 ? 'persona' : 'personas'}{equalRemainder > 0 ? ` + ajuste de $${equalRemainder}` : ''})
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-accent/30 border border-border/20">
                        <span className="text-[11px] font-bold text-foreground truncate max-w-[120px]">{m.name}</span>
                        <div className="relative max-w-[100px]">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                          <Input
                            type="number"
                            placeholder="0"
                            value={customOwed[m.id] || ''}
                            onChange={e => handleCustomOwedChange(m.id, e.target.value)}
                            className="rounded-lg h-7 pl-6 pr-2 text-right text-xs font-semibold"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={`p-2.5 rounded-xl border text-center text-xs font-bold ${isCustomValid ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400'}`}>
                    <p className="text-[10px] uppercase tracking-wider font-black">Control de Suma</p>
                    <p className="mt-0.5">Asignado: <strong className="tabular-nums">${totalAssignedCustom.toLocaleString('es-CL')}</strong> de <strong className="tabular-nums">${numAmount.toLocaleString('es-CL')}</strong></p>
                    {!isCustomValid && (
                      <p className="text-[9px] text-amber-600/80 mt-0.5 font-medium leading-none">
                        {totalAssignedCustom < numAmount 
                          ? `Faltan asignar $${(numAmount - totalAssignedCustom).toLocaleString('es-CL')}` 
                          : `Sobra un exceso de $${(totalAssignedCustom - numAmount).toLocaleString('es-CL')}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <Button
                disabled={!isStep4Valid}
                onClick={() => setStep(userIsPayer ? 5 : 6)}
                className="w-full rounded-2xl h-11 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* STEP 5 (standard) / STEP 4 (personal-ipaid) / STEP 5 (personal-iowe): PAYMENT METHOD */}
          {((step === 5 && !isPersonal) || (step === paymentStep && isPersonal && flowMode === 'ipaid')) && (
            <div className="space-y-4 py-2 flex flex-col items-center">
              <div className="text-center space-y-1.5 w-full">
                <h3 className="text-lg font-black text-foreground">¿Cómo pagaste? 💳</h3>
                <p className="text-xs text-muted-foreground">Selecciona el método de pago empleado</p>
              </div>

              <div className="flex flex-col gap-3 w-full max-w-[280px]">
                <Button
                  type="button"
                  variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                  className={`w-full rounded-2xl h-14 text-sm font-bold gap-2 flex items-center justify-center ${paymentMethod === 'cash' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-background hover:bg-muted border border-border text-foreground'}`}
                  onClick={() => { setPaymentMethod('cash'); setSelectedCard(null); setStep(descStep); }}
                >
                  <span className="text-xl">💵</span> Efectivo
                </Button>
                
                <Button
                  type="button"
                  variant={paymentMethod === 'card' ? 'default' : 'outline'}
                  className={`w-full rounded-2xl h-14 text-sm font-bold gap-2 flex items-center justify-center ${paymentMethod === 'card' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-background hover:bg-muted border border-border text-foreground'}`}
                  onClick={() => {
                    setPaymentMethod('card');
                    if (savedCards.length > 0 && !selectedCard) setSelectedCard(savedCards[0]);
                  }}
                >
                  <span className="text-xl">💳</span> Tarjeta
                </Button>

                {paymentMethod === 'card' && (
                  <div className="pt-2 space-y-2 w-full animate-in fade-in slide-in-from-top-1 duration-200">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block text-center">Selecciona la Tarjeta:</Label>
                    {savedCards.length === 0 ? (
                      <p className="text-[10px] text-amber-600 font-semibold italic text-center">No tienes tarjetas guardadas. Agrégalas en "Mi Perfil".</p>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-[120px] overflow-y-auto pr-1">
                        {savedCards.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => { setSelectedCard(c); setStep(descStep); }}
                            className={`w-full p-2.5 rounded-xl text-xs font-bold border transition-all text-center ${
                              selectedCard === c
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-600 dark:bg-indigo-950/20 dark:border-indigo-800 dark:text-indigo-400'
                                : 'bg-background hover:bg-muted text-muted-foreground border-border'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 w-full max-w-[280px]">
                <Button
                  variant="ghost"
                  onClick={() => { setPaymentMethod(null); setSelectedCard(null); setStep(descStep); }}
                  className="w-full rounded-2xl h-10 text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Omitir paso
                </Button>
                {paymentMethod === 'card' && selectedCard && (
                  <Button
                    onClick={() => setStep(descStep)}
                    className="w-full rounded-2xl h-10 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs"
                  >
                    Siguiente
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* STEP 6 (standard) / STEP 5 (personal): DESCRIPTION */}
          {step === descStep && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-black text-foreground">¿De qué es el gasto? 🏷️</h3>
                <p className="text-xs text-muted-foreground">Escribe la descripción o elige un atajo rápido</p>
              </div>

              {/* Quick tags */}
              <div className="flex flex-wrap gap-1.5 py-1 justify-center">
                {QUICK_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => selectCategory(cat)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-black transition-all ${
                      selectedCategory === cat.id 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm scale-95' 
                        : 'bg-card border-border/50 text-foreground hover:border-indigo-300'
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.name}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quick-desc-input" className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-1">Descripción</Label>
                <Input
                  ref={descInputRef}
                  id="quick-desc-input"
                  placeholder="Ej: Pizza gigante, Asado, Combustible"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !saving && saveExpense()}
                  className="rounded-xl h-10 text-xs font-semibold"
                />
              </div>

              {/* Summary for personal iowe */}
              {isPersonal && flowMode === 'iowe' && (
                <div className="p-3 rounded-2xl bg-red-500/5 border border-red-500/10 text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                  <span className="text-base">🤝</span>
                  <span>Le debes <strong>${numAmount.toLocaleString('es-CL')}</strong> a <strong>{iOweToId ? members.find(m => m.id === iOweToId)?.name : iOweToName}</strong></span>
                </div>
              )}

              <Button
                disabled={saving}
                onClick={saveExpense}
                className="w-full rounded-2xl h-12 bg-gradient-to-br from-green-600 to-emerald-600 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 mt-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 fill-white" />}
                Guardar Gasto ⚡
              </Button>
            </div>
          )}

        </div>

      </DialogContent>
    </Dialog>
  );
}
