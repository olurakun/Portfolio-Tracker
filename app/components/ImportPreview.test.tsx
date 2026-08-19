// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportPreview, { type ImportMeta } from './ImportPreview';
import type { ParsedRow } from '../../lib/importParse';

afterEach(cleanup);

const row = (o: Partial<ParsedRow> = {}): ParsedRow => ({
  row: 2, symbol: 'THYAO', type: 'buy', quantity: 100, price: 305.25,
  date: '2026-06-15', currency: 'TRY', broker: '', ...o,
});

const defaults = {
  rows: [row(), row({ row: 3, symbol: 'AAPL' }), row({ row: 4, symbol: 'TLY' })],
  duplicateFlags: [false, false, false],
  dupePolicy: 'skip' as const,
  onDupePolicyChange: () => {},
  meta: null as ImportMeta | null,
  negatives: [] as { symbol: string; net: number }[],
  newSymbolChoices: {} as Record<string, 'create' | 'skip'>,
  onNewSymbolChoice: () => {},
  newSymbolTypes: {} as Record<string, string>,
  onNewSymbolType: () => {},
  currencies: {} as Record<string, string>,
  onCurrencyChange: () => {},
  knownBrokers: ['Midas', 'Yapı Kredi'],
  brokerOverride: null as string | null,
  onBrokerOverrideChange: () => {},
  busy: false,
  onCancel: () => {},
  onConfirm: () => {},
};

const setup = (props: Partial<typeof defaults> = {}) =>
  render(<ImportPreview {...defaults} {...props} />);

const confirmButton = () => screen.getByRole('button', { name: /aktar|Aktarılıyor/ });

describe('ImportPreview', () => {
  it('aktarılacak satır sayısını butonda yazar', () => {
    setup();
    expect(confirmButton()).toHaveTextContent('3 işlemi aktar');
  });

  // Yinelenen işlemler maliyeti sessizce bozduğu için varsayılan davranış
  // atlamak olmalı — kullanıcı istemeden ikinci kez eklenmemeli.
  it('yinelenen satırları varsayılan olarak atlar', () => {
    setup({ duplicateFlags: [true, false, true] });
    expect(screen.getByText(/1 satır aktarılacak/)).toBeInTheDocument();
    expect(screen.getByText(/2 yinelenen \(atlanacak\)/)).toBeInTheDocument();
    expect(confirmButton()).toHaveTextContent('1 işlemi aktar');
    expect(screen.getAllByText('Yinelenen')).toHaveLength(2);
  });

  it('kullanıcı isterse yinelenenleri de aktarabilir', async () => {
    const onDupePolicyChange = vi.fn();
    const { rerender } = setup({ duplicateFlags: [true, false, true], onDupePolicyChange });

    await userEvent.click(screen.getByRole('checkbox'));
    expect(onDupePolicyChange).toHaveBeenCalledWith('include');

    rerender(<ImportPreview {...defaults} duplicateFlags={[true, false, true]} dupePolicy="include" />);
    expect(confirmButton()).toHaveTextContent('3 işlemi aktar');
    expect(screen.queryByText(/yinelenen \(atlanacak\)/)).not.toBeInTheDocument();
  });

  it('yinelenen yoksa uyarı bloğu hiç çıkmaz', () => {
    setup();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/portföyünde zaten var/)).not.toBeInTheDocument();
  });

  it('hatalı satırları sayar ve aktarmaz', () => {
    setup({ rows: [row(), row({ row: 3, error: 'tarih okunamadı' })], duplicateFlags: [false, false] });
    expect(screen.getByText(/1 hatalı \(atlanacak\)/)).toBeInTheDocument();
    expect(confirmButton()).toHaveTextContent('1 işlemi aktar');
    expect(screen.getByText('tarih okunamadı')).toBeInTheDocument();
  });

  it('aktarılacak satır kalmadıysa onay butonu kapalıdır', () => {
    setup({ rows: [row({ error: 'tarih okunamadı' })], duplicateFlags: [false] });
    expect(confirmButton()).toBeDisabled();
  });

  // Bir dönüştürücünün en tehlikeli hatası satır atlamaktır; kullanıcı bunu
  // onaydan ÖNCE görmeli.
  it('çevrilen dosyada sayılar tutmuyorsa uyarır', () => {
    setup({ meta: { skipped: [], sourceTransactionCount: 5 } });
    const warning = screen.getByText(/Dosyada 5 işlem sayıldı, 3 satır çıkarıldı/);
    expect(warning).toHaveTextContent('sayılar tutmuyor');
    expect(warning.className).toContain('text-amber-400');
  });

  it('sayılar tutuyorsa uyarı rengine geçmez', () => {
    setup({ meta: { skipped: [], sourceTransactionCount: 3 } });
    const line = screen.getByText(/Dosyada 3 işlem sayıldı/);
    expect(line).not.toHaveTextContent('sayılar tutmuyor');
    expect(line.className).toContain('text-gray-400');
  });

  it('çevirmede atlanan hareketleri sebebiyle listeler', async () => {
    setup({ meta: { skipped: ['16.06.2026 ASELS alım — emir iptal edilmiş'], sourceTransactionCount: 3 } });
    await userEvent.click(screen.getByText('1 hareket atlandı'));
    expect(screen.getByText(/emir iptal edilmiş/)).toBeInTheDocument();
  });

  it('dosya doğrudan okunduysa çeviri bloğu çıkmaz', () => {
    setup();
    expect(screen.queryByText(/dosyadan çevrildi/)).not.toBeInTheDocument();
  });

  // Dosyada geçmiş alımlar eksikse maliyet yanlış hesaplanır; uyarı çıkar ama
  // kullanıcı yine de devam edebilir.
  it('eksik geçmiş alım uyarısı verir ama aktarmayı engellemez', () => {
    setup({ negatives: [{ symbol: 'ASELS', net: -120 }] });
    expect(screen.getByText(/geçmiş alımlar eksik görünüyor/)).toBeInTheDocument();
    expect(screen.getByText(/-120 adet açık/)).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it('para birimi değişikliğini yukarı bildirir', async () => {
    const onCurrencyChange = vi.fn();
    setup({ currencies: { THYAO: 'TRY' }, onCurrencyChange });
    await userEvent.selectOptions(screen.getByLabelText('THYAO para birimi'), 'USD');
    expect(onCurrencyChange).toHaveBeenCalledWith('THYAO', 'USD');
  });

  it('portföyde olmayan sembol için karar sorar', async () => {
    const onNewSymbolChoice = vi.fn();
    setup({ newSymbolChoices: { TLY: 'create' }, newSymbolTypes: { TLY: 'fund' }, onNewSymbolChoice });
    expect(screen.getByText(/Portföyünde olmayan semboller/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('TLY için karar'), 'skip');
    expect(onNewSymbolChoice).toHaveBeenCalledWith('TLY', 'skip');
  });

  it('aktarılırken onay butonu kapalı ve durumu yazıyor', () => {
    setup({ busy: true });
    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toHaveTextContent('Aktarılıyor');
  });
});

describe('ImportPreview — aracı kurum', () => {
  const withBroker = [row({ broker: 'Midas' }), row({ row: 3, broker: 'Midas' })];

  // Ekstre genelde tek bir kuruma ait; dosyada yoksa tek seferde atanabilmeli.
  it('dosyada kurum yoksa uyarı rengiyle seçim ister', () => {
    const { container } = setup({ rows: [row()], duplicateFlags: [false] });
    expect(screen.getByText(/tüm satırlara birden atayabilirsin/)).toBeInTheDocument();
    expect(container.querySelector('.border-amber-700\\/50')).toBeTruthy();
  });

  it('kurum seçilince uyarı kalkar', () => {
    const { container } = setup({ rows: [row()], duplicateFlags: [false], brokerOverride: 'Midas' });
    expect(container.querySelector('.border-amber-700\\/50')).toBeFalsy();
  });

  it('dosyadaki kurumları satırlarda gösterir', () => {
    setup({ rows: withBroker, duplicateFlags: [false, false] });
    expect(screen.getAllByText('Midas').length).toBeGreaterThan(0);
  });

  it('dosyada kurum varsa "dosyadaki değerler" seçeneği çıkar', () => {
    setup({ rows: withBroker, duplicateFlags: [false, false] });
    expect(screen.getByRole('option', { name: 'Dosyadaki değerler' })).toBeInTheDocument();
  });

  it('dosyada kurum yoksa "dosyadaki değerler" seçeneği çıkmaz', () => {
    setup({ rows: [row()], duplicateFlags: [false] });
    expect(screen.queryByRole('option', { name: 'Dosyadaki değerler' })).not.toBeInTheDocument();
  });

  // Seçim yapılınca dosyadaki değerler değil, seçilen kurum geçerli olmalı.
  // Kontrol SATIRLARDA yapılıyor; "Midas" açılır listede seçenek olarak
  // durmaya devam eder, orada olması doğru.
  it('seçilen kurum dosyadaki değerlerin yerine geçer', () => {
    setup({ rows: withBroker, duplicateFlags: [false, false], brokerOverride: 'Yapı Kredi' });
    const body = screen.getAllByRole('rowgroup')[1];
    expect(within(body).getAllByText('Yapı Kredi')).toHaveLength(2);
    expect(within(body).queryByText('Midas')).not.toBeInTheDocument();
  });

  it('portföyde geçen kurumları öneri olarak sunar', () => {
    setup({ rows: [row()], duplicateFlags: [false] });
    expect(screen.getByRole('option', { name: 'Yapı Kredi' })).toBeInTheDocument();
  });

  it('kurum seçimini yukarı bildirir', async () => {
    const onBrokerOverrideChange = vi.fn();
    setup({ rows: [row()], duplicateFlags: [false], onBrokerOverrideChange });
    await userEvent.selectOptions(screen.getByLabelText('Aracı kurum'), 'Midas');
    expect(onBrokerOverrideChange).toHaveBeenCalledWith('Midas');
  });

  // Kurum eksik olması aktarmayı engellememeli; sonradan toplu doldurulabiliyor.
  it('kurum seçilmese de aktarmaya izin verir', () => {
    setup({ rows: [row()], duplicateFlags: [false] });
    expect(confirmButton()).toBeEnabled();
  });
});
