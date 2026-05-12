import { useState, useEffect } from 'react';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Loader2, Trash2, LogOut, ChevronRight, Pencil, Check, X, Sparkles } from 'lucide-react';
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
  const [memberInputs, setMemberInputs] = useState<string[]>(['', '']);
  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

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

                <div className="relative z-10 p-4 flex flex-col gap-2 min-h-[110px]">
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

            {/* Members */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Personas del grupo <span className="font-normal text-muted-foreground/60">(opcional)</span>
              </Label>
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
    </div>
  );
}
