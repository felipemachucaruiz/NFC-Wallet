import { useState } from "react";
import { useGetCurrentAuthUser, useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserCheck, CalendarDays, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";

type DayCheckin = {
  dayId: string;
  dayLabel: string;
  date: string;
  totalCheckins: number;
  totalTickets: number;
  sections: {
    name: string;
    checkins: number;
    capacity: number;
  }[];
};

const MOCK_CHECKINS: DayCheckin[] = [
  {
    dayId: "day-1",
    dayLabel: "Day 1 - Friday",
    date: "2026-04-10",
    totalCheckins: 823,
    totalTickets: 1200,
    sections: [
      { name: "VIP", checkins: 140, capacity: 200 },
      { name: "General", checkins: 550, capacity: 800 },
      { name: "Palco", checkins: 38, capacity: 50 },
      { name: "Platea", checkins: 95, capacity: 150 },
    ],
  },
  {
    dayId: "day-2",
    dayLabel: "Day 2 - Saturday",
    date: "2026-04-11",
    totalCheckins: 1050,
    totalTickets: 1400,
    sections: [
      { name: "VIP", checkins: 180, capacity: 200 },
      { name: "General", checkins: 700, capacity: 950 },
      { name: "Palco", checkins: 45, capacity: 50 },
      { name: "Platea", checkins: 125, capacity: 200 },
    ],
  },
  {
    dayId: "day-3",
    dayLabel: "Day 3 - Sunday",
    date: "2026-04-12",
    totalCheckins: 340,
    totalTickets: 1100,
    sections: [
      { name: "VIP", checkins: 60, capacity: 200 },
      { name: "General", checkins: 220, capacity: 700 },
      { name: "Palco", checkins: 20, capacity: 50 },
      { name: "Platea", checkins: 40, capacity: 150 },
    ],
  },
];

export default function EventCheckins() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";
  const [selectedDay, setSelectedDay] = useState("all");

  const filteredDays = selectedDay === "all" ? MOCK_CHECKINS : MOCK_CHECKINS.filter((d) => d.dayId === selectedDay);

  const totalCheckins = filteredDays.reduce((s, d) => s + d.totalCheckins, 0);
  const totalTickets = filteredDays.reduce((s, d) => s + d.totalTickets, 0);
  const checkinRate = totalTickets > 0 ? Math.round((totalCheckins / totalTickets) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("checkins.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("checkins.subtitle")}</p>
        </div>
        <Select value={selectedDay} onValueChange={setSelectedDay}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("checkins.allDays")}</SelectItem>
            {MOCK_CHECKINS.map((d) => (
              <SelectItem key={d.dayId} value={d.dayId}>{d.dayLabel}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            <p className="text-3xl font-bold">{MOCK_CHECKINS.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("checkins.daysConfigured")}</p>
          </CardContent>
        </Card>
      </div>

      {filteredDays.map((day) => {
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("checkins.colSection")}</TableHead>
                    <TableHead>{t("checkins.colCheckins")}</TableHead>
                    <TableHead>{t("checkins.colCapacity")}</TableHead>
                    <TableHead>{t("checkins.colRate")}</TableHead>
                    <TableHead>{t("checkins.colProgress")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {day.sections.map((section) => {
                    const sectionRate = section.capacity > 0 ? Math.round((section.checkins / section.capacity) * 100) : 0;
                    return (
                      <TableRow key={section.name}>
                        <TableCell className="font-medium">{section.name}</TableCell>
                        <TableCell>{section.checkins.toLocaleString()}</TableCell>
                        <TableCell>{section.capacity.toLocaleString()}</TableCell>
                        <TableCell>{sectionRate}%</TableCell>
                        <TableCell className="w-40">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${sectionRate}%` }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
