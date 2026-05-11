import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { saldamosSupabase } from "@/integrations/supabase/saldamos-client";
import { toast } from "sonner";

export type Category = { id: string; name: string; is_default: boolean };

type Props = {
  groupId: string;
  categories: Category[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCategoriesChanged: () => Promise<void> | void;
};

export function CategoryPicker({ groupId, categories, value, onChange, onCategoriesChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = useMemo(
    () => categories.find((c) => c.id === value) ?? null,
    [categories, value],
  );

  const trimmed = query.trim();
  const exists = trimmed
    ? categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())
    : true;
  const canCreate = trimmed.length > 0 && !exists;

  const createCategory = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    const { data, error } = await saldamosSupabase
      .from("expense_categories" as any) // Avoid type issues if not in types
      .insert({ group_id: groupId, name: trimmed, is_default: false })
      .select("id, name, is_default")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.message ?? "No se pudo crear la categoría");
      return;
    }
    await onCategoriesChanged();
    onChange((data as any).id);
    setQuery("");
    setOpen(false);
    toast.success(`Categoría "${(data as any).name}" creada`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal rounded-xl"
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            {selected ? selected.name : <span className="text-muted-foreground text-sm">Otros (sin categoría)</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 rounded-xl overflow-hidden" align="start">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="Buscar o crear categoría..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {canCreate ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded"
                  onClick={createCategory}
                  disabled={creating}
                >
                  <Plus className="h-4 w-4" />
                  Crear "{trimmed}"
                </button>
              ) : (
                <span className="px-2 py-1.5 text-sm text-muted-foreground">Sin resultados</span>
              )}
            </CommandEmpty>
            <CommandGroup>
              {categories.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>{c.name}</span>
                  {c.is_default && (
                    <span className="ml-auto text-xs text-muted-foreground">por defecto</span>
                  )}
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem
                  value={`__create_${trimmed}`}
                  onSelect={createCategory}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Crear "{trimmed}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
