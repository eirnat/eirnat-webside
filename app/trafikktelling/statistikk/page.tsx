import type { Metadata } from "next";
import { DashboardSection } from "../DashboardSection";
import { Tilbakemelding } from "../Tilbakemelding";

export const metadata: Metadata = {
  title: "Statistikk – Trafikktelling",
  description: "Kart og statistikk fra trafikktellingen.",
};

export default function StatistikkPage() {
  return (
    <main>
      <DashboardSection />
      <Tilbakemelding />
    </main>
  );
}
