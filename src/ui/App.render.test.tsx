// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { App } from './App';

afterEach(() => { cleanup(); indexedDB.deleteDatabase('PlotBunniDB'); });

describe('App renders', () => {
  it('boots, creates a default book, and shows the three panes', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Untitled Novel/)).toBeTruthy(), { timeout: 4000 });
    expect(screen.getByText('Agent')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Brain-dump/i)).toBeTruthy();
    expect(screen.getByText(/Endpoint/i)).toBeTruthy();
  });
});
