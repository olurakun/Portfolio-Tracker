// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PortfolioSwitch from './PortfolioSwitch';
import { REAL } from '../../lib/portfolios';

afterEach(cleanup);

const setup = (props: Partial<React.ComponentProps<typeof PortfolioSwitch>> = {}) =>
  render(<PortfolioSwitch scenarios={['Sanal']} active={REAL} onChange={() => {}} {...props} />);

describe('PortfolioSwitch', () => {
  it('gerçek portföyü her zaman ilk seçenek olarak gösterir', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Gerçek' })).toBeInTheDocument();
  });

  it('senaryoları listeler', () => {
    setup({ scenarios: ['Sanal', 'NVDA senaryosu'] });
    expect(screen.getByRole('button', { name: 'NVDA senaryosu' })).toBeInTheDocument();
  });

  it('seçimi bildirir', async () => {
    const onChange = vi.fn();
    setup({ onChange });
    await userEvent.click(screen.getByRole('button', { name: 'Sanal' }));
    expect(onChange).toHaveBeenCalledWith('Sanal');
  });

  it('gerçek portföye dönebilir', async () => {
    const onChange = vi.fn();
    setup({ active: 'Sanal', onChange });
    await userEvent.click(screen.getByRole('button', { name: 'Gerçek' }));
    expect(onChange).toHaveBeenCalledWith(REAL);
  });

  // Hangi portföye bakıldığı karıştırılırsa kullanıcı kâr ettiğini sanıp
  // gerçekte etmemiş olur; sanal kip görsel olarak ayrışmak ZORUNDA.
  it('sanal senaryoyu gerçek portföyden görsel olarak ayırır', () => {
    setup({ active: 'Sanal' });
    const virtual = screen.getByRole('button', { name: 'Sanal' });
    expect(virtual.className).toContain('border-dashed');
    expect(virtual.className).toContain('cyan');
  });

  it('gerçek portföy seçiliyken kesikli çerçeve kullanmaz', () => {
    setup({ active: REAL });
    expect(screen.getByRole('button', { name: 'Gerçek' }).className).not.toContain('border-dashed');
  });

  it('seçili olanı erişilebilir şekilde işaretler', () => {
    setup({ active: 'Sanal' });
    expect(screen.getByRole('button', { name: 'Sanal' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Gerçek' })).toHaveAttribute('aria-pressed', 'false');
  });
});
