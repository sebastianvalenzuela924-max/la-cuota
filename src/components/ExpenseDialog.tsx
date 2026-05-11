import { useEffect, useMemo, useState } from "react";
import { saldamosSupabase } from "@/integrations/supabase/saldamos-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Sparkles, Wand2, User } from "lucide-react";
import { formatMoney, type ExpenseWithContribs } from "@/lib/balances";
import { CategoryPicker, type Category } from "@/components/CategoryPicker";
import { parseLaCuotaMessage, findMemberMatch } from "@/lib/lacuota-parser";
import { Textarea } from "@/components/ui/textarea";

type Member = { id: string; name: string; joined_at: string };
type ExpenseWithCategory = ExpenseWithContribs & { category_id: string | null; is_personal?: boolean };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
  members: Member[];
  currency: string;
  categories: Category[];
  existing: ExpenseWithCategory | null;
  onSaved: () => void;
  onMembersChanged?: () => Promise<void> | void;
  onCategoriesChanged: () => Promise<void> | void;
};

export function ExpenseDialog({ open, onOpenChange, groupId, members, currency, categories, existing, onSaved, onMembersChanged, onCategoriesChanged }: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contribs, setContribs] = useState<Record<string, string>>({});
  const [owed, setOwed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isPersonal, setIsPersonal] = useState(false);
  const [personalPayer, setPersonalPayer] = useState<string>("");

  const eligible = useMemo(() => {
    if (existing) {
      const existingIds = new Set(existing.contributions.map((c) => c.member_id));
      const exDate = new Date(existing.expense_date).getTime();
      return members.filter(
        (m) => existingIds.has(m.id) || new Date(m.joined_at).getTime() <= exDate,
      );
    }
    return members;
  }, [members, existing]);

  useEffect(() => {
    if (!open) return;
    const defaultCat = categories.find((c) => c.is_default) ?? null;
    if (existing) {
      setDescription(existing.description);
      setTotal(String(existing.total_amount));
      setDate(new Date(existing.expense_date).toISOString().slice(0, 10));
      setCategoryId(existing.category_id ?? defaultCat?.id ?? null);
      setIsPersonal(!!existing.is_personal);
      const sel = new Set(existing.contributions.map((c) => c.member_id));
      setSelected(sel);
      const paidMap: Record<string, string> = {};
      const owedMap: Record<string, string> = {};
      existing.contributions.forEach((c) => {
        paidMap[c.member_id] = String(c.amount_paid);
        owedMap[c.member_id] = c.amount_owed > 0 ? String(c.amount_owed) : "";
      });
      setContribs(paidMap);
      setOwed(owedMap);
      if (existing.is_personal && existing.contributions[0]) {
        setPersonalPayer(existing.contributions[0].member_id);
      } else {
        setPersonalPayer("");
      }
    } else {
      setDescription("");
      setTotal("");
      setDate(new Date().toISOString().slice(0, 10));
      setCategoryId(defaultCat?.id ?? null);
      setIsPersonal(false);
      setPersonalPayer("");
      setSelected(new Set(members.map((m) => m.id)));
      const map: Record<string, string> = {};
      members.forEach((m) => (map[m.id] = ""));
      setContribs(map);
      setOwed({ ...map });
    }
  }, [open, existing]);

  const totalNum = Number(total) || 0;
  const sumContribs = Array.from(selected).reduce((s, id) => s + (Number(contribs[id]) || 0), 0);
  const sumOwed = Array.from(selected).reduce((s, id) => s + (Number(owed[id]) || 0), 0);
  const mismatch = totalNum > 0 && Math.abs(sumContribs - totalNum) > 0.01;
  const owedMismatch = totalNum > 0 && sumOwed > 0.01 && Math.abs(sumOwed - totalNum) > 0.01;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const distributeEvenly = () => {
    if (!totalNum || selected.size === 0) return;
    const share = totalNum / selected.size;
    const next = { ...contribs };
    selected.forEach((id) => (next[id] = share.toFixed(0)));
    setContribs(next);
  };

  const distributeOwedEvenly = () => {
    if (!totalNum || selected.size === 0) return;
    const share = totalNum / selected.size;
    const next = { ...owed };
    selected.forEach((id) => (next[id] = share.toFixed(0)));
    setOwed(next);
  };

  const assignAllToOne = (id: string) => {
    const next: Record<string, string> = {};
    selected.forEach((mid) => (next[mid] = mid === id ? totalNum.toFixed(0) : "0"));
    setContribs(next);
  };

  const save = async () => {
    if (!description.trim() || !totalNum) {
      toast.error("Completá descripción y monto total.");
      return;
    }
    if (isPersonal && !personalPayer) {
      toast.error("Elegí a quién corresponde el gasto personal.");
      return;
    }
    if (!isPersonal && selected.size === 0) {
      toast.error("Elegí al menos un participante.");
      return;
    }
    setSaving(true);
    const isoDate = new Date(date + "T12:00:00").toISOString();

    let expenseId = existing?.id;
    const finalCategoryId = categoryId ?? categories.find((c) => c.is_default)?.id ?? null;
    if (existing) {
      const { error } = await saldamosSupabase
        .from("expenses")
        .update({
          description: description.trim(),
          total_amount: totalNum,
          expense_date: isoDate,
          category_id: finalCategoryId,
          is_personal: isPersonal,
        })
        .eq("id", existing.id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      await saldamosSupabase.from("expense_contributions").delete().eq("expense_id", existing.id);
    } else {
      const { data, error } = await saldamosSupabase
        .from("expenses")
        .insert({
          group_id: groupId,
          description: description.trim(),
          total_amount: totalNum,
          expense_date: isoDate,
          category_id: finalCategoryId,
          is_personal: isPersonal,
        })
        .select("id")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Error");
        setSaving(false);
        return;
      }
      expenseId = (data as any).id;
    }

    const rows = isPersonal
      ? [{
          expense_id: expenseId!,
          member_id: personalPayer,
          amount_paid: totalNum,
          amount_owed: totalNum,
        }]
      : Array.from(selected).map((mid) => ({
          expense_id: expenseId!,
          member_id: mid,
          amount_paid: Number(contribs[mid]) || 0,
          amount_owed: Number(owed[mid]) || 0,
        }));
    const { error: cErr } = await saldamosSupabase.from("expense_contributions").insert(rows);
    setSaving(false);
    if (cErr) {
      toast.error(cErr.message);
      return;
    }
    toast.success(existing ? "Gasto actualizado" : "Gasto guardado");
    onSaved();
  };

  const handlePasteProcess = () => {
    const parsed = parseLaCuotaMessage(pasteText);
    if (parsed.length === 0) {
      toast.error("No se detectaron personas en el texto.");
      return;
    }
    const nextOwed = { ...owed };
    const nextSelected = new Set(selected);
    parsed.forEach(p => {
      const matchId = findMemberMatch(p.name, members);
      if (matchId) {
        nextOwed[matchId] = p.amount.toString();
        nextSelected.add(matchId);
      }
    });
    setOwed(nextOwed);
    setSelected(nextSelected);
    
    const sum = parsed.reduce((s, p) => s + p.amount, 0);
    if (!total || Number(total) === 0) setTotal(sum.toString());
    
    toast.success("Consumos importados");
    setPasteOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
          <DialogDescription>
            Ingresá manualmente cuánto aportó y cuánto consumió cada uno.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="desc">Descripción</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Cena del sábado"
              className="rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="total">Monto total ({currency})</Label>
              <Input
                id="total"
                type="number"
                inputMode="decimal"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Fecha</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categoría</Label>
            <CategoryPicker
              groupId={groupId}
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onCategoriesChanged={onCategoriesChanged}
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 text-violet-500" />
              <div>
                <Label htmlFor="personal-switch" className="cursor-pointer font-medium">Gasto personal</Label>
                <p className="text-[10px] text-muted-foreground">No afecta el balance grupal. Solo tu historial individual.</p>
              </div>
            </div>
            <Switch id="personal-switch" checked={isPersonal} onCheckedChange={(v) => setIsPersonal(!!v)} />
          </div>

          {isPersonal ? (
            <div className="space-y-2">
              <Label>¿De quién es este gasto?</Label>
              <select
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                value={personalPayer}
                onChange={(e) => setPersonalPayer(e.target.value)}
              >
                <option value="">Elegí una persona...</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Participantes y montos</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] rounded-lg" onClick={() => setPasteOpen(true)}>
                    <Wand2 className="h-3 w-3 mr-1" /> Pegar ticket
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] rounded-lg" onClick={distributeEvenly}>Aportes =</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] rounded-lg" onClick={distributeOwedEvenly}>Consumos =</Button>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border bg-muted/30 p-2">
                {eligible.map((m) => {
                  const isSel = selected.has(m.id);
                  return (
                    <div key={m.id} className={`rounded-lg p-2 grid grid-cols-[auto_1fr_7rem_7rem] items-center gap-2 ${isSel ? "bg-card shadow-sm" : "opacity-60"}`}>
                      <Checkbox checked={isSel} onCheckedChange={() => toggle(m.id)} id={`c-${m.id}`} />
                      <Label htmlFor={`c-${m.id}`} className="text-xs truncate cursor-pointer font-medium">{m.name}</Label>
                      <Input
                        type="number"
                        disabled={!isSel}
                        value={contribs[m.id] ?? ""}
                        onChange={(e) => setContribs({ ...contribs, [m.id]: e.target.value })}
                        placeholder="Aportó"
                        className="h-8 text-xs rounded-lg"
                      />
                      <Input
                        type="number"
                        disabled={!isSel}
                        value={owed[m.id] ?? ""}
                        onChange={(e) => setOwed({ ...owed, [m.id]: e.target.value })}
                        placeholder="Consumió"
                        className="h-8 text-xs rounded-lg"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white rounded-xl" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Pegar ticket</DialogTitle></DialogHeader>
          <Textarea 
            value={pasteText} 
            onChange={e => setPasteText(e.target.value)} 
            placeholder="Pega el mensaje de La Cuota aquí..." 
            className="min-h-[150px] text-xs rounded-xl"
          />
          <DialogFooter>
            <Button onClick={handlePasteProcess} className="rounded-xl">Procesar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
