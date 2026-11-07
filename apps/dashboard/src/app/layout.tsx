import type { Metadata } from 'next';
import { Bodoni_Moda, Figtree } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import './globals.css';

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });
const bodoni = Bodoni_Moda({ subsets: ['latin'], variable: '--font-bodoni', display: 'swap' });

export const metadata: Metadata = {
  title: 'HO Connect Dashboard',
  description: 'HairOriginals partner programme: partners, leads and commissions.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${bodoni.variable}`}>
      <body className="min-h-screen">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
