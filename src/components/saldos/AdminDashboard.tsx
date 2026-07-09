import { useState, useEffect } from 'react';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  ArrowLeft, Trash2, Loader2, User, Search, 
  Shield, Mail, Calendar, AlertTriangle, Database, Check, Copy
} from 'lucide-react';
import { toast } from 'sonner';

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

interface AdminDashboardProps {
  onBack: () => void;
}

export default function AdminDashboard({ onBack }: AdminDashboardProps) {
  const { user } = useSaldamosAuth();
  const [usersList, setUsersList] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  // SQL definition that needs to be executed in Supabase Dashboard
  const setupSql = `-- 1. Función para listar todos los usuarios (segura para admin)
create or replace function get_all_users()
returns table (
  id uuid,
  email varchar,
  created_at timestamptz
)
language plpgsql
security definer
as $$
declare
  caller_email text;
begin
  caller_email := auth.jwt() ->> 'email';
  if caller_email != 'sebastianvalenzuela924@gmail.com' then
    raise exception 'Unauthorized';
  end if;

  return query
  select u.id, u.email::varchar, u.created_at
  from auth.users u
  order by u.created_at desc;
end;
$$;

-- 2. Función para eliminar un usuario por ID (segura para admin)
create or replace function delete_user_by_id(target_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  caller_email text;
begin
  caller_email := auth.jwt() ->> 'email';
  if caller_email != 'sebastianvalenzuela924@gmail.com' then
    raise exception 'Unauthorized';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;`;

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(setupSql);
    setCopiedSql(true);
    toast.success('Script SQL copiado al portapapeles');
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const loadUsers = async () => {
    if (user?.email !== 'sebastianvalenzuela924@gmail.com') {
      toast.error('Acceso denegado. No eres administrador.');
      onBack();
      return;
    }

    setLoading(true);
    setSqlError(null);
    try {
      const { data, error } = await saldamosSupabase.rpc('get_all_users');
      if (error) {
        console.error('RPC Error:', error);
        // Check if it's a "function does not exist" error
        if (error.message.includes('does not exist') || error.code === 'P0001') {
          setSqlError('rpc_missing');
        } else {
          toast.error(`Error al cargar usuarios: ${error.message}`);
        }
      } else {
        setUsersList(data || []);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [user?.email]);

  const handleDeleteUser = async (targetUser: AuthUser) => {
    if (targetUser.email === user?.email) {
      toast.error('No puedes eliminar tu propia cuenta de administrador.');
      return;
    }

    const confirmDelete = window.confirm(
      `¿Estás seguro de que deseas eliminar permanentemente la cuenta de "${targetUser.email}"?\n\nEsta acción no se puede deshacer y el usuario perderá acceso a la aplicación.`
    );
    if (!confirmDelete) return;

    setDeletingId(targetUser.id);
    try {
      const { error } = await saldamosSupabase.rpc('delete_user_by_id', {
        target_user_id: targetUser.id
      });

      if (error) {
        toast.error(`Error al eliminar usuario: ${error.message}`);
      } else {
        toast.success(`Cuenta "${targetUser.email}" eliminada con éxito.`);
        // Reload list
        loadUsers();
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al intentar eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredUsers = usersList.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen bg-background pb-12 animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack} 
            className="rounded-full hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>
          <div>
            <h1 className="text-sm font-black text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Shield className="w-4 h-4 text-slate-800 dark:text-slate-400" />
              Panel de Administración
            </h1>
            <p className="text-[10px] text-muted-foreground leading-none">Gestión de Cuentas de la App</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[9px] font-black text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          ADMIN
        </span>
      </div>

      <div className="p-4 max-w-md mx-auto w-full space-y-4">
        {sqlError === 'rpc_missing' ? (
          /* SQL Error Instructions Card */
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-black text-amber-800 dark:text-amber-400 uppercase tracking-wider">
                  Configuración SQL Requerida
                </h3>
                <p className="text-[11px] text-amber-700/95 dark:text-amber-300/90 leading-relaxed">
                  Para poder leer y eliminar cuentas de autenticación, necesitas crear las funciones RPC correspondientes en tu base de datos de Supabase.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-400">Instrucciones:</p>
              <ol className="text-[10px] text-amber-700 dark:text-amber-300 space-y-1.5 list-decimal pl-4">
                <li>Ve a tu panel de control de <strong>Supabase</strong>.</li>
                <li>Entra al proyecto <strong>Saldamos2</strong> (o la base de datos correspondiente).</li>
                <li>Haz clic en el <strong>SQL Editor</strong> en la barra lateral izquierda.</li>
                <li>Haz clic en "New Query", pega el script SQL de abajo y presiona <strong>Run</strong>.</li>
              </ol>
            </div>

            <div className="relative rounded-xl border border-border bg-slate-950 p-3 max-h-[200px] overflow-y-auto custom-scrollbar">
              <pre className="text-[9px] text-slate-300 font-mono leading-normal whitespace-pre-wrap">
                {setupSql}
              </pre>
              <button
                onClick={copySqlToClipboard}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Copiar código SQL"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <Button
              onClick={loadUsers}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold gap-1.5"
            >
              <Database className="w-3.5 h-3.5" /> Reintentar Conexión
            </Button>
          </div>
        ) : (
          /* Main Content */
          <>
            {/* Stats Card */}
            <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between shadow-sm">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total de Cuentas</p>
                <p className="text-2xl font-black text-foreground">{loading ? '...' : usersList.length}</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <User className="w-5 h-5" />
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por correo o ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl text-xs"
              />
            </div>

            {/* User List */}
            <div className="space-y-2">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-1">Listado de Usuarios</p>
              
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                  <p className="text-[10px] text-muted-foreground">Obteniendo cuentas de Supabase...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-2xl text-muted-foreground bg-muted/10">
                  <p className="text-xs">No se encontraron cuentas.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map(u => {
                    const isSelf = u.email === user?.email;
                    return (
                      <div 
                        key={u.id}
                        className="rounded-2xl border border-border bg-card p-3 flex items-center justify-between gap-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-800 transition-colors"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <p className="text-xs font-black text-foreground truncate">{u.email}</p>
                            {isSelf && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-[8px] font-black uppercase shrink-0">
                                Tú
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>Registrado el: {new Date(u.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <p className="text-[8px] font-mono text-muted-foreground/60 truncate">ID: {u.id}</p>
                        </div>

                        {!isSelf && (
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={deletingId !== null}
                            onClick={() => handleDeleteUser(u)}
                            className="rounded-xl hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 text-muted-foreground shrink-0"
                            title="Eliminar usuario"
                          >
                            {deletingId === u.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
