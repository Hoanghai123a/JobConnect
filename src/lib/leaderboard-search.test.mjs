import assert from "node:assert/strict";
import test from "node:test";

const { matchesLeaderboardSearch } = await import("./leaderboard-search.ts");
const entry = {
  fullName: "Nguyễn  Văn A",
  employeeCode: "NV-001 25",
  factoryName: "Nhà máy Bắc Ninh",
};

test("matches Vietnamese names with or without diacritics and repeated spaces", () => {
  assert.equal(matchesLeaderboardSearch(entry, "nguyen van a"), true);
  assert.equal(matchesLeaderboardSearch(entry, "  NGUYỄN   VĂN  "), true);
});

test("matches employee codes regardless of separators and case", () => {
  assert.equal(matchesLeaderboardSearch(entry, "nv00125"), true);
  assert.equal(matchesLeaderboardSearch(entry, "NV 001-25"), true);
});

test("does not match unrelated text and treats an empty query as no filter", () => {
  assert.equal(matchesLeaderboardSearch(entry, "không tồn tại"), false);
  assert.equal(matchesLeaderboardSearch(entry, ""), true);
});

test("ignores invisible Unicode characters from imported cells", () => {
  assert.equal(
    matchesLeaderboardSearch(
      { ...entry, fullName: "Lê\u200B Thị Hồng Mây" },
      "Lê Thị Hồng Mây",
    ),
    true,
  );
});
