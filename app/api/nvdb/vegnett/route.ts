import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get('bbox');

  if (!bbox) {
    return NextResponse.json({ error: 'Mangler bbox' }, { status: 400 });
  }

  // NY URL FOR V4: Vi fjerner "-v3" og bruker det nye endepunktet
  // Legg merke til at parameteren nå heter "kartutsnitt" og vi legger til "srid=4326"
  const url = `https://nvdbapiles.atlas.vegvesen.no/vegnett/veglenkesekvenser/segmentert?kartutsnitt=${bbox}&srid=4326`;

  try {
    console.log("Henter fra NVDB V4:", url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        // Det er viktig at X-Client er unik. La oss kalle den noe litt mer formelt.
        'X-Client': 'eirnat-kartverktøy-v4',
        'Accept': 'application/vnd.vegvesen.nvdb-v4+json', // Vi ber om V4-format
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`NVDB V4 feilkode ${response.status}:`, errorText);
      return NextResponse.json({ error: `NVDB svarte med ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    
    // V4 returnerer data i et litt annet format enn V3. 
    // Vi må sørge for at vi sender tilbake ekte GeoJSON til kartet.
    return NextResponse.json(data);

  } catch (error: any) {
    console.error("Kritisk feil i V4-rute:", error.message);
    return NextResponse.json({ error: 'Klarte ikke hente data fra NVDB V4' }, { status: 500 });
  }
}