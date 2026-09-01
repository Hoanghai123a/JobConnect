import assert from "node:assert/strict";
import test, { after } from "node:test";
import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

process.env.PB_URL = "http://pocketbase.test";
process.env.PB_ADMIN_EMAIL = "admin@example.test";
process.env.PB_ADMIN_PASSWORD = "secret";
delete process.env.PB_ADMIN_TOKEN;

const sourceDir = path.resolve(process.cwd(), "src/lib");
const tempModulePath = path.join(sourceDir, ".uid-counter-server.test-runtime.ts");
const tempConfigPath = path.join(sourceDir, ".uid-counter-pocketbase-config.test-runtime.ts");
const [serverSource, configSource] = await Promise.all([
  fs.readFile(path.join(sourceDir, "uid-counter-server.ts"), "utf8"),
  fs.readFile(path.join(sourceDir, "pocketbase-config.ts"), "utf8"),
]);
await Promise.all([
  fs.writeFile(
    tempModulePath,
    serverSource.replace(
      'from "./pocketbase-config"',
      'from "./.uid-counter-pocketbase-config.test-runtime.ts"',
    ),
  ),
  fs.writeFile(tempConfigPath, configSource),
]);

const serverModule = await import(`${pathToFileURL(tempModulePath).href}?${Date.now()}`);
const { handleUidCounterRequest, resetUidCounterServerStateForTests } = serverModule;
const originalFetch = globalThis.fetch;

after(async () => {
  globalThis.fetch = originalFetch;
  await Promise.all([
    fs.rm(tempModulePath, { force: true }),
    fs.rm(tempConfigPath, { force: true }),
  ]);
});

function json(body, status = 200) {
  return Response.json(body, { status });
}

function createPocketBaseMock(options = {}) {
  let tokenSequence = 0;
  let currentValue = options.currentValue ?? 1320;
  let activeWrites = 0;
  let maxActiveWrites = 0;
  const calls = [];

  const mock = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    const authorization = new Headers(init.headers).get("Authorization") || "";
    calls.push({ path: url.pathname, method, authorization });

    if (url.pathname.endsWith("/auth-with-password")) {
      tokenSequence += 1;
      return json({ token: `admin-token-${tokenSequence}` });
    }
    if (url.pathname.endsWith("/users/auth-refresh")) {
      return json({ record: { id: "staff-id", role: "staff" } });
    }
    if (url.pathname.endsWith("/app_settings/records")) {
      if (options.rejectDirectToken && authorization === "Bearer user-token") {
        return json({ message: "Only superusers can perform this action." }, 403);
      }
      if (options.expireFirstToken && authorization === "Bearer admin-token-1") {
        return json({ message: "The request requires valid authentication." }, 401);
      }
      return json({ items: [{ account_code_prefix: options.prefix ?? "HL" }] });
    }
    if (url.pathname.endsWith("/uid_counters/records") && method === "GET") {
      return json({
        items: [
          {
            id: "counter-id",
            counter_key: "user:HL",
            counter_type: options.counterType ?? "user",
            prefix: "HL",
            period: "",
            current_value: options.invalidCurrentValue ?? currentValue,
            note: "",
          },
        ],
      });
    }
    if (url.pathname.endsWith("/uid_counters/records/counter-id") && method === "PATCH") {
      activeWrites += 1;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const payload = JSON.parse(String(init.body));
      activeWrites -= 1;
      if (options.rejectUpdatedBy || (options.rejectUpdatedByOnce && !options.rejectedUpdatedBy)) {
        options.rejectedUpdatedBy = true;
        return json(
          {
            message: "Failed to update record.",
            data: { updated_by: { message: "Invalid relation." } },
          },
          400,
        );
      }
      currentValue = payload.current_value;
      return json({ id: "counter-id", ...payload });
    }
    return json({ message: `Unhandled ${method} ${url.pathname}` }, 500);
  };

  return {
    mock,
    calls,
    getCurrentValue: () => currentValue,
    getMaxActiveWrites: () => maxActiveWrites,
  };
}

function request(count = 1) {
  return new Request("http://app.test/api/uid-counter", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer staff-token" },
    body: JSON.stringify({ action: "allocate", type: "user", count }),
  });
}

async function responseJson(response) {
  return { status: response.status, body: await response.json() };
}

test("cấp một và nhiều UID từ giá trị hiện có", async () => {
  resetUidCounterServerStateForTests();
  const pb = createPocketBaseMock({ currentValue: 1320 });
  globalThis.fetch = pb.mock;

  assert.deepEqual(await responseJson(await handleUidCounterRequest(request(1))), {
    status: 200,
    body: {
      type: "user",
      prefix: "HL",
      period: "",
      startValue: 1321,
      endValue: 1321,
      uids: ["HL001321"],
    },
  });
  assert.deepEqual((await responseJson(await handleUidCounterRequest(request(2)))).body.uids, [
    "HL001322",
    "HL001323",
  ]);
  assert.equal(pb.getCurrentValue(), 1323);
});

test("đăng nhập lại đúng một lần khi token quản trị hết hạn", async () => {
  resetUidCounterServerStateForTests();
  const pb = createPocketBaseMock({ expireFirstToken: true });
  globalThis.fetch = pb.mock;

  const result = await responseJson(await handleUidCounterRequest(request()));
  assert.equal(result.status, 200);
  assert.equal(pb.calls.filter((call) => call.path.endsWith("/auth-with-password")).length, 2);
});

test("tự thay token PB_ADMIN_TOKEN không có quyền bằng thông tin superuser", async () => {
  resetUidCounterServerStateForTests();
  const previousToken = process.env.PB_ADMIN_TOKEN;
  process.env.PB_ADMIN_TOKEN = "user-token";
  const pb = createPocketBaseMock({ rejectDirectToken: true });
  globalThis.fetch = pb.mock;

  const result = await responseJson(await handleUidCounterRequest(request()));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.uids, ["HL001321"]);
  assert.equal(pb.calls.filter((call) => call.path.endsWith("/auth-with-password")).length, 1);
  if (previousToken === undefined) delete process.env.PB_ADMIN_TOKEN;
  else process.env.PB_ADMIN_TOKEN = previousToken;
});

test("trả lỗi có cấu trúc khi PocketBase từ chối updated_by", async () => {
  resetUidCounterServerStateForTests();
  const pb = createPocketBaseMock({ rejectUpdatedBy: true });
  globalThis.fetch = pb.mock;

  const result = await responseJson(await handleUidCounterRequest(request()));
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "PB_VALIDATION_FAILED");
  assert.equal(result.body.operation, "update uid_counters");
});

test("retry ghi bộ đếm khi schema từ chối relation updated_by tùy chọn", async () => {
  resetUidCounterServerStateForTests();
  const pb = createPocketBaseMock({ rejectUpdatedByOnce: true });
  globalThis.fetch = pb.mock;

  const result = await responseJson(await handleUidCounterRequest(request()));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.uids, ["HL001321"]);
});

test("từ chối tiền tố rỗng và bộ đếm sai kiểu hoặc sai giá trị", async (t) => {
  for (const scenario of [
    { options: { prefix: "" }, code: "UID_PREFIX_MISSING" },
    { options: { counterType: "employment_history" }, code: "UID_COUNTER_INVALID" },
    { options: { invalidCurrentValue: -1 }, code: "UID_COUNTER_INVALID" },
  ]) {
    await t.test(scenario.code + JSON.stringify(scenario.options), async () => {
      resetUidCounterServerStateForTests();
      const pb = createPocketBaseMock(scenario.options);
      globalThis.fetch = pb.mock;
      const result = await responseJson(await handleUidCounterRequest(request()));
      assert.equal(result.body.code, scenario.code);
    });
  }
});

test("hai yêu cầu đồng thời không trả UID trùng trong cùng tiến trình", async () => {
  resetUidCounterServerStateForTests();
  const pb = createPocketBaseMock({ currentValue: 1320 });
  globalThis.fetch = pb.mock;

  const [first, second] = await Promise.all([
    handleUidCounterRequest(request()),
    handleUidCounterRequest(request()),
  ]);
  const results = await Promise.all([responseJson(first), responseJson(second)]);
  assert.deepEqual(results.map((item) => item.body.uids[0]).sort(), ["HL001321", "HL001322"]);
  assert.equal(pb.getMaxActiveWrites(), 1);
});
