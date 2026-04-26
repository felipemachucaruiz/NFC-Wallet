import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Loader2, CreditCard, Smartphone, Building2, ChevronDown } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { initiateTopUp, getWompiConfig, fetchSavedCards, type SavedCard } from "@/lib/api";

const AMOUNT_PRESETS = [20_000, 50_000, 100_000, 200_000, 300_000, 500_000];

const PSE_BANKS = [
  { code: "1007", name: "Bancolombia" },
  { code: "1022", name: "BBVA Colombia" },
  { code: "1006", name: "Banco de Bogotá" },
  { code: "1009", name: "Citibank" },
  { code: "1051", name: "Davivienda" },
  { code: "1040", name: "Banco Agrario" },
  { code: "1023", name: "Banco de Occidente" },
  { code: "1062", name: "Banco Falabella" },
  { code: "1060", name: "Banco Pichincha" },
];

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(amount);
}

function getBrowserInfo() {
  return {
    browser_color_depth: String(window.screen.colorDepth),
    browser_screen_height: String(window.screen.height),
    browser_screen_width: String(window.screen.width),
    browser_language: navigator.language,
    browser_user_agent: navigator.userAgent,
    browser_tz: String(new Date().getTimezoneOffset()),
  };
}

type PaymentMethod = "nequi" | "pse" | "card" | "bancolombia_transfer" | "daviplata";

export default function BraceletTopup() {
  const { t } = useTranslation();
  const { isAuthenticated, loading: authLoading, openAuthModal } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const braceletUid = params.get("uid") ?? undefined;
  const isPreload = !braceletUid;

  const [amount, setAmount] = useState<number>(50_000);
  const [customAmount, setCustomAmount] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("nequi");

  // Nequi / Daviplata
  const [phone, setPhone] = useState("");
  // PSE
  const [bankCode, setBankCode] = useState("");
  const [pseType, setPseType] = useState<0 | 1>(0);
  const [pseEmail, setPseEmail] = useState("");
  const [legalIdType, setLegalIdType] = useState("CC");
  const [legalId, setLegalId] = useState("");
  // Card
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [wompiKey, setWompiKey] = useState("");
  const [wompiBase, setWompiBase] = useState("");
  const [cardToken, setCardToken] = useState("");
  const [cardTokenError, setCardTokenError] = useState("");

  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      openAuthModal("login", braceletUid ? `bracelet-topup?uid=${braceletUid}` : "bracelet-topup");
      navigate("/");
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchSavedCards().then((r) => setSavedCards(r.cards)).catch(() => {});
    getWompiConfig().then((r) => { setWompiKey(r.publicKey); setWompiBase(r.baseUrl); }).catch(() => {});
  }, [isAuthenticated]);

  const finalAmount = useCustom
    ? Math.max(0, parseInt(customAmount.replace(/\D/g, ""), 10) || 0)
    : amount;

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => {
      setError("");
      if (finalAmount < 1000) throw new Error(t("topUp.minAmount"));
      const base = {
        braceletUid,
        amount: finalAmount,
        paymentMethod: method,
        browserInfo: getBrowserInfo(),
      };
      if (method === "nequi" || method === "daviplata") {
        if (!phone || phone.replace(/\D/g, "").length !== 10) throw new Error(t("topUp.phoneRequired"));
        return initiateTopUp({ ...base, phoneNumber: phone.replace(/\D/g, "") });
      }
      if (method === "pse") {
        if (!bankCode) throw new Error(t("topUp.bankRequired"));
        if (!pseEmail) throw new Error(t("topUp.emailRequired"));
        if (!legalId) throw new Error(t("topUp.idRequired"));
        return initiateTopUp({ ...base, bankCode, pseUserType: pseType, pseEmail, userLegalIdType: legalIdType as any, userLegalId: legalId });
      }
      if (method === "bancolombia_transfer") {
        return initiateTopUp({ ...base });
      }
      if (method === "card") {
        if (selectedCardId) return initiateTopUp({ ...base, savedCardId: selectedCardId });
        if (!cardToken) throw new Error(t("topUp.cardRequired"));
        return initiateTopUp({ ...base, cardToken });
      }
      throw new Error("Unknown method");
    },
    onSuccess: (res) => {
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else {
        navigate(`/bracelet-payment-status?intentId=${res.intentId}`);
      }
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(braceletUid ? `/my-bracelets` : "/my-bracelets")}
            className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold">
              {isPreload ? t("topUp.preloadTitle") : t("topUp.topUpTitle")}
            </h1>
            {braceletUid && (
              <p className="text-xs text-zinc-500 font-mono mt-0.5">{braceletUid.replace(/:/g, "")}</p>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("topUp.amount")}</p>
          <div className="grid grid-cols-3 gap-2">
            {AMOUNT_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => { setAmount(p); setUseCustom(false); }}
                className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                  !useCustom && amount === p
                    ? "bg-cyan-500 border-cyan-500 text-black"
                    : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {formatCOP(p)}
              </button>
            ))}
          </div>
          <div>
            <button
              onClick={() => setUseCustom(true)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                useCustom
                  ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              <span className="flex-1 text-left">{t("topUp.customAmount")}</span>
            </button>
            {useCustom && (
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                className="mt-2 w-full bg-zinc-800 border border-cyan-500/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                placeholder="Ej: 75000"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value.replace(/\D/g, ""))}
              />
            )}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-zinc-500">{t("topUp.total")}</span>
            <span className="text-lg font-bold text-white">{formatCOP(finalAmount)}</span>
          </div>
        </div>

        {/* Payment method */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("topUp.paymentMethod")}</p>
          <div className="grid grid-cols-2 gap-2">
            {(["nequi", "daviplata", "pse", "bancolombia_transfer", "card"] as PaymentMethod[]).map((m) => {
              const labels: Record<PaymentMethod, string> = {
                nequi: "Nequi",
                daviplata: "Daviplata",
                pse: "PSE",
                bancolombia_transfer: "Bancolombia",
                card: t("topUp.card"),
              };
              return (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-semibold border transition-colors flex items-center justify-center gap-2 ${
                    method === m
                      ? "bg-cyan-500 border-cyan-500 text-black"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                  }`}
                >
                  {(m === "card") && <CreditCard className="w-3.5 h-3.5" />}
                  {(m === "nequi" || m === "daviplata") && <Smartphone className="w-3.5 h-3.5" />}
                  {(m === "pse" || m === "bancolombia_transfer") && <Building2 className="w-3.5 h-3.5" />}
                  {labels[m]}
                </button>
              );
            })}
          </div>

          {/* Nequi / Daviplata */}
          {(method === "nequi" || method === "daviplata") && (
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">{t("topUp.phoneNumber")}</label>
              <input
                type="tel"
                inputMode="numeric"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                placeholder="3001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
            </div>
          )}

          {/* PSE */}
          {method === "pse" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">{t("topUp.bank")}</label>
                <div className="relative">
                  <select
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm appearance-none focus:outline-none focus:border-cyan-500 transition-colors"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                  >
                    <option value="">{t("topUp.selectBank")}</option>
                    {PSE_BANKS.map((b) => (
                      <option key={b.code} value={b.code}>{b.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">{t("topUp.personType")}</label>
                <div className="flex gap-2">
                  {([0, 1] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setPseType(v)}
                      className={`flex-1 py-2 rounded-xl text-sm border transition-colors ${
                        pseType === v ? "bg-cyan-500 border-cyan-500 text-black font-semibold" : "bg-zinc-800 border-zinc-700 text-zinc-300"
                      }`}
                    >
                      {v === 0 ? t("topUp.naturalPerson") : t("topUp.legalEntity")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">{t("topUp.email")}</label>
                <input
                  type="email"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  value={pseEmail}
                  onChange={(e) => setPseEmail(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <div className="relative w-28">
                  <select
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none focus:border-cyan-500 transition-colors"
                    value={legalIdType}
                    onChange={(e) => setLegalIdType(e.target.value)}
                  >
                    {["CC", "CE", "NIT", "PP", "TI"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder={t("topUp.idNumber")}
                  value={legalId}
                  onChange={(e) => setLegalId(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Card */}
          {method === "card" && (
            <div className="space-y-3">
              {savedCards.length > 0 && (
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">{t("topUp.savedCards")}</label>
                  <div className="space-y-2">
                    {savedCards.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCardId(c.id); setCardToken(""); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                          selectedCardId === c.id
                            ? "border-cyan-500 bg-cyan-500/10"
                            : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        <CreditCard className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{c.brand} •••• {c.lastFour}</p>
                          <p className="text-xs text-zinc-500">{c.cardHolderName}</p>
                        </div>
                        {selectedCardId === c.id && <div className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />}
                      </button>
                    ))}
                    <button
                      onClick={() => setSelectedCardId("")}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                        !selectedCardId ? "border-cyan-500 text-cyan-400 bg-cyan-500/10" : "border-zinc-700 text-zinc-400 bg-zinc-800"
                      }`}
                    >
                      {t("topUp.newCard")}
                    </button>
                  </div>
                </div>
              )}
              {!selectedCardId && wompiKey && (
                <WompiCardWidget
                  publicKey={wompiKey}
                  baseUrl={wompiBase}
                  amount={finalAmount}
                  onToken={(token) => { setCardToken(token); setCardTokenError(""); }}
                  onError={(msg) => setCardTokenError(msg)}
                />
              )}
              {cardTokenError && (
                <p className="text-xs text-red-400">{cardTokenError}</p>
              )}
              {cardToken && !selectedCardId && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  ✓ {t("topUp.cardReady")}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/25 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <Button
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 text-base rounded-2xl"
          disabled={isPending || finalAmount < 1000}
          onClick={() => submit()}
        >
          {isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            `${t("topUp.pay")} ${formatCOP(finalAmount)}`
          )}
        </Button>
      </div>
    </div>
  );
}

function WompiCardWidget({
  publicKey, baseUrl, amount, onToken, onError,
}: {
  publicKey: string;
  baseUrl: string;
  amount: number;
  onToken: (token: string) => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [tokenizing, setTokenizing] = useState(false);

  const formatCardNumber = (v: string) =>
    v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();

  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const tokenize = async () => {
    const cardNumber = number.replace(/\s/g, "");
    const [expMonth, expYear] = expiry.split("/");
    if (!cardNumber || cardNumber.length < 13 || !expMonth || !expYear || !cvc || !name) {
      onError(t("topUp.incompleteCard"));
      return;
    }
    setTokenizing(true);
    try {
      const res = await fetch(`${baseUrl}/tokens/cards`, {
        method: "POST",
        headers: { Authorization: `Bearer ${publicKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          number: cardNumber,
          exp_month: expMonth,
          exp_year: expYear.length === 2 ? `20${expYear}` : expYear,
          cvc,
          card_holder: name,
        }),
      });
      const data = await res.json() as { data?: { id: string }; error?: { messages: Record<string, string[]> } };
      if (data.data?.id) {
        onToken(data.data.id);
      } else {
        const msgs = data.error?.messages;
        onError(msgs ? Object.values(msgs).flat()[0] ?? t("topUp.cardError") : t("topUp.cardError"));
      }
    } catch {
      onError(t("topUp.cardError"));
    } finally {
      setTokenizing(false);
    }
  };

  return (
    <div className="space-y-3 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
      <input
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-cyan-500 transition-colors"
        placeholder="0000 0000 0000 0000"
        value={number}
        onChange={(e) => setNumber(formatCardNumber(e.target.value))}
        inputMode="numeric"
      />
      <div className="flex gap-2">
        <input
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-cyan-500 transition-colors"
          placeholder="MM/YY"
          value={expiry}
          onChange={(e) => setExpiry(formatExpiry(e.target.value))}
          inputMode="numeric"
        />
        <input
          className="w-24 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-cyan-500 transition-colors"
          placeholder="CVC"
          value={cvc}
          onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          type="password"
        />
      </div>
      <input
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm uppercase focus:outline-none focus:border-cyan-500 transition-colors"
        placeholder={t("topUp.cardHolder")}
        value={name}
        onChange={(e) => setName(e.target.value.toUpperCase())}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-zinc-600 text-zinc-300"
        onClick={tokenize}
        disabled={tokenizing}
      >
        {tokenizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("topUp.validateCard")}
      </Button>
    </div>
  );
}
