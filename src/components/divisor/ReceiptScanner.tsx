import { useState, useRef } from 'react';
import { Camera, Image, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Product, Currency } from '@/lib/types';
import { generateId } from '@/lib/bill-utils';

interface Props {
  onProductsDetected: (products: Product[], currency?: Currency) => void;
}

export default function ReceiptScanner({ onProductsDetected }: Props) {
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const processImage = async (file: File) => {
    setIsScanning(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: { imageBase64: base64 },
      });

      if (error) throw error;

      if (data?.products && Array.isArray(data.products)) {
        const detectedCurrency: Currency = data.currency === 'BRL' ? 'BRL' : 'CLP';
        const products: Product[] = data.products.map((p: { name: string; price: number; quantity?: number }) => ({
          id: generateId(),
          name: p.name,
          price: detectedCurrency === 'CLP' ? Math.round(p.price) : Math.round(p.price * 100) / 100,
          quantity: p.quantity || 1,
        }));

        onProductsDetected(products, detectedCurrency);
        const flag = detectedCurrency === 'BRL' ? '🇧🇷' : '🇨🇱';
        toast.success(`${flag} ${products.length} productos detectados`, {
          description: `Moneda: ${detectedCurrency}${data.localType ? ` • Tipo: ${data.localType}` : ''}`,
        });
      } else {
        toast.error('No se pudieron detectar productos');
      }
    } catch (err) {
      console.error('Scan error:', err);
      const message = err instanceof Error ? err.message : 'Error al escanear la boleta';
      toast.error(message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    e.target.value = '';
  };

  return (
    <section className="rounded-2xl border-2 border-dashed border-primary/25 bg-card p-6 animate-fade-in-up">
      {isScanning ? (
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Analizando boleta con IA...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-foreground text-base mb-1">Escanear boleta</h2>
            <p className="text-xs text-muted-foreground">Sube una foto y la IA detectará los productos y la moneda 🇨🇱🇧🇷</p>
          </div>
          <div className="flex gap-3 w-full">
            <Button
              className="flex-1 gap-2 h-11 rounded-xl text-sm font-semibold"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="w-4 h-4" />
              Tomar foto
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2 h-11 rounded-xl text-sm font-semibold"
              onClick={() => fileInputRef.current?.click()}
            >
              <Image className="w-4 h-4" />
              Galería
            </Button>
          </div>
        </div>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </section>
  );
}
