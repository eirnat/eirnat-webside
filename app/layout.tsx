// File: app/layout.tsx
import type { Metadata } from "next";
import { Lexend } from "next/font/google";
import "./globals.css";
import ConditionalFooter from "./ConditionalFooter";

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
  return (
    <html lang="no" className={`${lexend.variable} font-sans`}>
      <body className="bg-background text-foreground antialiased min-h-screen flex flex-col">
        <div className="flex-grow">{children}</div>
        <ConditionalFooter />
      </body>
    </html>
  );
}
