import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en leer boletas, tickets y cupones fiscales de Chile y Brasil. Analiza la imagen y extrae TODOS los productos con sus precios.

INSTRUCCIONES:
- Primero DETECTA LA MONEDA: si es una boleta chilena los precios son en CLP (pesos chilenos, números enteros). Si es un cupom fiscal o nota fiscal brasileña, los precios son en BRL (reales brasileños, con centavos usando coma como separador decimal).
- Detecta cada producto/item con su nombre y precio unitario.
- Si hay cantidades como "2x", "x2", "2 un", detecta la cantidad.
- Corrige errores comunes del OCR (letras confundidas, números mal leídos).
- Agrupa productos repetidos sumando cantidades.
- Para CLP: precios son números enteros sin decimales. Si un precio tiene punto como separador de miles (ej: 12.350), interpreta como 12350.
- Para BRL: precios usan coma para decimales (ej: 12,50 = 12.50). Convierte a número con punto decimal en el JSON.

Responde SOLO con un JSON válido con esta estructura exacta:
{
  "currency": "CLP" | "BRL",
  "products": [
    { "name": "Nombre del producto", "price": 1234, "quantity": 1 }
  ],
  "subtotal": 12345,
  "total": 12345,
  "localType": "restaurant" | "supermercado" | "bar" | "delivery" | "otro"
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
                },
              },
              {
                type: 'text',
                text: 'Analiza esta boleta y detecta la moneda (CLP o BRL). Extrae todos los productos con precios. Responde SOLO con JSON válido.',
              },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Límite de solicitudes excedido, intenta de nuevo en unos segundos.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos de IA agotados.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await response.text();
      console.error('AI gateway error:', response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Ensure currency field exists
    if (!parsed.currency || !['CLP', 'BRL'].includes(parsed.currency)) {
      parsed.currency = 'CLP';
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('OCR error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Error procesando la boleta' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
