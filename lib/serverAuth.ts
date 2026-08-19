import { createClient } from '@supabase/supabase-js';

// API route'ları için oturum kontrolü. Arayüzdeki AuthGate yalnızca ekranı
// kapatıyor; route'lar doğrudan çağrılabildiği için kendi kontrollerini
// yapmak zorunda. Para harcayan uçlarda (dönüştürme) bu şart.
export async function userIdFromRequest(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    const client = createClient(url, anonKey);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
