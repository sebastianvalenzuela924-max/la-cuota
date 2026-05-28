import { useState, useEffect } from 'react';
// Force redeploy - Build verified locally
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Loader2, Trash2, LogOut, ChevronRight, Pencil, Check, X, Sparkles, Users, Scale, HandCoins, Zap, Receipt, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import QuickExpenseDialog from './QuickExpenseDialog';

type Group = { id: string; name: string; currency: string; owner_id: string; isOwner: boolean };
type GroupType = 'balance' | 'football' | 'personal';

const GROUP_TYPES: { type: GroupType; emoji: string; label: string; desc: string; gradient: string; mode: 'balance' | 'tracker'; templateIdx: number }[] = [
  {
    type: 'balance',
    emoji: '🤝',
    label: 'Balances',
    desc: 'Viajes y gastos continuos con amigos. Acumula deudas entre todos.',
    gradient: 'from-sky-500 to-blue-700',
    mode: 'balance',
    templateIdx: 3, // Viaje
  },
  {
    type: 'football',
    emoji: '⚽',
    label: 'Fútbol',
    desc: 'Gastos rápidos de cancha y partido. Divide al instante.',
    gradient: 'from-emerald-600 to-teal-700',
    mode: 'tracker',
    templateIdx: 2, // Fútbol
  },
  {
    type: 'personal',
    emoji: '🧾',
    label: 'Personal',
    desc: 'Gastos diarios. Anota lo que gastas y lo que te deben.',
    gradient: 'from-violet-600 to-purple-700',
    mode: 'balance',
    templateIdx: 0, // Pareja
  },
];

const CURRENCIES = ['CLP', 'ARS', 'USD', 'EUR', 'BRL', 'UYU', 'MXN', 'COP'];

// Templates: emoji, label, suggested name, color gradient
const TEMPLATES = [
  { emoji: '❤️',  label: 'Pareja',    name: 'Gastos de pareja',   gradient: 'from-pink-500 to-rose-600',     bg: 'bg-gradient-to-br from-pink-500 to-rose-600' },
  { emoji: '🏠',  label: 'Hogar',     name: 'Gastos del hogar',   gradient: 'from-amber-500 to-orange-600',  bg: 'bg-gradient-to-br from-amber-500 to-orange-600' },
  { emoji: '⚽',  label: 'Fútbol',    name: 'Fútbol',             gradient: 'from-blue-500 to-indigo-600',   bg: 'bg-gradient-to-br from-blue-500 to-indigo-600' },
  { emoji: '✈️',  label: 'Viaje',     name: 'Viaje 2025',         gradient: 'from-sky-500 to-blue-700',      bg: 'bg-gradient-to-br from-sky-500 to-blue-700' },
  { emoji: '🎉',  label: 'Evento',    name: 'Evento especial',    gradient: 'from-blue-600 to-slate-800',    bg: 'bg-gradient-to-br from-blue-600 to-slate-800' },
  { emoji: '🍕',  label: 'Salidas',   name: 'Salidas y comidas',  gradient: 'from-orange-400 to-red-500',    bg: 'bg-gradient-to-br from-orange-400 to-red-500' },
  { emoji: '💼',  label: 'Trabajo',   name: 'Gastos del trabajo', gradient: 'from-slate-500 to-gray-700',    bg: 'bg-gradient-to-br from-slate-500 to-gray-700' },
  { emoji: '🎓',  label: 'Estudios',  name: 'Gastos compartidos', gradient: 'from-teal-500 to-cyan-600',     bg: 'bg-gradient-to-br from-teal-500 to-cyan-600' },
];

const COLOR_PRESETS = [
  { name: 'Azul',         gradient: 'from-blue-600 to-indigo-700' },
  { name: 'Cielo',        gradient: 'from-sky-400 to-blue-500' },
  { name: 'Turquesa',     gradient: 'from-cyan-500 to-teal-600' },
  { name: 'Verde',        gradient: 'from-emerald-600 to-teal-700' },
  { name: 'Verde Claro',  gradient: 'from-lime-500 to-emerald-600' },
  { name: 'Amarillo',     gradient: 'from-amber-400 to-orange-500' },
  { name: 'Naranja',      gradient: 'from-orange-500 to-red-600' },
  { name: 'Rojo',         gradient: 'from-rose-600 to-pink-700' },
  { name: 'Rosa',         gradient: 'from-pink-500 to-rose-600' },
  { name: 'Violeta',      gradient: 'from-fuchsia-600 to-pink-700' },
  { name: 'Morado',       gradient: 'from-purple-600 to-indigo-700' },
  { name: 'Negro',        gradient: 'from-slate-700 to-slate-900' },
];

const PEOPLE_GROUP_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200/50',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200/50',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200/50',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200/50',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200/50',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-200/50',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200/50',
];

const getPeopleGroupStyle = (groupName: string) => {
  let hash = 0;
  for (let i = 0; i < groupName.length; i++) {
    hash = groupName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PEOPLE_GROUP_COLORS[Math.abs(hash) % PEOPLE_GROUP_COLORS.length];
};

// Deterministic gradient from group id with local storage override
function getGroupStyle(groupId: string) {
  const savedColor = localStorage.getItem(`group_color_${groupId}`);
  if (savedColor) {
    return { bg: `bg-gradient-to-br ${savedColor}`, gradient: savedColor };
  }
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
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('CLP');
  const [creating, setCreating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATES[0] | null>(null);
  const [groupMode, setGroupMode] = useState<'balance' | 'tracker'>('balance');
  const [selectedGroupType, setSelectedGroupType] = useState<GroupType>('balance');
  const [memberInputs, setMemberInputs] = useState<string[]>(['', '']);
  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [frequentPeople, setFrequentPeople] = useState<string[]>([]);
  const [peopleGroups, setPeopleGroups] = useState<Record<string, string[]>>({});
  const [showAmigos, setShowAmigos] = useState(false);
  const [amigosTab, setAmigosTab] = useState<'groups' | 'all'>('groups');

  // Load user-specific data from localStorage
  useEffect(() => {
    if (!user?.id) return;
    
    const peopleKey = `saldamos_frequent_people_${user.id}`;
    const groupsKey = `saldamos_people_groups_${user.id}`;
    
    const savedPeople = localStorage.getItem(peopleKey);
    setFrequentPeople(savedPeople ? JSON.parse(savedPeople) : []);
    
    const savedGroups = localStorage.getItem(groupsKey);
    setPeopleGroups(savedGroups ? JSON.parse(savedGroups) : {});
  }, [user?.id]);
  const [managePeopleOpen, setManagePeopleOpen] = useState(false);
  const [newFrequentName, setNewFrequentName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [activeManageTab, setActiveManageTab] = useState<'people' | 'groups'>('people');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_PRESETS[0].gradient);
  const [colorEditId, setColorEditId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      // 1. Fetch owned groups
      const { data: owned, error: ownedErr } = await saldamosSupabase
        .from('groups')
        .select('id, name, currency, owner_id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      
      if (ownedErr) throw ownedErr;

      // 2. Fetch collaborated groups
      const { data: collabs, error: collabsErr } = await saldamosSupabase
        .from('group_collaborators')
        .select('group_id')
        .eq('user_id', user.id);
      
      if (collabsErr) console.warn('Collab fetch error:', collabsErr.message);

      let collaboratedGroups: any[] = [];
      if (collabs && collabs.length > 0) {
        const collabIds = collabs.map((c: any) => c.group_id);
        const { data: cGroups, error: cgErr } = await saldamosSupabase
          .from('groups')
          .select('id, name, currency, owner_id')
          .in('id', collabIds);
        
        if (cgErr) console.warn('C-Groups fetch error:', cgErr.message);
        collaboratedGroups = cGroups ?? [];
      }

      // Merge and deduplicate
      const allGroups = [...(owned ?? [])];
      collaboratedGroups.forEach(cg => {
        if (!allGroups.some(ag => ag.id === cg.id)) {
          allGroups.push(cg);
        }
      });
      
      console.log('Grupos consolidados:', allGroups.length);

      setGroups(allGroups.map((g: any) => ({ ...g, isOwner: g.owner_id === user.id })));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    if (user?.id && frequentPeople.length >= 0) {
      localStorage.setItem(`saldamos_frequent_people_${user.id}`, JSON.stringify(frequentPeople));
    }
  }, [frequentPeople, user?.id]);

  useEffect(() => {
    if (user?.id && Object.keys(peopleGroups).length >= 0) {
      localStorage.setItem(`saldamos_people_groups_${user.id}`, JSON.stringify(peopleGroups));
    }
  }, [peopleGroups, user?.id]);

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
    // Also remove from any groups
    const nextGroups = { ...peopleGroups };
    Object.keys(nextGroups).forEach(g => {
      nextGroups[g] = nextGroups[g].filter(p => p !== name);
    });
    setPeopleGroups(nextGroups);
  };

  const addGroup = () => {
    if (!newGroupName.trim() || peopleGroups[newGroupName.trim()]) return;
    const next = { ...peopleGroups, [newGroupName.trim()]: [] };
    setPeopleGroups(next);
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
  };

  const deletePersonGroup = (groupName: string) => {
    if (!confirm(`¿Borrar el grupo "${groupName}"?`)) return;
    const next = { ...peopleGroups };
    delete next[groupName];
    setPeopleGroups(next);
    toast.success('Grupo eliminado');
  };

  const renamePersonGroup = (oldName: string) => {
    if (!renameGroupValue.trim() || renameGroupValue === oldName) {
      setRenamingGroup(null);
      return;
    }
    const next = { ...peopleGroups };
    next[renameGroupValue.trim()] = next[oldName];
    delete next[oldName];
    setPeopleGroups(next);
    setRenamingGroup(null);
    setEditingGroup(renameGroupValue.trim());
    toast.success('Grupo renombrado');
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
    if (t.gradient) setSelectedColor(t.gradient);
  };

  const applyGroupType = (gt: typeof GROUP_TYPES[0]) => {
    setSelectedGroupType(gt.type);
    setGroupMode(gt.mode);
    setSelectedColor(gt.gradient);
    const tpl = TEMPLATES[gt.templateIdx];
    setSelectedTemplate(tpl);
    setName(tpl.name);
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
    
    // Read global name and auto-include it
    const globalNameKey = `saldamos_my_name_${uid}`;
    const myGlobalName = localStorage.getItem(globalNameKey)?.trim() ?? '';

    // Build final member list: manual inputs + auto-add self if not already included
    const validMembers = memberInputs.map(m => m.trim()).filter(Boolean);
    const alreadyHasMe = myGlobalName && validMembers.some(m => m.toLowerCase() === myGlobalName.toLowerCase());
    if (myGlobalName && !alreadyHasMe) {
      validMembers.unshift(myGlobalName); // add self at the front
    }

    if (validMembers.length > 0) {
      const { data: insertedMembers } = await saldamosSupabase
        .from('group_members')
        .insert(validMembers.map(memberName => ({ group_id: (newGroup as any).id, name: memberName })))
        .select('id, name');
      
      // Auto-set identity to my member record
      if (myGlobalName && insertedMembers) {
        const myMember = (insertedMembers as any[]).find(m => m.name.toLowerCase() === myGlobalName.toLowerCase());
        if (myMember) {
          localStorage.setItem(`saldamos_id_${(newGroup as any).id}`, myMember.id);
        }
      }
    }
    
    setCreating(false);
    const selfAdded = myGlobalName && !alreadyHasMe;
    toast.success(`Grupo "${name.trim()}" creado 🎉${validMembers.length > 0 ? ` con ${validMembers.length} persona${validMembers.length > 1 ? 's' : ''}` : ''}${selfAdded ? ` · Te agregué como "${myGlobalName}"` : ''}`);
    localStorage.setItem(`group_mode_${(newGroup as any).id}`, groupMode);
    localStorage.setItem(`group_color_${(newGroup as any).id}`, selectedColor);
    localStorage.setItem(`group_type_${(newGroup as any).id}`, selectedGroupType);
    setCreateOpen(false);
    setName('');
    setSelectedTemplate(null);
    setMemberInputs(['', '']);
    setSelectedGroupType('balance');
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
    <div className="space-y-5 animate-slide-left">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground tracking-tight">Mis grupos</h2>
          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{user?.email}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="rounded-xl text-xs gap-1.5 bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md shadow-blue-200 hover:shadow-blue-300 transition-all pulse-glow"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Nuevo grupo
          </Button>
          <Button size="icon" variant="ghost" className="w-8 h-8 rounded-xl" onClick={() => signOut()} title="Cerrar sesión">
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Mis Personas - Rediseñado Premium con Grupos */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/10 rounded-2xl p-3 border border-blue-100/50 dark:border-blue-900/30 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <h3 className="text-xs font-black text-foreground">Mis Personas</h3>
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setManagePeopleOpen(true)}
            className="h-6 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 px-2"
          >
            Gestionar
          </Button>
        </div>
        
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {frequentPeople.length === 0 ? (
            <button 
              onClick={() => setManagePeopleOpen(true)}
              className="flex items-center gap-3 py-2 px-2 text-left w-full hover:bg-blue-100/30 dark:hover:bg-blue-900/10 rounded-xl transition-colors border border-dashed border-blue-200/60"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-300">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-foreground leading-none">Sin contactos aún</p>
                <p className="text-[8px] text-muted-foreground mt-0.5">Toca aquí para agregarlos.</p>
              </div>
            </button>
          ) : (
            <>
              {/* Render Groups first */}
              {Object.keys(peopleGroups).map(gn => (
                <div key={gn} className="flex flex-col items-center gap-1 shrink-0 group">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shadow-sm border transition-transform group-hover:scale-105 active:scale-95 ${getPeopleGroupStyle(gn)}`}>
                    {gn.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[9px] font-bold text-foreground max-w-[50px] truncate leading-tight">{gn}</span>
                </div>
              ))}

              {/* Unassigned people as "Otros" */}
              {(() => {
                const assigned = new Set();
                Object.values(peopleGroups).forEach(m => m.forEach(p => assigned.add(p)));
                const unassigned = frequentPeople.filter(p => !assigned.has(p));
                
                if (unassigned.length > 0) {
                  return (
                    <div className="flex flex-col items-center gap-1 shrink-0 group">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-black text-slate-500 shadow-sm border border-slate-200 dark:border-slate-700 transition-transform group-hover:scale-105 active:scale-95">
                        ?
                      </div>
                      <span className="text-[9px] font-bold text-slate-500 max-w-[50px] truncate leading-tight">Otros</span>
                    </div>
                  );
                }
                return null;
              })()}

              <button 
                onClick={() => setManagePeopleOpen(true)}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div className="w-9 h-9 rounded-xl border border-dashed border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all hover:border-blue-400">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-[9px] font-bold text-blue-500 leading-tight">Añadir</span>
              </button>
            </>
          )}
        </div>
      </div>


      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-blue-200 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/10">
          <div className="text-5xl mb-3">👋</div>
          <p className="text-sm font-semibold text-foreground mb-1">¡Crea tu primer grupo!</p>
          <p className="text-xs text-muted-foreground mb-4">Viajes, pareja, amigos, hogar…<br/>Todo en un mismo lugar.</p>
          <Button size="sm" className="rounded-xl bg-blue-600 text-white text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Crear grupo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Special "Mi Perfil" Card */}
          <div
            className="relative rounded-2xl overflow-hidden cursor-pointer shadow-md transition-all duration-200 active:scale-[0.97] hover:shadow-lg bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-600 text-white"
            onClick={() => onSelectGroup('my-profile')}
          >
            {/* Background decoration */}
            <div className="absolute top-0 right-0 text-6xl opacity-20 leading-none -mt-2 -mr-1 select-none pointer-events-none">
              👤
            </div>

            <div className="relative z-10 p-4 flex flex-col gap-2 min-h-[110px]">
              {/* Top row: emoji */}
              <div className="flex items-start justify-between">
                <span className="text-2xl leading-none">👤</span>
                <span className="px-1.5 py-0.5 rounded-lg bg-white/25 text-[8px] font-black uppercase tracking-wider">
                  Mi Perfil
                </span>
              </div>

              {/* Name */}
              <div className="mt-auto">
                <div className="flex items-end justify-between gap-1">
                  <div>
                    <p className="text-white font-black text-sm leading-tight truncate">Mi Perfil</p>
                    <p className="text-white/80 text-[10px] font-bold uppercase">Control de Gastos</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-white/80 shrink-0 mb-0.5" />
                </div>
              </div>
            </div>
          </div>

          {groups.map(g => {
            const style = getGroupStyle(g.id);
            const emoji = getGroupEmoji(g.name) || ('emoji' in style ? style.emoji : '👋');
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
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); setColorEditId(g.id); }}>
                              <Scale className="w-3.5 h-3.5 mr-2" /> Cambiar color
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
                          <div className="flex items-center gap-1 mt-0.5">
                            <p className="text-white/70 text-[10px] font-medium uppercase">{g.currency}</p>
                            {(() => {
                              const gt = localStorage.getItem(`group_type_${g.id}`);
                              if (gt === 'football') return <span className="text-[8px] bg-white/20 text-white px-1 rounded-md font-black">⚽ Fútbol</span>;
                              if (gt === 'personal') return <span className="text-[8px] bg-white/20 text-white px-1 rounded-md font-black">🧾 Personal</span>;
                              if (gt === 'balance') return <span className="text-[8px] bg-white/20 text-white px-1 rounded-md font-black">🤝 Balances</span>;
                              return null;
                            })()}
                            {!g.isOwner && <span className="text-[8px] text-white/60 font-medium">· Compartido</span>}
                          </div>
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
            className="rounded-2xl border-2 border-dashed border-blue-200 flex flex-col items-center justify-center gap-1.5 min-h-[110px] cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all active:scale-[0.97]"
            onClick={() => setCreateOpen(true)}
          >
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Plus className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xs font-semibold text-blue-600">Nuevo grupo</p>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={v => { setCreateOpen(v); if (!v) { setSelectedTemplate(null); setName(''); setMemberInputs(['', '']); setShowAmigos(false); setAmigosTab('groups'); } }}>
        <DialogContent className="rounded-2xl max-w-sm max-h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-none shadow-2xl">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" /> Nuevo grupo
            </DialogTitle>
            <DialogDescription>¿Qué tipo de grupo necesitas?</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6 custom-scrollbar">
            {/* Group Type Selector */}
            <div className="space-y-2">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Tipo de grupo</p>
              <div className="grid grid-cols-3 gap-2">
                {GROUP_TYPES.map(gt => (
                  <button
                    key={gt.type}
                    onClick={() => applyGroupType(gt)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all text-center ${
                      selectedGroupType === gt.type
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 scale-[0.97]'
                        : 'border-transparent bg-muted/40 hover:bg-muted/70'
                    }`}
                  >
                    <span className="text-2xl leading-none">{gt.emoji}</span>
                    <p className="text-[10px] font-black uppercase leading-none text-foreground">{gt.label}</p>
                    <p className="text-[8px] text-muted-foreground leading-tight">{gt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

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
                        ? 'border-blue-500 bg-blue-50 scale-95'
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
                className="rounded-xl"
              />
            </div>

            {/* Mode display (auto from type, not editable) */}
            <div className="p-2.5 rounded-2xl bg-muted/30 border border-border/30 flex items-center gap-2.5">
              {selectedGroupType === 'balance' && <Scale className="w-4 h-4 text-sky-600 shrink-0" />}
              {selectedGroupType === 'football' && <HandCoins className="w-4 h-4 text-emerald-600 shrink-0" />}
              {selectedGroupType === 'personal' && <Receipt className="w-4 h-4 text-violet-600 shrink-0" />}
              <div>
                <p className="text-[10px] font-black text-foreground">
                  {selectedGroupType === 'balance' && 'Modo: Balance (deudas acumuladas)'}
                  {selectedGroupType === 'football' && 'Modo: Cobros (fútbol / tracker)'}
                  {selectedGroupType === 'personal' && 'Modo: Balance personal (pagué / debo)'}
                </p>
                <p className="text-[9px] text-muted-foreground">Configado automáticamente por el tipo</p>
              </div>
            </div>

            {/* Color Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Color del grupo</Label>
              <div className="flex flex-wrap gap-2 py-1">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c.gradient}
                    type="button"
                    onClick={() => setSelectedColor(c.gradient)}
                    className={`w-7 h-7 rounded-full bg-gradient-to-br ${c.gradient} transition-all ${selectedColor === c.gradient ? 'ring-2 ring-blue-600 ring-offset-2 scale-110' : 'opacity-60 hover:opacity-100'}`}
                  />
                ))}
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

            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Personas del grupo <span className="font-normal text-muted-foreground/60">(opcional)</span>
              </Label>
              
              {/* Frequent people picker - Rediseñado visual y colapsable */}
              {frequentPeople.length > 0 && (
                <div className="space-y-2 border border-border/40 rounded-2xl p-2 bg-muted/10">
                  <button
                    type="button"
                    onClick={() => setShowAmigos(!showAmigos)}
                    className="w-full flex items-center justify-between p-1.5 select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-[11px] font-black text-blue-600 uppercase tracking-widest">
                        Tus Amigos ({frequentPeople.length})
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-blue-600 flex items-center gap-1">
                      {showAmigos ? 'Ocultar' : 'Agregar amigos'}
                      {showAmigos ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </span>
                  </button>

                  {showAmigos && (
                    <div className="space-y-3 pt-2 border-t border-border/30 animate-in fade-in slide-in-from-top-1 duration-200">
                      {/* Tabs */}
                      <div className="flex bg-muted/65 p-0.5 rounded-lg border border-border/40 shrink-0 items-center max-w-fit">
                        <button
                          type="button"
                          onClick={() => setAmigosTab('groups')}
                          className={`px-3 py-1 rounded-md text-[9px] font-bold transition-all ${
                            amigosTab === 'groups'
                              ? 'bg-card text-blue-700 shadow-sm font-black'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Por Grupos
                        </button>
                        <button
                          type="button"
                          onClick={() => setAmigosTab('all')}
                          className={`px-3 py-1 rounded-md text-[9px] font-bold transition-all ${
                            amigosTab === 'all'
                              ? 'bg-card text-blue-700 shadow-sm font-black'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Todos
                        </button>
                      </div>

                      {/* Tab content */}
                      {amigosTab === 'all' ? (
                        <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto pr-1">
                          {frequentPeople.map(p => {
                            const isSelected = memberInputs.some(m => m.trim().toLowerCase() === p.trim().toLowerCase());
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => togglePersonInGroup(p)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border ${
                                  isSelected 
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                                    : 'bg-white dark:bg-card border-blue-100 dark:border-blue-900 text-foreground hover:border-blue-300'
                                }`}
                              >
                                <div className={`w-4 h-4 rounded flex items-center justify-center text-[9px] ${isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>
                                  {isSelected ? '✓' : p.charAt(0).toUpperCase()}
                                </div>
                                <span>{p}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                          {/* Groups list */}
                          {Object.keys(peopleGroups).map(gn => {
                            const groupMembers = peopleGroups[gn];
                            if (groupMembers.length === 0) return null;
                            const allSelected = groupMembers.every(m => memberInputs.some(mi => mi.trim().toLowerCase() === m.trim().toLowerCase()));
                            
                            return (
                              <div key={gn} className="space-y-1 bg-muted/20 p-2 rounded-xl border border-border/20">
                                <div className="flex items-center justify-between px-0.5">
                                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">{gn}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (allSelected) {
                                        setMemberInputs(prev => {
                                          const filtered = prev.filter(p => !groupMembers.map(gm => gm.toLowerCase()).includes(p.trim().toLowerCase()));
                                          return filtered.length < 2 ? [...filtered, ...Array(2 - filtered.length).fill('')] : filtered;
                                        });
                                      } else {
                                        setMemberInputs(prev => {
                                          const existing = prev.filter(p => p.trim() && !groupMembers.map(gm => gm.toLowerCase()).includes(p.trim().toLowerCase()));
                                          return [...existing, ...groupMembers];
                                        });
                                      }
                                    }}
                                    className="text-[8px] font-black text-blue-600 uppercase hover:underline"
                                  >
                                    {allSelected ? 'Quitar todo' : 'Añadir todo'}
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {groupMembers.map(p => {
                                    const isSelected = memberInputs.some(m => m.trim().toLowerCase() === p.trim().toLowerCase());
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => togglePersonInGroup(p)}
                                        className={`flex items-center gap-1.5 p-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                                          isSelected 
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                                            : 'bg-white dark:bg-card border-blue-100 dark:border-blue-900 text-foreground hover:border-blue-200'
                                        }`}
                                      >
                                        <div className={`w-4 h-4 rounded flex items-center justify-center text-[8px] ${isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>
                                          {isSelected ? '✓' : p.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="truncate">{p}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Friends not in any group (Otros) */}
                          {(() => {
                            const groupedNames = new Set(Object.values(peopleGroups).flat().map(n => n.toLowerCase()));
                            const ungrouped = frequentPeople.filter(p => !groupedNames.has(p.toLowerCase()));
                            if (ungrouped.length === 0) return null;
                            
                            return (
                              <div className="space-y-1 bg-muted/20 p-2 rounded-xl border border-border/20">
                                <div className="px-0.5">
                                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Otros Contactos</span>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {ungrouped.map(p => {
                                    const isSelected = memberInputs.some(m => m.trim().toLowerCase() === p.trim().toLowerCase());
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => togglePersonInGroup(p)}
                                        className={`flex items-center gap-1.5 p-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                                          isSelected 
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                                            : 'bg-white dark:bg-card border-blue-100 dark:border-blue-900 text-foreground hover:border-blue-200'
                                        }`}
                                      >
                                        <div className={`w-4 h-4 rounded flex items-center justify-center text-[8px] ${isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>
                                          {isSelected ? '✓' : p.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="truncate">{p}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
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
                  className="w-full h-7 rounded-xl border border-dashed border-border text-[11px] text-muted-foreground hover:text-blue-600 hover:border-blue-300 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Añadir otra persona
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 pt-2 bg-muted/20 gap-2 flex-row justify-end">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button
              onClick={create}
              disabled={creating || !name.trim()}
              className="rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white"
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (selectedTemplate ? selectedTemplate.emoji + ' ' : '')}
              Crear grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Manage People Dialog */}
      <Dialog open={managePeopleOpen} onOpenChange={setManagePeopleOpen}>
        <DialogContent className="rounded-3xl max-w-sm p-0 overflow-hidden border-none shadow-2xl max-h-[90vh] flex flex-col gap-0">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 pb-12 shrink-0">
            <DialogHeader className="text-white text-left">
              <DialogTitle className="text-xl font-black">Mis Personas</DialogTitle>
              <DialogDescription className="text-blue-100 opacity-80 text-xs">Organiza a tus amigos y crea grupos frecuentes.</DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="bg-background rounded-t-[32px] -mt-8 p-6 space-y-6 relative flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex bg-muted p-1 rounded-2xl">
              <button 
                onClick={() => setActiveManageTab('people')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all ${activeManageTab === 'people' ? 'bg-background shadow-sm text-blue-600' : 'text-muted-foreground'}`}
              >
                Personas
              </button>
              <button 
                onClick={() => setActiveManageTab('groups')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all ${activeManageTab === 'groups' ? 'bg-background shadow-sm text-blue-600' : 'text-muted-foreground'}`}
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
                  <Button onClick={addFrequentPerson} className="rounded-2xl h-12 w-12 p-0 bg-blue-600 shrink-0">
                    <Plus className="w-5 h-5 text-white" />
                  </Button>
                </div>

                <div className="max-h-[400px] overflow-y-auto pr-1 space-y-6 custom-scrollbar">
                  {frequentPeople.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                        <Users className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                      <p className="text-sm text-muted-foreground italic">Aún no has guardado a nadie.</p>
                    </div>
                  ) : (
                    <>
                      {/* Grouped by actual groups */}
                      {[...Object.keys(peopleGroups), 'Otros'].map(gn => {
                        const assigned = new Set();
                        Object.values(peopleGroups).forEach(m => m.forEach(p => assigned.add(p)));
                        const membersInGroup = gn === 'Otros' 
                          ? frequentPeople.filter(p => !assigned.has(p))
                          : (peopleGroups[gn] || []);

                        if (membersInGroup.length === 0) return null;

                        return (
                          <div key={gn} className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                              <span className={`text-[9px] font-black uppercase tracking-widest ${gn === 'Otros' ? 'text-slate-500' : 'text-blue-600'}`}>{gn}</span>
                              <div className="h-px bg-muted flex-1" />
                            </div>
                            <div className="space-y-2">
                              {membersInGroup.map(p => (
                                <div key={p} className="flex items-center justify-between p-3 bg-muted/20 dark:bg-muted/5 rounded-2xl border border-transparent hover:border-blue-100 dark:hover:border-blue-900/40 transition-all">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shadow-sm shrink-0 border ${gn === 'Otros' ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-white dark:bg-slate-900 border-blue-100 text-blue-600'}`}>
                                      {p.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-sm font-black text-foreground truncate">{p}</span>
                                  </div>
                                  <button 
                                    onClick={() => removeFrequentPerson(p)}
                                    className="text-muted-foreground/30 hover:text-red-500 transition-colors p-2 shrink-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </>
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
                  <Button onClick={addGroup} className="rounded-2xl h-12 w-12 p-0 bg-blue-600 shrink-0">
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
                        <div className="flex items-center justify-between bg-blue-500/5 p-3 rounded-2xl border border-blue-500/10">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {renamingGroup === gn ? (
                              <Input 
                                value={renameGroupValue}
                                onChange={e => setRenameGroupValue(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && renamePersonGroup(gn)}
                                className="h-7 text-sm font-black py-0 px-2 rounded-lg border-blue-200"
                                autoFocus
                                onBlur={() => setRenamingGroup(null)}
                              />
                            ) : (
                              <>
                                <span className={`text-sm font-black truncate ${getPeopleGroupStyle(gn).split(' ')[1]}`}>{gn}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-lg font-bold shrink-0 border ${getPeopleGroupStyle(gn)}`}>
                                  {peopleGroups[gn].length}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {renamingGroup !== gn && (
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 w-8 rounded-xl p-0 text-muted-foreground hover:text-blue-600"
                                onClick={() => { setRenamingGroup(gn); setRenameGroupValue(gn); }}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className={`h-8 rounded-xl text-[10px] font-bold ${editingGroup === gn ? 'bg-blue-100 text-blue-700' : 'text-muted-foreground'}`}
                              onClick={() => setEditingGroup(editingGroup === gn ? null : gn)}
                            >
                              {editingGroup === gn ? 'Cerrar' : 'Personas'}
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
                                      ? 'bg-blue-600 text-white shadow-sm' 
                                      : 'bg-background text-muted-foreground hover:border-blue-200 border border-transparent'
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
              <Button onClick={() => setManagePeopleOpen(false)} className="w-full rounded-2xl h-12 bg-blue-600 text-white font-black text-sm shadow-lg shadow-blue-200 dark:shadow-none">Listo</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Color Dialog */}
      <Dialog open={!!colorEditId} onOpenChange={v => !v && setColorEditId(null)}>
        <DialogContent className="rounded-2xl max-w-[320px]">
          <DialogHeader>
            <DialogTitle>Cambiar color</DialogTitle>
            <DialogDescription>Personaliza el fondo de tu grupo.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-3 py-4 justify-center">
            {COLOR_PRESETS.map(c => (
              <button
                key={c.gradient}
                type="button"
                onClick={() => {
                  if (colorEditId) {
                    localStorage.setItem(`group_color_${colorEditId}`, c.gradient);
                    setColorEditId(null);
                    load(); // Refresh UI
                  }
                }}
                className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.gradient} transition-all hover:scale-110 shadow-sm`}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setColorEditId(null)} className="rounded-xl w-full">Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Action Button for Quick Add Expense */}
      {groups.length > 0 && (
        <button
          onClick={() => setQuickExpenseOpen(true)}
          className="fixed bottom-[90px] right-6 z-50 w-16 h-16 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 group ring-4 ring-white/50 dark:ring-background/50 animate-bounce hover:animate-none"
          title="Gasto Rápido ⚡"
        >
          <Zap className="w-7 h-7 text-white fill-white animate-pulse" />
        </button>
      )}

      <QuickExpenseDialog
        open={quickExpenseOpen}
        onOpenChange={setQuickExpenseOpen}
        groups={groups}
        onSaved={load}
      />
    </div>
  );
}
