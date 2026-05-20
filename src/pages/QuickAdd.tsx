import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import AuthWall from '@/components/saldos/AuthWall';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { 
  ArrowLeft, Loader2, Sparkles, Plus, Check, Users, Scale, 
  HandCoins, Coins, ChevronRight, HelpCircle 
} from 'lucide-react';
import confetti from 'canvas-confetti';

type Group = {
  id: string;
  name: string;
  currency: string;
  owner_id: string;
};

export default function QuickAdd() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useSaldamosAuth();
  
  // Steps: 1 = Amount, 2 = Participants, 3 = Group Select, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  
  // Step 1 State
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  
  // Step 2 State
  const [frequentPeople, setFrequentPeople] = useState<string[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>(['Yo']);
  const [newPersonName, setNewPersonName] = useState('');
  const [splitEqually, setSplitEqually] = useState(true);
  
  // Step 3 State
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [savedGroup, setSavedGroup] = useState<Group | null>(null);
  
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Load frequent contacts and groups
  useEffect(() => {
    if (!user?.id) return;
    
    // Load frequent people
    const peopleKey = `saldamos_frequent_people_${user.id}`;
    const savedPeople = localStorage.getItem(peopleKey);
    if (savedPeople) {
      setFrequentPeople(JSON.parse(savedPeople));
    } else {
      // Default initial contacts
      const defaults = ['Yo'];
      setFrequentPeople(defaults);
      localStorage.setItem(peopleKey, JSON.stringify(defaults));
    }

    // Fetch groups
    const loadGroups = async () => {
      setLoadingGroups(true);
      try {
        const [owned, collabs] = await Promise.all([
          saldamosSupabase.from('groups').select('id, name, currency, owner_id').eq('owner_id', user.id),
          saldamosSupabase.from('group_collaborators').select('group_id').eq('user_id', user.id)
        ]);
        
        let allGroups: Group[] = [];
        if (owned.data) allGroups = [...owned.data];
        
        if (collabs.data && collabs.data.length > 0) {
          const collabIds = collabs.data.map(c => c.group_id);
          const { data: cGroups } = await saldamosSupabase
            .from('groups')
            .select('id, name, currency, owner_id')
            .in('id', collabIds);
          
          if (cGroups) {
            cGroups.forEach(cg => {
              if (!allGroups.some(ag => ag.id === cg.id)) {
                allGroups.push(cg);
              }
            });
          }
        }
        
        setGroups(allGroups);
      } catch (err: any) {
        console.error('Error fetching groups:', err);
      } finally {
        setLoadingGroups(false);
      }
    };
    
    loadGroups();
  }, [user?.id]);

  // Focus input on step 1
  useEffect(() => {
    if (step === 1) {
      setTimeout(() => amountInputRef.current?.focus(), 150);
    }
  }, [step]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthWall />;
  }

  const handleAddPerson = () => {
    const trimmed = newPersonName.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === 'yo') return;
    
    if (frequentPeople.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Esta persona ya está en tu lista');
      return;
    }
    
    const updated = [...frequentPeople, trimmed];
    setFrequentPeople(updated);
    setSelectedPeople(prev => [...prev, trimmed]);
    setNewPersonName('');
    
    // Save to localStorage
    const peopleKey = `saldamos_frequent_people_${user.id}`;
    localStorage.setItem(peopleKey, JSON.stringify(updated));
    toast.success(`Añadido: ${trimmed}`);
  };

  const togglePersonSelection = (person: string) => {
    if (person === 'Yo') return; // User must always be included
    
    setSelectedPeople(prev => {
      if (prev.includes(person)) {
        return prev.filter(p => p !== person);
      } else {
        return [...prev, person];
      }
    });
  };

  const executeSave = async (targetGroup: Group) => {
    const amtValue = Number(amount);
    if (isNaN(amtValue) || amtValue <= 0) {
      toast.error('Por favor ingresa un monto válido');
      setStep(1);
      return;
    }
    
    setSavingExpense(true);
    setSavedGroup(targetGroup);
    
    try {
      const groupId = targetGroup.id;
      
      // 1. Fetch group members
      const { data: members, error: memError } = await saldamosSupabase
        .from('group_members')
        .select('id, name')
        .eq('group_id', groupId);
      
      if (memError) throw memError;
      const currentMembers = members ?? [];
      
      // 2. Resolve Payer ID (Yo)
      // Check if user has an identity stored for this group
      let myMemId = localStorage.getItem(`saldamos_id_${groupId}`);
      
      // If not, check if there is a member named "Yo" or matching the user
      if (!myMemId) {
        const foundMe = currentMembers.find(m => 
          m.name.toLowerCase() === 'yo' || 
          m.name.toLowerCase() === 'me'
        );
        if (foundMe) {
          myMemId = foundMe.id;
          localStorage.setItem(`saldamos_id_${groupId}`, myMemId);
        } else {
          // Auto-create a member "Yo" for this user in that group
          const { data: newMe, error: createMeError } = await saldamosSupabase
            .from('group_members')
            .insert({ group_id: groupId, name: 'Yo' })
            .select('id')
            .single();
            
          if (createMeError) throw createMeError;
          myMemId = (newMe as any).id;
          localStorage.setItem(`saldamos_id_${groupId}`, myMemId);
          currentMembers.push({ id: myMemId!, name: 'Yo' });
        }
      }
      
      // 3. Resolve IDs for all other participants
      const participantIds: Record<string, string> = { 'Yo': myMemId! };
      
      for (const pName of selectedPeople) {
        if (pName === 'Yo') continue;
        
        const existing = currentMembers.find(m => m.name.toLowerCase() === pName.toLowerCase());
        if (existing) {
          participantIds[pName] = existing.id;
        } else {
          // Auto-insert member into the group
          const { data: newMem, error: createMemError } = await saldamosSupabase
            .from('group_members')
            .insert({ group_id: groupId, name: pName })
            .select('id')
            .single();
            
          if (createMemError) throw createMemError;
          const insertedId = (newMem as any).id;
          participantIds[pName] = insertedId;
          currentMembers.push({ id: insertedId, name: pName });
        }
      }
      
      // 4. Create the expense
      const groupMode = localStorage.getItem(`group_mode_${groupId}`) || 'balance';
      const isFootball = targetGroup.name.toLowerCase().includes('futbol') || targetGroup.name.toLowerCase().includes('fútbol');
      const isTracker = groupMode === 'tracker' || (isFootball && groupMode !== 'balance');
      
      const expDesc = description.trim() || 'Gasto rápido ⚡';
      
      const { data: exp, error: expError } = await saldamosSupabase
        .from('expenses')
        .insert({
          group_id: groupId,
          description: expDesc,
          total_amount: amtValue,
          is_settlement: false,
          is_personal: false,
          track_payments: isTracker
        })
        .select('id')
        .single();
        
      if (expError || !exp) throw expError ?? new Error('Failed to create expense');
      
      // 5. Create contributions
      const splitShare = amtValue / selectedPeople.length;
      const contributionsData = selectedPeople.map(pName => {
        const memId = participantIds[pName];
        const isPayer = pName === 'Yo';
        
        return {
          expense_id: (exp as any).id,
          member_id: memId,
          amount_paid: isPayer ? amtValue : 0,
          amount_owed: splitShare,
          is_settled: isPayer ? true : false
        };
      });
      
      const { error: contribError } = await saldamosSupabase
        .from('expense_contributions')
        .insert(contributionsData);
        
      if (contribError) throw contribError;
      
      // 6. Log activity
      try {
        await saldamosSupabase.from('group_activity' as any).insert({
          group_id: groupId,
          user_id: user.id,
          action_type: 'EXPENSE_ADDED',
          metadata: {
            description: expDesc,
            amount: amtValue,
            currency: targetGroup.currency
          }
        });
      } catch (err) {
        console.warn('Could not log activity in database:', err);
      }
      
      // Celebrate!
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
      
      setStep(4);
    } catch (err: any) {
      console.error('Error saving fast expense:', err);
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSavingExpense(false);
    }
  };

  const getGroupStyle = (groupId: string) => {
    const savedColor = localStorage.getItem(`group_color_${groupId}`);
    if (savedColor) return `bg-gradient-to-br ${savedColor}`;
    return 'bg-gradient-to-br from-blue-600 to-indigo-700';
  };

  const getGroupEmoji = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('pareja') || n.includes('amor')) return '❤️';
    if (n.includes('hogar') || n.includes('casa')) return '🏠';
    if (n.includes('fút') || n.includes('futbol')) return '⚽';
    if (n.includes('viaje')) return '✈️';
    if (n.includes('evento')) return '🎉';
    if (n.includes('comida') || n.includes('pizza')) return '🍕';
    return '👋';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 text-white flex flex-col items-center justify-start p-4 md:p-6 select-none">
      <div className="w-full max-w-md flex flex-col gap-5 pt-4">
        
        {/* Navigation & Title */}
        <div className="flex items-center justify-between">
          <button 
            onClick={() => {
              if (step > 1 && step < 4) setStep((step - 1) as any);
              else navigate('/');
            }}
            className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-white/80"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="text-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
              Widget ⚡
            </span>
            <h1 className="text-sm font-black mt-1 text-slate-300">Gasto Rápido</h1>
          </div>
          
          <div className="w-10 h-10" /> {/* Spacer */}
        </div>

        {/* Steps Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-[32px] border border-white/10 p-6 shadow-2xl relative overflow-hidden flex flex-col gap-6">
          
          {/* Progress Indicator */}
          {step < 4 && (
            <div className="flex justify-between items-center gap-1.5 px-4 mb-2">
              {[1, 2, 3].map((s) => (
                <div 
                  key={s} 
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    s <= step ? 'bg-blue-500 shadow-md shadow-blue-500/30' : 'bg-white/10'
                  }`} 
                />
              ))}
            </div>
          )}

          {/* STEP 1: AMOUNT */}
          {step === 1 && (
            <div className="space-y-6 flex flex-col">
              <div className="text-center space-y-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">¿Cuánto fue?</span>
                <div className="relative flex items-center justify-center max-w-[250px] mx-auto">
                  <span className="text-3xl font-black text-blue-400 mr-1.5">$</span>
                  <Input
                    ref={amountInputRef}
                    type="number"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && amount) setStep(2);
                    }}
                    className="text-4xl font-black bg-transparent border-none text-center outline-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-white placeholder-white/20 select-text"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-400">Descripción (Opcional)</Label>
                <Input
                  placeholder="Ej. Bebidas, comida, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-2xl bg-white/5 border-white/10 text-white h-12 text-sm px-4 placeholder-white/20"
                />
              </div>

              <Button
                onClick={() => setStep(2)}
                disabled={!amount || Number(amount) <= 0}
                className="w-full h-13 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white font-black text-sm shadow-lg shadow-blue-500/20 active:scale-97 transition-all mt-4"
              >
                Siguiente
              </Button>
            </div>
          )}

          {/* STEP 2: PARTICIPANTS */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-200">¿Quiénes participaron?</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Selecciona quiénes consumieron.</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400">Dividir igual</span>
                  <Switch 
                    checked={splitEqually} 
                    onCheckedChange={setSplitEqually} 
                    className="data-[state=checked]:bg-blue-600"
                  />
                </div>
              </div>

              {/* People Selection grid */}
              <div className="flex flex-wrap gap-2 max-h-[180px] overflow-y-auto pr-1">
                {frequentPeople.map((person) => {
                  const isSelected = selectedPeople.includes(person);
                  return (
                    <button
                      key={person}
                      type="button"
                      onClick={() => togglePersonSelection(person)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl text-xs font-black transition-all border ${
                        isSelected
                          ? 'bg-blue-600 border-blue-500 text-white shadow-lg scale-95'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {isSelected ? '✓' : person.charAt(0).toUpperCase()}
                      </div>
                      {person}
                    </button>
                  );
                })}
              </div>

              {/* Add New Contact input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Nombre de otra persona..."
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddPerson();
                    }
                  }}
                  className="rounded-2xl bg-white/5 border-white/10 text-white h-11 text-xs placeholder-white/20"
                />
                <Button 
                  onClick={handleAddPerson}
                  variant="outline" 
                  className="h-11 w-11 rounded-2xl border-white/10 bg-white/5 flex items-center justify-center p-0 text-white hover:bg-white/10"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <Button
                onClick={() => setStep(3)}
                className="w-full h-13 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white font-black text-sm shadow-lg shadow-blue-500/20 active:scale-97 transition-all mt-3"
              >
                Elegir Grupo ({selectedPeople.length})
              </Button>
            </div>
          )}

          {/* STEP 3: GROUP SELECT */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-black text-slate-200">¿En qué grupo guardar?</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Selecciona el grupo y el gasto se guardará automáticamente.</p>
              </div>

              {loadingGroups ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-white/10 rounded-2xl bg-white/5">
                  <p className="text-xs font-bold text-slate-300 mb-2">No tienes grupos aún</p>
                  <Button size="sm" onClick={() => navigate('/')} className="rounded-xl text-[10px] h-8 bg-blue-600">
                    Ir a crear grupo
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                  {groups.map((g) => {
                    const style = getGroupStyle(g.id);
                    const emoji = getGroupEmoji(g.name);
                    return (
                      <button
                        key={g.id}
                        onClick={() => !savingExpense && executeSave(g)}
                        disabled={savingExpense}
                        className={`relative rounded-2xl overflow-hidden shadow-md border border-white/10 transition-all hover:scale-102 active:scale-97 text-left flex flex-col gap-2 p-3 min-h-[90px] ${style}`}
                      >
                        {/* Emoji decoration */}
                        <span className="absolute top-1 right-2 text-3xl opacity-20 select-none pointer-events-none">
                          {emoji}
                        </span>

                        <span className="text-xl">{emoji}</span>
                        <div className="mt-auto">
                          <p className="text-[11px] font-black text-white leading-tight truncate max-w-[130px]">
                            {g.name}
                          </p>
                          <p className="text-[8px] text-white/70 font-semibold uppercase">{g.currency}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {savingExpense && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-[32px] z-50">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-xs font-black text-slate-200">Añadiendo gasto rápido...</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: SUCCESS */}
          {step === 4 && (
            <div className="text-center py-4 space-y-6 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-4xl shadow-lg shadow-emerald-500/20 animate-bounce">
                🎉
              </div>
              
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-emerald-400">¡Gasto guardado con éxito!</h3>
                <p className="text-xs text-slate-300 px-4 leading-normal">
                  Agregamos un gasto de <strong className="text-white">${Number(amount).toLocaleString()}</strong> en el grupo <strong>{savedGroup?.name}</strong>.
                </p>
              </div>

              <div className="w-full space-y-2 mt-4">
                <Button
                  onClick={() => {
                    setAmount('');
                    setDescription('');
                    setSelectedPeople(['Yo']);
                    setSavedGroup(null);
                    setStep(1);
                  }}
                  className="w-full h-11 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black text-xs"
                >
                  Agregar otro gasto
                </Button>
                
                <Button
                  onClick={() => {
                    // Navigate to home and open that group
                    if (savedGroup) {
                      navigate(`/?group=${savedGroup.id}`);
                    } else {
                      navigate('/');
                    }
                  }}
                  className="w-full h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white font-black text-xs shadow-lg shadow-blue-500/20"
                >
                  Ver balances en el grupo
                </Button>
              </div>
            </div>
          )}

        </div>

        {/* Info advice for Mobile Widget setup */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-3 items-start">
          <HelpCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-[11px] font-black text-slate-200">¿Cómo añadirlo como Widget?</h4>
            <p className="text-[10px] text-slate-400 leading-normal">
              1. En el navegador de tu celular, pulsa el botón de <strong>Compartir</strong> (Safari) o los <strong>tres puntos</strong> (Chrome).<br/>
              2. Elige <strong>"Añadir a la pantalla de inicio"</strong>.<br/>
              3. ¡Listo! Tendrás un acceso directo directo a esta pantalla como si fuese un widget nativo.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
