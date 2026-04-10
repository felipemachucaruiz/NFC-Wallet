export interface EventDay {
  dayNumber: number;
  label: string;
  date: string;
  doorTime: string;
}

export interface TicketType {
  id: string;
  name: string;
  validDays: string;
  price: number;
  serviceFee: number;
  availableCount: number;
  maxPerOrder: number;
  sectionId?: string;
  status: "available" | "limited" | "sold_out";
}

export interface VenueSection {
  id: string;
  name: string;
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
  category: string;
  venueName: string;
  venueAddress: string;
  city: string;
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
