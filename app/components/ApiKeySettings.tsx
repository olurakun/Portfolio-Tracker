"use client";

import { useState, useSyncExternalStore } from "react";
import {
  readUserApiKey, readUserApiKeyServer, subscribeApiKey,
  saveUserApiKey, clearUserApiKey, maskApiKey, isApiKeyFormat,
} from "../../lib/apiKey";

/**
 * Kullanıcının kendi Anthropic anahtarını girdiği alan.
 * Anahtar bu tarayıcıda kalır; sunucuya yalnızca dönüştürme isteğiyle gider ve
 * hiçbir yere kaydedilmez. Bunun karşılığında localStorage'ın XSS'e karşı
 * korunaksız olduğunu kullanıcıdan saklamıyoruz — kendi parasını harcayan bir
 * kimlik bilgisi söz konusu.
 */
export default function ApiKeySettings({ forceOpen = false }: { forceOpen?: boolean }) {
  const saved = useSyncExternalStore(subscribeApiKey, readUserApiKey, readUserApiKeyServer);
  // Alanı kullanıcı mı açtı, yoksa sunucu anahtar bulamadığı için mi açıldı —
  // ikisi ayrı tutuluyor ki "vazgeç" dendiğinde tekrar açılmasın.
  const [userOpened, setUserOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  // forceOpen yeniden true olduğunda (ör. kaydedilen anahtar geçersiz çıktı)
  // önceki "vazgeç" kararı sıfırlanmalı, yoksa panel bir daha hiç açılmaz.
  // React'in önerdiği yol bu: efekt değil, render sırasında prop karşılaştırma.
  const [prevForceOpen, setPrevForceOpen] = useState(forceOpen);
  if (forceOpen !== prevForceOpen) {
    setPrevForceOpen(forceOpen);
    if (forceOpen) setDismissed(false);
  }

  const open = userOpened || (forceOpen && !dismissed);

  const close = () => { setUserOpened(false); setDismissed(true); setDraft(""); setError(""); };

  const save = () => {
    if (!isApiKeyFormat(draft)) {
      setError('Anahtar sk-ant- ile başlamalı. Konsoldan kopyaladığının tamamını yapıştır.');
      return;
    }
    if (!saveUserApiKey(draft)) {
      setError('Anahtar bu tarayıcıya kaydedilemedi (gizli sekme olabilir).');
      return;
    }
    close();
  };

  const remove = () => {
    clearUserApiKey();
    setDraft("");
    setError("");
  };

  if (saved && !open) {
    return (
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-gray-400">Kendi anahtarın:</span>
        <code className="text-gray-300 bg-gray-900/60 border border-gray-700 rounded px-1.5 py-0.5">
          {maskApiKey(saved)}
        </code>
        <button onClick={() => { setUserOpened(true); setDismissed(false); }} className="text-orange-400 underline hover:text-orange-300">değiştir</button>
        <button onClick={remove} className="text-gray-500 underline hover:text-gray-300">kaldır</button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => { setUserOpened(true); setDismissed(false); }} className="text-xs text-orange-400 underline hover:text-orange-300">
        Kendi Anthropic anahtarını kullan
      </button>
    );
  }

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded p-3 space-y-2">
      <div className="text-xs text-gray-300 font-bold">Anthropic API anahtarı</div>
      <p className="text-xs text-gray-400">
        Dönüştürme senin anahtarınla çalışır ve faturası senin hesabına gider.
        Anahtarı{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
          className="text-orange-400 underline hover:text-orange-300">Anthropic konsolundan</a>
        {' '}alabilirsin.
      </p>
      <input
        type="password"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setError(""); }}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        placeholder="sk-ant-..."
        autoComplete="off"
        spellCheck={false}
        className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-xs font-mono"
      />
      {error && <div className="text-xs text-red-400">{error}</div>}
      <p className="text-xs text-gray-500">
        Anahtar yalnızca bu tarayıcıda saklanır, sunucuya kaydedilmez. Ortak
        kullanılan bir bilgisayarda işin bitince <span className="text-gray-400">kaldır</span>.
      </p>
      <div className="flex gap-2">
        <button onClick={save} className="text-xs px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-700 font-bold">
          Kaydet
        </button>
        <button onClick={close}
          className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600">
          Vazgeç
        </button>
        {saved && (
          <button onClick={remove} className="text-xs px-3 py-1.5 rounded text-gray-400 hover:text-red-400 ml-auto">
            Kayıtlı anahtarı sil
          </button>
        )}
      </div>
    </div>
  );
}
