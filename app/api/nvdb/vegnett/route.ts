import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get('bbox');

  if (!bbox) {
    return NextResponse.json({ error: 'Missing bbox' }, { status: 400 });
  }

  // NVDB API v3 krever koordinater i formatet: vest,sør,øst,nord
  // Vi legger også til srid=4326 for å fortelle at vi bruker GPS-koordinater (WGS84)
  const nvdbUrl = `https://nvdbapiles-v3.atlas.vegvesen.no/vegnett/veglenkesekvenser/segmenter?kartutsnitt=${bbox}&srid=4326`;

  try {
    const response = await fetch(nvdbUrl, {
      headers: {
        'Accept': 'application/vnd.vegvesen.nvdb-v3-rev1+json',
        'X-Client': 'Eirnat Kartverktøy', // Identifiserer deg for Vegvesenet
      },
    });

    if (!response.ok) {
      throw new Error(`NVDB svarte med status: ${response.status}`);
    }

    const data = await response.json();

    // Vi må pakke om NVDB-dataene til GeoJSON-format som kartet forstår
    const geojson = {
      type: 'FeatureCollection',
      features: data.objekter.map((obj: any) => ({
        type: 'Feature',
        geometry: obj.geometri,
        properties: {
          id: obj.veglenkesekvensid,
          type: obj.vegsystemreferanse?.vegsystem?.vegkategori,
          nummer: obj.vegsystemreferanse?.vegsystem?.nummer,
        },
      })),
    };

    return NextResponse.json(geojson);
  } catch (error) {
    console.error('NVDB Proxy Error:', error);
    return NextResponse.json({ error: 'Klarte ikke hente data fra NVDB' }, { status: 500 });
  }
}