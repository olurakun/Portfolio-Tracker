// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PortfolioTable, { type PortfolioRow } from './PortfolioTable';

afterEach(cleanup);

const row = (o: Partial<PortfolioRow> = {}): PortfolioRow => ({
  id: '1', symbol: 'THYAO', type: 'stock', totalQty: 100, currentPrice: 305.25, currentPriceUSD: 8.94,
  totalCost: 26294, value: 30525, valueUSD: 894, unrealizedPL: 4231, realizedPL: 0, unrealizedPLUSD: 124, realizedPLUSD: 0, ...o,
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

// Bileşen iki düzen birden render ediyor: dar ekranda kart listesi (md:hidden),
// geniş ekranda tablo (hidden md:block). Tarayıcıda hangisinin görüneceğini CSS
// belirliyor ve `display:none` olan erişilebilirlik ağacından da düşüyor — ama
// jsdom medya sorgusu uygulamadığı için İKİSİ de DOM'da. Bu yüzden sorgular
// hangi düzeni test ettiğini açıkça söylemeli.
const desktop = (c: HTMLElement) => within(c.querySelector('table') as HTMLElement);
const mobile = (c: HTMLElement) => within(c.querySelector('.md\\:hidden') as HTMLElement);

describe('PortfolioTable', () => {
  it('varlık tipini rozetle gösterir', () => {
    const { container } = setup({ openPositions: [row({ type: 'fund', symbol: 'TLY' })] });
    expect(desktop(container).getByText('Fon')).toBeInTheDocument();
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
    const { container } = setup();
    expect(desktop(container).getByText('TOPLAM')).toBeInTheDocument();
  });

  it('kapanmış pozisyonlar varsayılan olarak katlı durur', async () => {
    const onToggleClosed = vi.fn();
    const closed = [row({ id: '2', symbol: 'ASELS', totalQty: 0, realizedPL: -3204.5 })];
    const { container, rerender } = setup({ closedPositions: closed, onToggleClosed });

    expect(screen.queryByText('ASELS')).not.toBeInTheDocument();
    await userEvent.click(desktop(container).getByText(/Geçmiş pozisyonlar \(1\)/));
    expect(onToggleClosed).toHaveBeenCalled();

    rerender(<PortfolioTable {...defaults} closedPositions={closed} showClosed />);
    expect(desktop(container).getByText('ASELS')).toBeInTheDocument();
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

  // DAR EKRAN DÜZENİ. Tablo 375px'de değer ve K/Z'yi yatay kaydırmanın
  // arkasında bırakıyordu; portföye telefondan bakmanın asıl sebebi buydu.
  describe('dar ekran kart düzeni', () => {
    it('her pozisyon için değer ve anlık K/Z kartta görünür', () => {
      // İki pozisyon: tek pozisyonda kartın değeri ile TOPLAM aynı çıkıp
      // testin neyi doğruladığı belirsizleşiyor.
      const { container } = setup({
        openPositions: [row(), row({ id: '2', symbol: 'AAPL', value: 12000, unrealizedPL: -800 })],
        totals: { value: 42525, valueUSD: 1200, unrealizedPL: 3431, realizedPL: 0 },
      });
      const m = mobile(container);
      expect(m.getByText('THYAO')).toBeInTheDocument();
      expect(m.getByText('AAPL')).toBeInTheDocument();
      expect(m.getByText('30.525,00 ₺')).toBeInTheDocument();
      expect(m.getByText('+4.231,00 ₺')).toBeInTheDocument();
      // Zarar da kartta ve kırmızı görünmeli.
      expect(m.getByText('-800,00 ₺').className).toContain('text-red-400');
    });

    it('kartta da toplam gösterilir', () => {
      const { container } = setup();
      expect(mobile(container).getByText('TOPLAM')).toBeInTheDocument();
    });

    it('geçmiş tarih modunda kartta işlem butonu çıkmaz', () => {
      const { container } = setup({ isHistorical: true, asOfDate: '2026-03-14' });
      expect(mobile(container).queryByRole('button', { name: 'Al' })).not.toBeInTheDocument();
    });

    it('kart butonları işlem modalını doğru tiple açar', async () => {
      const onOpenTx = vi.fn();
      const { container } = setup({ onOpenTx });
      await userEvent.click(mobile(container).getByRole('button', { name: 'Sat' }));
      expect(onOpenTx).toHaveBeenCalledWith('1', 'sell');
    });
  });

  // Finansal bir tabloda yeşil/kırmızı YALNIZCA kâr/zarar demeli. Al/Sat
  // butonları da yeşil/kırmızıyken, kırmızı bir zarar rakamının yanında
  // kırmızı bir "Sat" butonu duruyordu.
  it('işlem butonları kâr/zarar renklerini kullanmaz', () => {
    const { container } = setup();
    for (const name of ['THYAO al', 'THYAO sat']) {
      const cls = screen.getByTitle(name).className;
      expect(cls).not.toMatch(/text-(green|red)-400/);
    }
  });

  it('adet ve fiyat sütunları sağa yaslı ve tabular-nums', () => {
    const { container } = setup();
    const qty = within(container).getByText('100');
    expect(qty.className).toContain('text-right');
    expect(qty.className).toContain('tabular-nums');
  });

  // Kullanıcı isteği: tabloda mutlak K/Z vardı ama maliyete göre kâr YÜZDESİ
  // yoktu — SummaryBar'daki "maliyete göre +%X" ile aynı anlam, pozisyon
  // bazında. totalCost 26294, unrealizedPL 4231 -> %16,1.
  it('anlık K/Z yanında maliyete göre kâr yüzdesi gösterir (masaüstü)', () => {
    const { container } = setup();
    expect(desktop(container).getByText('+%16,1')).toBeTruthy();
  });

  it('anlık K/Z yanında maliyete göre kâr yüzdesi gösterir (mobil)', () => {
    const { container } = setup();
    expect(mobile(container).getByText('+%16,1')).toBeTruthy();
  });

  // SummaryBar'daki kuralla aynı: kayıpta eksi işareti YOK, kayıp yalnızca
  // kırmızı renkle anlatılıyor (+%16,1 kazanç / %16,1 kayıp).
  it('zarardaki pozisyonda yüzde kırmızı gösterilir', () => {
    const { container } = setup({ openPositions: [row({ totalCost: 26294, unrealizedPL: -4231 })] });
    const pct = desktop(container).getByText('%16,1');
    expect(pct.className).toContain('text-red-400');
  });

  // Maliyet 0 ya da negatifse (ör. tamamı temettüyle karşılanmış pozisyon)
  // yüzde anlamsız — hiç basılmamalı, "%Infinity" ya da yanıltıcı bir
  // sayı görünmemeli.
  it('maliyet 0 ise yüzde hiç basılmaz', () => {
    const { container } = setup({ openPositions: [row({ totalCost: 0, unrealizedPL: 500 })] });
    expect(desktop(container).queryByText(/^[+-]%/)).toBeNull();
  });
});
