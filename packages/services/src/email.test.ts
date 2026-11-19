import { describe, expect, it } from "vitest";
import {
  buildInviteEmail,
  buildPasswordResetEmail,
  buildWelcomeSetPasswordEmail,
  zohoEmailConfigFromEnv,
} from "./email";

describe("email", () => {
  it("builds invite content with org and link", () => {
    const mail = buildInviteEmail({
      organizationName: "AndyMorales Studio",
      inviteUrl: "https://socio.seraphsystems.com/invite/abc",
      role: "MANAGER",
    });
    expect(mail.subject).toContain("AndyMorales Studio");
    expect(mail.htmlBody).toContain("/invite/abc");
    expect(mail.textBody).toContain("MANAGER");
  });

  it("builds welcome set-password and reset mail", () => {
    const welcome = buildWelcomeSetPasswordEmail({
      name: "Andy",
      organizationName: "AndyMorales Studio",
      setPasswordUrl: "https://socio.seraphsystems.com/set-password/tok",
    });
    expect(welcome.subject).toContain("set your password");
    expect(welcome.htmlBody).toContain("/set-password/tok");

    const reset = buildPasswordResetEmail({
      name: "Andy",
      resetUrl: "https://socio.seraphsystems.com/set-password/reset",
    });
    expect(reset.subject).toContain("Reset");
    expect(reset.textBody).toContain("/set-password/reset");
  });

  it("requires api key and from address", () => {
    expect(zohoEmailConfigFromEnv({})).toBeNull();
    expect(
      zohoEmailConfigFromEnv({
        ZOHO_CPAAS_API_KEY: "key",
        ZOHO_EMAIL_FROM: "noreply@seraphsystems.com",
      }),
    ).toMatchObject({
      fromAddress: "noreply@seraphsystems.com",
      fromName: "Socio",
    });
  });
});
