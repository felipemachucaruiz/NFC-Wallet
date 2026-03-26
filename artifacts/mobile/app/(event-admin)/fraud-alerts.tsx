import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { FraudAlertsScreen } from "@/components/FraudAlertsScreen";

export default function EventAdminFraudAlertsPage() {
  const { user } = useAuth();
  return <FraudAlertsScreen eventId={user?.eventId ?? undefined} />;
}
