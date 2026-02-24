export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { agents, boards, tasks } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RangeKey = "24h" | "3d" | "7d" | "14d" | "1m" | "3m" | "6m" | "1y";
type BucketKey = "hour" | "day" | "week" | "month";

interface SeriesPoint {
  period: string;
  value: number;
}

interface WipPoint {
  period: string;
  inbox: number;
  in_progress: number;
  review: number;
  done: number;
}

interface RangeSeries {
  range: string;
  bucket: BucketKey;
  points: SeriesPoint[];
}

interface WipRangeSeries {
  range: string;
  bucket: BucketKey;
  points: WipPoint[];
}

interface DashboardMetricsResponse {
  range: RangeKey;
  generated_at: string;
  kpis: {
    active_agents: number;
    tasks_in_progress: number;
    error_rate_pct: number;
    median_cycle_time_hours_7d: number | null;
  };
  throughput: { primary: RangeSeries; comparison: RangeSeries };
  cycle_time: { primary: RangeSeries; comparison: RangeSeries };
  error_rate: { primary: RangeSeries; comparison: RangeSeries };
  wip: { primary: WipRangeSeries; comparison: WipRangeSeries };
}

// ---------------------------------------------------------------------------
// Range configuration
// ---------------------------------------------------------------------------

const VALID_RANGE_KEYS = new Set<RangeKey>([
  "24h",
  "3d",
  "7d",
  "14d",
  "1m",
  "3m",
  "6m",
  "1y",
]);

interface RangeConfig {
  bucket: BucketKey;
  durationMs: number;
}

const RANGE_CONFIG: Record<RangeKey, RangeConfig> = {
  "24h": { bucket: "hour", durationMs: 24 * 60 * 60 * 1000 },
  "3d": { bucket: "hour", durationMs: 3 * 24 * 60 * 60 * 1000 },
  "7d": { bucket: "day", durationMs: 7 * 24 * 60 * 60 * 1000 },
  "14d": { bucket: "day", durationMs: 14 * 24 * 60 * 60 * 1000 },
  "1m": { bucket: "day", durationMs: 30 * 24 * 60 * 60 * 1000 },
  "3m": { bucket: "week", durationMs: 90 * 24 * 60 * 60 * 1000 },
  "6m": { bucket: "month", durationMs: 180 * 24 * 60 * 60 * 1000 },
  "1y": { bucket: "month", durationMs: 365 * 24 * 60 * 60 * 1000 },
};

// ---------------------------------------------------------------------------
// SQLite date format helper per bucket
// ---------------------------------------------------------------------------

function bucketFormat(bucket: BucketKey, column: string): string {
  switch (bucket) {
    case "hour":
      return `strftime('%Y-%m-%dT%H:00:00', ${column})`;
    case "day":
      return `strftime('%Y-%m-%d', ${column})`;
    case "week":
      return `strftime('%Y-W%W', ${column})`;
    case "month":
      return `strftime('%Y-%m', ${column})`;
  }
}

// ---------------------------------------------------------------------------
// Period label generation (for filling empty buckets)
// ---------------------------------------------------------------------------

function generatePeriodLabels(
  startMs: number,
  endMs: number,
  bucket: BucketKey
): string[] {
  const labels: string[] = [];
  const cursor = new Date(startMs);

  // Align cursor to bucket boundary
  if (bucket === "hour") {
    cursor.setUTCMinutes(0, 0, 0);
  } else if (bucket === "day") {
    cursor.setUTCHours(0, 0, 0, 0);
  } else if (bucket === "week") {
    // Align to start of ISO week (Monday)
    const day = cursor.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    cursor.setUTCDate(cursor.getUTCDate() + diff);
    cursor.setUTCHours(0, 0, 0, 0);
  } else {
    // month
    cursor.setUTCDate(1);
    cursor.setUTCHours(0, 0, 0, 0);
  }

  while (cursor.getTime() < endMs) {
    if (bucket === "hour") {
      labels.push(cursor.toISOString().slice(0, 19));
    } else if (bucket === "day") {
      labels.push(cursor.toISOString().slice(0, 10));
    } else if (bucket === "week") {
      // SQLite strftime('%Y-W%W') — %W is 00-53 (Monday-based week)
      const year = cursor.getUTCFullYear();
      const jan1 = new Date(Date.UTC(year, 0, 1));
      const dayOfYear =
        Math.floor((cursor.getTime() - jan1.getTime()) / 86400000) + 1;
      const weekNum = Math.floor((dayOfYear + jan1.getUTCDay() - 1) / 7);
      labels.push(`${year}-W${String(weekNum).padStart(2, "0")}`);
    } else {
      // month
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth() + 1;
      labels.push(`${y}-${String(m).padStart(2, "0")}`);
    }

    // Advance cursor
    if (bucket === "hour") {
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    } else if (bucket === "day") {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } else if (bucket === "week") {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    } else {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  return labels;
}

// ---------------------------------------------------------------------------
// Helpers to merge DB rows into full period series
// ---------------------------------------------------------------------------

function mergeThroughputPoints(
  labels: string[],
  rows: Array<{ period: string | null; cnt: number }>
): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.period) map.set(row.period, Number(row.cnt));
  }
  return labels.map((period) => ({ period, value: map.get(period) ?? 0 }));
}

function mergeCycleTimePoints(
  labels: string[],
  rows: Array<{ period: string | null; avg_hours: number | null }>
): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.period && row.avg_hours !== null) {
      map.set(row.period, Number(row.avg_hours));
    }
  }
  return labels.map((period) => ({
    period,
    value: map.get(period) ?? 0,
  }));
}

function mergeWipPoints(
  labels: string[],
  rows: Array<{
    period: string | null;
    inbox: number;
    in_progress: number;
    review: number;
    done: number;
  }>
): WipPoint[] {
  const map = new Map<
    string,
    { inbox: number; in_progress: number; review: number; done: number }
  >();
  for (const row of rows) {
    if (row.period) {
      map.set(row.period, {
        inbox: Number(row.inbox),
        in_progress: Number(row.in_progress),
        review: Number(row.review),
        done: Number(row.done),
      });
    }
  }
  return labels.map((period) => ({
    period,
    ...(map.get(period) ?? {
      inbox: 0,
      in_progress: 0,
      review: 0,
      done: 0,
    }),
  }));
}

// ---------------------------------------------------------------------------
// Median computation (in-process, over sorted done-task rows)
// ---------------------------------------------------------------------------

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lo = sorted[mid - 1] ?? 0;
  const hi = sorted[mid] ?? 0;
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/metrics/dashboard
 * Return dashboard KPIs and time-series data for accessible boards.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const url = new URL(request.url);
    const rangeKeyParam = url.searchParams.get("range_key") ?? "7d";
    const boardIdParam = url.searchParams.get("board_id") ?? null;
    const groupIdParam = url.searchParams.get("group_id") ?? null;

    if (!VALID_RANGE_KEYS.has(rangeKeyParam as RangeKey)) {
      throw new ApiError(
        422,
        `Invalid range_key "${rangeKeyParam}". Must be one of: ${[...VALID_RANGE_KEYS].join(", ")}`
      );
    }

    const rangeKey = rangeKeyParam as RangeKey;
    const { bucket, durationMs } = RANGE_CONFIG[rangeKey];

    // Time windows
    const now = Date.now();
    const primaryEnd = now;
    const primaryStart = now - durationMs;
    const compStart = primaryStart - durationMs;
    const compEnd = primaryStart;

    const primaryStartIso = new Date(primaryStart).toISOString();
    const primaryEndIso = new Date(primaryEnd).toISOString();
    const compStartIso = new Date(compStart).toISOString();
    const compEndIso = new Date(compEnd).toISOString();

    // ------------------------------------------------------------------
    // Resolve board IDs in scope (org + optional board/group filter)
    // ------------------------------------------------------------------

    // Fetch all boards for this org first (used for scoping)
    const orgBoards = await db
      .select({ id: boards.id, boardGroupId: boards.boardGroupId })
      .from(boards)
      .where(eq(boards.organizationId, actor.orgId));

    // Apply group_id filter
    let scopedBoards = orgBoards;
    if (groupIdParam) {
      scopedBoards = orgBoards.filter((b) => b.boardGroupId === groupIdParam);
    }
    // Apply board_id filter (overrides group filter scope)
    if (boardIdParam) {
      scopedBoards = scopedBoards.filter((b) => b.id === boardIdParam);
    }

    const scopedBoardIds = scopedBoards.map((b) => b.id);

    // If filters specified but no boards match, return zero-value response
    const noBoards =
      (boardIdParam || groupIdParam) && scopedBoardIds.length === 0;

    // ------------------------------------------------------------------
    // KPI: active_agents
    // ------------------------------------------------------------------

    let activeAgents = 0;
    if (!noBoards) {
      const agentWhere =
        scopedBoardIds.length > 0
          ? and(
              eq(agents.status, "online"),
              inArray(agents.boardId, scopedBoardIds)
            )
          : eq(agents.status, "online");

      const [agentRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(agents)
        .where(agentWhere);

      activeAgents = Number(agentRow?.count ?? 0);
    }

    // ------------------------------------------------------------------
    // KPI: tasks_in_progress
    // ------------------------------------------------------------------

    let tasksInProgress = 0;
    if (!noBoards) {
      const taskWhere =
        scopedBoardIds.length > 0
          ? and(
              eq(tasks.status, "in_progress"),
              inArray(tasks.boardId, scopedBoardIds)
            )
          : eq(tasks.status, "in_progress");

      const [taskRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(taskWhere);

      tasksInProgress = Number(taskRow?.count ?? 0);
    }

    // ------------------------------------------------------------------
    // KPI: median_cycle_time_hours_7d
    // ------------------------------------------------------------------

    let medianCycleTimeHours7d: number | null = null;
    if (!noBoards) {
      const sevenDaysAgo = new Date(
        now - 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const ctWhere =
        scopedBoardIds.length > 0
          ? and(
              eq(tasks.status, "done"),
              isNotNull(tasks.inProgressAt),
              gte(tasks.updatedAt, sevenDaysAgo),
              inArray(tasks.boardId, scopedBoardIds)
            )
          : and(
              eq(tasks.status, "done"),
              isNotNull(tasks.inProgressAt),
              gte(tasks.updatedAt, sevenDaysAgo)
            );

      const ctRows = await db
        .select({
          inProgressAt: tasks.inProgressAt,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .where(ctWhere);

      const cycleHours = ctRows
        .map((row) => {
          if (!row.inProgressAt || !row.updatedAt) return null;
          const start = new Date(row.inProgressAt).getTime();
          const end = new Date(row.updatedAt).getTime();
          if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
          return (end - start) / 3600000;
        })
        .filter((v): v is number => v !== null && v >= 0);

      medianCycleTimeHours7d = computeMedian(cycleHours);
    }

    // ------------------------------------------------------------------
    // Time-series queries helper
    // ------------------------------------------------------------------

    const primaryLabels = generatePeriodLabels(
      primaryStart,
      primaryEnd,
      bucket
    );
    const compLabels = generatePeriodLabels(compStart, compEnd, bucket);

    // Helper: build the board scope condition for tasks
    const makeTaskTimeWhere = (startIso: string, endIso: string) => {
      const timeConditions = and(
        gte(tasks.updatedAt, startIso),
        lt(tasks.updatedAt, endIso)
      );
      if (noBoards) return timeConditions;
      if (scopedBoardIds.length > 0) {
        return and(timeConditions, inArray(tasks.boardId, scopedBoardIds));
      }
      return timeConditions;
    };

    // ------------------------------------------------------------------
    // Throughput (done tasks per bucket)
    // ------------------------------------------------------------------

    const buildThroughputSeries = async (
      startIso: string,
      endIso: string,
      labels: string[]
    ): Promise<RangeSeries> => {
      if (noBoards) {
        return {
          range: rangeKey,
          bucket,
          points: labels.map((p) => ({ period: p, value: 0 })),
        };
      }

      const fmt = bucketFormat(bucket, "updated_at");
      const rows = await db
        .select({
          period: sql<string | null>`${sql.raw(fmt)}`,
          cnt: sql<number>`count(*)`,
        })
        .from(tasks)
        .where(
          and(eq(tasks.status, "done"), makeTaskTimeWhere(startIso, endIso))
        )
        .groupBy(sql`${sql.raw(fmt)}`)
        .orderBy(sql`${sql.raw(fmt)}`);

      return {
        range: rangeKey,
        bucket,
        points: mergeThroughputPoints(labels, rows),
      };
    };

    // ------------------------------------------------------------------
    // Cycle time (avg hours from inProgressAt → updatedAt for done tasks)
    // ------------------------------------------------------------------

    const buildCycleTimeSeries = async (
      startIso: string,
      endIso: string,
      labels: string[]
    ): Promise<RangeSeries> => {
      if (noBoards) {
        return {
          range: rangeKey,
          bucket,
          points: labels.map((p) => ({ period: p, value: 0 })),
        };
      }

      const fmt = bucketFormat(bucket, "updated_at");
      const rows = await db
        .select({
          period: sql<string | null>`${sql.raw(fmt)}`,
          avg_hours: sql<number | null>`avg(
            (julianday(updated_at) - julianday(in_progress_at)) * 24
          )`,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.status, "done"),
            isNotNull(tasks.inProgressAt),
            makeTaskTimeWhere(startIso, endIso)
          )
        )
        .groupBy(sql`${sql.raw(fmt)}`)
        .orderBy(sql`${sql.raw(fmt)}`);

      return {
        range: rangeKey,
        bucket,
        points: mergeCycleTimePoints(labels, rows),
      };
    };

    // ------------------------------------------------------------------
    // Error rate (stub — returns 0 per bucket; no error tracking yet)
    // ------------------------------------------------------------------

    const buildErrorRateSeries = (labels: string[]): RangeSeries => ({
      range: rangeKey,
      bucket,
      points: labels.map((period) => ({ period, value: 0 })),
    });

    // ------------------------------------------------------------------
    // WIP (task counts per status per bucket, using updatedAt)
    // ------------------------------------------------------------------

    const buildWipSeries = async (
      startIso: string,
      endIso: string,
      labels: string[]
    ): Promise<WipRangeSeries> => {
      if (noBoards) {
        return {
          range: rangeKey,
          bucket,
          points: labels.map((p) => ({
            period: p,
            inbox: 0,
            in_progress: 0,
            review: 0,
            done: 0,
          })),
        };
      }

      const fmt = bucketFormat(bucket, "updated_at");
      const rows = await db
        .select({
          period: sql<string | null>`${sql.raw(fmt)}`,
          inbox: sql<number>`sum(case when status = 'inbox' then 1 else 0 end)`,
          in_progress: sql<number>`sum(case when status = 'in_progress' then 1 else 0 end)`,
          review: sql<number>`sum(case when status = 'review' then 1 else 0 end)`,
          done: sql<number>`sum(case when status = 'done' then 1 else 0 end)`,
        })
        .from(tasks)
        .where(makeTaskTimeWhere(startIso, endIso))
        .groupBy(sql`${sql.raw(fmt)}`)
        .orderBy(sql`${sql.raw(fmt)}`);

      return {
        range: rangeKey,
        bucket,
        points: mergeWipPoints(labels, rows),
      };
    };

    // ------------------------------------------------------------------
    // Execute all time-series queries in parallel
    // ------------------------------------------------------------------

    const [
      primaryThroughput,
      compThroughput,
      primaryCycleTime,
      compCycleTime,
      primaryWip,
      compWip,
    ] = await Promise.all([
      buildThroughputSeries(primaryStartIso, primaryEndIso, primaryLabels),
      buildThroughputSeries(compStartIso, compEndIso, compLabels),
      buildCycleTimeSeries(primaryStartIso, primaryEndIso, primaryLabels),
      buildCycleTimeSeries(compStartIso, compEndIso, compLabels),
      buildWipSeries(primaryStartIso, primaryEndIso, primaryLabels),
      buildWipSeries(compStartIso, compEndIso, compLabels),
    ]);

    const primaryErrorRate = buildErrorRateSeries(primaryLabels);
    const compErrorRate = buildErrorRateSeries(compLabels);

    // ------------------------------------------------------------------
    // Compose response
    // ------------------------------------------------------------------

    const response: DashboardMetricsResponse = {
      range: rangeKey,
      generated_at: new Date(now).toISOString(),
      kpis: {
        active_agents: activeAgents,
        tasks_in_progress: tasksInProgress,
        error_rate_pct: 0,
        median_cycle_time_hours_7d: medianCycleTimeHours7d,
      },
      throughput: {
        primary: primaryThroughput,
        comparison: compThroughput,
      },
      cycle_time: {
        primary: primaryCycleTime,
        comparison: compCycleTime,
      },
      error_rate: {
        primary: primaryErrorRate,
        comparison: compErrorRate,
      },
      wip: {
        primary: primaryWip,
        comparison: compWip,
      },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
