import { useState } from 'react';
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
  const [parsed, setParsed] = useState(false);

  const handlePaste = () => {
    const data = parseBankText(rawText);
    onBankDataChange(data);
    setParsed(true);
  };

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRawText(text);
      const data = parseBankText(text);
      onBankDataChange(data);
      setParsed(true);
    } catch {
      // Clipboard API not available
    }
  };

  const hasData = bankData.name || bankData.bank || bankData.rut;

  return (
    <section className="rounded-2xl bg-card p-5 card-shadow animate-fade-in-up border border-border">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <CreditCard className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-bold text-foreground">Datos de transferencia</h2>
      </div>

      {!parsed && (
        <>
          <Textarea
            placeholder={`Pega aquí los datos bancarios, ejemplo:\nNombre: Juan Pérez\nBanco: Banco de Chile\nTipo de cuenta: Corriente\nNúmero: 12345678\nRUT: 12.345.678-9\nCorreo: juan@email.com`}
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            className="text-sm mb-3 min-h-[100px] rounded-xl"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePaste} disabled={!rawText.trim()} className="text-xs rounded-xl font-semibold">
              Procesar texto
            </Button>
            <Button variant="outline" size="sm" onClick={handleClipboardPaste} className="text-xs gap-1.5 rounded-xl font-semibold">
              <ClipboardPaste className="w-3.5 h-3.5" />
              Pegar del portapapeles
            </Button>
          </div>
        </>
      )}

      {hasData && parsed && (
        <div className="space-y-2 text-sm">
          {bankData.name && <div className="flex justify-between"><span className="text-muted-foreground">Nombre:</span><span className="font-semibold text-foreground">{bankData.name}</span></div>}
          {bankData.bank && <div className="flex justify-between"><span className="text-muted-foreground">Banco:</span><span className="font-semibold text-foreground">{bankData.bank}</span></div>}
          {bankData.accountType && <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span className="font-semibold text-foreground">{bankData.accountType}</span></div>}
          {bankData.accountNumber && <div className="flex justify-between"><span className="text-muted-foreground">Cuenta:</span><span className="font-semibold text-foreground">{bankData.accountNumber}</span></div>}
          {bankData.rut && <div className="flex justify-between"><span className="text-muted-foreground">RUT:</span><span className="font-semibold text-foreground">{bankData.rut}</span></div>}
          {bankData.email && <div className="flex justify-between"><span className="text-muted-foreground">Correo:</span><span className="font-semibold text-foreground">{bankData.email}</span></div>}
          <Button variant="ghost" size="sm" onClick={() => setParsed(false)} className="text-xs mt-2 text-muted-foreground font-medium">
            Editar datos
          </Button>
        </div>
      )}
    </section>
  );
}
