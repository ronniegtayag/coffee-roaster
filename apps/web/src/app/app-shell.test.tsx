import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loginAs, renderApp, resetSession } from '@/test/render';

describe('app shell', () => {
  afterEach(resetSession);

  it('renders the overview inside the layout for a logged-in user', async () => {
    loginAs();
    await renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0);
  });

  it('shows the not-found page for unknown paths', async () => {
    loginAs();
    await renderApp('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
