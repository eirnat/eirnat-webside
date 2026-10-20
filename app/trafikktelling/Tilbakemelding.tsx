const MAIL = "eirik.natlandsmyr@vegvesen.no";
const HREF = `mailto:${MAIL}?subject=${encodeURIComponent("Tilbakemelding trafikktelling")}`;

export function Tilbakemelding() {
  return (
    <p className="mx-auto max-w-3xl px-4 pb-8 pt-2 text-center text-sm text-vv-ink sm:px-6">
      Tilbakemeldinger kan sendes til{" "}
      <a
        className="underline underline-offset-2 hover:text-vv-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vv-blue"
        href={HREF}
      >
        {MAIL}
      </a>
      .
    </p>
  );
}
