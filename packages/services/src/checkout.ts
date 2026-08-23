import {
  type BillingInterval,
  type PlanId,
  isBillingInterval,
  isPlanId,
  planAmountCents,
} from "@social-ai/domain";
import { AppError } from "./errors";

export type PaymentProviderId = "mock" | "tilopay";

export type CheckoutConfig = {
  provider: PaymentProviderId;
  configured: boolean;
};

export type CheckoutSession = {
  url: string;
  provider: PaymentProviderId;
  configured: boolean;
  planId: PlanId;
  interval: BillingInterval;
  amountCents: number;
  currency: "USD";
};

type EnvLike = Record<string, string | undefined>;

export function checkoutConfigFromEnv(
  env: EnvLike = process.env,
): CheckoutConfig {
  const provider = env.PAYMENT_PROVIDER === "tilopay" ? "tilopay" : "mock";
  const configured =
    provider === "mock" ||
    Boolean(
      env.TILOPAY_API_KEY && env.TILOPAY_API_USER && env.TILOPAY_API_PASSWORD,
    );
  return { provider, configured };
}

export async function createCheckoutSession(input: {
  planId: string;
  interval: string;
  email: string;
  organizationName: string;
  successUrl: string;
  cancelUrl: string;
  env?: EnvLike;
  fetchImpl?: typeof fetch;
}): Promise<CheckoutSession> {
  if (!isPlanId(input.planId)) {
    throw new AppError(400, "INVALID_PLAN", "Unknown plan.");
  }
  if (!isBillingInterval(input.interval)) {
    throw new AppError(400, "INVALID_INTERVAL", "Unknown billing interval.");
  }
  const amountCents = planAmountCents(input.planId, input.interval);
  const env = input.env ?? process.env;
  const config = checkoutConfigFromEnv(env);
  const description = `socio ${input.planId} ${input.interval}`;

  if (config.provider === "tilopay" && config.configured) {
    const url = await createTilopayCheckout(
      {
        amountCents,
        currency: "USD",
        description,
        email: input.email,
        organizationName: input.organizationName,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        key: env.TILOPAY_API_KEY ?? "",
        user: env.TILOPAY_API_USER ?? "",
        password: env.TILOPAY_API_PASSWORD ?? "",
        apiUrl:
          env.TILOPAY_API_URL ??
          "https://app.tilopay.com/api/v1/processPayment",
      },
      input.fetchImpl ?? fetch,
    );
    return {
      url,
      provider: "tilopay",
      configured: true,
      planId: input.planId,
      interval: input.interval,
      amountCents,
      currency: "USD",
    };
  }

  const success = new URL(input.successUrl);
  success.searchParams.set("checkout", "ok");
  success.searchParams.set("plan", input.planId);
  return {
    url: success.toString(),
    provider: config.provider,
    configured: config.configured,
    planId: input.planId,
    interval: input.interval,
    amountCents,
    currency: "USD",
  };
}

async function createTilopayCheckout(
  input: {
    amountCents: number;
    currency: string;
    description: string;
    email: string;
    organizationName: string;
    successUrl: string;
    cancelUrl: string;
    key: string;
    user: string;
    password: string;
    apiUrl: string;
  },
  fetchImpl: typeof fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(input.apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: input.key,
        apiuser: input.user,
        password: input.password,
        amount: (input.amountCents / 100).toFixed(2),
        currency: input.currency,
        description: input.description,
        billToEmail: input.email,
        billToName: input.organizationName,
        redirect: input.successUrl,
        redirectcancel: input.cancelUrl,
      }),
    });
  } catch (error) {
    throw new AppError(
      502,
      "PAYMENT_PROVIDER_ERROR",
      error instanceof Error ? error.message : "Tilopay request failed",
    );
  }

  const json = (await response.json().catch(() => ({}))) as {
    url?: string;
    redirect?: string;
    paymentUrl?: string;
    data?: { url?: string };
    error?: { message?: string };
    message?: string;
  };
  const url =
    json.url ?? json.redirect ?? json.paymentUrl ?? json.data?.url ?? "";
  if (!response.ok || !url) {
    throw new AppError(
      502,
      "PAYMENT_PROVIDER_ERROR",
      json.error?.message ??
        json.message ??
        "Tilopay did not return a checkout URL",
    );
  }
  return url;
}
