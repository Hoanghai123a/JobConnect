export interface LeaderboardSearchFields {
  fullName: string;
  employeeCode: string;
  factoryName: string;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function matchesLeaderboardSearch(
  entry: LeaderboardSearchFields,
  query: string,
): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;

  const searchableText = normalizeText(
    `${entry.fullName} ${entry.employeeCode} ${entry.factoryName}`,
  );
  const normalizedCodeQuery = normalizeCode(query);
  const normalizedEmployeeCode = normalizeCode(entry.employeeCode);

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  return (
    queryTokens.every((token) => searchableText.includes(token)) ||
    searchableText.includes(normalizedQuery) ||
    (!!normalizedCodeQuery && normalizedEmployeeCode.includes(normalizedCodeQuery))
  );
}
