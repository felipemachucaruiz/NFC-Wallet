import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";

type EventContextType = {
  eventId: string;
  setEventId: (id: string) => void;
};

const EventContext = createContext<EventContextType>({ eventId: "", setEventId: () => {} });

const STORAGE_KEY = "tapee_admin_event_id";

export function EventProvider({ children }: { children: ReactNode }) {
  const { data: user } = useGetCurrentAuthUser();
  const role = user?.user?.role;
  const userEventId = user?.user?.eventId ?? "";

  const [storedEventId, setStoredEventId] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) || "";
    }
    return "";
  });

  useEffect(() => {
    if (role === "event_admin" && userEventId) {
      setStoredEventId(userEventId);
    }
  }, [role, userEventId]);

  // For event_admin the assigned eventId takes precedence; for admin use localStorage
  const eventId = role === "event_admin" ? (userEventId || storedEventId) : storedEventId;

  const setEventId = (id: string) => {
    setStoredEventId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <EventContext.Provider value={{ eventId, setEventId }}>
      {children}
    </EventContext.Provider>
  );
}

export function useEventContext() {
  return useContext(EventContext);
}
