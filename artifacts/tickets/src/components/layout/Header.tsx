import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Menu, X, Globe, User, Ticket, LogOut, ShoppingBag, Wifi, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { SearchAutocomplete } from "@/components/SearchAutocomplete";
import { LANGUAGE_KEY } from "@/i18n";

export function Header() {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout, openAuthModal } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const switchLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem(LANGUAGE_KEY, lang);
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <img
                src={`${import.meta.env.BASE_URL}tapee-logo.png`}
                alt="Tapee"
                className="h-12"
              />
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link href="/">
                <Button variant="ghost" size="sm">{t("nav.home")}</Button>
              </Link>
              {isAuthenticated && (
                <>
                  <Link href="/my-tickets">
                    <Button variant="ghost" size="sm">{t("nav.myTickets")}</Button>
                  </Link>
                  <Link href="/my-bracelets">
                    <Button variant="ghost" size="sm">{t("nav.myBracelets")}</Button>
                  </Link>
                  <Link href="/my-transactions">
                    <Button variant="ghost" size="sm">{t("nav.myTransactions")}</Button>
                  </Link>
                </>
              )}
            </nav>
          </div>

          <SearchAutocomplete className="hidden md:flex flex-1 max-w-md mx-6" />

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <Globe className="w-4 h-4" />
                  <span className="hidden sm:inline text-xs uppercase">{i18n.language}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => switchLanguage("es")}>
                  Español {i18n.language === "es" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => switchLanguage("en")}>
                  English {i18n.language === "en" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    <User className="w-4 h-4" />
                    <span className="hidden sm:inline text-sm">{user?.firstName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate("/my-tickets")}>
                    <Ticket className="w-4 h-4 mr-2" />
                    {t("nav.myTickets")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/my-bracelets")}>
                    <Wifi className="w-4 h-4 mr-2" />
                    {t("nav.myBracelets")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/my-transactions")}>
                    <Receipt className="w-4 h-4 mr-2" />
                    {t("nav.myTransactions")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/my-orders")}>
                    <ShoppingBag className="w-4 h-4 mr-2" />
                    {t("nav.myOrders")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/account")}>
                    <User className="w-4 h-4 mr-2" />
                    {t("nav.account")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => openAuthModal("login")}>{t("nav.login")}</Button>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => openAuthModal("register")}>
                  {t("nav.register")}
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pb-4 border-t border-border pt-4 space-y-3">
            <SearchAutocomplete onNavigate={() => setMobileMenuOpen(false)} />
            <div className="flex flex-col gap-1">
              <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full justify-start">{t("nav.home")}</Button>
              </Link>
              {isAuthenticated ? (
                <>
                  <Link href="/my-tickets" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" size="sm" className="w-full justify-start">{t("nav.myTickets")}</Button>
                  </Link>
                  <Link href="/my-bracelets" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" size="sm" className="w-full justify-start">{t("nav.myBracelets")}</Button>
                  </Link>
                  <Link href="/my-transactions" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" size="sm" className="w-full justify-start">{t("nav.myTransactions")}</Button>
                  </Link>
                  <Link href="/my-orders" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" size="sm" className="w-full justify-start">{t("nav.myOrders")}</Button>
                  </Link>
                  <Link href="/account" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" size="sm" className="w-full justify-start">{t("nav.account")}</Button>
                  </Link>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-destructive" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                    {t("nav.logout")}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { openAuthModal("login"); setMobileMenuOpen(false); }}>{t("nav.login")}</Button>
                  <Button size="sm" className="w-full bg-primary text-primary-foreground" onClick={() => { openAuthModal("register"); setMobileMenuOpen(false); }}>{t("nav.register")}</Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
