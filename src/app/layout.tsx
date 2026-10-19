import type { Metadata, Viewport } from "next";
import { Anek_Latin, Anek_Devanagari, Hind, Kalam, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { AppShell } from "@/components/shell/AppShell";

const anek = Anek_Latin({ subsets: ["latin"], variable: "--font-anek", axes: ["wdth"], display: "swap" });
const anekDeva = Anek_Devanagari({ subsets: ["devanagari"], variable: "--font-anek-deva", axes: ["wdth"], display: "swap" });
const hind = Hind({ subsets: ["latin", "devanagari"], weight: ["300", "400", "500", "600", "700"], variable: "--font-hind", display: "swap" });
const kalam = Kalam({ subsets: ["latin", "devanagari"], weight: ["300", "400", "700"], variable: "--font-kalam", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Saakh — your word, on record",
  description:
    "A shared ledger for India's small businesses. Say who owes whom; the other side confirms; AI agents keep score, send reminders and answer questions.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf3f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1412" },
  ],
};

// Sets the theme before paint so there's no flash.
const themeScript = `(function(){try{var t=localStorage.getItem('saakh.theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${anek.variable} ${anekDeva.variable} ${hind.variable} ${kalam.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
