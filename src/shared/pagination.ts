import { AppError } from "./errors.js";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export interface PageWindow {
  offset: number;
  limit: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export function toPageWindow(pageSize = 0, pageToken = ""): PageWindow {
  const offset = pageToken === "" ? 0 : Number(pageToken);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new AppError("INVALID_INPUT", "Invalid page token");
  }
  const limit = pageSize <= 0 ? DEFAULT_PAGE_SIZE : Math.min(pageSize, MAX_PAGE_SIZE);
  return { offset, limit };
}

export function toPageResponse({ offset, limit }: PageWindow, total: number) {
  const next = offset + limit;
  return { nextPageToken: next < total ? String(next) : "", totalCount: total };
}
