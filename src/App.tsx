import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Session from "./pages/Session";
import QuickAdd from "./pages/QuickAdd";
import NotFound from "./pages/NotFound";
import { SaldamosAuthProvider } from "./contexts/SaldamosAuthContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SaldamosAuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/session/:sessionId" element={<Session />} />
            <Route path="/quick-add" element={<QuickAdd />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </SaldamosAuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
