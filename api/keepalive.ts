export async function GET(request: Request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  const saldamosUrl = process.env.VITE_SALDAMOS_SUPABASE_URL;
  const saldamosKey = process.env.VITE_SALDAMOS_SUPABASE_KEY;

  const results: any = {};
  let overallSuccess = true;

  // 1. Ping primary Supabase (scanning / general)
  if (supabaseUrl && supabaseKey) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/?apikey=${supabaseKey}`, {
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
        },
      });
      const data = await response.json().catch(() => ({}));
      results.primary = { status: 'ok', responseCode: response.status };
    } catch (error: any) {
      results.primary = { status: 'error', error: error.message };
      overallSuccess = false;
    }
  } else {
    results.primary = { status: 'skipped', reason: 'Missing credentials' };
  }

  // 2. Ping Saldamos2 Supabase (groups, balances, auth)
  if (saldamosUrl && saldamosKey) {
    try {
      const response = await fetch(`${saldamosUrl}/rest/v1/?apikey=${saldamosKey}`, {
        headers: {
          Authorization: `Bearer ${saldamosKey}`,
        },
      });
      const data = await response.json().catch(() => ({}));
      results.saldamos2 = { status: 'ok', responseCode: response.status };
    } catch (error: any) {
      results.saldamos2 = { status: 'error', error: error.message };
      overallSuccess = false;
    }
  } else {
    results.saldamos2 = { status: 'skipped', reason: 'Missing credentials' };
  }

  return new Response(JSON.stringify({ 
    status: overallSuccess ? 'ok' : 'partial_error', 
    message: 'Supabase keepalive ping routine executed', 
    results 
  }), {
    status: overallSuccess ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
