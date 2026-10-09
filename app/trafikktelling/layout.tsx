import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#444f55",
};

export const metadata: Metadata = {
  title: "Trafikktelling",
  description: "Registrer kjøretøy i trafikktelling.",
  applicationName: "Trafikktelling",
  manifest: "/trafikktelling.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Trafikktelling",
    statusBarStyle: "black-translucent",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function TrafikktellingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${etica.variable} trafikktelling min-h-dvh`}>
      <TrafikkTopp />
      {children}
    </div>
  );
}
