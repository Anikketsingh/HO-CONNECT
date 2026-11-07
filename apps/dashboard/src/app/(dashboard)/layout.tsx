'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button, Card, cx, Logo, Spinner } from '@/components/ui';

type NavItem = { label: string; href?: string; milestone?: string };

const NAV: NavItem[] = [
  { label: 'Overview', href: '/' },
  { label: 'Partners', href: '/partners' },
  { label: 'QR codes', href: '/qr-codes' },
  { label: 'Leads', href: '/leads' },
  { label: 'Commissions', href: '/commissions' },
  { label: 'Payouts', href: '/payouts' },
  { label: 'Reports', href: '/reports' },
  { label: 'Audit log', href: '/audit' },
  { label: 'Settings', href: '/settings' },
];

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

function FullPage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-blush p-6">{children}</div>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { state, signOut, retry } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === 'signed_out') router.replace('/login');
  }, [state.status, router]);

  if (state.status === 'error') {
    return (
      <FullPage>
        <Card className="max-w-md p-6">
          <h1 className="font-display text-2xl text-espresso">Can't load the dashboard</h1>
          <p className="mt-2 text-sm text-muted">{state.message}</p>
          <div className="mt-6 flex gap-2">
            <Button onClick={retry}>Try again</Button>
            <Button variant="ghost" onClick={signOut}>
              Log out
            </Button>
          </div>
        </Card>
      </FullPage>
    );
  }

  if (state.status !== 'ready') {
    return (
      <FullPage>
        <Spinner />
      </FullPage>
    );
  }

  const { admin } = state;

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="flex items-center gap-3 px-6 pt-6 pb-8">
          <Logo className="w-20" />
          <span className="border-l border-line pl-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Connect
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          {NAV.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={cx(
                  'flex h-10 items-center rounded-lg px-3 text-sm font-medium',
                  isActive(pathname, item.href) ? 'bg-blush text-primary-deep' : 'text-ink hover:bg-blush/60',
                )}
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                className="flex h-10 cursor-default items-center justify-between rounded-lg px-3 text-sm text-muted/80"
                title={`Arrives in milestone ${item.milestone}`}
              >
                {item.label}
                <span className="rounded-full bg-blush px-2 py-0.5 text-[11px] font-semibold text-muted">
                  {item.milestone}
                </span>
              </span>
            ),
          )}
        </nav>
        <div className="border-t border-line p-4">
          <Link href="/account" className="block rounded-lg p-2 hover:bg-blush/60">
            <span className="block truncate text-sm font-semibold text-ink">{admin.name}</span>
            <span className="block truncate text-xs text-muted">{admin.email}</span>
          </Link>
          <Button variant="ghost" className="mt-1 h-9 w-full justify-start px-2 text-muted" onClick={signOut}>
            Log out
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden">
          <Logo className="w-16" />
          <div className="flex items-center gap-1">
            <Link href="/account" className="px-2 text-sm font-medium text-ink">
              Account
            </Link>
            <Button variant="ghost" className="h-9" onClick={signOut}>
              Log out
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 md:py-12">{children}</main>
      </div>
    </div>
  );
}
