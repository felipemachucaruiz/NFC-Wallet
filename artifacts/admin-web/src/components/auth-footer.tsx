import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { LANGUAGE_KEY } from "@/i18n";
import { setDateLocale } from "@/lib/date";

export function AuthFooter() {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const next = i18n.language === "es" ? "en" : "es";
    i18n.changeLanguage(next);
    localStorage.setItem(LANGUAGE_KEY, next);
    setDateLocale(next);
  };

  return (
    <footer className="px-6 py-4 border-t border-border">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-muted-foreground/60">
        <span>{t("authFooter.copyright")}</span>

        <div className="flex items-center gap-4 flex-wrap justify-center">
          <a
            href="https://www.tapeetickets.com/privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground transition-colors"
          >
            {t("authFooter.privacy")}
          </a>
          <a
            href="https://www.tapeetickets.com/terminos"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground transition-colors"
          >
            {t("authFooter.terms")}
          </a>
          <a
            href="mailto:soporte@tapee.app"
            className="hover:text-muted-foreground transition-colors"
          >
            {t("authFooter.help")}
          </a>
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 hover:text-muted-foreground transition-colors"
          >
            <Languages className="h-3 w-3" />
            {t("authFooter.switchLang")}
          </button>
        </div>
      </div>
    </footer>
  );
}
