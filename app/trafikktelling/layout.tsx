import type { Metadata } from "next";
import localFont from "next/font/local";
import { TrafikkTopp } from "./TrafikkTopp";

const etica = localFont({
  src: [
    {
      path: "../../public/fonts/LFTEtica-Light.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/LFTEtica-Semibold.otf",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-etica",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Trafikktelling",
  description: "Registrer kjøretøy i trafikktelling.",
};

export default function TrafikktellingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${etica.variable} trafikktelling min-h-screen`}>
      <TrafikkTopp />
      {children}
    </div>
  );
}
