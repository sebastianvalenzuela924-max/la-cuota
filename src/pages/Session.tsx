import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Receipt, Share2, ArrowLeft, Copy, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Product, Person, TipType, BankData, Currency } from '@/lib/types';
import { calculatePersonTotals, formatCurrency, getCurrencyFlag, roundValue } from '@/lib/bill-utils';
import ProductSection from '@/components/divisor/ProductSection';
import PeopleSection from '@/components/divisor/PeopleSection';
import AssignmentSection from '@/components/divisor/AssignmentSection';
import TipSection from '@/components/divisor/TipSection';
import BankSection from '@/components/divisor/BankSection';
import SummarySection from '@/components/divisor/SummarySection';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function Session() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [tipType, setTipType] = useState<TipType>('percent');
  const [tipValue, setTipValue] = useState(0);
  const [bankData, setBankData] = useState<Partial<BankData>>({});
  const [currency, setCurrency] = useState<Currency>('CLP');

  // Load Initial Data
  useEffect(() => {
    if (!sessionId) return;

    async function loadData() {
      setLoading(true);
      try {
        // 1. Fetch Session
        const { data: session, error: sError } = await supabase
          .from('bill_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (sError) throw sError;
        setCurrency(session.currency as Currency);
        setTipType(session.tip_type as TipType);
        setTipValue(session.tip_value);
        setBankData(session.bank_data);

        // 2. Fetch Products
        const { data: pData, error: pError } = await supabase
          .from('bill_products')
          .select('*')
          .eq('session_id', sessionId);
        if (pError) throw pError;
        setProducts(pData || []);

        // 3. Fetch People
        const { data: peData, error: peError } = await supabase
          .from('bill_people')
          .select('*')
          .eq('session_id', sessionId);
        if (peError) throw peError;
        setPeople(peData || []);

        // 4. Fetch Assignments
        const { data: aData, error: aError } = await supabase
          .from('bill_assignments')
          .select('product_id, person_id');
        if (aError) throw aError;

        const aggAssignments: Record<string, string[]> = {};
        aData?.forEach(a => {
          if (!aggAssignments[a.product_id]) aggAssignments[a.product_id] = [];
          aggAssignments[a.product_id].push(a.person_id);
        });
        setAssignments(aggAssignments);

      } catch (error) {
        console.error('Error loading session:', error);
        toast.error('No se pudo cargar la mesa compartida');
        navigate('/');
      } finally {
        setLoading(false);
      }
    }

    loadData();

    // Setup Realtime Subscriptions
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_sessions', filter: `id=eq.${sessionId}` }, (payload) => {
        const data = payload.new as any;
        if (data.currency) setCurrency(data.currency);
        if (data.tip_type) setTipType(data.tip_type);
        if (data.tip_value !== undefined) setTipValue(data.tip_value);
        if (data.bank_data) setBankData(data.bank_data);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_products', filter: `session_id=eq.${sessionId}` }, async () => {
        const { data } = await supabase.from('bill_products').select('*').eq('session_id', sessionId);
        setProducts(data || []);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_people', filter: `session_id=eq.${sessionId}` }, async () => {
        const { data } = await supabase.from('bill_people').select('*').eq('session_id', sessionId);
        setPeople(data || []);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_assignments' }, async () => {
        const { data: pIds } = await supabase.from('bill_products').select('id').eq('session_id', sessionId);
        if (!pIds) return;
        const ids = pIds.map(p => p.id);
        const { data } = await supabase.from('bill_assignments').select('*').in('product_id', ids);
        
        const agg: Record<string, string[]> = {};
        data?.forEach(a => {
          if (!agg[a.product_id]) agg[a.product_id] = [];
          agg[a.product_id].push(a.person_id);
        });
        setAssignments(agg);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, navigate]);

  // Derived Values
  const subtotal = useMemo(() => products.reduce((s, p) => s + p.price * p.quantity, 0), [products]);
  const tipAmount = useMemo(() => {
    const val = tipType === 'percent' ? subtotal * tipValue / 100 : tipValue;
    return roundValue(val, currency);
  }, [subtotal, tipType, tipValue, currency]);

  const totals = useMemo(
    () => calculatePersonTotals(products, assignments, people, tipType, tipValue, currency),
    [products, assignments, people, tipType, tipValue, currency]
  );

  const fmt = (n: number) => formatCurrency(n, currency);

  // Mutations
  const addProduct = async (p: Product) => {
    const { error } = await supabase.from('bill_products').insert([{ ...p, session_id: sessionId }]);
    if (error) toast.error('Error al añadir producto');
  };

  const removeProduct = async (id: string) => {
    const { error } = await supabase.from('bill_products').delete().eq('id', id);
    if (error) toast.error('Error al eliminar producto');
  };

  const updateProduct = async (id: string, data: Partial<Product>) => {
    const { error } = await supabase.from('bill_products').update(data).eq('id', id);
    if (error) toast.error('Error al actualizar producto');
  };

  const addPerson = async (p: Person) => {
    const { error } = await supabase.from('bill_people').insert([{ ...p, session_id: sessionId }]);
    if (error) toast.error('Error al añadir persona');
  };

  const removePerson = async (id: string) => {
    const { error } = await supabase.from('bill_people').delete().eq('id', id);
    if (error) toast.error('Error al eliminar persona');
  };

  const toggleAssignment = async (productId: string, personId: string) => {
    const current = assignments[productId] || [];
    const exists = current.includes(personId);

    if (exists) {
      await supabase.from('bill_assignments').delete().match({ product_id: productId, person_id: personId });
    } else {
      await supabase.from('bill_assignments').insert([{ product_id: productId, person_id: personId }]);
    }
  };

  const assignAllToProduct = async (productId: string) => {
    const inserts = people.map(p => ({ product_id: productId, person_id: p.id }));
    await supabase.from('bill_assignments').insert(inserts);
  };

  const divideAllAmongAll = async () => {
    const inserts: any[] = [];
    products.forEach(p => {
      people.forEach(person => {
        inserts.push({ product_id: p.id, person_id: person.id });
      });
    });
    await supabase.from('bill_assignments').upsert(inserts, { onConflict: 'product_id,person_id' });
  };

  const updateSession = async (updates: any) => {
    await supabase.from('bill_sessions').update(updates).eq('id', sessionId);
  };

  const sessionUrl = window.location.href;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground font-medium">Cargando mesa compartida...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-4 card-shadow">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0 h-9 w-9 rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-extrabold text-lg text-foreground tracking-tight whitespace-nowrap">Mesa Compartida</h1>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              {getCurrencyFlag(currency)} Sincronizado en vivo
            </p>
          </div>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl border-primary/20 bg-primary/5 text-primary">
                <Share2 className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] rounded-3xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-center font-bold">¡Invita a tus amigos!</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center space-y-6 py-4">
                <div className="bg-white p-4 rounded-3xl shadow-sm border border-border">
                  <QRCodeSVG value={sessionUrl} size={200} level="H" />
                </div>
                <div className="w-full space-y-2">
                  <p className="text-xs text-muted-foreground text-center">Escaneen el QR o compartan el link:</p>
                  <div className="flex items-center gap-2 p-3 bg-accent/50 rounded-2xl border border-border">
                    <p className="text-[10px] truncate flex-1 font-mono text-muted-foreground">{sessionUrl}</p>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => {
                        navigator.clipboard.writeText(sessionUrl);
                        toast.success('Link copiado');
                      }}
                      className="h-8 w-8 rounded-lg"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Button className="w-full rounded-2xl h-12 text-sm font-bold gap-2" onClick={() => navigate('/')}>
                  <CheckCircle2 className="w-5 h-5" />
                  Listo
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4 space-y-5 mt-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-accent/40 rounded-2xl p-3 border border-border/50">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Productos</p>
            <p className="text-xl font-bold text-foreground">{products.length}</p>
          </div>
          <div className="bg-accent/40 rounded-2xl p-3 border border-border/50">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Personas</p>
            <p className="text-xl font-bold text-foreground">{people.length}</p>
          </div>
          <div className="bg-accent/40 rounded-2xl p-3 border border-border/50">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total</p>
            <p className="text-lg font-bold text-foreground">{fmt(subtotal + tipAmount)}</p>
          </div>
        </div>

        <ProductSection
          products={products}
          currency={currency}
          onAdd={addProduct}
          onRemove={removeProduct}
          onUpdate={updateProduct}
        />

        <PeopleSection
          people={people}
          onAdd={addPerson}
          onRemove={removePerson}
        />

        <AssignmentSection
          products={products}
          people={people}
          assignments={assignments}
          currency={currency}
          onToggle={toggleAssignment}
          onAssignAll={assignAllToProduct}
          onDivideAllAmongAll={divideAllAmongAll}
        />

        <TipSection
          tipType={tipType}
          tipValue={tipValue}
          subtotal={subtotal}
          currency={currency}
          onTypeChange={t => updateSession({ tip_type: t })}
          onValueChange={v => updateSession({ tip_value: v })}
        />

        <BankSection
          bankData={bankData}
          onBankDataChange={d => updateSession({ bank_data: d })}
        />

        <SummarySection
          products={products}
          people={people}
          totals={totals}
          tipType={tipType}
          tipValue={tipValue}
          bankData={bankData}
          currency={currency}
        />
      </main>
    </div>
  );
}
