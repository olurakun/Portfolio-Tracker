// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// supabase istemcisi modül yükleme anında createClient(url, key) çağırıyor;
// gerçek modülü kullanmak testte NEXT_PUBLIC_SUPABASE_URL gerektirirdi.
// auth metodları burada taklit ediliyor.
let authStateCallback: ((event: string, session: unknown) => void) | null = null;
const mockAuth = {
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
    authStateCallback = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
};
vi.mock('../../lib/supabase', () => ({ supabase: { auth: mockAuth } }));

const { default: AuthGate } = await import('./AuthGate');

afterEach(() => { cleanup(); vi.clearAllMocks(); authStateCallback = null; });

beforeEach(() => {
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
});

async function renderReady() {
  render(<AuthGate>{() => <div>Portföy içeriği</div>}</AuthGate>);
  await waitFor(() => expect(screen.queryByText('Yükleniyor…')).toBeNull());
}

describe('AuthGate — şifremi unuttum akışı', () => {
  it('"Şifremi unuttum" tıklanınca parola alanı kaybolur, e-posta kalır', async () => {
    await renderReady();
    await userEvent.click(screen.getByText('Şifremi unuttum'));
    expect(screen.getByPlaceholderText('E-posta')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Parola')).toBeNull();
    expect(screen.getByRole('button', { name: 'Kurtarma bağlantısı gönder' })).toBeTruthy();
  });

  it('gönderince resetPasswordForEmail doğru e-posta ve redirectTo ile çağrılır', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await renderReady();
    await userEvent.click(screen.getByText('Şifremi unuttum'));
    await userEvent.type(screen.getByPlaceholderText('E-posta'), 'kullanici@ornek.com');
    await userEvent.click(screen.getByRole('button', { name: 'Kurtarma bağlantısı gönder' }));
    await waitFor(() => expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith(
      'kullanici@ornek.com',
      expect.objectContaining({ redirectTo: expect.any(String) }),
    ));
    expect(screen.getByText(/kurtarma bağlantısı gönderildi/i)).toBeTruthy();
  });

  it('resetPasswordForEmail hata dönerse gösterilir', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'Çok fazla istek' } });
    await renderReady();
    await userEvent.click(screen.getByText('Şifremi unuttum'));
    await userEvent.type(screen.getByPlaceholderText('E-posta'), 'kullanici@ornek.com');
    await userEvent.click(screen.getByRole('button', { name: 'Kurtarma bağlantısı gönder' }));
    await waitFor(() => expect(screen.getByText('Çok fazla istek')).toBeTruthy());
  });

  it('"Girişe dön" ile giriş formuna geri döner', async () => {
    await renderReady();
    await userEvent.click(screen.getByText('Şifremi unuttum'));
    await userEvent.click(screen.getByText('Girişe dön'));
    expect(screen.getByPlaceholderText('Parola')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Giriş yap' })).toBeTruthy();
  });

  // Asıl risk: PASSWORD_RECOVERY olayında session DOLU geliyor. Bu olay
  // yakalanmazsa AuthGate normal girişle karıştırıp doğrudan portföyü
  // gösterir — kullanıcı yeni şifre belirleme fırsatı bulamaz.
  it('PASSWORD_RECOVERY olayı portföyü DEĞİL yeni şifre formunu gösterir', async () => {
    await renderReady();
    authStateCallback!('PASSWORD_RECOVERY', { user: { id: '1' } });
    await waitFor(() => expect(screen.getByText('Yeni şifre belirle')).toBeTruthy());
    expect(screen.queryByText('Portföy içeriği')).toBeNull();
  });

  it('yeni şifre gönderilince updateUser çağrılır ve başarılıysa portföy açılır', async () => {
    mockAuth.updateUser.mockResolvedValue({ error: null });
    await renderReady();
    authStateCallback!('PASSWORD_RECOVERY', { user: { id: '1' } });
    await waitFor(() => screen.getByText('Yeni şifre belirle'));
    await userEvent.type(screen.getByPlaceholderText('Yeni parola'), 'yeniSifre123');
    await userEvent.click(screen.getByRole('button', { name: 'Şifreyi güncelle' }));
    await waitFor(() => expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'yeniSifre123' }));
    await waitFor(() => expect(screen.getByText('Portföy içeriği')).toBeTruthy());
  });

  it('updateUser hata dönerse kurtarma ekranında kalır', async () => {
    mockAuth.updateUser.mockResolvedValue({ error: { message: 'Şifre çok kısa' } });
    await renderReady();
    authStateCallback!('PASSWORD_RECOVERY', { user: { id: '1' } });
    await waitFor(() => screen.getByText('Yeni şifre belirle'));
    await userEvent.type(screen.getByPlaceholderText('Yeni parola'), 'k1');
    await userEvent.click(screen.getByRole('button', { name: 'Şifreyi güncelle' }));
    await waitFor(() => expect(screen.getByText('Şifre çok kısa')).toBeTruthy());
    expect(screen.getByText('Yeni şifre belirle')).toBeTruthy();
  });
});
