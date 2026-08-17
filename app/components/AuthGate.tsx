"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

// Oturum kapısı: giriş yapılmadan portföy verisine erişilemez.
// Asıl koruma burada değil veritabanındaki RLS politikalarında — bu katman
// sadece arayüz tarafı. Politikalar olmadan bu ekranı atlayan biri veriye
// yine ulaşabilirdi.
export default function AuthGate({ children }: { children: (session: Session) => React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    const fn = mode === 'signin'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });

    const { data, error: err } = await fn;

    if (err) {
      setError(err.message);
    } else if (mode === 'signup' && !data.session) {
      // E-posta doğrulaması açıksa oturum hemen açılmaz.
      setNotice("Hesap oluşturuldu. E-postana gelen doğrulama bağlantısına tıkla, sonra giriş yap.");
      setMode('signin');
    }
    setBusy(false);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-500">
        Yükleniyor…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6 font-sans">
        <form onSubmit={submit} className="bg-gray-800 border border-gray-700 rounded-xl p-8 w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Portföy Takip</h1>
            <p className="text-sm text-gray-400 mt-1">
              {mode === 'signin' ? 'Portföyünü görmek için giriş yap.' : 'Yeni bir hesap oluştur.'}
            </p>
          </div>

          <div className="space-y-2">
            <input
              type="email"
              autoComplete="email"
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 border border-gray-600"
              required
            />
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder="Parola"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              className="w-full p-2 rounded bg-gray-700 border border-gray-600"
              required
            />
          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}
          {notice && <div className="text-sm text-green-400">{notice}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-bold disabled:opacity-50"
          >
            {busy ? 'Bekleyin…' : mode === 'signin' ? 'Giriş yap' : 'Hesap oluştur'}
          </button>

          <button
            type="button"
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(""); setNotice(""); }}
            className="w-full text-xs text-gray-400 hover:text-white underline"
          >
            {mode === 'signin' ? 'Hesabın yok mu? Oluştur' : 'Zaten hesabın var mı? Giriş yap'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children(session)}</>;
}
