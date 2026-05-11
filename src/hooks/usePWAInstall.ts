import { useState, useEffect } from 'react';
import { toast } from 'sonner';

declare global {
  interface Window {
    deferredPrompt?: any;
  }
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Si ya cargó la variable global
    if (window.deferredPrompt) {
      setInstallPrompt(window.deferredPrompt);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      window.deferredPrompt = e;
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      window.deferredPrompt = null;
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Revisar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (installPrompt) {
      // Mostrar el prompt nativo de Android/Chrome
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstallPrompt(null);
        window.deferredPrompt = null;
      }
    } else {
      // Fallback para iOS o navegadores sin soporte nativo
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      
      if (isIOS) {
        toast('Para instalar en iPhone/iPad:', {
          description: 'Toca Compartir (cuadrado con flecha) y luego "Añadir a la pantalla de inicio".',
          duration: 6000,
        });
      } else {
        toast('Para instalar la app:', {
          description: 'Abre el menú de tu navegador y selecciona "Instalar aplicación" o "Añadir a la pantalla de inicio".',
          duration: 6000,
        });
      }
    }
  };

  // Mostrar el botón SIEMPRE que no esté ya instalada, independientemente del soporte nativo
  return { 
    canInstall: !isInstalled, 
    install, 
    isInstalled 
  };
}
