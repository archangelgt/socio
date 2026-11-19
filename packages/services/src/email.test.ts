import { describe, expect, it } from "vitest";
import { buildInviteEmail, zohoEmailConfigFromEnv } from "./email";

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
