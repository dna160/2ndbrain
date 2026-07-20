'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { KeyboardProvider } from '../../lib/keyboard';
import { CommandPalette } from './CommandPalette';
import { ToastProvider } from './Toasts';

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <KeyboardProvider>
        <ToastProvider>
          {children}
          <CommandPalette />
        </ToastProvider>
      </KeyboardProvider>
    </QueryClientProvider>
  );
}
