export interface EventDay {
  dayNumber: number;
  label: string;
  date: string;
  doorTime: string;
}

export interface PricingStage {
  id: string;
  name: string;
  price: number;
  startsAt: string;
  endsAt: string;
}

export interface TicketTypeUnit {
  id: string;
  unitNumber: number;
  unitLabel: string;
  status: "available" | "reserved" | "sold";
  mapX: number | null;
  mapY: number | null;
}

export interface TicketType {
  id: string;
  name: string;
  validDays: string;
  price: number;
  basePrice?: number;
  currentStageName?: string | null;
  serviceFee: number;
  serviceFeeType: "fixed" | "percentage";
  availableCount: number;
  maxPerOrder: number;
  sectionId?: string;
  status: "available" | "limited" | "sold_out";
  pricingStages?: PricingStage[];
  nextStage?: { name: string; price: number; startsAt: string } | null;
  isNumberedUnits?: boolean;
  unitLabel?: string;
  ticketsPerUnit?: number;
  units?: TicketTypeUnit[];
}

export interface VenueSection {
  id: string;
  name: string;
  sectionType: string;
  svgPath: string;
  color: string;
  status: "available" | "limited" | "sold_out" | "na";
  ticketTypes: TicketType[];
}

export interface EventData {
  id: string;
  name: string;
  description: string;
  coverImage: string;
  flyerImage: string;
  floorplanImage: string;
  category: string;
  venueName: string;
  venueAddress: string;
  city: string;
  promoterCompanyName: string;
  promoterNit: string;
  pulepId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  minAge: number | null;
  organizer: string;
  latitude: number;
  longitude: number;
  priceFrom: number;
  currencyCode: string;
  isMultiDay: boolean;
  days: EventDay[];
  ticketTypes: TicketType[];
  sections: VenueSection[];
  salesStartAt: string | null;
  status: "available" | "limited" | "sold_out";
  active: boolean;
}

export interface AttendeeData {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: "male" | "female" | "";
  idDocument: string;
}

export interface CartTicket {
  ticketTypeId: string;
  ticketTypeName: string;
  sectionName: string;
  validDays: string;
  price: number;
  attendee: AttendeeData;
}

export interface OrderData {
  id: string;
  eventId: string;
  eventName: string;
  createdAt: string;
  status: "completed" | "pending" | "failed";
  tickets: UserTicket[];
  total: number;
}

export interface UserTicket {
  id: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  venueName: string;
  sectionName: string;
  ticketTypeName: string;
  validDays: string;
  status: "valid" | "used";
  qrCode: string;
  dayStatuses?: { day: string; status: "upcoming" | "checked_in" }[];
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}
