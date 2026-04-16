import { useState } from 'react';
import { Plus, Trash2, ShoppingBag, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Product, Currency } from '@/lib/types';
import { generateId, formatCurrency } from '@/lib/bill-utils';

interface Props {
  products: Product[];
  currency: Currency;
  onAdd: (p: Product) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, p: Partial<Product>) => void;
}

export default function ProductSection({ products, currency, onAdd, onRemove, onUpdate }: Props) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');

  // Estado para edición
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');

  // Estados para reversibilidad del botón de ayuda
  const [addPriceMode, setAddPriceMode] = useState<'total' | 'unit'>('total');
  const [originalAddPrice, setOriginalAddPrice] = useState('');
  const [editPriceMode, setEditPriceMode] = useState<'total' | 'unit'>('total');
  const [originalEditPrice, setOriginalEditPrice] = useState('');

  const fmt = (n: number) => formatCurrency(n, currency);
  const totalProducts = products.reduce((s, p) => s + p.price * p.quantity, 0);

  const handleAdd = () => {
    const trimmed = name.trim();
    const priceNum = parseFloat(price);
    const qty = parseInt(quantity, 10) || 1;
    if (!trimmed || !priceNum || priceNum <= 0) return;

    const finalPrice = currency === 'CLP' ? Math.round(priceNum) : Math.round(priceNum * 100) / 100;
    onAdd({ id: generateId(), name: trimmed, price: finalPrice, quantity: qty });
    setName('');
    setPrice('');
    setQuantity('1');
  };

  const startEditing = (p: Product) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPrice(p.price.toString());
    setEditQuantity(p.quantity.toString());
    setEditPriceMode('total');
    setOriginalEditPrice('');
  };

  const handleUpdate = () => {
    if (!editingId) return;
    const priceNum = parseFloat(editPrice);
    const qty = parseInt(editQuantity, 10) || 1;
    
    onUpdate(editingId, {
      name: editName.trim(),
      price: currency === 'CLP' ? Math.round(priceNum) : Math.round(priceNum * 100) / 100,
      quantity: qty
    });
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleUpdate();
    if (e.key === 'Escape') setEditingId(null);
  };

  return (
    <section className="rounded-2xl bg-card p-5 card-shadow animate-fade-in-up border border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-bold text-foreground">Productos</h2>
        </div>
        {products.length > 0 && (
          <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">
            Total listado: {fmt(totalProducts)}
          </span>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Nombre"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 text-sm rounded-xl h-10"
        />
        <Input
          type="number"
          placeholder="Cant."
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-16 text-sm rounded-xl h-10 text-center"
          min={1}
          inputMode="numeric"
        />
        <div className="relative flex-[0.8]">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-bold">
            {currency === 'BRL' ? '$R' : '$CLP'}
          </span>
          <Input
            type="number"
            placeholder=""
            value={price}
            onChange={e => {
              setPrice(e.target.value);
              setAddPriceMode('total');
            }}
            onKeyDown={handleKeyDown}
            className="text-sm rounded-xl h-10 pl-10"
            inputMode="decimal"
            step={currency === 'BRL' ? '0.01' : '1'}
          />
        </div>
        <Button size="icon" onClick={handleAdd} className="shrink-0 rounded-xl h-10 w-10">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {parseInt(quantity) > 1 && parseFloat(price) > 0 && (
        <button 
          onClick={() => {
            const currentQty = parseInt(quantity);
            const currentPrice = parseFloat(price);
            
            if (addPriceMode === 'total') {
              setOriginalAddPrice(price);
              const val = currentPrice / currentQty;
              setPrice(currency === 'CLP' ? Math.round(val).toString() : (Math.round(val * 100) / 100).toString());
              setAddPriceMode('unit');
            } else {
              setPrice(originalAddPrice);
              setAddPriceMode('total');
            }
          }}
          className="text-[10px] text-primary hover:text-primary/70 underline block mt-[-8px] mb-3 ml-1 animate-fade-in"
        >
          {addPriceMode === 'total' 
            ? `¿${fmt(parseFloat(price))} es el total por los ${quantity}? Convertir a unitario`
            : `Volver al total (${fmt(parseFloat(originalAddPrice))})`}
        </button>
      )}

      {products.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          Agrega productos de la boleta
        </p>
      )}

      <div className="space-y-2">
        {products.map(p => (
          <div key={p.id} className="bg-accent/50 rounded-xl px-3.5 py-2.5 animate-scale-in">
            {editingId === p.id ? (
              <div className="space-y-2">
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  className="text-sm h-8"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={editQuantity}
                    onChange={e => setEditQuantity(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    className="text-sm h-8 w-16 text-center"
                  />
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-bold">
                      {currency === 'BRL' ? '$R' : '$CLP'}
                    </span>
                    <Input
                      type="number"
                      value={editPrice}
                      onChange={e => {
                        setEditPrice(e.target.value);
                        setEditPriceMode('total');
                      }}
                      onKeyDown={handleEditKeyDown}
                      className="text-sm h-8 pl-10"
                    />
                  </div>
                  <Button size="icon" onClick={handleUpdate} className="h-8 w-8 rounded-lg bg-green-500 hover:bg-green-600">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditingId(null)} className="h-8 w-8 rounded-lg">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                {parseInt(editQuantity) > 1 && parseFloat(editPrice) > 0 && (
                  <button 
                    onClick={() => {
                      const currentQty = parseInt(editQuantity);
                      const currentPrice = parseFloat(editPrice);
                      
                      if (editPriceMode === 'total') {
                        setOriginalEditPrice(editPrice);
                        const val = currentPrice / currentQty;
                        setEditPrice(currency === 'CLP' ? Math.round(val).toString() : (Math.round(val * 100) / 100).toString());
                        setEditPriceMode('unit');
                      } else {
                        setEditPrice(originalEditPrice);
                        setEditPriceMode('total');
                      }
                    }}
                    className="text-[10px] text-primary hover:text-primary/70 underline block mt-[-4px] ml-1"
                  >
                    {editPriceMode === 'total' 
                      ? `¿${fmt(parseFloat(editPrice))} es el total? Convertir`
                      : `Volver al total (${fmt(parseFloat(originalEditPrice))})`}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0" onClick={() => startEditing(p)}>
                  <span className="text-sm font-semibold text-foreground truncate block">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.quantity > 1 ? `${p.quantity}x ` : ''}{fmt(p.price)} {p.quantity > 1 ? `= ${fmt(p.price * p.quantity)}` : ''}
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => startEditing(p)} className="h-8 w-8 text-muted-foreground">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onRemove(p.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        
        {products.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border flex justify-between items-center px-1">
            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Total de productos</span>
            <span className="text-base font-extrabold text-foreground">{fmt(totalProducts)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

