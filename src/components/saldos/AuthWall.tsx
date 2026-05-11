import { useState } from 'react';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, Scale, ArrowRight } from 'lucide-react';

export default function SaldamosAuthWall() {
  const { signIn, signUp } = useSaldamosAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!email || password.length < 6) {
      toast.error('Email válido y contraseña de al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const result = mode === 'in' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);

    if (result.error) {
      const msg = (result.error as any).message ?? '';
      const lower = msg.toLowerCase();
      let friendly = msg;
      if (lower.includes('invalid login') || lower.includes('invalid credentials')) friendly = 'Email o contraseña incorrectos.';
      else if (lower.includes('already registered') || lower.includes('user already')) friendly = 'Ese email ya tiene cuenta. Inicia sesión.';
      else if (lower.includes('email not confirmed')) friendly = 'Confirma tu email primero.';
      toast.error(friendly);
      return;
    }

    if (mode === 'up' && result.requiresEmailConfirmation) {
      // Try auto sign-in
      const si = await signIn(email, password);
      if (!si.error) {
        toast.success('¡Bienvenido a Saldamos!');
      } else {
        toast.success('Cuenta creada. Revisa tu email para confirmarla.');
      }
      return;
    }

    toast.success(mode === 'up' ? '¡Bienvenido!' : 'Sesión iniciada');
  };

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handle(); };

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center animate-fade-in-up">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg">
        <Scale className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-1">Mis Saldos</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Guarda los balances entre tus grupos, viajes y salidas. <br/>
        Conecta con tu cuenta de <strong>Saldamos</strong>.
      </p>

      <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow space-y-4 text-left">
        {/* Mode toggle */}
        <div className="flex rounded-xl bg-accent/50 p-1 gap-1">
          {(['in', 'up'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition-all ${
                mode === m ? 'bg-card shadow text-foreground' : 'text-muted-foreground'
              }`}
            >
              {m === 'in' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="saldamos-email">Email</Label>
          <Input
            id="saldamos-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKey}
            placeholder="tú@ejemplo.com"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="saldamos-pwd">Contraseña</Label>
          <div className="relative">
            <Input
              id="saldamos-pwd"
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Mínimo 6 caracteres"
              className="rounded-xl pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button
          onClick={handle}
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white hover:opacity-90 font-semibold gap-1.5"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {mode === 'in' ? 'Entrar' : 'Crear cuenta gratis'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        ¿No tienes cuenta de Saldamos? Créala gratis arriba.<br/>
        Tu cuenta de La Cuota es independiente de esta sesión.
      </p>
    </div>
  );
}
