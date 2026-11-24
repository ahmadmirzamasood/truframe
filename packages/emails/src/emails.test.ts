import { describe, expect, it, vi } from "vitest";
import { createEmailSender, EmailConfigError, renderAuthEmail } from "./index.ts";

const url = "http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2Fdashboard";

describe("renderAuthEmail", () => {
  it("renders html and text with the action link for each kind", async () => {
    for (const kind of ["verify-email", "magic-link", "reset-password"] as const) {
      const msg = await renderAuthEmail({ kind, to: "a@example.com", url });
      expect(msg.subject).toMatch(/Truframe/);
      expect(msg.html).toContain('href="http://localhost:3000/api/auth/verify-email?token=abc');
      expect(msg.text).toContain("http://localhost:3000/api/auth/verify-email?token=abc");
    }
  });

  it("escapes the URL in html", async () => {
    const msg = await renderAuthEmail({
      kind: "magic-link",
      to: "a@example.com",
      url: 'http://x/"><script>alert(1)</script>',
    });
    expect(msg.html).not.toContain("<script>alert(1)</script>");
  });
});

describe("createEmailSender", () => {
  const message = { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "go http://x/y" };

  it("uses Resend when a key is set", async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
    const sender = createEmailSender({
      env: "staging",
      resendApiKey: "re_test",
      from: "Truframe <hi@example.com>",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await sender.send(message);
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
    expect(JSON.parse(String(init.body))).toMatchObject({ to: "a@example.com", subject: "s" });
  });

  it("fails loudly when Resend rejects", async () => {
    const sender = createEmailSender({
      env: "production",
      resendApiKey: "re_test",
      from: "x@example.com",
      fetch: (async () => new Response("bad", { status: 422 })) as unknown as typeof fetch,
    });
    await expect(sender.send(message)).rejects.toThrow(/HTTP 422/);
  });

  it("uses the dev outbox only for local", async () => {
    const outbox = vi.fn(async () => {});
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await createEmailSender({ env: "local", devOutbox: outbox }).send(message);
    expect(outbox).toHaveBeenCalledWith(message);
    log.mockRestore();
    expect(() => createEmailSender({ env: "staging" })).toThrow(EmailConfigError);
  });
});
