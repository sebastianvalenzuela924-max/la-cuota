import { Split, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Product, Person, Currency } from '@/lib/types';
import { PERSON_COLORS, getInitials, formatCurrency } from '@/lib/bill-utils';
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
  onClearProductAssignments
}: Props) {
  if (products.length === 0 || people.length === 0) return null;

  const fmt = (n: number) => formatCurrency(n, currency);
  const basePeople = people.filter(p => !p.id.includes('_share'));

  const handleToggle = (productId: string, personId: string, action?: 'increment' | 'clear') => {
    if (action === 'increment' && individualMode) {
      const product = products.find(p => p.id === productId);
      const assigned = assignments[productId] || [];
      if (product && product.quantity > 1 && assigned.length >= product.quantity) {
        toast.info(`Máximo ${product.quantity} unidades para este producto`);
        return;
      }
    }
    onToggle(productId, personId, action);
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
            title="En modo individual, cada clic = 1 unidad consumida del producto"
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
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 font-medium flex items-start gap-2 animate-fade-in">
          <span><strong>Modo Individual:</strong> Cada clic sobre una persona = 1 unidad consumida. Útil cuando la boleta dice "3 hamburguesas" y quieres asignar cuántas comió cada uno.</span>
        </div>
      )}

      <div className="space-y-3">
        {products.map(product => {
          const assigned = assignments[product.id] || [];
          const isIndividualProduct = individualMode && product.quantity > 1;
          const unitPrice = product.price;
          const totalPrice = product.price * product.quantity;
          const unitsAssigned = assigned.length;
          const unitsRemaining = product.quantity - unitsAssigned;

          return (
            <div key={product.id} className={`rounded-xl p-3.5 ${isIndividualProduct ? 'bg-amber-500/5 border border-amber-500/15' : 'bg-accent/40'}`}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">
                    {product.name} {product.quantity > 1 ? `(${product.quantity}x)` : ''}
                  </span>
                  {isIndividualProduct && (
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                      Unitario: {fmt(unitPrice)} · Quedan {unitsRemaining} de {product.quantity}
                    </span>
                  )}
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
                        ? `${person.name} – ${assignedCount} unidad(es) (Clic = +1, mantener = quitar)` 
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
                  {unitsAssigned} de {product.quantity} asignadas · Asignado: {fmt(unitPrice * unitsAssigned)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
