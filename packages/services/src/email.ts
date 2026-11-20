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

const BRAND_ORIGIN_DEFAULT = "https://socio.seraphsystems.com";

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
  const htmlBody = brandedEmail({
    preheader: `Join ${input.organizationName} on Socio`,
    eyebrow: "Workspace invite",
    title: "You're invited",
    lead: `Join <strong style="color:#0b0f2a">${escapeHtml(input.organizationName)}</strong> as <strong style="color:#0b0f2a">${escapeHtml(input.role)}</strong> — monitor, moderate, and protect every channel from one place.`,
    buttonLabel: "Accept invite",
    url: input.inviteUrl,
    footnote: "If you didn't expect this invite, you can ignore this email.",
    brandOrigin: originFromUrl(input.inviteUrl),
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
  const htmlBody = brandedEmail({
    preheader: `Set your password and open Socio${workspace}`,
    eyebrow: "Welcome aboard",
    title: `Hi ${input.name}`,
    lead: input.organizationName
      ? `Your Social AI team is ready for <strong style="color:#0b0f2a">${escapeHtml(input.organizationName)}</strong>. Choose a password and jump into the workspace.`
      : "Your Social AI team is ready. Choose a password and jump into Socio.",
    buttonLabel: "Set password →",
    url: input.setPasswordUrl,
    footnote: "This secure link expires in 48 hours.",
    brandOrigin: originFromUrl(input.setPasswordUrl),
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
  const htmlBody = brandedEmail({
    preheader: "Reset your Socio password",
    eyebrow: "Password reset",
    title: `Hi ${input.name}`,
    lead: "Tap below to choose a new password. If you didn't ask for this, you can safely ignore the email.",
    buttonLabel: "Reset password →",
    url: input.resetUrl,
    footnote: "This secure link expires in 48 hours.",
    brandOrigin: originFromUrl(input.resetUrl),
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
  const htmlBody = brandedEmail({
    preheader: `${input.organizationName} is ready on Socio`,
    eyebrow: "Workspace ready",
    title: `Hi ${input.name}`,
    lead: `Your workspace <strong style="color:#0b0f2a">${escapeHtml(input.organizationName)}</strong> is live. Open Socio and let AI take the noise while you keep control.`,
    buttonLabel: "Open Socio →",
    url: input.appUrl,
    footnote: input.setPasswordUrl
      ? `Prefer a fresh password? <a href="${escapeHtml(input.setPasswordUrl)}" style="color:#4f46e5;text-decoration:underline">Set it here</a>.`
      : undefined,
    brandOrigin: originFromUrl(input.appUrl),
  });
  return { subject, htmlBody, textBody: lines.join("\n") };
}

function brandedEmail(input: {
  preheader: string;
  eyebrow: string;
  title: string;
  lead: string;
  buttonLabel: string;
  url: string;
  footnote?: string;
  brandOrigin: string;
}): string {
  const origin = input.brandOrigin || BRAND_ORIGIN_DEFAULT;
  const markUrl = `${origin}/brand/mark.png`;
  const mascotUrl = `${origin}/brand/mascot.png`;
  const safeUrl = escapeHtml(input.url);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>Socio</title>
<!--[if mso]><style>body,table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#eef2ff;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${escapeHtml(input.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2ff;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border-collapse:separate;">
          <tr>
            <td style="background:linear-gradient(135deg,#0b0f2a 0%,#1e1b4b 48%,#312e81 100%);border-radius:20px 20px 0 0;padding:28px 28px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-right:12px;vertical-align:middle;">
                          <img src="${escapeHtml(markUrl)}" width="40" height="40" alt="Socio" style="display:block;border:0;border-radius:10px;background:#fff;">
                        </td>
                        <td style="vertical-align:middle;">
                          <div style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.04em;color:#ffffff;line-height:1;">socio</div>
                          <div style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#67e8f9;padding-top:4px;">Social AI Platform</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" valign="middle" style="vertical-align:middle;">
                    <img src="${escapeHtml(mascotUrl)}" width="64" height="64" alt="" style="display:block;border:0;">
                  </td>
                </tr>
              </table>
              <div style="height:14px;line-height:14px;font-size:14px;">&nbsp;</div>
              <div style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#a5b4fc;">${escapeHtml(input.eyebrow)}</div>
              <div style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:-0.03em;color:#ffffff;line-height:1.2;padding-top:8px;">${escapeHtml(input.title)}</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:28px 28px 8px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <div style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#334155;">${input.lead}</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:22px 28px 8px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="border-radius:12px;background:linear-gradient(90deg,#4f46e5 0%,#06b6d4 100%);">
                    <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(input.buttonLabel)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:18px 28px 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-radius:0 0 20px 20px;border-bottom:1px solid #e2e8f0;">
              ${
                input.footnote
                  ? `<div style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#64748b;text-align:center;">${input.footnote}</div>`
                  : ""
              }
              <div style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;padding-top:14px;">
                Button not working? <a href="${safeUrl}" style="color:#4f46e5;text-decoration:underline;">Open this secure link</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 12px 0;text-align:center;">
              <div style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#64748b;">
                Monitor. Moderate. Protect.<br>
                <a href="${escapeHtml(origin)}" style="color:#4f46e5;text-decoration:none;font-weight:600;">socio.seraphsystems.com</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function originFromUrl(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return BRAND_ORIGIN_DEFAULT;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
