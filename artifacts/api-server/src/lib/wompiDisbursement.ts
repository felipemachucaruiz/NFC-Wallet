const WOMPI_BASE_URL = process.env.WOMPI_BASE_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";

export type DisbursementMethod = "nequi" | "bancolombia";

export interface DisbursementTarget {
  method: DisbursementMethod;
  phoneNumber?: string;
  accountNumber?: string;
  accountType?: string;
  bankCode?: string;
}

export interface DisbursementResult {
  success: true;
  wompiId: string;
  reference: string;
}

export interface DisbursementFailure {
  success: false;
  error: string;
}

export type DisbursementOutcome = DisbursementResult | DisbursementFailure;

async function fetchWompiAcceptanceToken(): Promise<string> {
  const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
  if (!WOMPI_PUBLIC_KEY) throw new Error("WOMPI_PUBLIC_KEY not configured");
  const res = await fetch(`${WOMPI_BASE_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
  if (!res.ok) throw new Error("Failed to fetch Wompi acceptance token");
  const data = await res.json() as {
    data: { presigned_acceptance: { acceptance_token: string } };
  };
  return data.data.presigned_acceptance.acceptance_token;
}

export async function initiateWompiDisbursement(
  refundRequestId: string,
  amount: number,
  target: DisbursementTarget,
  customerEmail: string,
): Promise<DisbursementOutcome> {
  if (!WOMPI_PRIVATE_KEY) {
    return { success: false, error: "Wompi private key not configured" };
  }

  const reference = `refund_${refundRequestId}_${Date.now()}`;

  try {
    const acceptanceToken = await fetchWompiAcceptanceToken();
    const amountCentavos = amount * 100;

    let paymentMethodBody: Record<string, unknown>;

    if (target.method === "nequi") {
      if (!target.phoneNumber) {
        return { success: false, error: "Phone number is required for Nequi disbursements" };
      }
      paymentMethodBody = {
        type: "NEQUI",
        phone_number: target.phoneNumber,
      };
    } else {
      return { success: false, error: `Unsupported disbursement method: ${target.method}` };
    }

    const body = {
      amount_in_cents: amountCentavos,
      currency: "COP",
      customer_email: customerEmail,
      payment_method: paymentMethodBody,
      reference,
      acceptance_token: acceptanceToken,
    };

    const res = await fetch(`${WOMPI_BASE_URL}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as {
      data?: { id: string; status?: string };
      error?: { type: string; messages: Record<string, string[]> };
    };

    if (!res.ok || !data.data) {
      const errorDetail = data.error
        ? Object.values(data.error.messages ?? {}).flat().join(", ")
        : `HTTP ${res.status}`;
      return { success: false, error: `Wompi disbursement failed: ${errorDetail}` };
    }

    return {
      success: true,
      wompiId: data.data.id,
      reference,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Disbursement API error: ${message}` };
  }
}

export type DisbursementStatus = "pending" | "completed" | "failed";

export async function getWompiDisbursementStatus(wompiTransactionId: string): Promise<DisbursementStatus | null> {
  if (!WOMPI_PRIVATE_KEY) return null;

  try {
    const res = await fetch(`${WOMPI_BASE_URL}/transactions/${wompiTransactionId}`, {
      headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
    });
    const data = await res.json() as { data?: { status: string } };
    if (!res.ok || !data.data) return null;

    const s = data.data.status;
    if (s === "APPROVED") return "completed";
    if (s === "DECLINED" || s === "ERROR" || s === "VOIDED") return "failed";
    return "pending";
  } catch {
    return null;
  }
}
