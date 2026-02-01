"use client";

import Link from "next/link";
import { useMemo, useRef, useEffect } from "react";

interface Recording {
  id: string;
  title: string;
  duration: number;
  created_at: string;
  speakers: { id: string; name: string; color: string }[];
  hasTranscript: boolean;
}

interface DayCell {
  type: "day";
  dates: Date[]; // Can be 1 date (weekday) or 2 dates (weekend)
  recordings: Recording[];
  isToday: boolean;
  isWeekend: boolean;
  monthLabel?: string;
}

interface EmptyCell {
  type: "empty";
}

type CalendarCell = DayCell | EmptyCell;

export function CalendarView({ recordings }: { recordings: Recording[] }) {
  const todayRef = useRef<HTMLDivElement>(null);

  // Group recordings by date
  const recordingsByDate = useMemo(() => {
    const map = new Map<string, Recording[]>();
    recordings.forEach((recording) => {
      const date = new Date(recording.created_at).toDateString();
      if (!map.has(date)) {
        map.set(date, []);
      }
      map.get(date)!.push(recording);
    });
    return map;
  }, [recordings]);

  // Generate all calendar cells as one continuous grid (6 columns: Mon-Fri + Weekend)
  const cells = useMemo(() => {
    if (recordings.length === 0) return [];

    const now = new Date();
    const today = now.toDateString();

    // Find earliest recording
    let earliestDate = new Date();
    recordings.forEach((r) => {
      const date = new Date(r.created_at);
      if (date < earliestDate) {
        earliestDate = date;
      }
    });

    // Start from the first day of the earliest month
    const startDate = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
    // End at the last day of the current month
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const result: CalendarCell[] = [];

    // Calculate empty cells before first day
    // New column order: Mon(0), Tue(1), Wed(2), Thu(3), Fri(4), Weekend(5)
    // JS day: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
    const firstDayOfWeek = startDate.getDay();
    let emptyCells = 0;
    if (firstDayOfWeek === 0) {
      // Sunday -> goes to Weekend column (5), need 5 empty cells (Mon-Fri)
      emptyCells = 5;
    } else if (firstDayOfWeek === 6) {
      // Saturday -> goes to Weekend column (5), need 5 empty cells (Mon-Fri)
      emptyCells = 5;
    } else {
      // Mon=1 -> 0 empty, Tue=2 -> 1 empty, etc.
      emptyCells = firstDayOfWeek - 1;
    }

    for (let i = 0; i < emptyCells; i++) {
      result.push({ type: "empty" });
    }

    // Generate all days from start to end
    const current = new Date(startDate);
    let lastMonth = -1;

    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      const currentMonth = current.getMonth();

      // Check if this is the first day we're showing for this month
      const isFirstShownOfMonth = currentMonth !== lastMonth;

      if (dayOfWeek === 0) {
        // Sunday - skip it, it was combined with Saturday
        current.setDate(current.getDate() + 1);
        continue;
      }

      if (dayOfWeek === 6) {
        // Saturday - combine with Sunday
        const satDate = new Date(current);
        const sunDate = new Date(current);
        sunDate.setDate(sunDate.getDate() + 1);

        const satRecordings = recordingsByDate.get(satDate.toDateString()) || [];
        const sunRecordings = recordingsByDate.get(sunDate.toDateString()) || [];
        const weekendRecordings = [...satRecordings, ...sunRecordings];

        const isToday = satDate.toDateString() === today || sunDate.toDateString() === today;

        const cell: DayCell = {
          type: "day",
          dates: [satDate, sunDate],
          recordings: weekendRecordings,
          isToday,
          isWeekend: true,
        };

        if (isFirstShownOfMonth) {
          cell.monthLabel = current.toLocaleString("default", {
            month: "long",
            year: "numeric",
          });
          lastMonth = currentMonth;
        }

        result.push(cell);
        current.setDate(current.getDate() + 1); // Move to Sunday, which will be skipped
      } else {
        // Regular weekday (Mon-Fri)
        const dateStr = current.toDateString();
        const dayRecordings = recordingsByDate.get(dateStr) || [];

        const cell: DayCell = {
          type: "day",
          dates: [new Date(current)],
          recordings: dayRecordings,
          isToday: dateStr === today,
          isWeekend: false,
        };

        if (isFirstShownOfMonth) {
          cell.monthLabel = current.toLocaleString("default", {
            month: "long",
            year: "numeric",
          });
          lastMonth = currentMonth;
        }

        result.push(cell);
      }

      current.setDate(current.getDate() + 1);
    }

    return result;
  }, [recordings, recordingsByDate]);

  // Scroll to today on mount
  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: "instant", block: "center" });
    }
  }, []);

  if (recordings.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-8 text-center text-sm text-zinc-400 light:border-zinc-200 light:bg-white light:text-zinc-600">
        No recordings to display.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden light:border-zinc-200 light:bg-white">
      {/* Sticky header with day names - 6 columns */}
      <div className="sticky top-0 z-10 grid grid-cols-6 border-b border-white/10 bg-zinc-800/90 backdrop-blur light:border-zinc-200 light:bg-zinc-100/90">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Weekend"].map((day) => (
          <div
            key={day}
            className="border-r border-white/5 px-2 py-2 text-center text-xs font-medium text-zinc-400 last:border-r-0 light:border-zinc-200 light:text-zinc-600"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Continuous calendar grid - 6 columns */}
      <div className="grid grid-cols-6">
        {cells.map((cell, index) => {
          if (cell.type === "empty") {
            return (
              <div
                key={`empty-${index}`}
                className="min-h-20 border-b border-r border-white/5 bg-zinc-900/30 last:border-r-0 light:border-zinc-200 light:bg-zinc-50"
              />
            );
          }

          const { dates, recordings: dayRecordings, isToday, isWeekend, monthLabel } = cell;

          // Format date display
          const dateLabel = isWeekend
            ? `${dates[0].getDate()}-${dates[1].getDate()}`
            : `${dates[0].getDate()}`;

          return (
            <div
              key={dates[0].toISOString()}
              ref={isToday ? todayRef : undefined}
              className={`relative min-h-20 border-b border-r border-white/5 p-1 last:border-r-0 light:border-zinc-200 ${
                isToday ? "bg-indigo-500/10" : ""
              } ${isWeekend ? "bg-zinc-900/30 light:bg-zinc-50" : ""}`}
            >
              {/* Month label - shown on first cell of month */}
              {monthLabel && (
                <div className="absolute -top-px left-0 right-0 bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 light:bg-zinc-200 light:text-zinc-700">
                  {monthLabel}
                </div>
              )}

              <div className={monthLabel ? "mt-5" : ""}>
                <div
                  className={`mb-1 text-xs ${
                    isToday
                      ? "font-semibold text-indigo-400 light:text-indigo-600"
                      : "text-zinc-500"
                  }`}
                >
                  {dateLabel}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayRecordings.slice(0, 3).map((recording) => (
                    <Link
                      key={recording.id}
                      href={`/recordings/${encodeURIComponent(recording.id)}`}
                      className="truncate rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-300 transition hover:bg-zinc-700 light:bg-indigo-100 light:text-indigo-800 light:hover:bg-indigo-200"
                      title={recording.title}
                    >
                      {recording.title}
                    </Link>
                  ))}
                  {dayRecordings.length > 3 && (
                    <span className="text-[10px] text-zinc-500">
                      +{dayRecordings.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
