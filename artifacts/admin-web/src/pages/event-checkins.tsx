import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCheck, CalendarDays, BarChart3, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import { apiFetchCheckinStats } from "@/lib/api";

export default function EventCheckins() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId: ctxEventId } = useEventContext();
  const resolvedEventId = auth?.user?.role === "admin" ? ctxEventId : (auth?.user?.eventId ?? "");
  const [selectedDay, setSelectedDay] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["checkinStats", resolvedEventId],
    queryFn: () => apiFetchCheckinStats(resolvedEventId),
    enabled: !!resolvedEventId,
    refetchInterval: 30000,
  });

  const days = data?.days ?? [];
  const filteredDays = selectedDay === "all" ? days : days.filter((d) => d.dayId === selectedDay);

  const totalCheckins = filteredDays.reduce((s, d) => s + d.totalCheckins, 0);
  const totalTickets = data?.totalTickets ?? 0;
  const checkinRate = totalTickets > 0 ? Math.round((totalCheckins / totalTickets) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("checkins.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("checkins.subtitle")}</p>
        </div>
        {days.length > 0 && (
          <Select value={selectedDay} onValueChange={setSelectedDay}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("checkins.allDays")}</SelectItem>
              {days.map((d) => (
                <SelectItem key={d.dayId} value={d.dayId}>{d.dayLabel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCheck className="w-4 h-4" /> {t("checkins.totalCheckins")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalCheckins.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("checkins.ofTickets", { total: totalTickets.toLocaleString() })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> {t("checkins.checkinRate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{checkinRate}%</p>
            <div className="h-2 bg-muted rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${checkinRate}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> {t("checkins.eventDays")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{days.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("checkins.daysConfigured")}</p>
          </CardContent>
        </Card>
      </div>

      {filteredDays.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t("checkins.noDays", "No event days configured yet")}</p>
          </CardContent>
        </Card>
      ) : (
        filteredDays.map((day) => {
          const dayRate = day.totalTickets > 0 ? Math.round((day.totalCheckins / day.totalTickets) * 100) : 0;
          return (
            <Card key={day.dayId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {day.dayLabel}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{day.date}</Badge>
                    <Badge variant={dayRate >= 80 ? "default" : "secondary"}>
                      {day.totalCheckins}/{day.totalTickets} ({dayRate}%)
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${dayRate}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
