import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppProviders } from '../../components/shell/AppProviders';
import { NavRail } from '../../components/shell/NavRail';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <AppProviders>
      <div className="shell">
        <NavRail />
        {children}
      </div>
    </AppProviders>
  );
}
