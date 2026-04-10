// File: app/layout.tsx
import type { Metadata } from "next";
import { Lexend } from "next/font/google";
import "./globals.css";

// Vi laster Lexend-fonten fra Google Fonts
const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend", // Vi lager en CSS-variabel vi kan bruke i Tailwind
});

export const metadata: Metadata = {
  title: "eirnat.no - Digital Drodleplass",
  description: "Ymse prøving og feiling av Eirnat.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentYear = new Date().getFullYear();

  return (
    <html lang="no" className={`${lexend.variable} font-sans`}>
      <body className="bg-background text-foreground antialiased min-h-screen flex flex-col">
        <div className="flex-grow">{children}</div>
        <footer className="py-6 text-center text-xs text-slate-400">
          © {currentYear} Eirnat.{" "}
          <a className="hover:text-slate-500 transition-colors" href="mailto:hei@eirnat.no">
            hei@eirnat.no
          </a>
        </footer>
      </body>
    </html>
  );
}
