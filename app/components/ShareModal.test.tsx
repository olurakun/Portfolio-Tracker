// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShareModal, { type ShareRecord } from './ShareModal';
import { DEFAULT_SHARE_COLUMNS } from '../../lib/shares';

afterEach(cleanup);

const defaults = {
  open: true,
  onClose: () => {},
  assetCounts: { stock: 3, fund: 1, currency: 1, metal: 0, crypto: 0 },
  busy: false,
  error: "",
  shares: [] as ShareRecord[],
  sharesLoading: false,
  onCreate: () => {},
  onRefresh: () => {},
  onDelete: () => {},
};

const setup = (props: Partial<typeof defaults> = {}) => render(<ShareModal {...defaults} {...props} />);

describe('ShareModal', () => {
  it('kapalıyken hiçbir şey render etmez', () => {
    const { container } = setup({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('varlık sayılarını gösterir', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Hisse (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Değerli Maden (0)' })).toBeInTheDocument();
  });

  // Tüm tipler seçiliyken assetTypes null gönderilmeli — bu, buildShareSnapshot'ın
  // "null = hepsi" sözleşmesiyle eşleşiyor.
  it('tüm tipler seçiliyken assetTypes null gönderir', async () => {
    const onCreate = vi.fn();
    setup({ onCreate });
    await userEvent.click(screen.getByRole('button', { name: /Paylaşım linki oluştur/ }));
    expect(onCreate).toHaveBeenCalledWith("", expect.objectContaining({ assetTypes: null }));
  });

  it('bir tip kapatılınca yalnızca kalanları listeler', async () => {
    const onCreate = vi.fn();
    setup({ onCreate });
    await userEvent.click(screen.getByRole('button', { name: 'Değerli Maden (0)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Döviz (1)' }));
    await userEvent.click(screen.getByRole('button', { name: /Paylaşım linki oluştur/ }));
    const config = onCreate.mock.calls[0][1];
    expect(config.assetTypes).toEqual(expect.arrayContaining(['stock', 'fund']));
    expect(config.assetTypes).not.toContain('currency');
    expect(config.assetTypes).not.toContain('metal');
  });

  it('hiçbir tip seçili değilse gönderim kapalıdır', async () => {
    setup();
    for (const label of ['Hisse (3)', 'Fon (1)', 'Döviz (1)', 'Değerli Maden (0)']) {
      await userEvent.click(screen.getByRole('button', { name: label }));
    }
    expect(screen.getByRole('button', { name: /Paylaşım linki oluştur/ })).toBeDisabled();
  });

  it('sütun kapatınca oluşturma isteğine yansır', async () => {
    const onCreate = vi.fn();
    setup({ onCreate });
    await userEvent.click(screen.getByLabelText('Anlık K/Z'));
    await userEvent.click(screen.getByRole('button', { name: /Paylaşım linki oluştur/ }));
    const config = onCreate.mock.calls[0][1];
    expect(config.columns).toEqual({ ...DEFAULT_SHARE_COLUMNS, unrealizedPL: false });
  });

  it('başlığı oluşturma isteğiyle birlikte gönderir', async () => {
    const onCreate = vi.fn();
    setup({ onCreate });
    await userEvent.type(screen.getByPlaceholderText(/Paylaşım adı/), 'Hisse portföyüm');
    await userEvent.click(screen.getByRole('button', { name: /Paylaşım linki oluştur/ }));
    expect(onCreate).toHaveBeenCalledWith('Hisse portföyüm', expect.anything());
  });

  it('oluşturulurken buton kapalı ve durumu yazıyor', () => {
    setup({ busy: true });
    expect(screen.getByRole('button', { name: /Oluşturuluyor/ })).toBeDisabled();
  });

  it('hata mesajını gösterir', () => {
    setup({ error: 'Paylaşım oluşturulamadı: ağ hatası' });
    expect(screen.getByText(/ağ hatası/)).toBeInTheDocument();
  });

  it('mevcut paylaşımları listeler', () => {
    setup({
      shares: [{
        id: 'abc-123', title: 'Hisse portföyüm',
        config: { assetTypes: null, columns: DEFAULT_SHARE_COLUMNS },
        created_at: '2026-08-20T10:00:00Z', refreshed_at: '2026-08-22T10:00:00Z',
      }],
    });
    expect(screen.getByText('Hisse portföyüm')).toBeInTheDocument();
    expect(screen.getByText(/paylasim\/abc-123/)).toBeInTheDocument();
  });

  it('paylaşımı yoksa bilgilendirir', () => {
    setup();
    expect(screen.getByText(/Henüz bir paylaşım oluşturmadın/)).toBeInTheDocument();
  });

  it('yenile ve kaldır butonları doğru id ile çağrılır', async () => {
    const onRefresh = vi.fn();
    const onDelete = vi.fn();
    vi.stubGlobal('confirm', () => true);
    setup({
      onRefresh, onDelete,
      shares: [{
        id: 'xyz-789', title: null,
        config: { assetTypes: null, columns: DEFAULT_SHARE_COLUMNS },
        created_at: '2026-08-20T10:00:00Z', refreshed_at: '2026-08-22T10:00:00Z',
      }],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    expect(onRefresh).toHaveBeenCalledWith('xyz-789');
    await userEvent.click(screen.getByRole('button', { name: 'Kaldır' }));
    expect(onDelete).toHaveBeenCalledWith('xyz-789');
    vi.unstubAllGlobals();
  });

  it('adsız paylaşımı okunur bir etiketle gösterir', () => {
    setup({
      shares: [{
        id: 'no-title', title: null,
        config: { assetTypes: null, columns: DEFAULT_SHARE_COLUMNS },
        created_at: '2026-08-20T10:00:00Z', refreshed_at: '2026-08-22T10:00:00Z',
      }],
    });
    expect(screen.getByText('Adsız paylaşım')).toBeInTheDocument();
  });

  it('kapatma butonu onClose çağırır', async () => {
    const onClose = vi.fn();
    setup({ onClose });
    await userEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalled();
  });
});
