import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camel971 — Private Marketplace",
  description: "Browse, order, and track deliveries with Camel971.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

import { LanguageProvider } from "@/components/LanguageContext";
import CursorAnimation from "@/components/CursorAnimation";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <CursorAnimation />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
