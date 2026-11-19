import { AppError } from "./errors";

export type ZohoEmailConfig = {
  apiKey: string;
  fromAddress: string;
  fromName: string;
  endpoint?: string;
};

export type SendEmailInput = {
  to: { address: string; name?: string };
  subject: string;
  htmlBody: string;
  textBody?: string;
  clientReference?: string;
};

export function zohoEmailConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ZohoEmailConfig | null {
  const apiKey = env.ZOHO_CPAAS_API_KEY?.trim();
  const fromAddress = env.ZOHO_EMAIL_FROM?.trim();
  if (!apiKey || !fromAddress) {
    return null;
  }
  return {
    apiKey,
    fromAddress,
    fromName: env.ZOHO_EMAIL_FROM_NAME?.trim() || "Socio",
    endpoint:
      env.ZOHO_CPAAS_EMAIL_URL?.trim() || "https://cpaas.zoho.com/v1.1/email",
  };
}

/**
 * Send a transactional email via Zoho CPaaS Email API.
 * Never logs the API key or full Authorization header.
 */
export async function sendZohoEmail(
  config: ZohoEmailConfig,
  input: SendEmailInput,
): Promise<{ ok: true; messageId?: string }> {
  const response = await fetch(
    config.endpoint ?? "https://cpaas.zoho.com/v1.1/email",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Zoho-enczapikey ${config.apiKey}`,
      },
      body: JSON.stringify({
        from: { address: config.fromAddress, name: config.fromName },
        to: [
          {
            email_address: {
              address: input.to.address,
              ...(input.to.name ? { name: input.to.name } : {}),
            },
          },
        ],
        subject: input.subject,
        htmlbody: input.htmlBody,
        ...(input.textBody ? { textbody: input.textBody } : {}),
        ...(input.clientReference
          ? { client_reference: input.clientReference }
          : {}),
      }),
    },
  );

  const text = await response.text();
  let payload: {
    message_id?: string;
    data?: { message_id?: string };
    error?: { message?: string };
    message?: string;
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    // non-JSON error body
  }

  if (!response.ok) {
    const detail =
      payload.error?.message ||
      payload.message ||
      `Zoho email HTTP ${response.status}`;
    throw new AppError(502, "EMAIL_SEND_FAILED", detail.slice(0, 300));
  }

  return {
    ok: true,
    messageId: payload.message_id ?? payload.data?.message_id,
  };
}

export function buildInviteEmail(input: {
  organizationName: string;
  inviteUrl: string;
  role: string;
}): { subject: string; htmlBody: string; textBody: string } {
  const subject = `You're invited to ${input.organizationName} on Socio`;
  const textBody = [
    `You've been invited to join ${input.organizationName} on Socio as ${input.role}.`,
    "",
    `Open this link to accept: ${input.inviteUrl}`,
    "",
    "If you didn't expect this invite, you can ignore this email.",
  ].join("\n");
  const htmlBody = `
<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>You've been invited to join <strong>${escapeHtml(input.organizationName)}</strong> on Socio as <strong>${escapeHtml(input.role)}</strong>.</p>
  <p><a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Accept invite</a></p>
  <p style="color:#666;font-size:13px">Or paste this link:<br>${escapeHtml(input.inviteUrl)}</p>
</div>`.trim();
  return { subject, htmlBody, textBody };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
