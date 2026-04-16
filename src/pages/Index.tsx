import { useState, useMemo } from 'react';
import { Receipt } from 'lucide-react';
import type { Product, Person, TipType, BankData, Currency } from '@/lib/types';
import { calculatePersonTotals, formatCurrency, getCurrencyFlag, roundValue } from '@/lib/bill-utils';
import ReceiptScanner from '@/components/divisor/ReceiptScanner';
import ProductSection from '@/components/divisor/ProductSection';
import PeopleSection from '@/components/divisor/PeopleSection';
import AssignmentSection from '@/components/divisor/AssignmentSection';
import TipSection from '@/components/divisor/TipSection';
import BankSection from '@/components/divisor/BankSection';
import SummarySection from '@/components/divisor/SummarySection';
import CurrencySelector from '@/components/divisor/CurrencySelector';
import { supabase } from '@/integrations/supabase/client';
import { Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function Index() {
  const navigate = useNavigate();
  const [sharing, setSharing] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [tipType, setTipType] = useState<TipType>('percent');
  const [tipValue, setTipValue] = useState(0);
  const [bankData, setBankData] = useState<Partial<BankData>>({});
  const [currency, setCurrency] = useState<Currency>('CLP');

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

  const addProduct = (p: Product) => setProducts(prev => [...prev, p]);
  const removeProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    setAssignments(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };
  const updateProduct = (id: string, data: Partial<Product>) =>
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));

  const addPerson = (p: Person) => setPeople(prev => [...prev, p]);
  const removePerson = (id: string) => {
    setPeople(prev => prev.filter(p => p.id !== id));
    setAssignments(prev => {
      const next: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = v.filter(pid => pid !== id);
      }
      return next;
    });
  };

  const toggleAssignment = (productId: string, personId: string) => {
    setAssignments(prev => {
      const current = prev[productId] || [];
      const exists = current.includes(personId);
      return {
        ...prev,
        [productId]: exists ? current.filter(id => id !== personId) : [...current, personId],
      };
    });
  };

  const assignAllToProduct = (productId: string) => {
    setAssignments(prev => ({
      ...prev,
      [productId]: people.map(p => p.id),
    }));
  };

  const divideAllAmongAll = () => {
    const all: Record<string, string[]> = {};
    for (const p of products) {
      all[p.id] = people.map(person => person.id);
    }
    setAssignments(all);
  };

  const handleProductsDetected = (detected: Product[], detectedCurrency?: Currency) => {
    if (detectedCurrency) {
      setCurrency(detectedCurrency);
    }
    setProducts(prev => [...prev, ...detected]);
  };

  const handleShare = async () => {
    if (products.length === 0) {
      toast.error('Agrega al menos un producto para compartir');
      return;
    }

    setSharing(true);
    try {
      // 1. Create Session
      const { data: session, error: sError } = await supabase
        .from('bill_sessions')
        .insert([{
          currency,
          tip_type: tipType,
          tip_value: tipValue,
          bank_data: bankData
        }])
        .select()
        .single();

      if (sError) throw sError;

      const sid = session.id;

      // 2. Create Products
      if (products.length > 0) {
        const { error: pError } = await supabase
          .from('bill_products')
          .insert(products.map(p => ({ ...p, session_id: sid })));
        if (pError) throw pError;
      }

      // 3. Create People
      if (people.length > 0) {
        const { error: peError } = await supabase
          .from('bill_people')
          .insert(people.map(p => ({ ...p, session_id: sid })));
        if (peError) throw peError;
      }

      // 4. Create Assignments
      const assignmentInserts: any[] = [];
      Object.entries(assignments).forEach(([productId, personIds]) => {
        personIds.forEach(personId => {
          assignmentInserts.push({ product_id: productId, person_id: personId });
        });
      });

      if (assignmentInserts.length > 0) {
        const { error: aError } = await supabase
          .from('bill_assignments')
          .insert(assignmentInserts);
        if (aError) throw aError;
      }

      toast.success('¡Mesa compartida creada!');
      navigate(`/session/${sid}`);

    } catch (error) {
      console.error('Error sharing:', error);
      toast.error('No se pudo crear la mesa compartida');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-4 card-shadow">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-extrabold text-xl text-foreground tracking-tight whitespace-nowrap">La Cuota</h1>
            <p className="text-[10px] text-muted-foreground">Divide cuentas {getCurrencyFlag(currency)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <CurrencySelector currency={currency} onChange={setCurrency} />
            <Button 
              onClick={handleShare} 
              disabled={sharing || products.length === 0}
              variant="outline"
              size="sm"
              className="rounded-xl border-primary/20 bg-primary/5 text-primary gap-1.5 h-8 px-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap"
            >
              {sharing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
              {sharing ? 'Creando...' : 'Compartir'}
            </Button>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="max-w-lg mx-auto px-4 pt-5">
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-accent rounded-2xl p-3.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Productos</p>
            <p className="text-xl font-bold text-foreground">{products.length}</p>
          </div>
          <div className="bg-accent rounded-2xl p-3.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Personas</p>
            <p className="text-xl font-bold text-foreground">{people.length}</p>
          </div>
          <div className="bg-accent rounded-2xl p-3.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total</p>
            <p className="text-lg font-bold text-foreground">{fmt(subtotal + tipAmount)}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4 space-y-5 pb-10">
        <ReceiptScanner onProductsDetected={handleProductsDetected} />

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
          onTypeChange={setTipType}
          onValueChange={setTipValue}
        />

        <BankSection
          bankData={bankData}
          onBankDataChange={setBankData}
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
