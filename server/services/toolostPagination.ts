export interface ToolostPage<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
}

function readPositiveInteger(
  payload: Record<string, unknown>,
  key: "currentPage" | "totalPages",
): number {
  const value = payload[key];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(
      `Too Lost paginated response contained an invalid ${key}.`,
    );
  }
  return value;
}

export function parseToolostPage<T>(payload: unknown): ToolostPage<T> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(
      "Too Lost paginated response was malformed: expected an object.",
    );
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.data)) {
    throw new Error(
      "Too Lost paginated response was malformed: expected a data array.",
    );
  }

  return {
    items: record.data as T[],
    currentPage: readPositiveInteger(record, "currentPage"),
    totalPages: readPositiveInteger(record, "totalPages"),
  };
}

export async function collectToolostPages<T>(
  fetchPage: (page: number) => Promise<unknown>,
): Promise<T[]> {
  const items: T[] = [];
  let requestedPage = 1;
  let totalPages = 1;

  do {
    const page = parseToolostPage<T>(await fetchPage(requestedPage));
    if (page.currentPage !== requestedPage) {
      throw new Error(
        `Too Lost pagination returned page ${page.currentPage} while page ${requestedPage} was requested.`,
      );
    }
    if (requestedPage === 1) {
      totalPages = page.totalPages;
      if (totalPages > 10_000) {
        throw new Error(
          "Too Lost pagination reported an unsafe number of pages.",
        );
      }
    } else if (page.totalPages !== totalPages) {
      throw new Error(
        "Too Lost pagination changed totalPages during catalog traversal.",
      );
    }
    items.push(...page.items);
    requestedPage += 1;
  } while (requestedPage <= totalPages);

  return items;
}