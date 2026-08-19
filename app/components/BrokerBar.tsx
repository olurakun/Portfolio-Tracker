"use client";

import { brokerLabel, UNASSIGNED } from "../../lib/brokers";

/**
 * Aracı kurum kırılımı. Hem "hangi kurumda ne kadar var" sorusunu tek bakışta
 * cevaplıyor hem de tıklayınca portföyü o kuruma daraltıyor — böylece adet ve
 * maliyet o kurumun ekstresiyle karşılaştırılabiliyor.
 *
 * Tek bir kurum varsa hiç gösterilmiyor: kırılımı olmayan bir kırılım çubuğu
 * yer kaplamaktan başka bir şey yapmaz.
 */
export default function BrokerBar({
  totals, selected, onSelect, grandTotal,
}: {
  totals: { broker: string; value: number }[];
  selected: string | null;
  onSelect: (broker: string | null) => void;
  grandTotal: number;
}) {
  if (totals.length < 2) return null;

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm transition-colors border ${
      active
        ? 'bg-purple-600/20 border-purple-500 text-white'
        : 'bg-gray-900/40 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
    }`;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-3 mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500 uppercase tracking-wide mr-1">Aracı kurum</span>

      <button onClick={() => onSelect(null)} className={chip(selected === null)}>
        Hepsi
        <span className="text-xs text-gray-400 ml-2 tabular-nums">
          {grandTotal.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺
        </span>
      </button>

      {totals.map(({ broker, value }) => (
        <button
          key={broker || UNASSIGNED}
          onClick={() => onSelect(broker)}
          className={chip(selected === broker)}
        >
          <span className={broker ? '' : 'italic'}>{brokerLabel(broker)}</span>
          <span className="text-xs text-gray-400 ml-2 tabular-nums">
            {value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺
          </span>
          {grandTotal > 0 && (
            <span className="text-xs text-gray-500 ml-1.5 tabular-nums">
              %{((value / grandTotal) * 100).toFixed(0)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
