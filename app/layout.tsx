import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "RealizedEdge",
  description: "Realized P&L, option income, and capital efficiency across options and stock trades."
};

// Set the .dark class before paint (from stored/system preference) so there is no
// theme flash on first load. Runs before hydration; useTheme() reads this class.
const NO_FLASH_THEME =
  "(function(){try{var t=localStorage.getItem('positioniq.theme');if(t!=='light'){document.documentElement.classList.add('dark');}}catch(e){}})();";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={sans.variable}>
      <body>
        <Script id="theme-no-flash" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
        {children}
      </body>
    </html>
  );
}
