import { useState } from 'react';
import { Split, UserCheck, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Product, Person, Currency } from '@/lib/types';
import { PERSON_COLORS, getInitials, formatCurrency, parseProductName, roundValue } from '@/lib/bill-utils';
import { toast } from 'sonner';

interface Props {
  products: Product[];
  people: Person[];
  assignments: Record<string, string[]>;
  currency: Currency;
  individualMode: boolean;
  onToggleIndividualMode: () => void;
  onToggle: (productId: string, personId: string, action?: 'increment' | 'clear') => void;
  onAssignAll: (productId: string) => void;
  onDivideAllAmongAll: () => void;
  onClearProductAssignments: (productId: string) => void;
  onUpdateProduct: (id: string, updates: Partial<Product>) => void;
}

export default function AssignmentSection({ 
  products, 
  people, 
  assignments, 
  currency, 
  individualMode,
  onToggleIndividualMode,
  onToggle, 
  onAssignAll, 
  onDivideAllAmongAll,
  onClearProductAssignments,
  onUpdateProduct
}: Props) {
  const [editingDivisorProductId, setEditingDivisorProductId] = useState<string | null>(null);
  const [tempDivisorValue, setTempDivisorValue] = useState('5');

  if (products.length === 0 || people.length === 0) return null;

  const fmt = (n: number) => formatCurrency(n, currency);
  const basePeople = people.filter(p => !p.id.includes('_share'));

  const handleToggle = (productId: string, personId: string, action?: 'increment' | 'clear') => {
    if (action === 'increment' && individualMode) {
      const product = products.find(p => p.id === productId);
      if (product) {
        const { customDivisor } = parseProductName(product.name);
        const divisor = customDivisor || product.quantity;
        const assigned = assignments[productId] || [];
        if (divisor > 1 && assigned.length >= divisor) {
          toast.info(`Máximo ${divisor} partes para este producto`);
          return;
        }
      }
    }
    onToggle(productId, personId, action);
  };

  const handleSaveDivisor = (product: Product) => {
    const partsVal = parseInt(tempDivisorValue, 10);
    if (isNaN(partsVal) || partsVal < 1) {
      toast.error('Ingrese un número válido mayor o igual a 1');
      return;
    }

    const { displayName } = parseProductName(product.name);
    // If setting to 1, clear custom divisor completely
    const newName = partsVal <= 1 ? displayName : `${displayName} [div:${partsVal}]`;

    onUpdateProduct(product.id, { name: newName });
    setEditingDivisorProductId(null);
    toast.success(partsVal <= 1 ? 'División removida' : `Producto dividido en ${partsVal} partes`);
  };

  return (
    <section className="rounded-2xl bg-card p-5 card-shadow animate-fade-in-up border border-border">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <UserCheck className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-bold text-foreground">Asignar</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleIndividualMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all duration-200 ${
              individualMode
                ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                : 'bg-background text-muted-foreground border-border hover:border-amber-400 hover:text-amber-600'
            }`}
            title="En modo individual, cada clic = 1 unidad o parte consumida del producto"
          >
            Individual
          </button>
          <Button variant="outline" size="sm" onClick={onDivideAllAmongAll} className="text-xs gap-1.5 rounded-xl font-semibold">
            <Split className="w-3.5 h-3.5" />
            Dividir todo
          </Button>
        </div>
      </div>

      {individualMode && (
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 font-medium flex flex-col gap-1.5 animate-fade-in">
          <span><strong>Modo Individual:</strong> Cada clic sobre una persona = 1 parte consumida.</span>
          <span>Puedes dividir cualquier producto en partes iguales usando el botón <strong>"Dividir"</strong> en cada fila.</span>
        </div>
      )}

      <div className="space-y-3">
        {products.map(product => {
          const assigned = assignments[product.id] || [];
          const { displayName, customDivisor } = parseProductName(product.name);
          const divisor = customDivisor || product.quantity;
          const isIndividualProduct = individualMode && divisor > 1;
          const unitPrice = roundValue((product.price * product.quantity) / divisor, currency);
          const totalPrice = product.price * product.quantity;
          const unitsAssigned = assigned.length;
          const unitsRemaining = divisor - unitsAssigned;

          return (
            <div key={product.id} className={`rounded-xl p-3.5 ${isIndividualProduct ? 'bg-amber-500/5 border border-amber-500/15' : 'bg-accent/40'}`}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">
                    {displayName} {product.quantity > 1 ? `(${product.quantity}x)` : ''}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    {isIndividualProduct && (
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        Unitario: {fmt(unitPrice)} · Quedan {unitsRemaining} de {divisor}
                      </span>
                    )}
                    
                    {/* Divisor Action Button */}
                    {editingDivisorProductId === product.id ? (
                      <div className="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-100 bg-background/80 px-2 py-0.5 rounded-lg border border-border">
                        <span className="text-[9px] text-muted-foreground font-bold uppercase">Partes:</span>
                        <input
                          type="number"
                          min="1"
                          value={tempDivisorValue}
                          onChange={e => setTempDivisorValue(e.target.value)}
                          className="w-8 h-5 text-[10px] rounded border border-border bg-background text-center px-0.5 font-bold"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveDivisor(product)}
                          className="w-5 h-5 bg-green-600 text-white rounded flex items-center justify-center"
                          title="Confirmar"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingDivisorProductId(null)}
                          className="w-5 h-5 bg-muted text-muted-foreground rounded flex items-center justify-center"
                          title="Cancelar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingDivisorProductId(product.id);
                          setTempDivisorValue(divisor.toString());
                        }}
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded transition-all ${
                          customDivisor 
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30' 
                            : 'bg-primary/10 text-primary hover:bg-primary/20'
                        }`}
                        title="Divide este producto en partes (por ejemplo, para 5 personas)"
                      >
                        {customDivisor ? `÷ ${customDivisor} partes` : '÷ Dividir'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="text-sm text-muted-foreground font-semibold">
                    {fmt(totalPrice)}
                  </span>
                  {assigned.length > 0 && (
                    <button
                      onClick={() => onClearProductAssignments(product.id)}
                      className="text-[10px] text-red-500 hover:text-red-600 font-bold transition-colors uppercase tracking-wider mt-0.5"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {basePeople.map(person => {
                  const assignedCount = assigned.filter(id => id === person.id || id.startsWith(`${person.id}_share`)).length;
                  const isAssigned = assignedCount > 0;
                  const color = PERSON_COLORS[person.colorIndex];
                  return (
                    <button
                      key={person.id}
                      onClick={() => handleToggle(product.id, person.id, 'increment')}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleToggle(product.id, person.id, 'clear');
                      }}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-150 relative no-select-tap"
                      style={{
                        backgroundColor: isAssigned ? color.bg : 'transparent',
                        color: isAssigned ? color.fg : color.bg,
                        border: `2px solid ${color.bg}`,
                        transform: isAssigned ? 'scale(1.05)' : 'scale(1)',
                        opacity: isAssigned ? 1 : 0.5,
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                      }}
                      title={isIndividualProduct 
                        ? `${person.name} – ${assignedCount} parte(s) (Clic = +1, mantener = quitar)` 
                        : `${person.name} (Clic para sumar, mantener presionado para quitar)`
                      }
                    >
                      {getInitials(person.name)}
                      {assignedCount > 1 && (
                        <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-background shadow-sm animate-scale-in">
                          {assignedCount}
                        </span>
                      )}
                    </button>
                  );
                })}
                {!isIndividualProduct && (
                  <button
                    onClick={() => onAssignAll(product.id)}
                    className="text-xs text-primary hover:text-primary/80 font-semibold ml-1 transition-colors"
                  >
                    Todos
                  </button>
                )}
              </div>
              {!isIndividualProduct && assigned.length > 1 && (
                <p className="text-xs text-muted-foreground mt-2 font-medium">
                  ÷ {assigned.length} = {fmt(Math.round(totalPrice / assigned.length))} c/u
                </p>
              )}
              {isIndividualProduct && assigned.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">
                  {unitsAssigned} de {divisor} partes asignadas · Asignado: {fmt(unitPrice * unitsAssigned)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
