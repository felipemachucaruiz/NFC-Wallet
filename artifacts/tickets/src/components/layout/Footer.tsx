import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="mb-4">
              <img
                src={`${import.meta.env.BASE_URL}tapee-logo.png`}
                alt="Tapee"
                className="h-12"
              />
            </div>
            <p className="text-muted-foreground text-sm max-w-md">
              La plataforma de boletas más segura de Colombia. Compra tus entradas de forma rápida y segura con tecnología NFC.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.terms")}</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.privacy")}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Tapee</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.about")}</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.help")}</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-6 flex flex-col items-center gap-3">
          <p className="text-xs text-muted-foreground">{t("footer.paymentMethods", "Métodos de pago aceptados")}</p>
          <img
            src={`${import.meta.env.BASE_URL}metodos-pago.png`}
            alt="Amex, Visa, Mastercard, Addi, Efecty, Nequi, Apple Pay, Google Pay"
            className="h-11 object-contain"
          />
        </div>

        <div className="border-t border-border mt-6 pt-5 text-center text-sm text-muted-foreground space-y-1">
          <p>© {year} Tapee. {t("footer.rights")}.</p>
          <p>INVERSIONES JUDIMAC S.A.S · NIT: 901890734-3</p>
        </div>
      </div>
    </footer>
  );
}
