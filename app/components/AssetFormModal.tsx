"use client";

import AssetPicker, { type AssetChoice } from "./AssetPicker";

/**
 * Yeni varlık ekleme — eskiden sol kolonda kalıcı bir formdu.
 *
 * Modala taşındı çünkü nadiren kullanılan bir işlem, tablonun genişliğinden
 * kalıcı olarak çeyrek pay alıyordu; dar ekranda ise portföye inmeden önce
 * geçilmesi gereken ~300px'lik bir blok oluşturuyordu.
 */
export default function AssetFormModal({
  open, onClose, value, onChange, onSubmit, busy,
}: {
  open: boolean;
  onClose: () => void;
  value: AssetChoice;
  onChange: (next: AssetChoice) => void;
  onSubmit: () => void;
  busy?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg">Yeni Varlık Ekle</h2>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <AssetPicker value={value} onChange={onChange} autoFocus />

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded bg-gray-700 hover:bg-gray-600">İptal</button>
          <button type="submit" disabled={busy || !value.symbol.trim()}
            className="flex-1 py-2 rounded bg-purple-600 hover:bg-purple-700 font-bold disabled:opacity-50">
            Ekle
          </button>
        </div>
      </form>
    </div>
  );
}
