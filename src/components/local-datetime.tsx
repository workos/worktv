"use client";

import { useMemo } from "react";

type LocalDateTimeProps = {
  iso: string;
  options?: Intl.DateTimeFormatOptions;
};

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function LocalDateTime({ iso, options }: LocalDateTimeProps) {
  const formatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { ...DEFAULT_OPTIONS, ...options }),
    [options]
  );

  const label = useMemo(() => formatter.format(new Date(iso)), [formatter, iso]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label}
    </time>
  );
}
