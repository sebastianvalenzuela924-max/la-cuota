import { useState, useEffect } from 'react';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, ChevronRight, Loader2, Trash2, LogOut, Users } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';

type Group = { id: string; name: string; currency: string; owner_id: string; isOwner: boolean };

const CURRENCIES = ['CLP', 'ARS', 'USD', 'EUR', 'BRL', 'UYU', 'MXN', 'COP'];

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

  const create = async () => {
    if (!name.trim() || !user || creating) return;
    setCreating(true);
    // Refresh session first
    const { data: sess } = await saldamosSupabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) {
      setCreating(false);
      toast.error('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }
    const { error } = await saldamosSupabase
      .from('groups')
      .insert({ name: name.trim(), currency, owner_id: uid });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Grupo creado');
    setCreateOpen(false);
    setName('');
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Mis grupos</h2>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </Button>
          <Button size="icon" variant="ghost" className="w-8 h-8 rounded-xl" onClick={() => signOut()} title="Cerrar sesión">
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : groups.length === 0 ? (
        <div className="text-center py-10 rounded-2xl border border-dashed border-border">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Aún no tienes grupos.<br/>Crea uno o importa desde La Cuota.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <div
              key={g.id}
              className="flex items-center justify-between bg-accent/40 rounded-xl px-4 py-3 cursor-pointer hover:bg-accent/70 transition-colors"
              onClick={() => onSelectGroup(g.id)}
            >
              <div>
                <p className="font-semibold text-sm text-foreground">{g.name}</p>
                <p className="text-xs text-muted-foreground">{g.currency}{!g.isOwner && ' · Compartido'}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="w-7 h-7 rounded-lg text-muted-foreground hover:text-destructive" onClick={(e) => deleteGroup(g, e)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo grupo</DialogTitle>
            <DialogDescription>Por ejemplo: "Viaje Mendoza 2025"</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} placeholder="Asado del viernes" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={creating || !name.trim()}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
