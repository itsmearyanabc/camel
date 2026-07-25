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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
