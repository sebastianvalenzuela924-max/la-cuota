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
    const members = gn === 'Otros' ? unassignedPeople : (peopleGroups[gn] || []);
    let addedCount = 0;
    members.forEach(m => {
      if (!people.some(p => p.name.toLowerCase() === m.toLowerCase())) {
        onAdd({ id: generateId(), name: m, colorIndex: (people.length + addedCount) % PERSON_COLORS.length });
        addedCount++;
      }
    });
    if (addedCount > 0) toast.success(`Se agregaron ${addedCount} personas de ${gn}`);
  };

  const unassignedPeople = useMemo(() => {
    const assigned = new Set<string>();
    Object.values(peopleGroups).forEach(members => {
      members.forEach(m => assigned.add(m));
    });
    return frequentPeople.filter(p => !assigned.has(p));
  }, [frequentPeople, peopleGroups]);

  return (
    <section className="rounded-2xl bg-card p-5 card-shadow animate-fade-in-up border border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-bold text-foreground">Personas</h2>
        </div>
        
        {frequentPeople.length > 0 && (
          <button 
            type="button"
            onClick={() => setShowFrequent(!showFrequent)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
              showFrequent 
                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                : 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{showFrequent ? 'Cerrar' : 'Mis Amigos'}</span>
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showFrequent ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>

      {showFrequent && frequentPeople.length > 0 && (
        <div className="mb-6 p-4 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10 rounded-2xl border border-blue-100/50 dark:border-blue-900/30 space-y-4 animate-in slide-in-from-top-2 duration-300">
          {/* Groups Horizontal Scroll */}
          <div className="space-y-2">
            <p className="text-[9px] font-black text-blue-600/70 uppercase tracking-widest px-1">Grupos Guardados</p>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {Object.keys(peopleGroups).map(gn => (
                <button
                  key={gn}
                  onClick={() => setActiveGroup(activeGroup === gn ? null : gn)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap border ${
                    activeGroup === gn 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-95' 
                      : 'bg-white dark:bg-slate-900 border-blue-100 text-blue-600 hover:border-blue-300'
                  }`}
                >
                  {gn}
                </button>
              ))}
              {unassignedPeople.length > 0 && (
                <button
                  onClick={() => setActiveGroup(activeGroup === 'Otros' ? null : 'Otros')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap border ${
                    activeGroup === 'Otros' 
                      ? 'bg-slate-700 border-slate-700 text-white shadow-md scale-95' 
                      : 'bg-white dark:bg-slate-900 border-slate-200 text-slate-500 hover:border-slate-400'
                  }`}
                >
                  Otros
                </button>
              )}
            </div>
          </div>

          {/* People Grid for selected group */}
          <div className="min-h-[60px] animate-in fade-in duration-300">
            {activeGroup ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-foreground">
                    {activeGroup === 'Otros' ? 'Personas sin grupo' : `Gente en "${activeGroup}"`}
                  </p>
                  {activeGroup !== 'Otros' && (
                    <button 
                      onClick={() => addWholeGroup(activeGroup)}
                      className="text-[9px] font-black text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> AGREGAR TODO
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(activeGroup === 'Otros' ? unassignedPeople : (peopleGroups[activeGroup] || [])).map(p => {
                    const isAdded = people.some(pp => pp.name.toLowerCase() === p.toLowerCase());
                    return (
                      <button
                        key={p}
                        disabled={isAdded}
                        onClick={() => handleAdd(p)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-2 ${
                          isAdded 
                            ? 'bg-muted/50 text-muted-foreground border-transparent opacity-60 cursor-not-allowed' 
                            : 'bg-white dark:bg-slate-900 border-blue-100 text-blue-700 shadow-sm hover:border-blue-400 hover:scale-105 active:scale-95'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] ${isAdded ? 'bg-muted text-muted-foreground' : 'bg-blue-100 text-blue-600'}`}>
                          {isAdded ? '✓' : p.charAt(0).toUpperCase()}
                        </div>
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <p className="text-[10px] text-muted-foreground font-medium">Selecciona un grupo para ver a tus amigos</p>
              </div>
            )}
          </div>
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
