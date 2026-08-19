"use client";

import { REAL, REAL_LABEL, portfolioLabel } from "../../lib/portfolios";

/**
 * Gerçek portföy ile sanal senaryo arasında geçiş.
 *
 * Sanal kip GÖRSEL OLARAK ayrışmak zorunda: kullanıcı hangi portföye baktığını
 * karıştırırsa "kâr ettim" sanıp gerçekte etmemiş olur. Bu yüzden kesikli
 * çerçeve ve ayrı bir renk kullanılıyor — uygulamanın başka hiçbir yerinde
 * camgöbeği yok.
 */
export default function PortfolioSwitch({
  scenarios, active, onChange,
}: {
  scenarios: string[];
  active: string;
  onChange: (portfolio: string) => void;
}) {
  const options = [REAL, ...scenarios];

  return (
    <div className="inline-flex rounded-lg border border-gray-700 bg-gray-900/40 p-0.5">
      {options.map(option => {
        const isActive = option === active;
        const virtual = option !== REAL;
        return (
          <button
            key={option || REAL_LABEL}
            onClick={() => onChange(option)}
            aria-pressed={isActive}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              isActive
                ? virtual
                  ? 'bg-cyan-600/25 text-cyan-200 border border-dashed border-cyan-500'
                  : 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {portfolioLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
