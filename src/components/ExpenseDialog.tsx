import { useEffect, useMemo, useState } from "react";
import { saldamosSupabase } from "@/integrations/supabase/saldamos-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle, Sparkles, Wand2, User, HandCoins, ArrowRight, Plus, ChevronRight, Users, PartyPopper } from "lucide-react";
import { formatMoney, type ExpenseWithContribs } from "@/lib/balances";
import { CategoryPicker, type Category } from "@/components/CategoryPicker";
import { parseLaCuotaMessage, findMemberMatch } from "@/lib/lacuota-parser";
import { Textarea } from "@/components/ui/textarea";
import confetti from "canvas-confetti";

type Member = { id: string; name: string; joined_at: string };
type ExpenseWithCategory = ExpenseWithContribs & { category_id: string | null; is_personal?: boolean };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
  members: Member[];
  currency: string;
  categories: Category[];
  existing: ExpenseWithCategory | null;
  onSaved: (expense?: any) => void;
  onMembersChanged?: () => Promise<void> | void;
  onCategoriesChanged: () => Promise<void> | void;
  initialImportText?: string | null;
};

export function ExpenseDialog({ 
  open, onOpenChange, groupId, members, currency, categories, existing, onSaved, onMembersChanged, onCategoriesChanged, initialImportText 
}: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contribs, setContribs] = useState<Record<string, string>>({});
  const [owed, setOwed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isPersonal, setIsPersonal] = useState(false);
  const [trackPayments, setTrackPayments] = useState(false);
  const [personalPayer, setPersonalPayer] = useState<string>("");
  const [unmappedPersons, setUnmatchedPersons] = useState<any[]>([]);
  const [manualMappings, setManualMappings] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`saldamos_mappings_${groupId}`) || '{}');
    } catch { return {}; }
  });
  const [frequentPeople] = useState<string[]>(() => {
    const saved = localStorage.getItem('saldamos_frequent_people');
    return saved ? JSON.parse(saved) : [];
  });
  const [peopleGroups] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('saldamos_people_groups');
    return saved ? JSON.parse(saved) : {};
  });
  const [activeGroupFilter, setActiveGroupFilter] = useState<string | null>(null);
  const [addingFrequent, setAddingFrequent] = useState<string | null>(null);
  const [showFrequent, setShowFrequent] = useState(true);
  const [tempMembers, setTempMembers] = useState<Member[]>([]);
  const groupMode = groupId ? localStorage.getItem(`group_mode_${groupId}`) : 'balance';
  const [peopleFilterTab, setPeopleFilterTab] = useState<'group' | 'friends'>('group');

  const allAvailableMembers = useMemo(() => {
    // Combine props members with locally added ones, avoiding duplicates
    const combined = [...members];
    tempMembers.forEach(tm => {
      if (!combined.some(m => m.id === tm.id)) combined.push(tm);
    });
    return combined;
  }, [members, tempMembers]);

  const eligible = useMemo(() => {
    if (existing) {
      const existingIds = new Set(existing.contributions.map((c) => c.member_id));
      const exDate = new Date(existing.expense_date).getTime();
      return allAvailableMembers.filter(
        (m) => existingIds.has(m.id) || new Date(m.joined_at).getTime() <= exDate,
      );
    }
    return allAvailableMembers;
  }, [allAvailableMembers, existing]);

  useEffect(() => {
    if (!open) return;
    const defaultCat = categories.find((c) => c.is_default) ?? null;
    if (existing) {
      setDescription(existing.description);
      setTotal(String(existing.total_amount));
      setDate(new Date(existing.expense_date).toISOString().slice(0, 10));
      setCategoryId(existing.category_id ?? defaultCat?.id ?? null);
      setIsPersonal(!!existing.is_personal);
      setTrackPayments(!!existing.track_payments);
      const sel = new Set(existing.contributions.map((c) => c.member_id));
      setSelected(sel);
      const paidMap: Record<string, string> = {};
      const owedMap: Record<string, string> = {};
      existing.contributions.forEach((c) => {
        paidMap[c.member_id] = String(c.amount_paid);
        owedMap[c.member_id] = c.amount_owed > 0 ? String(c.amount_owed) : "";
      });
      setContribs(paidMap);
      setOwed(owedMap);
      if (existing.is_personal && existing.contributions[0]) {
        setPersonalPayer(existing.contributions[0].member_id);
      } else {
        setPersonalPayer("");
      }
    } else if (initialImportText) {
      const parsed = parseLaCuotaMessage(initialImportText);
      setDescription(""); // Leave empty as requested
      const sum = parsed.reduce((s, p) => s + p.amount, 0);
      setTotal(sum.toString());
      setDate(new Date().toISOString().slice(0, 10));
      setCategoryId(defaultCat?.id ?? null);
      setIsPersonal(false);
      
      const nextOwed: Record<string, string> = {};
      const nextSelected = new Set<string>();
      const unmatched: any[] = [];
      
      parsed.forEach(p => {
        // Try exact/fuzzy match first
        let matchId = findMemberMatch(p.name, members);
        
        // If no match, try saved manual mapping
        if (!matchId && manualMappings[p.name]) {
          matchId = manualMappings[p.name];
        }

        if (matchId) {
          nextOwed[matchId] = p.amount.toString();
          nextSelected.add(matchId);
        } else {
          unmatched.push(p);
        }
      });
      setOwed(nextOwed);
      setSelected(nextSelected);
      setUnmatchedPersons(unmatched);
      setContribs({});
    } else {
      setDescription("");
      setTotal("");
      setDate(new Date().toISOString().slice(0, 10));
      setCategoryId(defaultCat?.id ?? null);
      setTempMembers([]);
      const groupMode = groupId ? localStorage.getItem(`group_mode_${groupId}`) : 'balance';
      const isFootball = description.toLowerCase().includes('fútbol') || description.toLowerCase().includes('futbol') || (groupId && localStorage.getItem(`group_emoji_${groupId}`) === '⚽');
      
      setTrackPayments(groupMode === 'tracker' || isFootball);
      setPersonalPayer("");
      
      if (groupMode === 'tracker') {
        setSelected(new Set());
      } else {
        setSelected(new Set(members.map((m) => m.id)));
      }
      
      const map: Record<string, string> = {};
      members.forEach((m) => (map[m.id] = ""));
      setContribs(map);
      setOwed({ ...map });
    }
  }, [open, existing, initialImportText, members, groupId]);

  const totalNum = Number(total) || 0;
  const sumContribs = Array.from(selected).reduce((s, id) => s + (Number(contribs[id]) || 0), 0);
  const sumOwed = Array.from(selected).reduce((s, id) => s + (Number(owed[id]) || 0), 0);
  const mismatch = totalNum > 0 && Math.abs(sumContribs - totalNum) > 0.01;
  const owedMismatch = totalNum > 0 && sumOwed > 0.01 && Math.abs(sumOwed - totalNum) > 0.01;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const addFrequentToGroup = async (name: string) => {
    if (addingFrequent) return;
    setAddingFrequent(name);
    try {
      const { data, error } = await saldamosSupabase
        .from('group_members')
        .insert({ group_id: groupId, name: name.trim() })
        .select()
        .single();
      
      if (error) throw error;
      
      const newMember = data as any;
      toast.success(`${name} agregado al grupo`);
      
      // Update local members immediately so they appear in the UI
      setTempMembers(prev => [...prev, newMember]);
      
      // Auto-select in the expense
      setSelected(prev => new Set(prev).add(newMember.id));
      
      // Refresh parent in background
      if (onMembersChanged) onMembersChanged();
    } catch (err: any) {
      toast.error('Error al agregar: ' + err.message);
    } finally {
      setAddingFrequent(null);
    }
  };

  const selectAll = () => setSelected(new Set(members.map(m => m.id)));
  const selectNone = () => setSelected(new Set());

  const distributeEvenly = () => {
    if (!totalNum || selected.size === 0) return;
    const share = Math.floor((totalNum / selected.size) * 100) / 100;
    let remainderCents = Math.round((totalNum - (share * selected.size)) * 100);
    const next = { ...contribs };
    Array.from(selected).forEach((id, idx) => {
      let amount = share;
      if (remainderCents > 0) {
        amount += 0.01;
        remainderCents -= 1;
      }
      next[id] = amount.toFixed(2);
    });
    setContribs(next);
  };

  const distributeOwedEvenly = () => {
    if (!totalNum || selected.size === 0) return;
    const share = Math.floor((totalNum / selected.size) * 100) / 100;
    let remainderCents = Math.round((totalNum - (share * selected.size)) * 100);
    const next = { ...owed };
    Array.from(selected).forEach((id, idx) => {
      let amount = share;
      if (remainderCents > 0) {
        amount += 0.01;
        remainderCents -= 1;
      }
      next[id] = amount.toFixed(2);
    });
    setOwed(next);
  };

  const assignAllToOne = (id: string) => {
    const next: Record<string, string> = {};
    selected.forEach((mid) => (next[mid] = mid === id ? totalNum.toFixed(2) : "0"));
    setContribs(next);
  };

  const save = async () => {
    if (!description.trim() || !totalNum) {
      toast.error("Completá descripción y monto total.");
      return;
    }
    if (isPersonal && !personalPayer) {
      toast.error("Elegí a quién corresponde el gasto personal.");
      return;
    }
    if (!isPersonal && selected.size === 0) {
      toast.error("Elegí al menos un participante.");
      return;
    }
    setSaving(true);
    const isoDate = new Date(date + "T12:00:00").toISOString();

    let expenseId = existing?.id;
    const finalCategoryId = categoryId ?? categories.find((c) => c.is_default)?.id ?? null;
    if (existing) {
      const { error } = await saldamosSupabase
        .from("expenses")
        .update({
          description: description.trim(),
          total_amount: totalNum,
          expense_date: isoDate,
          category_id: finalCategoryId,
          is_personal: isPersonal,
          track_payments: trackPayments,
        })
        .eq("id", existing.id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      await saldamosSupabase.from("expense_contributions").delete().eq("expense_id", existing.id);
    } else {
      const { data, error } = await saldamosSupabase
        .from("expenses")
        .insert({
          group_id: groupId,
          description: description.trim(),
          total_amount: totalNum,
          expense_date: isoDate,
          category_id: finalCategoryId,
          is_personal: isPersonal,
          track_payments: trackPayments,
        })
        .select("id")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Error");
        setSaving(false);
        return;
      }
      expenseId = (data as any).id;
    }

    const rows = isPersonal
      ? [{
          expense_id: expenseId!,
          member_id: personalPayer,
          amount_paid: totalNum,
          amount_owed: totalNum,
        }]
      : Array.from(selected).map((mid) => ({
          expense_id: expenseId!,
          member_id: mid,
          amount_paid: Number(contribs[mid]) || 0,
          amount_owed: Number(owed[mid]) || 0,
        }));
    const { error: cErr } = await saldamosSupabase.from("expense_contributions").insert(rows);
    setSaving(false);
    if (cErr) {
      toast.error(cErr.message);
      return;
    }
    toast.success(existing ? "Gasto actualizado" : "Gasto guardado");

    // 🎉 Confetti fun animation!
    try {
      const btn = document.getElementById('save-expense-btn');
      if (btn) {
        const rect = btn.getBoundingClientRect();
        const x = (rect.left + rect.width / 2) / window.innerWidth;
        const y = (rect.top + rect.height / 2) / window.innerHeight;
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { x, y },
          colors: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'],
          disableForReducedMotion: true
        });
      }
    } catch(e) {}

    onSaved({
      id: expenseId,
      description: description.trim(),
      total_amount: totalNum
    });
    onOpenChange(false);
  };

  const handlePasteProcess = () => {
    const parsed = parseLaCuotaMessage(pasteText);
    if (parsed.length === 0) {
      toast.error("No se detectaron personas en el texto.");
      return;
    }
    const nextOwed = { ...owed };
    const nextSelected = new Set(selected);
    parsed.forEach(p => {
      const matchId = findMemberMatch(p.name, members);
      if (matchId) {
        nextOwed[matchId] = p.amount.toString();
        nextSelected.add(matchId);
      }
    });
    setOwed(nextOwed);
    setSelected(nextSelected);
    
    const sum = parsed.reduce((s, p) => s + p.amount, 0);
    if (!total || Number(total) === 0) setTotal(sum.toString());
    
    toast.success("Consumos importados");
    setPasteOpen(false);
  };

  const saveMapping = (externalName: string, memberId: string) => {
    const newMappings = { ...manualMappings, [externalName]: memberId };
    setManualMappings(newMappings);
    localStorage.setItem(`saldamos_mappings_${groupId}`, JSON.stringify(newMappings));
    
    // Update the current expense state too
    const person = unmappedPersons.find(p => p.name === externalName);
    if (person) {
      setOwed(prev => ({ ...prev, [memberId]: person.amount.toString() }));
      setSelected(prev => new Set(prev).add(memberId));
      setUnmatchedPersons(prev => prev.filter(p => p.name !== externalName));
    }
    toast.success(`Nombre "${externalName}" vinculado.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl rounded-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center pb-2">
          <DialogTitle className="text-2xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex justify-center items-center gap-2">
            <PartyPopper className="w-6 h-6 text-blue-500" />
            {existing ? "Editando gasto" : "¡Nuevo Gasto!"}
          </DialogTitle>
          <DialogDescription className="text-center text-xs">
            {existing ? "Vamos a ajustar los detalles." : "¿En qué se fue la plata esta vez? 💸"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center space-y-2 bg-blue-50/50 p-6 rounded-3xl border border-blue-100/50 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Label htmlFor="total" className="text-blue-600 font-bold uppercase tracking-widest text-[10px] z-10">
              ¿Cuánto dolió? ({currency})
            </Label>
            <div className="relative w-full max-w-[220px] z-10">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-blue-600/30">$</span>
              <Input
                id="total"
                type="number"
                inputMode="decimal"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0"
                className="rounded-2xl text-4xl font-black text-center h-16 pl-10 border-blue-200 bg-white/80 shadow-inner focus-visible:ring-blue-400 focus-visible:ring-offset-2 transition-all"
              />
            </div>
          </div>

          <div className="space-y-3">
             <Label htmlFor="desc" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-1.5">
               <Sparkles className="w-3 h-3 text-amber-500" /> ¿Qué compramos?
             </Label>
             <Input
               id="desc"
               value={description}
               onChange={(e) => setDescription(e.target.value)}
               placeholder="Ej: Completos, Cervezas, Uber... 🍔🍻🚕"
               className="rounded-xl h-12 text-sm font-medium shadow-sm bg-white"
             />
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            {groupMode !== 'tracker' ? (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Categoría</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <CategoryPicker
                      groupId={groupId}
                      categories={categories}
                      value={categoryId}
                      onChange={setCategoryId}
                      onCategoriesChanged={onCategoriesChanged}
                    />
                  </div>
                  <div className="flex gap-1">
                    <Input 
                      placeholder="Nueva..." 
                      className="w-20 text-[10px] h-10 rounded-xl"
                      id="new-cat-input"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.currentTarget as HTMLInputElement).value;
                          if (val.trim()) {
                            (async () => {
                              const { data, error } = await saldamosSupabase
                                .from("expense_categories" as any)
                                .insert({ group_id: groupId, name: val.trim(), is_default: false })
                                .select("id")
                                .single();
                              if (!error) {
                                await onCategoriesChanged();
                                setCategoryId((data as any).id);
                                (document.getElementById('new-cat-input') as HTMLInputElement).value = '';
                                toast.success(`Categoría "${val}" creada`);
                              }
                            })();
                          }
                        }
                      }}
                    />
                    <Button 
                      size="icon" 
                      variant="outline" 
                      className="h-10 w-10 rounded-xl shrink-0 border-dashed"
                      onClick={() => {
                        const input = document.getElementById('new-cat-input') as HTMLInputElement;
                        const val = input.value;
                        if (val.trim()) {
                          (async () => {
                            const { data, error } = await saldamosSupabase
                              .from("expense_categories" as any)
                              .insert({ group_id: groupId, name: val.trim(), is_default: false })
                              .select("id")
                              .single();
                            if (!error) {
                              await onCategoriesChanged();
                              setCategoryId((data as any).id);
                              input.value = '';
                              toast.success(`Categoría "${val}" creada`);
                            }
                          })();
                        }
                      }}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : <div />}
            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">¿Cuándo?</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl h-10 text-[10px] text-muted-foreground bg-muted/20 border-border/50" />
            </div>
          </div>



          {groupMode !== 'tracker' && (
            <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <User className="mt-0.5 h-4 w-4 text-blue-500" />
                <div>
                  <Label htmlFor="personal-switch" className="cursor-pointer font-medium">Gasto personal</Label>
                  <p className="text-[10px] text-muted-foreground">No afecta el balance grupal. Solo tu historial individual.</p>
                </div>
              </div>
              <Switch id="personal-switch" checked={isPersonal} onCheckedChange={(v) => setIsPersonal(!!v)} />
            </div>
          )}

          {!isPersonal && groupMode !== 'tracker' && (
            <div className="flex items-start justify-between gap-3 rounded-xl border bg-amber-50/50 border-amber-100 p-3">
              <div className="flex items-start gap-2">
                <HandCoins className="mt-0.5 h-4 w-4 text-amber-600" />
                <div>
                  <Label htmlFor="track-switch" className="cursor-pointer font-medium text-amber-900">Controlar cobros</Label>
                  <p className="text-[10px] text-amber-700">Resalta el gasto si te deben dinero y permite marcar quién ya pagó.</p>
                </div>
              </div>
              <Switch id="track-switch" checked={trackPayments} onCheckedChange={(v) => setTrackPayments(!!v)} />
            </div>
          )}
          
          {unmappedPersons.length > 0 && (
            <div className="space-y-3 p-4 rounded-2xl bg-amber-50 border border-amber-100 animate-in fade-in zoom-in duration-300">
              <div className="flex items-center gap-2 text-amber-700 mb-1">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-xs font-bold uppercase tracking-wider">Vincular personas detectadas</p>
              </div>
              <p className="text-[10px] text-amber-600 mb-2">No pudimos identificar a estas personas. Vincúlalas con un miembro del grupo y lo recordaremos para la próxima.</p>
              <div className="space-y-2">
                {unmappedPersons.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 bg-white/50 p-2 rounded-xl border border-amber-200">
                    <span className="text-xs font-bold text-amber-900 truncate flex-1">{p.name} ({formatMoney(p.amount, currency)})</span>
                    <ArrowRight className="w-3 h-3 text-amber-400" />
                    <Select onValueChange={(val) => saveMapping(p.name, val)}>
                      <SelectTrigger className="h-8 text-[10px] w-[140px] rounded-lg border-amber-200">
                        <SelectValue placeholder="Vincular a..." />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NEW: People Selection Section (Always visible) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Seleccionar Personas</Label>
              <div className="flex bg-muted p-0.5 rounded-lg">
                <button 
                  onClick={() => setPeopleFilterTab('group')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${peopleFilterTab === 'group' ? 'bg-background shadow-sm text-blue-600' : 'text-muted-foreground'}`}
                >
                  En el Grupo
                </button>
                <button 
                  onClick={() => setPeopleFilterTab('friends')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${peopleFilterTab === 'friends' ? 'bg-background shadow-sm text-blue-600' : 'text-muted-foreground'}`}
                >
                  Mis Amigos
                </button>
              </div>
            </div>

            <div className="p-3 bg-blue-500/5 rounded-2xl border border-blue-500/10 space-y-3">
              {peopleFilterTab === 'group' ? (
                <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto no-scrollbar py-1">
                  {allAvailableMembers.map(m => {
                    const isSel = selected.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggle(m.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border shrink-0 ${
                          isSel 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                            : 'bg-white dark:bg-card border-blue-100 dark:border-blue-900 text-foreground hover:border-blue-300'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black ${
                          isSel ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'
                        }`}>
                          {isSel ? '✓' : m.name.charAt(0).toUpperCase()}
                        </div>
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.keys(peopleGroups).length > 0 && (
                    <div className="flex gap-1 overflow-x-auto no-scrollbar">
                      <button
                        type="button"
                        onClick={() => setActiveGroupFilter(null)}
                        className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase transition-all whitespace-nowrap border ${
                          activeGroupFilter === null 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : 'bg-muted/50 border-transparent text-muted-foreground'
                        }`}
                      >
                        Todos
                      </button>
                      {Object.keys(peopleGroups).map(gn => (
                        <button
                          key={gn}
                          type="button"
                          onClick={() => setActiveGroupFilter(activeGroupFilter === gn ? null : gn)}
                          className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase transition-all whitespace-nowrap border ${
                            activeGroupFilter === gn 
                              ? 'bg-blue-600 border-blue-600 text-white' 
                              : 'bg-blue-50 border-blue-100 text-blue-600'
                          }`}
                        >
                          {gn}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto no-scrollbar py-1">
                    {frequentPeople
                      .filter(p => !activeGroupFilter || (peopleGroups[activeGroupFilter] || []).includes(p))
                      .map(p => {
                        const member = allAvailableMembers.find(m => m.name.toLowerCase() === p.toLowerCase());
                        const isAlreadyIn = !!member;
                        const isSelected = member ? selected.has(member.id) : false;
                        
                        return (
                          <button
                            key={p}
                            type="button"
                            disabled={addingFrequent === p}
                            onClick={() => isAlreadyIn ? toggle(member.id) : addFrequentToGroup(p)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border shrink-0 ${
                              isSelected 
                                ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                                : isAlreadyIn
                                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 hover:bg-blue-500/20'
                                  : 'bg-white dark:bg-card border-blue-100 dark:border-blue-900 text-foreground hover:border-blue-300'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'
                            }`}>
                              {addingFrequent === p ? <Loader2 className="w-3 h-3 animate-spin" /> : (isSelected ? '✓' : p.charAt(0).toUpperCase())}
                            </div>
                            {p}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {isPersonal ? (
            <div className="space-y-2">
              <Label>¿De quién es este gasto?</Label>
              <select
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                value={personalPayer}
                onChange={(e) => setPersonalPayer(e.target.value)}
              >
                <option value="">Elegí una persona...</option>
                {allAvailableMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Label>Participantes ({selected.size})</Label>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] rounded-lg" onClick={() => setPasteOpen(true)}>
                    <Wand2 className="h-3 w-3 mr-1" /> Pegar ticket
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] rounded-lg" onClick={distributeEvenly}>Aportes =</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] rounded-lg" onClick={distributeOwedEvenly}>Consumos =</Button>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border bg-muted/30 p-2 min-h-[60px] flex flex-col justify-center">
                {selected.size === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center italic py-4">Selecciona personas arriba para asignar montos</p>
                ) : (
                  allAvailableMembers
                    .filter(m => selected.has(m.id))
                    .map((m) => {
                      return (
                        <div key={m.id} className="rounded-lg p-2 grid grid-cols-[1fr_auto_auto] items-center gap-2 bg-card shadow-sm animate-in fade-in zoom-in-95 duration-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <Checkbox checked={true} onCheckedChange={() => toggle(m.id)} id={`c-${m.id}`} />
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <Label htmlFor={`c-${m.id}`} className="text-xs truncate cursor-pointer font-medium">{m.name}</Label>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 rounded-lg shrink-0 text-blue-600 hover:bg-blue-50"
                                onClick={(e) => { e.preventDefault(); assignAllToOne(m.id); }}
                                title="Pagó todo"
                              >
                                <HandCoins className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex gap-1 justify-end">
                            <Input
                              type="number"
                              value={contribs[m.id] ?? ""}
                              onChange={(e) => setContribs({ ...contribs, [m.id]: e.target.value })}
                              placeholder="Pagó"
                              className="h-8 text-[10px] rounded-lg w-20"
                            />
                          </div>
                          <div className="flex justify-end">
                            <Input
                              type="number"
                              value={owed[m.id] ?? ""}
                              onChange={(e) => setOwed({ ...owed, [m.id]: e.target.value })}
                              placeholder="Consumió"
                              className="h-8 text-xs rounded-lg w-24"
                            />
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" className="rounded-xl w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            id="save-expense-btn"
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl w-full sm:w-auto shadow-lg hover:shadow-blue-500/25 transition-all active:scale-95" 
            onClick={save} 
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} 
            Guardar Gasto
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Pegar ticket</DialogTitle></DialogHeader>
          <Textarea 
            value={pasteText} 
            onChange={e => setPasteText(e.target.value)} 
            placeholder="Pega el mensaje de La Cuota aquí..." 
            className="min-h-[150px] text-xs rounded-xl"
          />
          <DialogFooter>
            <Button onClick={handlePasteProcess} className="rounded-xl">Procesar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
