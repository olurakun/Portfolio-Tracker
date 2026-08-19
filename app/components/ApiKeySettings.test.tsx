// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApiKeySettings from './ApiKeySettings';

const VALID = 'sk-ant-api03-' + 'a'.repeat(40);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const open = async () => {
  const link = screen.queryByText('Kendi Anthropic anahtarını kullan');
  if (link) await userEvent.click(link);
};

describe('ApiKeySettings', () => {
  it('anahtar yokken kapalı durur', () => {
    render(<ApiKeySettings />);
    expect(screen.getByText('Kendi Anthropic anahtarını kullan')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('sk-ant-...')).not.toBeInTheDocument();
  });

  // Sunucu anahtar bulamadığında alan kendiliğinden açılmalı, kullanıcı
  // nereye tıklayacağını aramasın.
  it('sunucu anahtar bulamadıysa kendiliğinden açılır', () => {
    render(<ApiKeySettings forceOpen />);
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
  });

  // Yanlış yapıştırılan metin ağ isteğine hiç çıkmasın.
  it('başka sağlayıcının anahtarını reddeder ve kaydetmez', async () => {
    render(<ApiKeySettings forceOpen />);
    await userEvent.type(screen.getByPlaceholderText('sk-ant-...'), 'sk-proj-yanlissaglayici');
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(screen.getByText(/sk-ant- ile başlamalı/)).toBeInTheDocument();
    expect(localStorage.getItem('portfoy-takip:anthropic-key')).toBeNull();
  });

  it('geçerli anahtarı kaydeder', async () => {
    render(<ApiKeySettings forceOpen />);
    await userEvent.type(screen.getByPlaceholderText('sk-ant-...'), VALID);
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(localStorage.getItem('portfoy-takip:anthropic-key')).toBe(VALID);
  });

  // Anahtar ekranda hiçbir zaman tam görünmemeli.
  it('kayıtlı anahtarı maskeleyerek gösterir', () => {
    localStorage.setItem('portfoy-takip:anthropic-key', VALID);
    render(<ApiKeySettings />);
    const shown = screen.getByText(/^sk-ant-/).textContent ?? '';
    expect(shown).toContain('…');
    expect(shown.length).toBeLessThan(VALID.length);
    expect(screen.queryByText(VALID)).not.toBeInTheDocument();
  });

  it('anahtarı kaldırabilir', async () => {
    localStorage.setItem('portfoy-takip:anthropic-key', VALID);
    render(<ApiKeySettings />);
    await userEvent.click(screen.getByText('kaldır'));
    expect(localStorage.getItem('portfoy-takip:anthropic-key')).toBeNull();
    expect(screen.getByText('Kendi Anthropic anahtarını kullan')).toBeInTheDocument();
  });

  // Parola alanı: omuz üstünden okunmasın ve tarayıcı otomatik doldurmasın.
  it('anahtar alanı gizli ve otomatik doldurma kapalı', async () => {
    render(<ApiKeySettings forceOpen />);
    const input = screen.getByPlaceholderText('sk-ant-...');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  // Kaydettikten sonra anahtar geçersiz çıkarsa panel yeniden açılabilmeli;
  // "vazgeç" kararı kalıcı olmamalı.
  it('vazgeçtikten sonra yeniden tetiklenirse tekrar açılır', async () => {
    const { rerender } = render(<ApiKeySettings forceOpen />);
    await userEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByPlaceholderText('sk-ant-...')).not.toBeInTheDocument();

    rerender(<ApiKeySettings forceOpen={false} />);
    rerender(<ApiKeySettings forceOpen />);
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
  });

  it('anahtar kaydedilince alan kapanır', async () => {
    render(<ApiKeySettings forceOpen />);
    await userEvent.type(screen.getByPlaceholderText('sk-ant-...'), VALID);
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(screen.queryByPlaceholderText('sk-ant-...')).not.toBeInTheDocument();
    expect(screen.getByText('değiştir')).toBeInTheDocument();
  });

  it('kapalıyken bağlantıya tıklayınca açılır', async () => {
    render(<ApiKeySettings />);
    await open();
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
  });
});
