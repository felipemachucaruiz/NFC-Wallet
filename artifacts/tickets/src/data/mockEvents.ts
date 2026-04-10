import type { EventData } from "./types";

export const mockEvents: EventData[] = [
  {
    id: "evt-001",
    name: "Estéreo Picnic 2026",
    description: `<h2>Festival Estéreo Picnic 2026</h2>
<p>El festival de música más grande de Colombia regresa con una edición épica de 3 días. Disfruta de artistas internacionales y locales en el Parque Simón Bolívar.</p>
<h3>Lineup</h3>
<ul>
<li><strong>Día 1:</strong> Arctic Monkeys, Tame Impala, Bomba Estéreo</li>
<li><strong>Día 2:</strong> The Weeknd, Dua Lipa, J Balvin</li>
<li><strong>Día 3:</strong> Foo Fighters, Rosalía, Carlos Vives</li>
</ul>
<h3>Reglas</h3>
<ul>
<li>No se permite el ingreso de alimentos o bebidas</li>
<li>No se permite el ingreso de mascotas</li>
<li>Objetos prohibidos: armas, drogas, vidrio</li>
</ul>
<h3>Términos y Condiciones</h3>
<p>Al adquirir tu boleta aceptas los términos y condiciones del evento. Las boletas son nominativas e intransferibles. No se realizan devoluciones excepto en caso de cancelación del evento.</p>`,
    coverImage: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1200&h=600&fit=crop",
    flyerImage: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=800&fit=crop",
    category: "festivals",
    venueName: "Parque Simón Bolívar",
    venueAddress: "Calle 63 # 59A-06, Bogotá",
    city: "Bogotá",
    startsAt: "2026-11-15T14:00:00-05:00",
    endsAt: "2026-11-17T23:00:00-05:00",
    timezone: "America/Bogota",
    minAge: 18,
    organizer: "Páramo Presenta",
    latitude: 4.6583,
    longitude: -74.0938,
    priceFrom: 250000,
    currencyCode: "COP",
    isMultiDay: true,
    days: [
      { dayNumber: 1, label: "Día 1 - Viernes", date: "2026-11-15", doorTime: "2:00 PM" },
      { dayNumber: 2, label: "Día 2 - Sábado", date: "2026-11-16", doorTime: "1:00 PM" },
      { dayNumber: 3, label: "Día 3 - Domingo", date: "2026-11-17", doorTime: "1:00 PM" },
    ],
    ticketTypes: [
      { id: "tt-001", name: "Abono 3 días - General", validDays: "Viernes, Sábado, Domingo", price: 650000, serviceFee: 52000, availableCount: 1200, maxPerOrder: 4, status: "available" },
      { id: "tt-002", name: "Abono 3 días - VIP", validDays: "Viernes, Sábado, Domingo", price: 1200000, serviceFee: 96000, availableCount: 80, maxPerOrder: 4, status: "limited" },
      { id: "tt-003", name: "Solo Viernes - General", validDays: "Viernes", price: 250000, serviceFee: 20000, availableCount: 500, maxPerOrder: 6, status: "available" },
      { id: "tt-004", name: "Solo Sábado - General", validDays: "Sábado", price: 280000, serviceFee: 22400, availableCount: 0, maxPerOrder: 6, status: "sold_out" },
      { id: "tt-005", name: "Solo Domingo - General", validDays: "Domingo", price: 250000, serviceFee: 20000, availableCount: 300, maxPerOrder: 6, status: "available" },
      { id: "tt-006", name: "Solo Viernes - VIP", validDays: "Viernes", price: 450000, serviceFee: 36000, availableCount: 45, maxPerOrder: 4, status: "limited" },
    ],
    sections: [
      {
        id: "sec-general",
        name: "General",
        svgPath: "M 50 200 L 50 350 L 350 350 L 350 200 Z",
        color: "#22c55e",
        status: "available",
        ticketTypes: [
          { id: "tt-001", name: "Abono 3 días - General", validDays: "Viernes, Sábado, Domingo", price: 650000, serviceFee: 52000, availableCount: 1200, maxPerOrder: 4, status: "available" },
          { id: "tt-003", name: "Solo Viernes - General", validDays: "Viernes", price: 250000, serviceFee: 20000, availableCount: 500, maxPerOrder: 6, status: "available" },
          { id: "tt-004", name: "Solo Sábado - General", validDays: "Sábado", price: 280000, serviceFee: 22400, availableCount: 0, maxPerOrder: 6, status: "sold_out" },
          { id: "tt-005", name: "Solo Domingo - General", validDays: "Domingo", price: 250000, serviceFee: 20000, availableCount: 300, maxPerOrder: 6, status: "available" },
        ],
      },
      {
        id: "sec-vip",
        name: "VIP",
        svgPath: "M 100 50 L 100 180 L 300 180 L 300 50 Z",
        color: "#eab308",
        status: "limited",
        ticketTypes: [
          { id: "tt-002", name: "Abono 3 días - VIP", validDays: "Viernes, Sábado, Domingo", price: 1200000, serviceFee: 96000, availableCount: 80, maxPerOrder: 4, status: "limited" },
          { id: "tt-006", name: "Solo Viernes - VIP", validDays: "Viernes", price: 450000, serviceFee: 36000, availableCount: 45, maxPerOrder: 4, status: "limited" },
        ],
      },
    ],
    salesStartAt: null,
    status: "available",
    active: true,
  },
  {
    id: "evt-002",
    name: "Bad Bunny - World's Hottest Tour",
    description: `<h2>Bad Bunny en Barranquilla</h2>
<p>El conejo malo llega a Barranquilla con su gira mundial. Una noche inolvidable llena de reggaetón, trap y la mejor energía.</p>
<p>Producción de nivel mundial con pantallas LED gigantes, efectos especiales y un show de más de 2 horas.</p>`,
    coverImage: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&h=600&fit=crop",
    flyerImage: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&h=800&fit=crop",
    category: "concerts",
    venueName: "Estadio Metropolitano",
    venueAddress: "Cra. 21 #Calle 34, Barranquilla",
    city: "Barranquilla",
    startsAt: "2026-12-05T19:00:00-05:00",
    endsAt: "2026-12-05T23:30:00-05:00",
    timezone: "America/Bogota",
    minAge: 16,
    organizer: "Live Nation Colombia",
    latitude: 10.9634,
    longitude: -74.7814,
    priceFrom: 180000,
    currencyCode: "COP",
    isMultiDay: false,
    days: [
      { dayNumber: 1, label: "Viernes 5 de Diciembre", date: "2026-12-05", doorTime: "5:00 PM" },
    ],
    ticketTypes: [
      { id: "tt-010", name: "General", validDays: "5 Dic", price: 180000, serviceFee: 14400, availableCount: 5000, maxPerOrder: 6, status: "available" },
      { id: "tt-011", name: "Preferencial", validDays: "5 Dic", price: 350000, serviceFee: 28000, availableCount: 1500, maxPerOrder: 4, status: "available" },
      { id: "tt-012", name: "VIP", validDays: "5 Dic", price: 600000, serviceFee: 48000, availableCount: 200, maxPerOrder: 4, status: "limited" },
      { id: "tt-013", name: "Platinum", validDays: "5 Dic", price: 1500000, serviceFee: 120000, availableCount: 0, maxPerOrder: 2, status: "sold_out" },
    ],
    sections: [
      {
        id: "sec-norte",
        name: "Norte - General",
        svgPath: "M 100 300 L 100 380 L 300 380 L 300 300 Z",
        color: "#22c55e",
        status: "available",
        ticketTypes: [
          { id: "tt-010", name: "General", validDays: "5 Dic", price: 180000, serviceFee: 14400, availableCount: 5000, maxPerOrder: 6, status: "available" },
        ],
      },
      {
        id: "sec-oriental",
        name: "Oriental - Preferencial",
        svgPath: "M 310 100 L 310 290 L 380 290 L 380 100 Z",
        color: "#22c55e",
        status: "available",
        ticketTypes: [
          { id: "tt-011", name: "Preferencial", validDays: "5 Dic", price: 350000, serviceFee: 28000, availableCount: 1500, maxPerOrder: 4, status: "available" },
        ],
      },
      {
        id: "sec-occidental",
        name: "Occidental - VIP",
        svgPath: "M 20 100 L 20 290 L 90 290 L 90 100 Z",
        color: "#eab308",
        status: "limited",
        ticketTypes: [
          { id: "tt-012", name: "VIP", validDays: "5 Dic", price: 600000, serviceFee: 48000, availableCount: 200, maxPerOrder: 4, status: "limited" },
        ],
      },
      {
        id: "sec-sur",
        name: "Sur - Platinum",
        svgPath: "M 100 20 L 100 90 L 300 90 L 300 20 Z",
        color: "#ef4444",
        status: "sold_out",
        ticketTypes: [
          { id: "tt-013", name: "Platinum", validDays: "5 Dic", price: 1500000, serviceFee: 120000, availableCount: 0, maxPerOrder: 2, status: "sold_out" },
        ],
      },
    ],
    salesStartAt: null,
    status: "available",
    active: true,
  },
  {
    id: "evt-003",
    name: "Colombia vs Argentina - Eliminatorias",
    description: `<h2>Eliminatorias Sudamericanas 2026</h2>
<p>La selección Colombia se enfrenta a Argentina en un partido crucial de las eliminatorias al Mundial 2026. ¡Vive la emoción del fútbol en el Metropolitano!</p>`,
    coverImage: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&h=600&fit=crop",
    flyerImage: "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&h=800&fit=crop",
    category: "sports",
    venueName: "Estadio Metropolitano Roberto Meléndez",
    venueAddress: "Cra. 21 #Calle 34, Barranquilla",
    city: "Barranquilla",
    startsAt: "2026-10-12T18:00:00-05:00",
    endsAt: "2026-10-12T20:30:00-05:00",
    timezone: "America/Bogota",
    minAge: null,
    organizer: "FCF",
    latitude: 10.9634,
    longitude: -74.7814,
    priceFrom: 80000,
    currencyCode: "COP",
    isMultiDay: false,
    days: [
      { dayNumber: 1, label: "Sábado 12 de Octubre", date: "2026-10-12", doorTime: "4:00 PM" },
    ],
    ticketTypes: [
      { id: "tt-020", name: "Norte", validDays: "12 Oct", price: 80000, serviceFee: 6400, availableCount: 8000, maxPerOrder: 4, status: "available" },
      { id: "tt-021", name: "Sur", validDays: "12 Oct", price: 80000, serviceFee: 6400, availableCount: 7500, maxPerOrder: 4, status: "available" },
      { id: "tt-022", name: "Oriental", validDays: "12 Oct", price: 150000, serviceFee: 12000, availableCount: 3000, maxPerOrder: 4, status: "available" },
      { id: "tt-023", name: "Occidental Preferencial", validDays: "12 Oct", price: 300000, serviceFee: 24000, availableCount: 100, maxPerOrder: 2, status: "limited" },
    ],
    sections: [
      {
        id: "sec-norte-f",
        name: "Norte",
        svgPath: "M 100 300 L 100 380 L 300 380 L 300 300 Z",
        color: "#22c55e",
        status: "available",
        ticketTypes: [
          { id: "tt-020", name: "Norte", validDays: "12 Oct", price: 80000, serviceFee: 6400, availableCount: 8000, maxPerOrder: 4, status: "available" },
        ],
      },
      {
        id: "sec-sur-f",
        name: "Sur",
        svgPath: "M 100 20 L 100 90 L 300 90 L 300 20 Z",
        color: "#22c55e",
        status: "available",
        ticketTypes: [
          { id: "tt-021", name: "Sur", validDays: "12 Oct", price: 80000, serviceFee: 6400, availableCount: 7500, maxPerOrder: 4, status: "available" },
        ],
      },
      {
        id: "sec-oriental-f",
        name: "Oriental",
        svgPath: "M 310 100 L 310 290 L 380 290 L 380 100 Z",
        color: "#22c55e",
        status: "available",
        ticketTypes: [
          { id: "tt-022", name: "Oriental", validDays: "12 Oct", price: 150000, serviceFee: 12000, availableCount: 3000, maxPerOrder: 4, status: "available" },
        ],
      },
      {
        id: "sec-occ-f",
        name: "Occidental Preferencial",
        svgPath: "M 20 100 L 20 290 L 90 290 L 90 100 Z",
        color: "#eab308",
        status: "limited",
        ticketTypes: [
          { id: "tt-023", name: "Occidental Preferencial", validDays: "12 Oct", price: 300000, serviceFee: 24000, availableCount: 100, maxPerOrder: 2, status: "limited" },
        ],
      },
    ],
    salesStartAt: null,
    status: "available",
    active: true,
  },
  {
    id: "evt-004",
    name: "El Fantasma de la Ópera",
    description: `<h2>El Fantasma de la Ópera</h2>
<p>El musical más exitoso de todos los tiempos llega por primera vez a Medellín. Una producción espectacular con un elenco internacional.</p>`,
    coverImage: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=1200&h=600&fit=crop",
    flyerImage: "https://images.unsplash.com/photo-1503095396549-807759245b35?w=800&h=800&fit=crop",
    category: "theater",
    venueName: "Teatro Metropolitano de Medellín",
    venueAddress: "Calle 41 #57-30, Medellín",
    city: "Medellín",
    startsAt: "2026-09-20T20:00:00-05:00",
    endsAt: "2026-09-20T22:30:00-05:00",
    timezone: "America/Bogota",
    minAge: 12,
    organizer: "Teatro Nacional",
    latitude: 6.2492,
    longitude: -75.5743,
    priceFrom: 120000,
    currencyCode: "COP",
    isMultiDay: false,
    days: [
      { dayNumber: 1, label: "Sábado 20 de Septiembre", date: "2026-09-20", doorTime: "7:00 PM" },
    ],
    ticketTypes: [
      { id: "tt-030", name: "Balcón", validDays: "20 Sep", price: 120000, serviceFee: 9600, availableCount: 400, maxPerOrder: 6, status: "available" },
      { id: "tt-031", name: "Platea", validDays: "20 Sep", price: 220000, serviceFee: 17600, availableCount: 200, maxPerOrder: 6, status: "available" },
      { id: "tt-032", name: "Palco VIP", validDays: "20 Sep", price: 450000, serviceFee: 36000, availableCount: 30, maxPerOrder: 4, status: "limited" },
    ],
    sections: [
      {
        id: "sec-balcon",
        name: "Balcón",
        svgPath: "M 50 250 L 50 380 L 350 380 L 350 250 Z",
        color: "#22c55e",
        status: "available",
        ticketTypes: [
          { id: "tt-030", name: "Balcón", validDays: "20 Sep", price: 120000, serviceFee: 9600, availableCount: 400, maxPerOrder: 6, status: "available" },
        ],
      },
      {
        id: "sec-platea",
        name: "Platea",
        svgPath: "M 80 120 L 80 240 L 320 240 L 320 120 Z",
        color: "#22c55e",
        status: "available",
        ticketTypes: [
          { id: "tt-031", name: "Platea", validDays: "20 Sep", price: 220000, serviceFee: 17600, availableCount: 200, maxPerOrder: 6, status: "available" },
        ],
      },
      {
        id: "sec-palco",
        name: "Palco VIP",
        svgPath: "M 120 30 L 120 110 L 280 110 L 280 30 Z",
        color: "#eab308",
        status: "limited",
        ticketTypes: [
          { id: "tt-032", name: "Palco VIP", validDays: "20 Sep", price: 450000, serviceFee: 36000, availableCount: 30, maxPerOrder: 4, status: "limited" },
        ],
      },
    ],
    salesStartAt: null,
    status: "available",
    active: true,
  },
  {
    id: "evt-005",
    name: "Creamfields Colombia 2026",
    description: `<h2>Creamfields Colombia 2026</h2>
<p>El festival de música electrónica más importante del mundo aterriza en Cali. Dos días de la mejor música electrónica con artistas de talla mundial.</p>`,
    coverImage: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200&h=600&fit=crop",
    flyerImage: "https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=800&h=800&fit=crop",
    category: "festivals",
    venueName: "Centro de Eventos Valle del Pacífico",
    venueAddress: "Km 1 Vía Cali-Palmira, Cali",
    city: "Cali",
    startsAt: "2027-01-15T15:00:00-05:00",
    endsAt: "2027-01-16T06:00:00-05:00",
    timezone: "America/Bogota",
    minAge: 18,
    organizer: "Cream Holdings",
    latitude: 3.4216,
    longitude: -76.5205,
    priceFrom: 200000,
    currencyCode: "COP",
    isMultiDay: true,
    days: [
      { dayNumber: 1, label: "Día 1 - Viernes", date: "2027-01-15", doorTime: "3:00 PM" },
      { dayNumber: 2, label: "Día 2 - Sábado", date: "2027-01-16", doorTime: "2:00 PM" },
    ],
    ticketTypes: [
      { id: "tt-040", name: "Abono 2 días - General", validDays: "Viernes, Sábado", price: 380000, serviceFee: 30400, availableCount: 3000, maxPerOrder: 4, status: "available" },
      { id: "tt-041", name: "Abono 2 días - VIP", validDays: "Viernes, Sábado", price: 750000, serviceFee: 60000, availableCount: 500, maxPerOrder: 4, status: "available" },
      { id: "tt-042", name: "Solo Viernes - General", validDays: "Viernes", price: 200000, serviceFee: 16000, availableCount: 1500, maxPerOrder: 6, status: "available" },
      { id: "tt-043", name: "Solo Sábado - General", validDays: "Sábado", price: 220000, serviceFee: 17600, availableCount: 1200, maxPerOrder: 6, status: "available" },
    ],
    sections: [
      {
        id: "sec-gen-c",
        name: "General",
        svgPath: "M 50 200 L 50 380 L 350 380 L 350 200 Z",
        color: "#22c55e",
        status: "available",
        ticketTypes: [
          { id: "tt-040", name: "Abono 2 días - General", validDays: "Viernes, Sábado", price: 380000, serviceFee: 30400, availableCount: 3000, maxPerOrder: 4, status: "available" },
          { id: "tt-042", name: "Solo Viernes - General", validDays: "Viernes", price: 200000, serviceFee: 16000, availableCount: 1500, maxPerOrder: 6, status: "available" },
          { id: "tt-043", name: "Solo Sábado - General", validDays: "Sábado", price: 220000, serviceFee: 17600, availableCount: 1200, maxPerOrder: 6, status: "available" },
        ],
      },
      {
        id: "sec-vip-c",
        name: "VIP",
        svgPath: "M 100 50 L 100 190 L 300 190 L 300 50 Z",
        color: "#22c55e",
        status: "available",
        ticketTypes: [
          { id: "tt-041", name: "Abono 2 días - VIP", validDays: "Viernes, Sábado", price: 750000, serviceFee: 60000, availableCount: 500, maxPerOrder: 4, status: "available" },
        ],
      },
    ],
    salesStartAt: "2026-12-01T10:00:00-05:00",
    status: "available",
    active: true,
  },
  {
    id: "evt-006",
    name: "Shakira - Las Mujeres Ya No Lloran World Tour",
    description: `<h2>Shakira en Bogotá</h2>
<p>La artista colombiana más exitosa de todos los tiempos regresa a su tierra con un espectáculo inolvidable.</p>`,
    coverImage: "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1200&h=600&fit=crop",
    flyerImage: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800&h=800&fit=crop",
    category: "concerts",
    venueName: "Estadio El Campín",
    venueAddress: "Carrera 30 #57-60, Bogotá",
    city: "Bogotá",
    startsAt: "2026-10-25T19:00:00-05:00",
    endsAt: "2026-10-25T23:00:00-05:00",
    timezone: "America/Bogota",
    minAge: null,
    organizer: "Ocesa Colombia",
    latitude: 4.6474,
    longitude: -74.0774,
    priceFrom: 150000,
    currencyCode: "COP",
    isMultiDay: false,
    days: [
      { dayNumber: 1, label: "Sábado 25 de Octubre", date: "2026-10-25", doorTime: "5:00 PM" },
    ],
    ticketTypes: [
      { id: "tt-050", name: "General Norte", validDays: "25 Oct", price: 150000, serviceFee: 12000, availableCount: 0, maxPerOrder: 6, status: "sold_out" },
      { id: "tt-051", name: "General Sur", validDays: "25 Oct", price: 150000, serviceFee: 12000, availableCount: 0, maxPerOrder: 6, status: "sold_out" },
      { id: "tt-052", name: "Oriental", validDays: "25 Oct", price: 280000, serviceFee: 22400, availableCount: 0, maxPerOrder: 4, status: "sold_out" },
      { id: "tt-053", name: "Occidental VIP", validDays: "25 Oct", price: 550000, serviceFee: 44000, availableCount: 0, maxPerOrder: 2, status: "sold_out" },
    ],
    sections: [
      {
        id: "sec-norte-s",
        name: "Norte",
        svgPath: "M 100 300 L 100 380 L 300 380 L 300 300 Z",
        color: "#ef4444",
        status: "sold_out",
        ticketTypes: [
          { id: "tt-050", name: "General Norte", validDays: "25 Oct", price: 150000, serviceFee: 12000, availableCount: 0, maxPerOrder: 6, status: "sold_out" },
        ],
      },
      {
        id: "sec-sur-s",
        name: "Sur",
        svgPath: "M 100 20 L 100 90 L 300 90 L 300 20 Z",
        color: "#ef4444",
        status: "sold_out",
        ticketTypes: [
          { id: "tt-051", name: "General Sur", validDays: "25 Oct", price: 150000, serviceFee: 12000, availableCount: 0, maxPerOrder: 6, status: "sold_out" },
        ],
      },
      {
        id: "sec-orien-s",
        name: "Oriental",
        svgPath: "M 310 100 L 310 290 L 380 290 L 380 100 Z",
        color: "#ef4444",
        status: "sold_out",
        ticketTypes: [
          { id: "tt-052", name: "Oriental", validDays: "25 Oct", price: 280000, serviceFee: 22400, availableCount: 0, maxPerOrder: 4, status: "sold_out" },
        ],
      },
      {
        id: "sec-occ-s",
        name: "Occidental VIP",
        svgPath: "M 20 100 L 20 290 L 90 290 L 90 100 Z",
        color: "#ef4444",
        status: "sold_out",
        ticketTypes: [
          { id: "tt-053", name: "Occidental VIP", validDays: "25 Oct", price: 550000, serviceFee: 44000, availableCount: 0, maxPerOrder: 2, status: "sold_out" },
        ],
      },
    ],
    salesStartAt: null,
    status: "sold_out",
    active: true,
  },
];

export function getEventById(id: string): EventData | undefined {
  return mockEvents.find((e) => e.id === id);
}

export function formatPrice(amount: number, currency: string = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateRange(startsAt: string, endsAt: string, isMultiDay: boolean): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

  if (isMultiDay) {
    return `${start.toLocaleDateString("es-CO", opts)} - ${end.toLocaleDateString("es-CO", opts)}, ${start.getFullYear()}`;
  }

  return start.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
