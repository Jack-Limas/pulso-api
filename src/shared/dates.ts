const ISO_DATE_LENGTH = 10;

export function isoDateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function utcToIsoDate(date: Date): string {
  return date.toISOString().slice(0, ISO_DATE_LENGTH);
}
