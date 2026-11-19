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
  const htmlBody = ctaEmail({
    lead: `You've been invited to join <strong>${escapeHtml(input.organizationName)}</strong> on Socio as <strong>${escapeHtml(input.role)}</strong>.`,
    buttonLabel: "Accept invite",
    url: input.inviteUrl,
  });
  return { subject, htmlBody, textBody };
}

export function buildWelcomeSetPasswordEmail(input: {
  name: string;
  setPasswordUrl: string;
  organizationName?: string;
}): { subject: string; htmlBody: string; textBody: string } {
  const workspace = input.organizationName
    ? ` for ${input.organizationName}`
    : "";
  const subject = `Welcome to Socio${workspace} — set your password`;
  const textBody = [
    `Hi ${input.name},`,
    "",
    `Welcome to Socio${workspace}.`,
    `Set your password here: ${input.setPasswordUrl}`,
    "",
    "This link expires in 48 hours.",
  ].join("\n");
  const htmlBody = ctaEmail({
    lead: `Hi ${escapeHtml(input.name)}, welcome to Socio${input.organizationName ? ` — workspace <strong>${escapeHtml(input.organizationName)}</strong>` : ""}. Choose a password to open your account.`,
    buttonLabel: "Set password",
    url: input.setPasswordUrl,
    footnote: "This link expires in 48 hours.",
  });
  return { subject, htmlBody, textBody };
}

export function buildPasswordResetEmail(input: {
  name: string;
  resetUrl: string;
}): { subject: string; htmlBody: string; textBody: string } {
  const subject = "Reset your Socio password";
  const textBody = [
    `Hi ${input.name},`,
    "",
    `Reset your password: ${input.resetUrl}`,
    "",
    "If you didn't ask for this, ignore the email. Link expires in 48 hours.",
  ].join("\n");
  const htmlBody = ctaEmail({
    lead: `Hi ${escapeHtml(input.name)}, use the button below to reset your Socio password.`,
    buttonLabel: "Reset password",
    url: input.resetUrl,
    footnote:
      "If you didn't ask for this, ignore the email. Link expires in 48 hours.",
  });
  return { subject, htmlBody, textBody };
}

export function buildRegisterWelcomeEmail(input: {
  name: string;
  organizationName: string;
  appUrl: string;
  setPasswordUrl?: string;
}): { subject: string; htmlBody: string; textBody: string } {
  const subject = `Welcome to ${input.organizationName} on Socio`;
  const lines = [
    `Hi ${input.name},`,
    "",
    `Your workspace ${input.organizationName} is ready.`,
    `Open Socio: ${input.appUrl}`,
  ];
  if (input.setPasswordUrl) {
    lines.push("", `Set or change your password: ${input.setPasswordUrl}`);
  }
  const htmlBody = ctaEmail({
    lead: `Hi ${escapeHtml(input.name)}, your workspace <strong>${escapeHtml(input.organizationName)}</strong> is ready.`,
    buttonLabel: "Open Socio",
    url: input.appUrl,
    footnote: input.setPasswordUrl
      ? `Or <a href="${escapeHtml(input.setPasswordUrl)}">set your password</a> from this device.`
      : undefined,
  });
  return { subject, htmlBody, textBody: lines.join("\n") };
}

function ctaEmail(input: {
  lead: string;
  buttonLabel: string;
  url: string;
  footnote?: string;
}): string {
  return `
<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>${input.lead}</p>
  <p><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(input.buttonLabel)}</a></p>
  <p style="color:#666;font-size:13px">Or paste this link:<br>${escapeHtml(input.url)}</p>
  ${input.footnote ? `<p style="color:#666;font-size:13px">${input.footnote}</p>` : ""}
</div>`.trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
