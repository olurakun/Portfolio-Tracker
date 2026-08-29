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

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Supabase'in kurtarma e-postasındaki linke tıklanınca PASSWORD_RECOVERY
  // olayı ateşleniyor ve GEÇİCİ bir oturum açılıyor (session dolu oluyor) —
  // bu bayrak olmasa AuthGate normal giriş yapılmış sanıp doğrudan
  // portföyü gösterirdi, kullanıcı yeni şifre belirleme fırsatı bulamazdı.
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    if (mode === 'forgot') {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (err) setError(err.message);
      else setNotice("E-postana bir kurtarma bağlantısı gönderildi. Gelen linke tıklayıp yeni şifreni belirle.");
      setBusy(false);
      return;
    }

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

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) setError(err.message);
    else setRecovering(false);
    setBusy(false);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-500">
        Yükleniyor…
      </div>
    );
  }

  // Kurtarma linkiyle gelindiyse session DOLU ama bu normal bir giriş değil —
  // asıl portföyü göstermeden önce yeni şifre alınmalı.
  if (recovering) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6 font-sans">
        <form onSubmit={submitNewPassword} className="bg-gray-800 border border-gray-700 rounded-xl p-8 w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Yeni şifre belirle</h1>
            <p className="text-sm text-gray-400 mt-1">Kurtarma bağlantısı doğrulandı.</p>
          </div>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Yeni parola"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className="w-full p-2 rounded bg-gray-700 border border-gray-600"
            required
            autoFocus
          />
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-bold disabled:opacity-50"
          >
            {busy ? 'Bekleyin…' : 'Şifreyi güncelle'}
          </button>
        </form>
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
              {mode === 'signin' ? 'Portföyünü görmek için giriş yap.'
                : mode === 'signup' ? 'Yeni bir hesap oluştur.'
                : 'Şifreni sıfırlamak için e-postanı gir.'}
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
            {mode !== 'forgot' && (
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
            )}
          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}
          {notice && <div className="text-sm text-green-400">{notice}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-bold disabled:opacity-50"
          >
            {busy ? 'Bekleyin…' : mode === 'signin' ? 'Giriş yap' : mode === 'signup' ? 'Hesap oluştur' : 'Kurtarma bağlantısı gönder'}
          </button>

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(""); setNotice(""); }}
              className="w-full text-xs text-gray-500 hover:text-white underline"
            >
              Şifremi unuttum
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setMode(m => m === 'signin' ? 'signup' : 'signin');
              setError(""); setNotice("");
            }}
            className="w-full text-xs text-gray-400 hover:text-white underline"
          >
            {mode === 'signup' ? 'Zaten hesabın var mı? Giriş yap'
              : mode === 'forgot' ? 'Girişe dön'
              : 'Hesabın yok mu? Oluştur'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children(session)}</>;
}
