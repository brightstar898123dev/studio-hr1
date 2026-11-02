import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HR Recruiting", template: "%s · HR Recruiting" },
  description: "Recruiting emails, replies and interviews in one place.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
