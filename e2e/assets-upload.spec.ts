/**
 * T4 (SECURITY "Uploads") end to end through the real API: signed upload URLs, magic-byte
 * sniffing, the SVG sanitizer, polyglot rejection, plan size limits, and serving files only to
 * the project's workspace with `nosniff` and a sandbox CSP.
 */
import { type APIRequestContext, expect, test } from "@playwright/test";
import { ownClientIp, signInWithMock, unique } from "./helpers";

const MALICIOUS_SVG = [
  '<?xml version="1.0"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" onload="alert(1)">',
  "<script>alert(document.cookie)</script>",
  '<foreignObject width="40" height="20"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="https://evil.example"></iframe></body></foreignObject>',
  '<use href="https://evil.example/sprite.svg#x"/>',
  '<rect width="40" height="20" fill="#2563eb" onclick="steal()"/>',
  "</svg>",
].join("");

const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360f8cfc0f01f0005000201" +
    "e221bc330000000049454e44ae426082",
  "hex",
);

async function project(request: APIRequestContext, origin: string) {
  const res = await request.post("/api/projects", {
    data: { name: "Uploads", framework: "nextjs", templateId: "blank" },
    headers: { origin },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { project: { id: string } }).project.id;
}

async function upload(
  request: APIRequestContext,
  origin: string,
  pid: string,
  name: string,
  body: Buffer | string,
) {
  const ticket = await request.post(`/api/projects/${pid}/assets/uploads`, {
    data: { name, bytes: Buffer.byteLength(body) },
    headers: { origin },
  });
  expect(ticket.status()).toBe(201);
  const { url } = (await ticket.json()) as { url: string };
  return request.put(url, { data: body, headers: { "content-type": "application/octet-stream" } });
}

test("T4: uploads are sniffed, sanitized, limited and served safely", async ({
  page,
  context,
  browser,
}) => {
  await ownClientIp(context);
  await signInWithMock(page, unique("uploads"));
  const origin = new URL(page.url()).origin;
  const request = context.request;
  const pid = await project(request, origin);

  // A malicious SVG is stored sanitized.
  const svg = await upload(request, origin, pid, "logo.svg", MALICIOUS_SVG);
  expect(svg.status()).toBe(201);
  const { asset } = (await svg.json()) as {
    asset: { id: string; key: string; mime: string; width: number; height: number };
  };
  expect(asset).toMatchObject({ mime: "image/svg+xml", width: 40, height: 20 });
  expect(asset.key).toMatch(/^assets\/[0-9a-f]{64}\.svg$/);
  const file = await request.get(`/api/projects/${pid}/files/${asset.key}`);
  expect(file.status()).toBe(200);
  const served = await file.text();
  expect(served).not.toMatch(/script|onload|onclick|foreignObject|iframe|evil|alert/i);
  expect(served).toContain('fill="#2563eb"');
  expect(file.headers()["content-type"]).toBe("image/svg+xml");
  expect(file.headers()["x-content-type-options"]).toBe("nosniff");
  expect(file.headers()["content-security-policy"]).toContain("sandbox");

  // Opened directly in a tab, the served SVG runs nothing.
  const tab = await context.newPage();
  const dialogs: string[] = [];
  tab.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await tab.goto(`/api/projects/${pid}/files/${asset.key}`);
  await tab.waitForTimeout(500);
  expect(dialogs).toEqual([]);
  await tab.close();

  // A real PNG works; its size comes from the header.
  const png = await upload(request, origin, pid, "dot.png", PNG_1x1);
  expect(png.status()).toBe(201);
  expect(((await png.json()) as { asset: { width: number } }).asset.width).toBe(1);

  // Polyglots, mislabelled files and HTML are refused.
  const gifar = Buffer.concat([
    Buffer.from("GIF89a\x01\x00\x01\x00", "latin1"),
    Buffer.from("<html><script>alert(1)</script></html>"),
  ]);
  const poly = await upload(request, origin, pid, "a.gif", gifar);
  expect(poly.status()).toBe(415);
  expect(
    ((await poly.json()) as { error: { details: { reason: string } } }).error.details.reason,
  ).toBe("POLYGLOT");
  expect((await upload(request, origin, pid, "a.jpg", PNG_1x1)).status()).toBe(415);
  expect(
    (await upload(request, origin, pid, "page.png", "<html><body>hi</body></html>")).status(),
  ).toBe(415);

  // Plan limit: Free allows 5 MB per file.
  const big = await request.post(`/api/projects/${pid}/assets/uploads`, {
    data: { name: "huge.png", bytes: 6 * 1024 * 1024 },
    headers: { origin },
  });
  expect(big.status()).toBe(403);
  expect(((await big.json()) as { error: { code: string } }).error.code).toBe("LIMIT_REACHED");

  // A forged upload URL is refused.
  expect((await request.put("/api/uploads/abc.def", { data: PNG_1x1 })).status()).toBe(403);

  // The storage meter counts the two stored files.
  const usage = await request.get(`/api/projects/${pid}/assets`);
  expect((await usage.json()) as { usage: { files: number } }).toMatchObject({
    usage: { files: 2 },
  });

  // Another user can't read the file.
  const other = await browser.newContext({ baseURL: origin });
  await ownClientIp(other);
  const otherPage = await other.newPage();
  await signInWithMock(otherPage, unique("other"));
  expect((await other.request.get(`/api/projects/${pid}/files/${asset.key}`)).status()).toBe(404);
  await other.close();
});
