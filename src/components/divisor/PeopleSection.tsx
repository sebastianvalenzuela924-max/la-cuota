import { useState } from 'react';
import { Plus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Person } from '@/lib/types';
import { generateId, getInitials, PERSON_COLORS } from '@/lib/bill-utils';

interface Props {
  people: Person[];
  onAdd: (p: Person) => void;
  onRemove: (id: string) => void;
}

export default function PeopleSection({ people, onAdd, onRemove }: Props) {
  const [name, setName] = useState('');

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({ id: generateId(), name: trimmed, colorIndex: people.length % PERSON_COLORS.length });
    setName('');
  };

  return (
    <section className="rounded-2xl bg-card p-5 card-shadow animate-fade-in-up border border-border">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <Users className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-bold text-foreground">Personas</h2>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Nombre"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="flex-1 text-sm rounded-xl h-10"
        />
        <Button size="icon" onClick={handleAdd} className="shrink-0 rounded-xl h-10 w-10">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {people.map(p => {
          const color = PERSON_COLORS[p.colorIndex];
          return (
            <div key={p.id} className="flex items-center gap-1.5 bg-accent/60 rounded-full pl-1 pr-2.5 py-1 animate-scale-in">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ backgroundColor: color.bg, color: color.fg }}
              >
                {getInitials(p.name)}
              </div>
              <span className="text-sm font-medium text-foreground">{p.name}</span>
              <button onClick={() => onRemove(p.id)} className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        {people.length === 0 && (
          <p className="text-sm text-muted-foreground text-center w-full py-3">
            Agrega las personas para dividir
          </p>
        )}
      </div>
    </section>
  );
}
