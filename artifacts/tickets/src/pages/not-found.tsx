import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center">
      <Card className="w-full max-w-md mx-4 bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold">404 — {t("common.pageNotFound")}</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {t("common.pageNotFoundDesc")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
