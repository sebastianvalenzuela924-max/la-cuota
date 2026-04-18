import { useState, useEffect } from 'react';
import { CreditCard, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { BankData } from '@/lib/types';
import { parseBankText } from '@/lib/bill-utils';

interface Props {
  bankData: Partial<BankData>;
  onBankDataChange: (data: Partial<BankData>) => void;
}

export default function BankSection({ bankData, onBankDataChange }: Props) {
  const [rawText, setRawText] = useState('');

  // Sincronizar texto local si cambian los datos (ej. otro usuario los pega)
  useEffect(() => {
    if (bankData && Object.keys(bankData).length > 0) {
      // Solo actualizamos si el texto actual está vacío o es significativamente diferente de un resumen de bankData
      // Para simplificar, si hay datos y el área está vacía, mostramos un resumen
      if (!rawText) {
        const summary = [
          bankData.name,
          bankData.rut,
          bankData.bank,
          bankData.accountType,
          bankData.accountNumber,
          bankData.email
        ].filter(Boolean).join('\n');
        setRawText(summary);
      }
    }
  }, [bankData]);

  const updateData = (text: string) => {
    setRawText(text);
    const data = parseBankText(text);
    onBankDataChange(data);
  };

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      updateData(text);
    } catch {
      // Clipboard API not available
    }
  };

  const hasData = !!(bankData.name || bankData.bank || bankData.rut || bankData.accountNumber || bankData.email || bankData.accountType);

  return (
    <section className="rounded-2xl bg-card p-5 card-shadow animate-fade-in-up border border-border">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <CreditCard className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-bold text-foreground">Datos de transferencia</h2>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder={`Pega aquí los datos bancarios o escríbelos. Ejemplo:\nJuan Perez\n12.345.678-9\nCuenta RUT`}
            value={rawText}
            onChange={e => updateData(e.target.value)}
            className="text-sm min-h-[100px] rounded-xl bg-accent/30 border-dashed border-2 border-primary/20 focus-visible:border-solid transition-all"
          />
          <Button variant="outline" size="sm" onClick={handleClipboardPaste} className="text-xs gap-1.5 rounded-xl font-semibold w-full">
            <ClipboardPaste className="w-3.5 h-3.5" />
            Pegar del portapapeles
          </Button>
        </div>

        {hasData && (
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2.5 animate-scale-in">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Datos detectados</span>
              <span className="text-[10px] font-medium text-muted-foreground italic">Aparecerán en el resumen</span>
            </div>
            
            <div className="grid grid-cols-1 gap-1.5 text-xs">
              {bankData.name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nombre:</span>
                  <span className="font-semibold text-foreground text-right">{bankData.name}</span>
                </div>
              )}
              {bankData.rut && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RUT:</span>
                  <span className="font-semibold text-foreground text-right">{bankData.rut}</span>
                </div>
              )}
              {bankData.bank && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Banco:</span>
                  <span className="font-semibold text-foreground text-right">{bankData.bank}</span>
                </div>
              )}
              {bankData.accountType && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo:</span>
                  <span className="font-semibold text-foreground text-right">{bankData.accountType}</span>
                </div>
              )}
              {bankData.accountNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cuenta:</span>
                  <span className="font-semibold text-foreground text-right">{bankData.accountNumber}</span>
                </div>
              )}
              {bankData.email && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Correo:</span>
                  <span className="font-semibold text-foreground text-right text-balance max-w-[150px]">{bankData.email}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
