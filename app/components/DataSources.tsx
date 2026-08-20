"use client";

/**
 * Veri kaynağı künyesi.
 *
 * Sadece nezaket değil: ExchangeRate-API'nin ücretsiz katmanı ATIF ZORUNLU
 * tutuyor ("Attribution Required"), istenen bağlantı metni de sabit —
 * "Rates By Exchange Rate API". Bu satır kaldırılırsa o servisin kullanım
 * şartları ihlal edilmiş olur, bu yüzden testi var
 * (app/components/DataSources.test.tsx).
 *
 * Diğerleri atıf zorunlu tutmuyor ama finansal bir uygulamada rakamların
 * nereden geldiğini söylemek doğru olan.
 */
export default function DataSources() {
  return (
    <footer className="mt-12 pt-4 border-t border-gray-800 text-xs text-gray-600">
      <span className="text-gray-500">Veri kaynakları:</span>{' '}
      <a
        href="https://www.exchangerate-api.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-gray-400 underline decoration-gray-700"
      >Rates By Exchange Rate API</a>
      {' · '}
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
    </footer>
  );
}
