"use client";

/**
 * Veri kaynağı künyesi.
 *
 * Hiçbiri atıf zorunlu tutmuyor (zorunlu tutan ExchangeRate-API kaldırıldı,
 * yerini Frankfurter aldı — bkz. lib/fx.ts). Yine de duruyor: finansal bir
 * uygulamada rakamların nereden geldiğini söylemek doğru olan, ayrıca
 * ticarileşmeden önce hangi kaynağın değişmesi gerektiğini görünür tutuyor.
 */
export default function DataSources() {
  return (
    <footer className="mt-12 pt-4 border-t border-gray-800 text-xs text-gray-600">
      <span className="text-gray-500">Veri kaynakları:</span>{' '}
      <a
        href="https://frankfurter.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-gray-400 underline decoration-gray-700"
      >Frankfurter</a>
      <span className="text-gray-700"> (AMB kurları)</span>
      {' · '}
      <a
        href="https://www.tefas.gov.tr"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-gray-400 underline decoration-gray-700"
      >TEFAS</a>
      <span className="text-gray-700"> (fon fiyatları)</span>
      {' · '}
      <a
        href="https://finance.yahoo.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-gray-400 underline decoration-gray-700"
      >Yahoo Finance</a>
      <span className="text-gray-700"> (hisse ve maden)</span>
      {' · '}
      {/* CoinGecko atfı ZORUNLU (api_terms) — kaldırılmamalı. */}
      <a
        href="https://www.coingecko.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-gray-400 underline decoration-gray-700"
      >CoinGecko</a>
      <span className="text-gray-700"> (kripto)</span>
    </footer>
  );
}
