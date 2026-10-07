import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { getLocale } from "@/lib/i18n";
import "./globals.css";

const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], display: "swap" });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Gravitas Campus", template: "%s · Gravitas Campus" },
  description: "Gravitas Campus, Gadag — hands-on AI and technology learning for schools, graduates and professionals.",
};

export const viewport: Viewport = { themeColor: "#1B1640" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${fredoka.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
