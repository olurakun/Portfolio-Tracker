// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PortfolioTable, { type PortfolioRow } from './PortfolioTable';

afterEach(cleanup);

const row = (o: Partial<PortfolioRow> = {}): PortfolioRow => ({
  id: '1', symbol: 'THYAO', type: 'stock', totalQty: 100, currentPrice: 305.25, currentPriceUSD: 8.94,
  value: 30525, valueUSD: 894, unrealizedPL: 4231, realizedPL: 0, unrealizedPLUSD: 124, realizedPLUSD: 0, ...o,
});

const defaults = {
  openPositions: [row()],
  closedPositions: [] as PortfolioRow[],
  totals: { value: 30525, valueUSD: 894, unrealizedPL: 4231, realizedPL: 0 },
  isHistorical: false,
  asOfDate: '',
  loading: false,
  sortKey: 'value' as const,
  sortDir: 'desc' as const,
  onSort: () => {},
  editingPriceIds: new Set<string>(),
  onToggleEditPrice: () => {},
  onPriceChange: () => {},
  onOpenTx: () => {},
  showClosed: false,
  onToggleClosed: () => {},
  onRefresh: () => {},
};

const setup = (props: Partial<typeof defaults> = {}) =>
  render(<PortfolioTable {...defaults} {...props} />);

describe('PortfolioTable', () => {
  it('varlık tipini rozetle gösterir', () => {
    setup({ openPositions: [row({ type: 'fund', symbol: 'TLY' })] });
    expect(screen.getByText('Fon')).toBeInTheDocument();
  });

  // Geçmiş bir tarihe bakarken işlem girmek anlamsız: o günün fiyatı da elle
  // düzenlenemez, yoksa kullanıcı geçmişi değiştirdiğini sanır.
  it('geçmiş tarih modunda Al/Sat ve fiyat düzenleme gizlenir', () => {
    setup({ isHistorical: true, asOfDate: '2026-03-14' });
    expect(screen.queryByTitle('THYAO al')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Elle düzenle')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /O Günkü Fiyat/ })).toBeInTheDocument();
  });

  it('bugünkü görünümde Al/Sat/Temettü görünür', () => {
    setup();
    expect(screen.getByTitle('THYAO al')).toBeInTheDocument();
    expect(screen.getByTitle('THYAO sat')).toBeInTheDocument();
    expect(screen.getByTitle('THYAO temettü gir')).toBeInTheDocument();
  });

  // Fiyatlar gelmeden sıfır göstermek yanlış bilgi vermek olur.
  it('yüklenirken sıfır değil iskelet gösterir', () => {
    const { container } = setup({ openPositions: [], totals: { value: 0, valueUSD: 0, unrealizedPL: 0, realizedPL: 0 }, loading: true });
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('TOPLAM')).not.toBeInTheDocument();
    expect(screen.queryByText(/açık pozisyon yok/)).not.toBeInTheDocument();
  });

  it('boş portföyde yönlendirici mesaj gösterir, toplam satırı göstermez', () => {
    setup({ openPositions: [], totals: { value: 0, valueUSD: 0, unrealizedPL: 0, realizedPL: 0 } });
    expect(screen.getByText(/Henüz açık pozisyon yok/)).toBeInTheDocument();
    // Hiç pozisyon yokken "%100" yazan bir toplam satırı gürültüden ibaret.
    expect(screen.queryByText('TOPLAM')).not.toBeInTheDocument();
  });

  it('pozisyon varken toplam satırını gösterir', () => {
    setup();
    expect(screen.getByText('TOPLAM')).toBeInTheDocument();
  });

  it('kapanmış pozisyonlar varsayılan olarak katlı durur', async () => {
    const onToggleClosed = vi.fn();
    const closed = [row({ id: '2', symbol: 'ASELS', totalQty: 0, realizedPL: -3204.5 })];
    const { rerender } = setup({ closedPositions: closed, onToggleClosed });

    expect(screen.queryByText('ASELS')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText(/Geçmiş pozisyonlar \(1\)/));
    expect(onToggleClosed).toHaveBeenCalled();

    rerender(<PortfolioTable {...defaults} closedPositions={closed} showClosed />);
    expect(screen.getByText('ASELS')).toBeInTheDocument();
  });

  it('sütun başlığına tıklayınca sıralama isteği gönderir', async () => {
    const onSort = vi.fn();
    setup({ onSort });
    await userEvent.click(screen.getByRole('button', { name: /Sembol/ }));
    expect(onSort).toHaveBeenCalledWith('symbol');
  });

  // Kâr yeşil, zarar kırmızı — bu tablodaki tek renk kodlu bilgi.
  it('zararı kırmızı, kârı yeşil gösterir', () => {
    setup({ openPositions: [row({ unrealizedPL: -500, realizedPL: 1200 })] });
    const cells = screen.getAllByText(/₺/).map(el => el.className);
    expect(cells.some(c => c.includes('text-red-400'))).toBe(true);
    expect(cells.some(c => c.includes('text-green-400'))).toBe(true);
  });

  it('yenile butonu yüklenirken kapalıdır', () => {
    setup({ loading: true });
    expect(screen.getByRole('button', { name: 'Fiyatları yenile' })).toBeDisabled();
  });

  it('adet ve fiyat sütunları sağa yaslı ve tabular-nums', () => {
    const { container } = setup();
    const qty = within(container).getByText('100');
    expect(qty.className).toContain('text-right');
    expect(qty.className).toContain('tabular-nums');
  });
});
