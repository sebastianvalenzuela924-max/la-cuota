import { useState } from 'react';
import { Plus, Users, X, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
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
  const [frequentPeople] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('saldamos_frequent_people');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [peopleGroups] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('saldamos_people_groups');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [showFrequent, setShowFrequent] = useState(false);

  const handleAdd = (manualName?: string) => {
    const finalName = (manualName || name).trim();
    if (!finalName) return;
    // Evitar duplicados por nombre
    if (people.some(p => p.name.toLowerCase() === finalName.toLowerCase())) {
      toast.error(`${finalName} ya está en la lista`);
      return;
    }
    onAdd({ id: generateId(), name: finalName, colorIndex: people.length % PERSON_COLORS.length });
    if (!manualName) setName('');
  };

  const addWholeGroup = (gn: string) => {
    const members = peopleGroups[gn] || [];
    let addedCount = 0;
    members.forEach(m => {
      if (!people.some(p => p.name.toLowerCase() === m.toLowerCase())) {
        onAdd({ id: generateId(), name: m, colorIndex: (people.length + addedCount) % PERSON_COLORS.length });
        addedCount++;
      }
    });
    if (addedCount > 0) toast.success(`Se agregaron ${addedCount} personas de ${gn}`);
  };

  return (
    <section className="rounded-2xl bg-card p-5 card-shadow animate-fade-in-up border border-border">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <Users className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-bold text-foreground">Personas</h2>
      </div>

      {frequentPeople.length > 0 && (
        <div className="mb-4 space-y-2">
          <button 
            type="button"
            onClick={() => setShowFrequent(!showFrequent)}
            className="flex items-center justify-between w-full px-4 py-2 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 font-bold text-xs hover:bg-blue-100 transition-all"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>Ver mis amigos / grupos</span>
            </div>
            <ChevronRight className={`w-4 h-4 transition-transform ${showFrequent ? 'rotate-90' : ''}`} />
          </button>

          {showFrequent && (
            <div className="p-3 bg-muted/30 rounded-2xl border border-dashed border-muted space-y-3 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest px-1">Grupos</span>
                <div className="flex gap-1 overflow-x-auto no-scrollbar max-w-[180px] pb-1">
                  {Object.keys(peopleGroups).map(gn => (
                    <button
                      key={gn}
                      onClick={() => setActiveGroup(activeGroup === gn ? null : gn)}
                      className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase transition-all whitespace-nowrap border ${
                        activeGroup === gn 
                          ? 'bg-blue-600 border-blue-600 text-white' 
                          : 'bg-blue-50 border-blue-100 text-blue-600'
                      }`}
                    >
                      {gn}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 py-1">
                {activeGroup ? (
                  <>
                    <button 
                      onClick={() => addWholeGroup(activeGroup)}
                      className="px-2 py-1 rounded-lg bg-blue-600 text-white text-[9px] font-black uppercase shadow-sm mb-1 w-full"
                    >
                      + Agregar Todo el Grupo {activeGroup}
                    </button>
                    {(peopleGroups[activeGroup] || []).map(p => {
                      const isAdded = people.some(pp => pp.name.toLowerCase() === p.toLowerCase());
                      return (
                        <button
                          key={p}
                          disabled={isAdded}
                          onClick={() => handleAdd(p)}
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all ${
                            isAdded 
                              ? 'bg-muted text-muted-foreground border-transparent opacity-50' 
                              : 'bg-background border-blue-200 text-blue-600 hover:border-blue-400'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  frequentPeople.slice(0, 12).map(p => {
                    const isAdded = people.some(pp => pp.name.toLowerCase() === p.toLowerCase());
                    return (
                      <button
                        key={p}
                        disabled={isAdded}
                        onClick={() => handleAdd(p)}
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all ${
                          isAdded 
                            ? 'bg-muted text-muted-foreground border-transparent opacity-50' 
                            : 'bg-background border-blue-100 text-blue-600 hover:border-blue-300'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })
                )}
                {!activeGroup && frequentPeople.length > 12 && (
                  <span className="text-[10px] text-muted-foreground self-center italic px-1">...y {frequentPeople.length - 12} más</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Nombre"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="flex-1 text-sm rounded-xl h-10"
        />
        <Button size="icon" onClick={() => handleAdd()} className="shrink-0 rounded-xl h-10 w-10">
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
