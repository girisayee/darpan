import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PositionIQ",
  description: "Realized P&L, option income, and capital efficiency across options and stock trades."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
