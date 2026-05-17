export type EventCategory = "concert" | "festival" | "sports" | "theater" | "conference" | "party" | "other" | "race";

export type TicketAvailability = "available" | "limited" | "sold_out";

export type TicketStatus = "valid" | "active" | "used" | "cancelled" | "expired";

export interface EventDay {
  dayNumber: number;
  label: string;
  date: string;
}

export interface TicketUnit {
  id: string;
  unitNumber: number;
  unitLabel?: string;
  status: "available" | "reserved" | "sold";
  mapX: number | null;
  mapY: number | null;
}

export interface TicketType {
  id: string;
  name: string;
  price: number;
  serviceFee: number;
  availability: TicketAvailability;
  maxPerOrder: number;
  validDays?: number[];
  sectionId?: string;
  sectionName?: string;
  isNumberedUnits?: boolean;
  unitLabel?: string;
  ticketsPerUnit?: number;
  units?: TicketUnit[];
}

export interface VenueSection {
  id: string;
  name: string;
  svgPathData?: string;
  color: string;
  availability: TicketAvailability;
  ticketTypes: TicketType[];
}

export interface VenueMap {
  svgViewBox: string;
  floorplanImageUrl?: string;
  sections: VenueSection[];
}

export interface EventListItem {
  id: string;
  name: string;
  coverImageUrl?: string;
  flyerImageUrl?: string;
  startsAt: string;
  endsAt?: string;
  venueName: string;
  venueAddress: string;
  city: string;
  category: EventCategory;
  minPrice?: number;
  maxPrice?: number;
  currencyCode: string;
  soldOut: boolean;
  multiDay: boolean;
  days?: EventDay[];
  externalTicketingUrl?: string | null;
  externalTicketingVendorName?: string | null;
}

export interface EventDetail extends EventListItem {
  description?: string;
  minAge?: number;
  latitude?: number;
  longitude?: number;
  timezone: string;
  ticketTypes: TicketType[];
  venueMap?: VenueMap;
  salesStartAt?: string;
  salesEndAt?: string;
  vimeoUrl?: string | null;
  floatingGraphics?: Array<{ url: string; opacity: number }> | null;
  pulepId?: string | null;
  promoterCompanyName?: string | null;
  promoterNit?: string | null;
  doorsOpenAt?: string | null;
  raceConfig?: { sizes: string[] } | null;
}

export interface AttendeeInfo {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: "male" | "female" | "non_binary" | "";
  idDocument: string;
  shirtSize?: string;
  bloodType?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  eps?: string;
}

export interface OrderTicket {
  ticketTypeId: string;
  ticketTypeName: string;
  sectionName?: string;
  price: number;
  serviceFee: number;
  validDays?: number[];
  attendee: AttendeeInfo;
}

export interface OrderSummary {
  eventId: string;
  eventName: string;
  tickets: OrderTicket[];
  subtotal: number;
  totalServiceFees: number;
  total: number;
  currencyCode: string;
}

export type PaymentMethod = "nequi" | "pse" | "card" | "bancolombia_transfer" | "daviplata" | "puntoscolombia" | "free";

export interface TicketPurchaseResult {
  orderId: string;
  status: string;
  redirectUrl?: string | null;
}

export interface MyTicket {
  id: string;
  eventId: string;
  eventName: string;
  eventCoverImageUrl?: string;
  startsAt: string;
  endsAt?: string;
  venueName: string;
  latitude?: number | null;
  longitude?: number | null;
  sectionName?: string;
  ticketTypeName: string;
  validDays?: EventDay[];
  checkedInDays?: number[];
  status: TicketStatus;
  qrCode: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string;
  purchasedByMe: boolean;
  currencyCode: string;
  price: number;
  orderId?: string;
}
