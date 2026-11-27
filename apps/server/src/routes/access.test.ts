import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSION_COOKIE, routes } from "@wayfarers-rest/shared";
import { hashPassword, verifyPassword } from "../auth/password";
import { ADMIN_PASSWORD, startTestServer } from "../testing/server";

test("health answers on both paths without signing in", async (t) => {
  const server = await startTestServer(t);
  const { body } = await server.anonymous.ok("health");
  assert.equal(body.codeVersion, "test");
  assert.ok(body.catalogueVersion > 0);
  assert.deepEqual((await server.anonymous.ok("apiHealth")).body, body);
});

test("a password hash verifies its password and nothing else", () => {
  const hash = hashPassword("s3cret-password");
  assert.match(hash, /^scrypt:[0-9a-f]+:[0-9a-f]+$/);
  assert.equal(verifyPassword("s3cret-password", hash), true);
  assert.equal(verifyPassword("s3cret-passworD", hash), false);
  assert.equal(verifyPassword("s3cret-password", null), false);
  assert.equal(verifyPassword("s3cret-password", "plain:abc:def"), false);
});

test("signing in sets a strict, http-only, secure cookie that opens the admin routes", async (t) => {
  const server = await startTestServer(t);
  assert.equal((await server.anonymous.fail("session")).code, "unauthorized");

  const response = await server.anonymous.send("login", { body: { password: ADMIN_PASSWORD } });
  const cookie = response.cookies.find(({ name }) => name === SESSION_COOKIE);
  assert.ok(cookie);
  assert.deepEqual(
    { httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite, path: cookie.path },
    { httpOnly: true, secure: true, sameSite: "Strict", path: "/" },
  );

  const admin = await server.signIn();
  const { body } = await admin.ok("session");
  assert.equal(body.expiresAt, "2026-12-27T22:00:00.000Z");
});

test("a session ends when the admin signs out, and after thirty days", async (t) => {
  const server = await startTestServer(t);
  const first = await server.signIn();
  assert.equal((await first.ok("logout")).status, 204);
  assert.equal((await first.fail("session")).code, "unauthorized");

  const second = await server.signIn();
  server.advance(29 * 86_400_000);
  await second.ok("session");
  server.advance(86_400_000);
  assert.equal((await second.fail("session")).code, "unauthorized");
});

test("five wrong passwords block every attempt for a minute", async (t) => {
  const server = await startTestServer(t);
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await server.anonymous.fail("login", { body: { password: "wrong" } })).code, "unauthorized");
  }
  assert.equal((await server.anonymous.fail("login", { body: { password: ADMIN_PASSWORD } })).code, "rateLimited");
  server.advance(61_000);
  await server.anonymous.ok("login", { body: { password: ADMIN_PASSWORD } });
});

test("without a password hash nobody signs in", async (t) => {
  const server = await startTestServer(t, { adminPasswordHash: null });
  assert.equal((await server.anonymous.fail("login", { body: { password: ADMIN_PASSWORD } })).code, "unauthorized");
});

test("every admin route refuses a caller without a session, a device token included", async (t) => {
  const server = await startTestServer(t);
  const device = await server.pairDevice(await server.signIn());
  let refused = 0;
  for (const [name, route] of Object.entries(routes)) {
    if (route.auth !== "admin") continue;
    const response = await server.app.inject({ method: route.method, url: route.path.replace(/:(\w+)/g, "x") });
    // The routes of the contract that are not served yet answer 404.
    assert.ok(response.statusCode === 401 || response.statusCode === 404, `${name} answered ${response.statusCode}`);
    if (response.statusCode === 401) refused += 1;
  }
  assert.ok(refused >= 16, `only ${refused} admin routes are served`);
  assert.equal((await device.fail("listDevices")).code, "unauthorized");
  assert.equal((await device.fail("publication")).code, "unauthorized");
});

test("a device token opens the app routes until it is revoked", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  assert.equal((await server.anonymous.fail("catalogue")).code, "unauthorized");
  assert.equal((await server.with({ authorization: "Bearer nope" }).fail("catalogue")).code, "unauthorized");

  const created = await admin.ok("createDevice", { body: { name: "iPhone 14 Pro" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.device.lastSeenAt, null);
  const device = server.with({ authorization: `Bearer ${created.body.token}` });
  await device.ok("catalogue");

  const listed = (await admin.ok("listDevices")).body.devices;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].lastSeenAt, "2026-11-27T22:00:00.000Z");
  assert.ok(!JSON.stringify(listed).includes(created.body.token));

  assert.equal((await admin.ok("revokeDevice", { params: { deviceId: created.body.device.id } })).status, 204);
  assert.equal((await device.fail("catalogue")).code, "unauthorized");
  const [revoked] = (await admin.ok("listDevices")).body.devices;
  assert.equal(revoked.revokedAt, "2026-11-27T22:00:00.000Z");
  assert.equal((await admin.fail("revokeDevice", { params: { deviceId: "unknown" } })).code, "notFound");
});

test("the admin session also reads what the contract opens to both", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  await admin.ok("catalogue");
  await admin.ok("listReports");
});

test("the Tailscale login is logged, and can be required everywhere but on /health", async (t) => {
  const open = await startTestServer(t);
  await open.with({ "tailscale-user-login": "owner@example.com" }).ok("apiHealth");
  assert.ok(open.logs.some((line) => JSON.parse(line).req?.tailscaleLogin === "owner@example.com"));

  const closed = await startTestServer(t, { allowedTailscaleLogin: "owner@example.com" });
  await closed.anonymous.ok("health");
  assert.equal((await closed.anonymous.fail("apiHealth")).code, "forbidden");
  assert.equal((await closed.with({ "tailscale-user-login": "other@example.com" }).fail("login", { body: { password: ADMIN_PASSWORD } })).code, "forbidden");
  await closed.with({ "tailscale-user-login": "owner@example.com" }).ok("apiHealth");
});

test("errors always carry the error body of the contract", async (t) => {
  const server = await startTestServer(t);
  const missing = await server.app.inject({ method: "GET", url: "/nowhere" });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, "notFound");

  const malformed = await server.app.inject({
    method: "POST",
    url: routes.login.path,
    headers: { "content-type": "application/json" },
    payload: "{not json",
  });
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.json().error.code, "badRequest");

  const error = await server.anonymous.fail("login", { body: { password: "x", extra: true } as never });
  assert.equal(error.code, "badRequest");
  assert.deepEqual(error.details?.fields?.map((field) => field.path), [""]);
});
