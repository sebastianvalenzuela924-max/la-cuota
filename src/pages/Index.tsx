import { useState, useMemo, useEffect } from 'react';
import { Receipt, Scale, Scissors, Trash2, Moon, Sun } from 'lucide-react';
import type { Product, Person, TipType, BankData, Currency } from '@/lib/types';
import { calculatePersonTotals, formatCurrency, getCurrencyFlag, roundValue, generateSummaryText } from '@/lib/bill-utils';
import ReceiptScanner from '@/components/divisor/ReceiptScanner';
import ProductSection from '@/components/divisor/ProductSection';
import PeopleSection from '@/components/divisor/PeopleSection';
import AssignmentSection from '@/components/divisor/AssignmentSection';
import TipSection from '@/components/divisor/TipSection';
import BankSection from '@/components/divisor/BankSection';
import SummarySection from '@/components/divisor/SummarySection';
import CurrencySelector from '@/components/divisor/CurrencySelector';
import SaldosPage from '@/pages/SaldosPage';
import { saldamosSupabase } from '@/integrations/supabase/saldamos-client';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import { Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { Copy, CheckCircle2, Download } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useDarkMode } from '@/hooks/useDarkMode';

export default function Index() {
  const navigate = useNavigate();
  const { canInstall, install } = usePWAInstall();
  const { user } = useSaldamosAuth();
  const { isDark, toggle: toggleDark } = useDarkMode();
  const [activeTab, setActiveTab] = useState<'dividir' | 'saldos'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('group')) return 'saldos';
    }
    return 'dividir';
  });
  const [pendingImportText, setPendingImportText] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareAppOpen, setShareAppOpen] = useState(false);
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('install') === 'true') {
        setShareAppOpen(true);
        const newUrl = window.location.pathname + window.location.search.replace(/[?&]install=true/, '').replace(/^&/, '?');
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, []);

  const getChromeLink = () => {
    if (typeof window === 'undefined') return 'https://la-cuota.vercel.app/?install=true';
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      return 'googlechromes://la-cuota.vercel.app?install=true';
    }
    if (/android/.test(ua)) {
      return 'intent://la-cuota.vercel.app/?install=true#Intent;scheme=https;package=com.android.chrome;end';
    }
    return 'https://la-cuota.vercel.app/?install=true';
  };

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
    setPeople(prev => prev.filter(p => p.id !== id && !p.id.startsWith(`${id}_share`)));
    setAssignments(prev => {
      const next: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = v.filter(pid => pid !== id && !pid.startsWith(`${id}_share`));
      }
      return next;
    });
  };

  const cleanupVirtualPeople = (newAssignments: Record<string, string[]>) => {
    setPeople(prevPeople => {
      const virtualPeople = prevPeople.filter(p => p.id.includes('_share'));
      if (virtualPeople.length === 0) return prevPeople;
      const assignedIds = new Set(Object.values(newAssignments).flat());
      return prevPeople.filter(p => !p.id.includes('_share') || assignedIds.has(p.id));
    });
  };

  const toggleAssignment = (productId: string, personId: string, action?: 'increment' | 'clear') => {
    if (action === 'clear') {
      setAssignments(prev => {
        const current = prev[productId] || [];
        const nextAssignments = {
          ...prev,
          [productId]: current.filter(id => id !== personId && !id.startsWith(`${personId}_share`))
        };
        setTimeout(() => cleanupVirtualPeople(nextAssignments), 0);
        return nextAssignments;
      });
      return;
    }

    setAssignments(prev => {
      const current = prev[productId] || [];
      const matches = current.filter(id => id === personId || id.startsWith(`${personId}_share`));
      const count = matches.length;

      let nextAssigned: string[];
      if (count === 0) {
        nextAssigned = [...current, personId];
      } else {
        const virtualId = `${personId}_share${count}`;
        nextAssigned = [...current, virtualId];

        setPeople(prevPeople => {
          if (prevPeople.some(p => p.id === virtualId)) return prevPeople;
          const basePerson = prevPeople.find(p => p.id === personId);
          if (!basePerson) return prevPeople;
          return [...prevPeople, {
            id: virtualId,
            name: basePerson.name,
            colorIndex: basePerson.colorIndex
          }];
        });
      }

      const nextAssignments = {
        ...prev,
        [productId]: nextAssigned
      };
      return nextAssignments;
    });
  };

  const clearProductAssignments = (productId: string) => {
    setAssignments(prev => {
      const nextAssignments = {
        ...prev,
        [productId]: []
      };
      setTimeout(() => cleanupVirtualPeople(nextAssignments), 0);
      return nextAssignments;
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

  const resetBill = () => {
    if (confirm('¿Estás seguro de que quieres vaciar la boleta actual? Se borrarán todos los productos y personas.')) {
      setProducts([]);
      setPeople([]);
      setAssignments({});
      setTipValue(0);
      setBankData({});
      toast.success('Boleta vaciada');
    }
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
      // 1. Create Session (no auth required - sessions are public)
      const { data: session, error: sError } = await saldamosSupabase
        .from('bill_sessions')
        .insert([{
          currency,
          tip_type: tipType,
          tip_value: tipValue,
          bank_data: bankData,
        }])
        .select()
        .single();

      if (sError) throw sError;
      const sid = session.id;

      // 2. Create Products
      if (products.length > 0) {
        const { error: pError } = await saldamosSupabase
          .from('bill_products')
          .insert(products.map(p => ({ ...p, session_id: sid })));
        if (pError) throw pError;
      }

      // 3. Create People
      if (people.length > 0) {
        const { error: peError } = await saldamosSupabase
          .from('bill_people')
          .insert(people.map(p => ({ 
            id: p.id,
            name: p.name,
            color_index: p.colorIndex,
            session_id: sid 
          })));
        if (peError) throw peError;
      }

      // 4. Create Assignments
      const assignmentInserts: { product_id: string; person_id: string; session_id: string }[] = [];
      Object.entries(assignments).forEach(([productId, personIds]) => {
        personIds.forEach(personId => {
          assignmentInserts.push({ 
            product_id: productId, 
            person_id: personId,
            session_id: sid
          });
        });
      });

      if (assignmentInserts.length > 0) {
        const { error: aError } = await saldamosSupabase
          .from('bill_assignments')
          .insert(assignmentInserts);
        if (aError) throw aError;
      }

      toast.success('¡Mesa compartida creada!');
      navigate(`/session/${sid}`);

    } catch (error) {
      const e = error as Error;
      console.error('Error sharing:', error);
      toast.error(`No se pudo crear la mesa compartida: ${e.message || 'Error desconocido'}`);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-4 card-shadow">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div 
            onClick={() => setShareAppOpen(true)}
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity active:scale-95"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Receipt className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h1 className="font-extrabold text-2xl text-foreground tracking-tight whitespace-nowrap leading-none">La Cuota</h1>
              <p className="text-xs text-muted-foreground font-semibold mt-1 leading-none">
                Divide cuentas {getCurrencyFlag(currency)}
              </p>
              <div className="mt-1.5 flex">
                <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-black animate-pulse whitespace-nowrap">
                  Comparte 🔗
                </span>
              </div>
            </div>
          </div>

          <Dialog open={shareAppOpen} onOpenChange={setShareAppOpen}>
            <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-[360px] max-h-[90vh] overflow-y-auto p-6 rounded-[2.5rem] gap-0 outline-none border-none shadow-2xl bg-card animate-scale-in">
              <DialogHeader className="mb-6">
                <DialogTitle className="text-center font-bold text-xl text-foreground">¡Comparte la App!</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center w-full min-w-0">
                <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-border flex items-center justify-center mb-6 shrink-0">
                  <QRCodeSVG 
                    value="https://la-cuota.vercel.app/" 
                    size={180} 
                    level="H"
                    includeMargin={false}
                    className="w-full h-auto max-w-[180px]"
                  />
                </div>
                
                <div className="w-full space-y-3 mb-4">
                  <p className="text-sm text-center font-bold text-foreground italic">"La mejor forma de dividir la cuenta con amigos"</p>
                  <p className="text-[11px] text-muted-foreground text-center font-medium">Escanea este código para instalar o abrir la app 🇨🇱</p>
                </div>

                <div className="w-full flex items-center gap-2 p-3 bg-accent/50 rounded-2xl border border-border overflow-hidden mb-4">
                  <p className="text-[10px] font-mono text-muted-foreground truncate flex-1">https://la-cuota.vercel.app/</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => {
                        navigator.clipboard.writeText("https://la-cuota.vercel.app/");
                        toast.success('Link de la app copiado');
                      }}
                      className="h-8 w-8 rounded-lg bg-background/50 hover:bg-background"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => {
                        window.open(`https://wa.me/?text=${encodeURIComponent("¡Mira esta app para dividir la cuenta!: https://la-cuota.vercel.app/")}`, '_blank');
                      }}
                      className="h-8 w-8 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-600"
                      title="Compartir por WhatsApp"
                    >
                      <svg 
                        viewBox="0 0 24 24" 
                        fill="currentColor" 
                        className="w-4 h-4"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.067 2.877 1.215 3.076.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                    </Button>
                  </div>
                </div>

                {/* Sección de Instalación y Chrome */}
                <div className="w-full border-t border-border/60 pt-4 mt-2 space-y-4">
                  <div className="bg-accent/40 rounded-2xl p-4 border border-border/40 space-y-3">
                    <h4 className="text-[11px] font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
                      📲 Pasos para instalar en tu celular:
                    </h4>
                    <ol className="text-[11px] text-muted-foreground space-y-2 list-decimal list-inside font-medium leading-relaxed">
                      <li>Presiona el botón <strong>"Abrir en Google Chrome 🌐"</strong> de abajo.</li>
                      <li>Una vez abierta la app en Chrome, vuelve a esta pestaña y presiona el botón de instalar.</li>
                      <li>¡Listo! Revisa tu pantalla de inicio o cajón de aplicaciones y verás la app instalada con éxito 🇨🇱.</li>
                    </ol>
                  </div>
                  
                  <a 
                    href={getChromeLink()} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#4285F4] hover:bg-[#357ae8] text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer no-underline"
                  >
                    Abrir en Google Chrome 🌐
                  </a>

                  {canInstall && (
                    <Button 
                      onClick={install}
                      className="w-full rounded-2xl h-11 bg-primary text-primary-foreground font-bold gap-2 shadow-lg shadow-primary/20 animate-bounce-subtle"
                    >
                      <Download className="w-4 h-4" />
                      Instalar con solo un click
                    </Button>
                  )}
                </div>

                {/* Footer de contacto */}
                <div className="w-full border-t border-border/60 mt-5 pt-4 flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">¿Tienes una idea de app o proyecto?</p>
                  <a 
                    href="mailto:svalenzuela.dev@gmail.com" 
                    className="text-xs text-primary font-extrabold hover:underline mt-1.5 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    📩 Contáctame: svalenzuela.dev@gmail.com
                  </a>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="flex-1"></div>
          
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleDark}
                className="w-9 h-9 rounded-2xl flex items-center justify-center bg-accent hover:bg-accent/80 transition-all active:scale-95 shadow-sm"
                title={isDark ? 'Modo claro' : 'Modo oscuro'}
              >
                {isDark
                  ? <Sun className="w-4 h-4 text-amber-400" />
                  : <Moon className="w-4 h-4 text-slate-600" />
                }
              </button>
              <CurrencySelector currency={currency} onChange={setCurrency} />
            </div>
            <Button 
              onClick={handleShare} 
              disabled={sharing || products.length === 0}
              variant="outline"
              size="sm"
              className="rounded-2xl border-primary/20 bg-primary/5 text-primary gap-1.5 h-9 px-3 text-xs font-bold transition-all active:scale-95 whitespace-nowrap shadow-sm"
            >
              {sharing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              {sharing ? 'Creando...' : 'Une a tus amigos'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content - only shown on Dividir tab */}
      {activeTab === 'dividir' && (
      <main className="max-w-lg mx-auto px-4 space-y-5 pb-24">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-5 mt-2">
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

        <div className="flex gap-2">
          <div className="flex-1">
            <ReceiptScanner onProductsDetected={handleProductsDetected} />
          </div>
          {(products.length > 0 || people.length > 0) && (
            <Button 
              variant="outline" 
              size="icon" 
              className="h-12 w-12 rounded-2xl shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-100 animate-in fade-in zoom-in duration-300 shadow-sm" 
              onClick={resetBill} 
              title="Vaciar boleta"
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          )}
        </div>

        <PeopleSection
          people={people}
          onAdd={addPerson}
          onRemove={removePerson}
        />

        <ProductSection
          products={products}
          currency={currency}
          onAdd={addProduct}
          onRemove={removeProduct}
          onUpdate={updateProduct}
        />

        <AssignmentSection
          products={products}
          people={people}
          assignments={assignments}
          currency={currency}
          onToggle={toggleAssignment}
          onAssignAll={assignAllToProduct}
          onDivideAllAmongAll={divideAllAmongAll}
          onClearProductAssignments={clearProductAssignments}
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
          onImportToSaldos={(text) => {
            setPendingImportText(text);
            setActiveTab('saldos');
          }}
        />

        {/* Tarjeta de Promoción para compartir la App */}
        <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/5 dark:from-blue-500/20 dark:to-indigo-500/10 border border-blue-500/20 rounded-2xl p-5 flex flex-col items-center text-center gap-3 animate-fade-in-up mt-2">
          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Share2 className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-foreground">¿Te sirvió La Cuota? ✨</h3>
            <p className="text-xs text-muted-foreground max-w-xs font-medium leading-relaxed">
              ¡Recomiéndanos con tus amigos para que en su próxima junta también dividan la cuenta en segundos!
            </p>
          </div>
          <Button 
            onClick={() => setShareAppOpen(true)}
            size="sm"
            className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 px-4 h-9 shadow-md shadow-blue-500/10 transition-all active:scale-95"
          >
            <Share2 className="w-3.5 h-3.5" />
            Compartir App
          </Button>
        </div>
      </main>
      )}
      {/* Saldos Tab Panel */}
      {activeTab === 'saldos' && (
        <main className="max-w-lg mx-auto px-4 pb-28 pt-4">
          <SaldosPage 
            pendingImportText={pendingImportText} 
            onClearPendingImport={() => setPendingImportText(null)} 
            billData={products.length > 0 ? generateSummaryText(products, people, totals, tipType, tipValue, bankData, currency) : null}
          />
        </main>
      )}

      {/* Bottom Tab Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-t border-border">
        <div className="max-w-lg mx-auto flex">
          <button
            onClick={() => setActiveTab('dividir')}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 transition-colors ${
              activeTab === 'dividir' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Scissors className={`w-5 h-5 ${activeTab === 'dividir' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="text-[10px] font-semibold">Dividir</span>
          </button>
          <button
            onClick={() => setActiveTab('saldos')}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 transition-colors ${
              activeTab === 'saldos' ? 'text-blue-600' : 'text-muted-foreground'
            }`}
          >
            <Scale className={`w-5 h-5 ${activeTab === 'saldos' ? 'text-blue-600' : 'text-muted-foreground'}`} />
            <span className="text-[10px] font-bold">Mis Saldos</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
