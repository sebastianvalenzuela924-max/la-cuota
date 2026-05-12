import { useState, useEffect } from 'react';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Loader2, Trash2, LogOut, ChevronRight, Pencil, Check, X, Sparkles, Users, Scale, HandCoins } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';

type Group = { id: string; name: string; currency: string; owner_id: string; isOwner: boolean };

const CURRENCIES = ['CLP', 'ARS', 'USD', 'EUR', 'BRL', 'UYU', 'MXN', 'COP'];

// Templates: emoji, label, suggested name, color gradient
const TEMPLATES = [
  { emoji: '❤️',  label: 'Pareja',    name: 'Gastos de pareja',   gradient: 'from-pink-500 to-rose-600',     bg: 'bg-gradient-to-br from-pink-500 to-rose-600' },
  { emoji: '🏠',  label: 'Hogar',     name: 'Gastos del hogar',   gradient: 'from-amber-500 to-orange-600',  bg: 'bg-gradient-to-br from-amber-500 to-orange-600' },
  { emoji: '⚽',  label: 'Fútbol',    name: 'Fútbol',             gradient: 'from-green-500 to-emerald-600', bg: 'bg-gradient-to-br from-green-500 to-emerald-600' },
  { emoji: '✈️',  label: 'Viaje',     name: 'Viaje 2025',         gradient: 'from-sky-500 to-indigo-600',    bg: 'bg-gradient-to-br from-sky-500 to-indigo-600' },
  { emoji: '🎉',  label: 'Evento',    name: 'Evento especial',    gradient: 'from-violet-500 to-purple-700', bg: 'bg-gradient-to-br from-violet-500 to-purple-700' },
  { emoji: '🍕',  label: 'Salidas',   name: 'Salidas y comidas',  gradient: 'from-orange-400 to-red-500',    bg: 'bg-gradient-to-br from-orange-400 to-red-500' },
  { emoji: '💼',  label: 'Trabajo',   name: 'Gastos del trabajo', gradient: 'from-slate-500 to-gray-700',    bg: 'bg-gradient-to-br from-slate-500 to-gray-700' },
  { emoji: '🎓',  label: 'Estudios',  name: 'Gastos compartidos', gradient: 'from-teal-500 to-cyan-600',     bg: 'bg-gradient-to-br from-teal-500 to-cyan-600' },
];

// Deterministic gradient from group id
function getGroupStyle(groupId: string) {
  const idx = parseInt(groupId.replace(/-/g, '').slice(0, 8), 16) % TEMPLATES.length;
  return TEMPLATES[idx];
}

function getGroupEmoji(name: string) {
  const n = name.toLowerCase();
  if (n.includes('pareja') || n.includes('amor') || n.includes('novia')) return '❤️';
  if (n.includes('hogar') || n.includes('casa') || n.includes('depa')) return '🏠';
  if (n.includes('fút') || n.includes('futbol') || n.includes('deport')) return '⚽';
  if (n.includes('viaje') || n.includes('trip') || n.includes('vacac')) return '✈️';
  if (n.includes('evento') || n.includes('fiesta') || n.includes('cumple')) return '🎉';
  if (n.includes('comida') || n.includes('salida') || n.includes('restau') || n.includes('pizza')) return '🍕';
  if (n.includes('trabajo') || n.includes('oficina')) return '💼';
  if (n.includes('estudio') || n.includes('univer')) return '🎓';
  return null;
}

interface Props {
  onSelectGroup: (groupId: string) => void;
}

export default function SaldamosGroupsList({ onSelectGroup }: Props) {
  const { user, signOut } = useSaldamosAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('CLP');
  const [creating, setCreating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATES[0] | null>(null);
  const [groupMode, setGroupMode] = useState<'balance' | 'tracker'>('balance');
  const [memberInputs, setMemberInputs] = useState<string[]>(['', '']);
  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [frequentPeople, setFrequentPeople] = useState<string[]>(() => {
    const saved = localStorage.getItem('saldamos_frequent_people');
    return saved ? JSON.parse(saved) : [];
  });
  const [peopleGroups, setPeopleGroups] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('saldamos_people_groups');
    return saved ? JSON.parse(saved) : {};
  });
  const [managePeopleOpen, setManagePeopleOpen] = useState(false);
  const [newFrequentName, setNewFrequentName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [activeManageTab, setActiveManageTab] = useState<'people' | 'groups'>('people');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await saldamosSupabase
      .from('groups')
      .select('id, name, currency, owner_id')
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setGroups((data ?? []).map((g: any) => ({ ...g, isOwner: g.owner_id === user.id })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    localStorage.setItem('saldamos_frequent_people', JSON.stringify(frequentPeople));
  }, [frequentPeople]);

  const addFrequentPerson = () => {
    if (!newFrequentName.trim()) return;
    if (frequentPeople.includes(newFrequentName.trim())) {
      toast.error('Esta persona ya está en tu lista');
      return;
    }
    setFrequentPeople(prev => [...prev, newFrequentName.trim()]);
    setNewFrequentName('');
    toast.success('Persona agregada');
  };

  const removeFrequentPerson = (name: string) => {
    const next = frequentPeople.filter(p => p !== name);
    setFrequentPeople(next);
    localStorage.setItem('saldamos_frequent_people', JSON.stringify(next));
    
    // Also remove from any groups
    const nextGroups = { ...peopleGroups };
    Object.keys(nextGroups).forEach(g => {
      nextGroups[g] = nextGroups[g].filter(p => p !== name);
    });
    setPeopleGroups(nextGroups);
    localStorage.setItem('saldamos_people_groups', JSON.stringify(nextGroups));
  };

  const addGroup = () => {
    if (!newGroupName.trim() || peopleGroups[newGroupName.trim()]) return;
    const next = { ...peopleGroups, [newGroupName.trim()]: [] };
    setPeopleGroups(next);
    localStorage.setItem('saldamos_people_groups', JSON.stringify(next));
    setNewGroupName('');
    toast.success(`Grupo "${newGroupName}" creado`);
  };

  const togglePersonInGroupList = (groupName: string, personName: string) => {
    const next = { ...peopleGroups };
    const group = [...next[groupName]];
    if (group.includes(personName)) {
      next[groupName] = group.filter(p => p !== personName);
    } else {
      next[groupName] = [...group, personName];
    }
    setPeopleGroups(next);
    localStorage.setItem('saldamos_people_groups', JSON.stringify(next));
  };

  const deletePersonGroup = (groupName: string) => {
    const next = { ...peopleGroups };
    delete next[groupName];
    setPeopleGroups(next);
    localStorage.setItem('saldamos_people_groups', JSON.stringify(next));
    toast.success('Grupo eliminado');
  };

  const togglePersonInGroup = (personName: string) => {
    setMemberInputs(prev => {
      const exists = prev.some(m => m.trim() === personName);
      if (exists) {
        return prev.filter(m => m.trim() !== personName);
      } else {
        const emptyIdx = prev.findIndex(m => !m.trim());
        if (emptyIdx !== -1) {
          const next = [...prev];
          next[emptyIdx] = personName;
          return next;
        }
        return [...prev, personName];
      }
    });
  };

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setSelectedTemplate(t);
    setName(t.name);
  };

  const create = async () => {
    if (!name.trim() || !user || creating) return;
    setCreating(true);
    const { data: sess } = await saldamosSupabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) { setCreating(false); toast.error('Sesión expirada.'); return; }
    const { error, data: newGroup } = await saldamosSupabase
      .from('groups')
      .insert({ name: name.trim(), currency, owner_id: uid })
      .select('id')
      .single();
    if (error || !newGroup) { setCreating(false); toast.error(error?.message ?? 'Error'); return; }
    
    // Add members
    const validMembers = memberInputs.map(m => m.trim()).filter(Boolean);
    if (validMembers.length > 0) {
      await saldamosSupabase.from('group_members').insert(
        validMembers.map(memberName => ({ group_id: (newGroup as any).id, name: memberName }))
      );
    }
    
    setCreating(false);
    toast.success(`Grupo "${name.trim()}" creado 🎉${validMembers.length > 0 ? ` con ${validMembers.length} persona${validMembers.length > 1 ? 's' : ''}` : ''}`);
    localStorage.setItem(`group_mode_${(newGroup as any).id}`, groupMode);
    setCreateOpen(false);
    setName('');
    setSelectedTemplate(null);
    setMemberInputs(['', '']);
    load();
  };

  const startRename = (g: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(g.id);
    setRenameValue(g.name);
  };

  const saveRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!renameValue.trim() || !renamingId) return;
    setRenameSaving(true);
    const { error } = await saldamosSupabase
      .from('groups')
      .update({ name: renameValue.trim() })
      .eq('id', renamingId);
    setRenameSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Nombre actualizado');
    setRenamingId(null);
    load();
  };

  const deleteGroup = async (g: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!g.isOwner) {
      if (!confirm(`¿Salir de "${g.name}"?`)) return;
      await saldamosSupabase.from('group_collaborators').delete().eq('group_id', g.id).eq('user_id', user!.id);
    } else {
      if (!confirm(`¿Eliminar "${g.name}" y todos sus datos?`)) return;
      const { data: exps } = await saldamosSupabase.from('expenses').select('id').eq('group_id', g.id);
      const ids = (exps ?? []).map((x: any) => x.id);
      if (ids.length > 0) await saldamosSupabase.from('expense_contributions').delete().in('expense_id', ids);
      await saldamosSupabase.from('expenses').delete().eq('group_id', g.id);
      await saldamosSupabase.from('group_members').delete().eq('group_id', g.id);
      await saldamosSupabase.from('groups').delete().eq('id', g.id);
    }
    toast.success(g.isOwner ? 'Grupo eliminado' : 'Saliste del grupo');
    load();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground tracking-tight">Mis grupos</h2>
          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{user?.email}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="rounded-xl text-xs gap-1.5 bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-md shadow-violet-200 hover:shadow-violet-300 transition-all"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Nuevo grupo
          </Button>
          <Button size="icon" variant="ghost" className="w-8 h-8 rounded-xl" onClick={() => signOut()} title="Cerrar sesión">
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Mis Personas - Rediseñado Premium */}
      <div className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 rounded-3xl p-4 border border-violet-100 dark:border-violet-900/30 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-200 dark:shadow-none">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-foreground leading-none">Mis Personas</h3>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Tu lista de contactos</p>
            </div>
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setManagePeopleOpen(true)}
            className="h-8 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-violet-100 dark:hover:bg-violet-900/40 text-violet-600"
          >
            Gestionar
          </Button>
        </div>
        
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {frequentPeople.length === 0 ? (
            <button 
              onClick={() => setManagePeopleOpen(true)}
              className="flex items-center gap-3 py-2 px-1 text-left w-full hover:bg-violet-100/50 dark:hover:bg-violet-900/20 rounded-2xl transition-colors"
            >
              <div className="w-10 h-10 rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-900/40 flex items-center justify-center text-violet-300">
                <Plus className="w-5 h-5" />
              </div>
              <p className="text-xs text-muted-foreground italic">Agrega amigos para armar grupos en segundos.</p>
            </button>
          ) : (
            <>
              {frequentPeople.map(p => (
                <div key={p} className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-white dark:bg-card border border-violet-100 dark:border-violet-800 shadow-sm flex items-center justify-center text-lg font-black text-violet-600">
                    {p.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[10px] font-bold text-foreground max-w-[60px] truncate">{p}</span>
                </div>
              ))}
              <button 
                onClick={() => setManagePeopleOpen(true)}
                className="flex flex-col items-center gap-1.5 shrink-0"
              >
                <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-800 flex items-center justify-center text-violet-400 hover:bg-violet-50 transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground">Más</span>
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-violet-200 bg-violet-50/30">
          <div className="text-5xl mb-3">👋</div>
          <p className="text-sm font-semibold text-foreground mb-1">¡Crea tu primer grupo!</p>
          <p className="text-xs text-muted-foreground mb-4">Viajes, pareja, amigos, hogar…<br/>Todo en un mismo lugar.</p>
          <Button size="sm" className="rounded-xl bg-violet-600 text-white text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Crear grupo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {groups.map(g => {
            const style = getGroupStyle(g.id);
            const emoji = getGroupEmoji(g.name) || style.emoji;
            const isRenaming = renamingId === g.id;
            return (
              <div
                key={g.id}
                className={`relative rounded-2xl overflow-hidden cursor-pointer shadow-md transition-all duration-200 active:scale-[0.97] hover:shadow-lg ${style.bg}`}
                onClick={() => !isRenaming && onSelectGroup(g.id)}
              >
                {/* Background decoration */}
                <div className="absolute top-0 right-0 text-6xl opacity-20 leading-none -mt-2 -mr-1 select-none pointer-events-none">
                  {emoji}
                </div>

                <div className="relative z-10 p-4 flex flex-col gap-2 min-h-[110px]" onClick={() => {
                  localStorage.setItem(`group_emoji_${g.id}`, emoji);
                  // Default to balance if not set
                  if (!localStorage.getItem(`group_mode_${g.id}`)) {
                    localStorage.setItem(`group_mode_${g.id}`, 'balance');
                  }
                  onSelectGroup(g.id);
                }}>
                  {/* Top row: emoji + menu */}
                  <div className="flex items-start justify-between">
                    <span className="text-2xl leading-none">{emoji}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <button className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors">
                          <span className="text-white text-xs font-bold">···</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        {g.isOwner && (
                          <>
                            <DropdownMenuItem onClick={e => startRename(g, e)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" /> Renombrar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={e => deleteGroup(g, e)}>
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          {g.isOwner ? 'Eliminar grupo' : 'Salir del grupo'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Name + rename */}
                  <div className="mt-auto">
                    {isRenaming ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveRename(e as any); if (e.key === 'Escape') setRenamingId(null); }}
                          className="flex-1 text-xs font-bold bg-white/20 text-white placeholder-white/60 rounded-lg px-2 py-1 outline-none border border-white/40 min-w-0"
                        />
                        <button onClick={saveRename} disabled={renameSaving} className="w-5 h-5 bg-white/30 hover:bg-white/50 rounded-md flex items-center justify-center">
                          {renameSaving ? <Loader2 className="w-3 h-3 animate-spin text-white" /> : <Check className="w-3 h-3 text-white" />}
                        </button>
                        <button onClick={e => { e.stopPropagation(); setRenamingId(null); }} className="w-5 h-5 bg-white/20 hover:bg-white/40 rounded-md flex items-center justify-center">
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-end justify-between gap-1">
                        <div>
                          <p className="text-white font-black text-sm leading-tight truncate">{g.name}</p>
                          <p className="text-white/70 text-[10px] font-medium uppercase">{g.currency}{!g.isOwner && ' · Compartido'}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-white/60 shrink-0 mb-0.5" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Quick add card */}
          <div
            className="rounded-2xl border-2 border-dashed border-violet-200 flex flex-col items-center justify-center gap-1.5 min-h-[110px] cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-all active:scale-[0.97]"
            onClick={() => setCreateOpen(true)}
          >
            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
              <Plus className="w-4 h-4 text-violet-600" />
            </div>
            <p className="text-xs font-semibold text-violet-600">Nuevo grupo</p>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={v => { setCreateOpen(v); if (!v) { setSelectedTemplate(null); setName(''); } }}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" /> Nuevo grupo
            </DialogTitle>
            <DialogDescription>Elige una plantilla o crea uno personalizado.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Templates grid */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Plantillas rápidas</p>
              <div className="grid grid-cols-4 gap-2">
                {TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    onClick={() => applyTemplate(t)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                      selectedTemplate?.label === t.label
                        ? 'border-violet-500 bg-violet-50 scale-95'
                        : 'border-transparent bg-muted/40 hover:bg-muted/70'
                    }`}
                  >
                    <span className="text-xl leading-none">{t.emoji}</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nombre del grupo</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && create()}
                placeholder="Ej: Asado del viernes"
                autoFocus
                className="rounded-xl"
              />
            </div>

            {/* Mode Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Modo de grupo</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGroupMode('balance')}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${
                    groupMode === 'balance'
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-transparent bg-muted/40 hover:bg-muted/70'
                  }`}
                >
                  <Scale className="w-4 h-4 text-violet-600" />
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase leading-none">Con Balance</p>
                    <p className="text-[8px] text-muted-foreground mt-0.5 leading-tight">Deudas acumuladas entre todos.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setGroupMode('tracker')}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${
                    groupMode === 'tracker'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                      : 'border-transparent bg-muted/40 hover:bg-muted/70'
                  }`}
                >
                  <HandCoins className={`w-4 h-4 ${groupMode === 'tracker' ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                  <div className="text-center">
                    <p className={`text-[10px] font-bold uppercase leading-none ${groupMode === 'tracker' ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>Solo Cobros</p>
                    <p className="text-[8px] text-muted-foreground mt-0.5 leading-tight">Lista de pagos sin deuda total.</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Personas del grupo <span className="font-normal text-muted-foreground/60">(opcional)</span>
              </Label>
              
              {/* Frequent people picker - Rediseñado visual */}
              {frequentPeople.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black text-violet-600 uppercase tracking-widest">Tus Amigos</p>
                    {Object.keys(peopleGroups).length > 0 && (
                      <div className="flex gap-1 overflow-x-auto no-scrollbar max-w-[150px]">
                        {Object.keys(peopleGroups).map(gn => (
                          <button
                            key={gn}
                            type="button"
                            onClick={() => {
                              const members = peopleGroups[gn];
                              const allSelected = members.every(m => memberInputs.some(mi => mi.trim() === m));
                              if (allSelected) {
                                // Deselect all of this group
                                setMemberInputs(prev => {
                                  const filtered = prev.filter(p => !members.includes(p.trim()));
                                  return filtered.length < 2 ? [...filtered, ...Array(2 - filtered.length).fill('')] : filtered;
                                });
                              } else {
                                // Add all of this group
                                setMemberInputs(prev => {
                                  const existing = prev.filter(p => p.trim() && !members.includes(p.trim()));
                                  return [...existing, ...members];
                                });
                              }
                            }}
                            className="px-1.5 py-0.5 rounded-lg border border-violet-200 text-[8px] font-bold text-violet-600 bg-violet-50 whitespace-nowrap"
                          >
                            + {gn}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 py-1">
                    {frequentPeople.map(p => {
                      const isSelected = memberInputs.some(m => m.trim() === p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePersonInGroup(p)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-2xl text-[11px] font-bold transition-all border ${
                            isSelected 
                              ? 'bg-violet-600 border-violet-600 text-white shadow-md scale-95' 
                              : 'bg-white dark:bg-card border-violet-100 dark:border-violet-900 text-foreground hover:border-violet-300'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] ${isSelected ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-600'}`}>
                            {isSelected ? '✓' : p.charAt(0).toUpperCase()}
                          </div>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {memberInputs.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Input
                      value={val}
                      onChange={e => {
                        const next = [...memberInputs];
                        next[idx] = e.target.value;
                        setMemberInputs(next);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setMemberInputs(prev => [...prev, '']);
                        }
                      }}
                      placeholder={idx === 0 ? 'Nombre (ej: Juan)' : idx === 1 ? 'Nombre (ej: María)' : 'Otro nombre...'}
                      className="rounded-xl text-sm flex-1"
                    />
                    {memberInputs.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setMemberInputs(prev => prev.filter((_, i) => i !== idx))}
                        className="w-7 h-7 rounded-lg bg-muted/60 hover:bg-red-50 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setMemberInputs(prev => [...prev, ''])}
                  className="w-full h-7 rounded-xl border border-dashed border-border text-[11px] text-muted-foreground hover:text-violet-600 hover:border-violet-300 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Añadir otra persona
                </button>
              </div>
            </div>

            <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button
              onClick={create}
              disabled={creating || !name.trim()}
              className="rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white"
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (selectedTemplate?.emoji + ' ')}
              Crear grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Manage People Dialog */}
      <Dialog open={managePeopleOpen} onOpenChange={setManagePeopleOpen}>
        <DialogContent className="rounded-3xl max-w-sm p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-gradient-to-br from-violet-600 to-indigo-700 p-6 pb-12">
            <DialogHeader className="text-white text-left">
              <DialogTitle className="text-xl font-black">Mis Personas</DialogTitle>
              <DialogDescription className="text-violet-100 opacity-80 text-xs">Organiza a tus amigos y crea grupos frecuentes.</DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="bg-background rounded-t-[32px] -mt-8 p-6 space-y-6 relative">
            <div className="flex bg-muted p-1 rounded-2xl">
              <button 
                onClick={() => setActiveManageTab('people')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all ${activeManageTab === 'people' ? 'bg-background shadow-sm text-violet-600' : 'text-muted-foreground'}`}
              >
                Personas
              </button>
              <button 
                onClick={() => setActiveManageTab('groups')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all ${activeManageTab === 'groups' ? 'bg-background shadow-sm text-violet-600' : 'text-muted-foreground'}`}
              >
                Grupos
              </button>
            </div>

            {activeManageTab === 'people' ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input 
                    value={newFrequentName}
                    onChange={e => setNewFrequentName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addFrequentPerson()}
                    placeholder="Nombre (ej: Carlos)"
                    className="rounded-2xl h-12 border-muted"
                  />
                  <Button onClick={addFrequentPerson} className="rounded-2xl h-12 w-12 p-0 bg-violet-600 shrink-0">
                    <Plus className="w-5 h-5 text-white" />
                  </Button>
                </div>

                <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                  {frequentPeople.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                        <Users className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                      <p className="text-sm text-muted-foreground italic">Aún no has guardado a nadie.</p>
                    </div>
                  ) : (
                    frequentPeople.map(p => (
                      <div key={p} className="flex items-center justify-between p-3 bg-muted/30 rounded-2xl border border-transparent hover:border-violet-100 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-black">
                            {p.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-bold text-foreground">{p}</span>
                        </div>
                        <button 
                          onClick={() => removeFrequentPerson(p)}
                          className="text-muted-foreground hover:text-red-500 transition-colors p-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input 
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addGroup()}
                    placeholder="Nuevo grupo (ej: Fútbol)"
                    className="rounded-2xl h-12 border-muted"
                  />
                  <Button onClick={addGroup} className="rounded-2xl h-12 w-12 p-0 bg-emerald-600 shrink-0">
                    <Plus className="w-5 h-5 text-white" />
                  </Button>
                </div>

                <div className="max-h-[300px] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                  {Object.keys(peopleGroups).length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-sm text-muted-foreground italic">Crea un grupo para agrupar personas.</p>
                    </div>
                  ) : (
                    Object.keys(peopleGroups).map(gn => (
                      <div key={gn} className="space-y-2">
                        <div className="flex items-center justify-between bg-emerald-500/5 p-3 rounded-2xl border border-emerald-500/10">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-emerald-700">{gn}</span>
                            <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-lg font-bold">
                              {peopleGroups[gn].length}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className={`h-8 rounded-xl text-[10px] font-bold ${editingGroup === gn ? 'bg-emerald-100 text-emerald-700' : 'text-muted-foreground'}`}
                              onClick={() => setEditingGroup(editingGroup === gn ? null : gn)}
                            >
                              {editingGroup === gn ? 'Cerrar' : 'Editar'}
                            </Button>
                            <button onClick={() => deletePersonGroup(gn)} className="p-2 text-muted-foreground hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        
                        {editingGroup === gn && (
                          <div className="bg-muted/30 p-3 rounded-2xl border border-dashed border-muted grid grid-cols-2 gap-2 animate-in fade-in zoom-in-95 duration-200">
                            {frequentPeople.map(p => {
                              const inGroup = peopleGroups[gn].includes(p);
                              return (
                                <button
                                  key={p}
                                  onClick={() => togglePersonInGroupList(gn, p)}
                                  className={`flex items-center gap-2 p-2 rounded-xl text-[11px] font-bold transition-all ${
                                    inGroup 
                                      ? 'bg-emerald-500 text-white shadow-sm' 
                                      : 'bg-background text-muted-foreground hover:border-emerald-200 border border-transparent'
                                  }`}
                                >
                                  <div className={`w-4 h-4 rounded flex items-center justify-center ${inGroup ? 'bg-white/20' : 'bg-muted'}`}>
                                    {inGroup ? '✓' : ''}
                                  </div>
                                  {p}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            
            <DialogFooter className="pt-2">
              <Button onClick={() => setManagePeopleOpen(false)} className="w-full rounded-2xl h-12 bg-violet-600 text-white font-black text-sm shadow-lg shadow-violet-200 dark:shadow-none">Listo</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
