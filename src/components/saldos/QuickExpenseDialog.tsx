import { useState, useEffect, useRef } from 'react';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { 
  Loader2, Zap, Check, Users, ArrowRight, ArrowLeft, 
  Coins, ChevronRight, User, Tag, Sparkles
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';

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
}

interface Member {
  id: string;
  name: string;
}

const QUICK_CATEGORIES = [
  { id: '1', name: 'Comida', emoji: '🍕', text: 'Comida' },
  { id: '2', name: 'Bebidas', emoji: '🍺', text: 'Bebidas' },
  { id: '3', name: 'Cancha', emoji: '⚽', text: 'Cancha / Fútbol' },
  { id: '4', name: 'Súper', emoji: '🛒', text: 'Supermercado' },
  { id: '5', name: 'Transporte', emoji: '🚗', text: 'Transporte' },
  { id: '6', name: 'Hogar', emoji: '🏠', text: 'Hogar' },
  { id: '7', name: 'Otros', emoji: '📦', text: 'Otros' }
];

export default function QuickExpenseDialog({ open, onOpenChange, groups, onSaved }: QuickExpenseDialogProps) {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [payerId, setPayerId] = useState('');
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());
  const [customOwed, setCustomOwed] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLInputElement>(null);

  // Reset state when opening dialog
  useEffect(() => {
    if (open) {
      setStep(1);
      setAmount('');
      setSelectedGroup(null);
      setMembers([]);
      setPayerId('');
      setSplitMode('equal');
      setSelectedParticipants(new Set());
      setCustomOwed({});
      setDescription('');
      setSelectedCategory(null);
      
      // Auto focus amount input
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 150);
    }
  }, [open]);

  // Focus description when on step 5
  useEffect(() => {
    if (step === 5) {
      setTimeout(() => {
        descInputRef.current?.focus();
      }, 150);
    }
  }, [step]);

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
      
      // Preselect payer: check local storage identity or fallback to first member
      const savedMyId = localStorage.getItem(`saldamos_id_${group.id}`);
      if (savedMyId && loadedMembers.some(m => m.id === savedMyId)) {
        setPayerId(savedMyId);
      } else if (loadedMembers.length > 0) {
        setPayerId(loadedMembers[0].id);
      }
      
      // Initialize participants (all selected by default)
      setSelectedParticipants(new Set(loadedMembers.map(m => m.id)));
      
      const initialCustom: Record<string, string> = {};
      loadedMembers.forEach(m => {
        initialCustom[m.id] = '';
      });
      setCustomOwed(initialCustom);
      
    } catch (err: any) {
      toast.error('Error al cargar contactos: ' + err.message);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleGroupSelect = (group: Group) => {
    setSelectedGroup(group);
    loadMembers(group);
    setStep(3); // Go to payer selection
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipants(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllParticipants = () => {
    setSelectedParticipants(new Set(members.map(m => m.id)));
  };

  const deselectAllParticipants = () => {
    setSelectedParticipants(new Set());
  };

  const handleCustomOwedChange = (memberId: string, val: string) => {
    setCustomOwed(prev => ({
      ...prev,
      [memberId]: val
    }));
  };

  // Calculations for Step 4
  const numAmount = Number(amount) || 0;
  const participantCount = selectedParticipants.size;
  const equalShare = participantCount > 0 ? Math.floor(numAmount / participantCount) : 0;
  const equalRemainder = participantCount > 0 ? numAmount - (equalShare * participantCount) : 0;

  const totalAssignedCustom = Object.values(customOwed).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const isCustomValid = Math.abs(totalAssignedCustom - numAmount) < 0.1;

  const isStep4Valid = splitMode === 'equal' 
    ? participantCount > 0 
    : isCustomValid;

  const selectCategory = (cat: typeof QUICK_CATEGORIES[0]) => {
    setSelectedCategory(cat.id);
    setDescription(cat.text);
  };

  const saveExpense = async () => {
    if (!selectedGroup || !payerId || numAmount <= 0) return;
    setSaving(true);
    
    try {
      const isFootball = selectedGroup.name.toLowerCase().includes('futbol') || selectedGroup.name.toLowerCase().includes('fútbol');
      const savedMode = localStorage.getItem(`group_mode_${selectedGroup.id}`);
      const isTracker = savedMode === 'tracker' || (isFootball && savedMode !== 'balance');

      // 1. Insert expense
      const { data: exp, error: expErr } = await saldamosSupabase
        .from('expenses')
        .insert({
          group_id: selectedGroup.id,
          description: description.trim() || 'Gasto Rápido ⚡',
          total_amount: numAmount,
          category_id: selectedCategory || null,
          track_payments: isTracker,
          is_settlement: false,
          is_personal: false
        })
        .select('id')
        .single();

      if (expErr || !exp) throw expErr || new Error('No se pudo crear la transacción');

      // 2. Build contributions
      const contribs: any[] = [];
      const firstActiveId = members.find(m => selectedParticipants.has(m.id))?.id;

      if (splitMode === 'equal') {
        members.forEach(m => {
          const isParticipant = selectedParticipants.has(m.id);
          const isPayer = m.id === payerId;
          
          let amountOwed = 0;
          if (isParticipant) {
            amountOwed = equalShare;
            // Add remainder to the first active participant
            if (m.id === firstActiveId) {
              amountOwed += equalRemainder;
            }
          }

          let amountPaid = 0;
          if (isPayer) {
            amountPaid = numAmount;
          }

          // If they owe money or paid money, include them
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
        // Custom split mode
        members.forEach(m => {
          const amountOwed = Number(customOwed[m.id]) || 0;
          const isPayer = m.id === payerId;
          
          let amountPaid = 0;
          if (isPayer) {
            amountPaid = numAmount;
          }

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

      const { error: cErr } = await saldamosSupabase.from('expense_contributions').insert(contribs);
      if (cErr) throw cErr;

      // Log activity
      try {
        await saldamosSupabase.from('group_activity' as any).insert({
          group_id: selectedGroup.id,
          user_name: 'Usuario',
          action: 'EXPENSE_ADDED',
          details: { id: exp.id, description: description.trim() || 'Gasto Rápido ⚡', amount: numAmount }
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

  const currency = selectedGroup?.currency ?? 'CLP';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[92vw] rounded-3xl p-6 border-none shadow-2xl overflow-hidden max-h-[85vh] flex flex-col gap-0">
        
        {/* Step progress bar */}
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-6 mt-2 shrink-0">
          <div 
            className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full transition-all duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>

        {/* Step Title Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
            Paso {step} de 5
          </span>
          {step > 1 && (
            <button 
              onClick={() => setStep(prev => prev - 1)}
              className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3 h-3" /> Atrás
            </button>
          )}
        </div>

        {/* Dynamic Step Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-2">
          
          {/* STEP 1: AMOUNT */}
          {step === 1 && (
            <div className="space-y-6 py-4 flex flex-col items-center">
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
                  onKeyDown={e => e.key === 'Enter' && numAmount > 0 && setStep(2)}
                  className="rounded-2xl h-16 pl-10 text-3xl font-black text-center focus:ring-2 focus:ring-indigo-500 border-border/80"
                />
              </div>

              <Button
                disabled={numAmount <= 0}
                onClick={() => setStep(2)}
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

          {/* STEP 3: PAYER */}
          {step === 3 && (
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
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
                        }`}>
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

          {/* STEP 4: SPLIT */}
          {step === 4 && (
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
                  className={`text-[10px] font-black rounded-lg transition-all ${
                    splitMode === 'equal' ? 'bg-card text-indigo-700 shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Partes Iguales
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode('custom')}
                  className={`text-[10px] font-black rounded-lg transition-all ${
                    splitMode === 'custom' ? 'bg-card text-indigo-700 shadow-sm' : 'text-muted-foreground'
                  }`}
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
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] ${
                            isSelected ? 'bg-green-500 border-green-500 text-white' : 'border-muted-foreground/30'
                          }`}>
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

                  <div className={`p-2.5 rounded-xl border text-center text-xs font-bold ${
                    isCustomValid 
                      ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400' 
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400'
                  }`}>
                    <p className="text-[10px] uppercase tracking-wider font-black">Control de Suma</p>
                    <p className="mt-0.5">
                      Asignado: <strong className="tabular-nums">${totalAssignedCustom.toLocaleString('es-CL')}</strong> de <strong className="tabular-nums">${numAmount.toLocaleString('es-CL')}</strong>
                    </p>
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
                onClick={() => setStep(5)}
                className="w-full rounded-2xl h-11 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* STEP 5: DESCRIPTION */}
          {step === 5 && (
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
