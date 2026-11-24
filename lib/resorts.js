// The four resorts of Les 3 Vallées and where their snow is measured/forecast.
//
// station: the Météo-France nivo-meteorological station (WMO id) the ski patrol
//          reports from — the *measured* snow depth. Ids from the station list of
//          faizpuru/meteofrance-montagne (MIT).
// webcams: Windy webcam ids to show for this resort, best first. Leave empty to
//          let lib/webcams.js pick the most popular live camera near the village;
//          put an id here (from the camera's windy.com URL) to pin a favourite.
// village/summit: forecast points for Open-Meteo. Coordinates are approximate
//          (the model grid is ~1–2 km anyway); the elevation is passed explicitly
//          so temperatures are downscaled to that altitude.

export const RESORTS = [
  {
    id: 'courchevel',
    name: 'Courchevel',
    station: '7893',
    webcams: [],
    village: { label: 'Courchevel 1850', lat: 45.4153, lon: 6.6347, elevation: 1850 },
    summit: { label: 'La Saulire', lat: 45.3889, lon: 6.6205, elevation: 2738 },
  },
  {
    id: 'meribel',
    name: 'Méribel',
    station: '7892',
    webcams: [],
    village: { label: 'Méribel-Mottaret', lat: 45.3726, lon: 6.5814, elevation: 1750 },
    summit: { label: 'Mont Vallon', lat: 45.3486, lon: 6.6178, elevation: 2952 },
  },
  {
    id: 'menuires',
    name: 'Les Menuires',
    station: '7889',
    webcams: [],
    village: { label: 'Les Menuires', lat: 45.3237, lon: 6.5385, elevation: 1850 },
    summit: { label: 'Pointe de la Masse', lat: 45.2969, lon: 6.5036, elevation: 2804 },
  },
  {
    id: 'valthorens',
    name: 'Val Thorens',
    station: '7918',
    webcams: [],
    village: { label: 'Val Thorens', lat: 45.2973, lon: 6.5800, elevation: 2300 },
    summit: { label: 'Cime Caron', lat: 45.2851, lon: 6.5463, elevation: 3200 },
  },
];

export const STATION_IDS = RESORTS.map((r) => r.station);

// The forecast points in a fixed order: [r0.village, r0.summit, r1.village, …].
export const FORECAST_POINTS = RESORTS.flatMap((r) => [r.village, r.summit]);
