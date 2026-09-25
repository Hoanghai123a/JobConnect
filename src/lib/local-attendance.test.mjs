import test from "node:test";
import assert from "node:assert/strict";

const source = await import("./local-attendance.ts");

test("local attendance normalizes invalid rows and keeps valid rows", () => {
  const originalWindow = globalThis.window;
  const values = new Map([
    [
      source.LOCAL_ATTENDANCE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        profile: { display_name: "  An  ", lcb: "12000000" },
        rows: [
          { date: "2026-09-01", shift: "night", hc_hours: 8, ot_hours: 1 },
          { date: "bad", hc_hours: 8 },
        ],
      }),
    ],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  const state = source.readLocalAttendance();
  assert.equal(state.profile.display_name, "An");
  assert.equal(state.profile.lcb, 12000000);
  assert.equal(state.rows.length, 1);
  assert.equal(state.rows[0].shift, "night");

  globalThis.window = originalWindow;
});

test("local attendance rejects an unknown schema version", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: () => JSON.stringify({ version: 99, profile: { display_name: "An" }, rows: [] }),
      setItem: () => undefined,
    },
  };

  assert.deepEqual(source.readLocalAttendance(), source.createEmptyLocalAttendanceState());
  globalThis.window = originalWindow;
});

test("local attendance keeps default hours when an older profile omits them", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: () => JSON.stringify({ version: 1, profile: { display_name: "An" }, rows: [] }),
      setItem: () => undefined,
    },
  };

  const profile = source.readLocalAttendance().profile;
  assert.equal(profile.default_hc_hours, 8);
  assert.equal(profile.default_ot_hours, 0);
  globalThis.window = originalWindow;
});

test("upsert and remove local rows are immutable", () => {
  const empty = source.createEmptyLocalAttendanceState();
  const next = source.upsertLocalAttendanceRow(empty, {
    date: "2026-09-02",
    shift: "day",
    is_holiday: false,
    hc_hours: 8,
    ot_hours: 0,
    attendance_type: "work",
  });
  assert.equal(empty.rows.length, 0);
  assert.equal(next.rows.length, 1);
  const removed = source.removeLocalAttendanceRow(next, next.rows[0].id);
  assert.equal(removed.rows.length, 0);
});
