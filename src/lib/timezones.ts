export type TimezoneOption = { value: string; label: string };

export const fallbackTimezones = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function getUtcOffsetMinutes(tz: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(now);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  // e.g. "GMT+5:30" or "GMT-8" or "GMT"
  const match = offsetPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  return sign * (hours * 60 + minutes);
}

function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${h}:${m}`;
}

function toTimezoneOption(tz: string): TimezoneOption {
  const offsetMinutes = getUtcOffsetMinutes(tz);
  return { value: tz, label: `${tz} (${formatUtcOffset(offsetMinutes)})` };
}

export function getSupportedTimezones(): TimezoneOption[] {
  let zones: string[];
  if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
    zones = (
      Intl as typeof Intl & { supportedValuesOf: (key: string) => string[] }
    ).supportedValuesOf("timeZone");
  } else {
    zones = fallbackTimezones;
  }

  return zones
    .map((tz) => ({ tz, option: toTimezoneOption(tz) }))
    .sort((a, b) => {
      const aOffset = getUtcOffsetMinutes(a.tz);
      const bOffset = getUtcOffsetMinutes(b.tz);
      if (aOffset !== bOffset) return aOffset - bOffset;
      return a.tz.localeCompare(b.tz);
    })
    .map(({ option }) => option);
}
