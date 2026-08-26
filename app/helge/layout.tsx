import type { Metadata } from "next";
import { Quicksand } from "next/font/google";

const quicksand = Quicksand({
  subsets: ["latin"],
  variable: "--font-quicksand",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Helges utdrikningslag",
  description: "Poengtavle for Helges utdrikningslag.",
};

export default function HelgeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${quicksand.variable} min-h-screen bg-gradient-to-br from-red-950 via-rose-900 to-orange-950 font-[family-name:var(--font-quicksand)] text-black antialiased`}
    >
      <div className="relative mx-auto w-full max-w-lg">
        {children}
      </div>
    </div>
  );
}
