// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { App } from './App';

afterEach(() => { cleanup(); indexedDB.deleteDatabase('PlotBunniDB'); });

describe('App refinements', () => {
  it('opens the novel editor and toggles the debug panel', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Untitled Novel/)).toBeTruthy(), { timeout: 5000 });

    fireEvent.click(screen.getByText(/Untitled Novel/));           // select the book
    await waitFor(() => expect(screen.getByText('Novel')).toBeTruthy());
    expect(screen.getByText('Title')).toBeTruthy();                // editable title field
    expect(screen.getByText('Synopsis')).toBeTruthy();             // editable synopsis field

    fireEvent.click(screen.getByText('Debug'));                    // toggle debug panel
    await waitFor(() => expect(screen.getByText('Debug log')).toBeTruthy());
  });

  it('shows Test and List models in Settings', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('⚙ Endpoint')).toBeTruthy(), { timeout: 5000 });
    fireEvent.click(screen.getByText('⚙ Endpoint'));
    await waitFor(() => expect(screen.getByText('Test')).toBeTruthy());
    expect(screen.getByText('List models')).toBeTruthy();
  });
});
