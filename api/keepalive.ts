export async function GET(request: Request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase credentials' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Hacemos una petición simple a la API REST de Supabase para mantener el proyecto activo
    const response = await fetch(`${supabaseUrl}/rest/v1/?apikey=${supabaseKey}`, {
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const data = await response.json();

    return new Response(JSON.stringify({ status: 'ok', message: 'Supabase pinged successfully', data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to ping Supabase' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
