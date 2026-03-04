"use client";

import {
  Activity,
  CheckSquare,
  MonitorPlay,
  PenSquare,
  Server,
  Timer,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type listBoardGroupsApiV1BoardGroupsGetResponse,
  useListBoardGroupsApiV1BoardGroupsGet,
} from "@/api/generated/board-groups/board-groups";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type listGatewaysApiV1GatewaysGetResponse,
  useListGatewaysApiV1GatewaysGet,
} from "@/api/generated/gateways/gateways";
import {
  type dashboardMetricsApiV1MetricsDashboardGetResponse,
  useDashboardMetricsApiV1MetricsDashboardGet,
} from "@/api/generated/metrics/metrics";
import type { DashboardMetricsApiV1MetricsDashboardGetRangeKey } from "@/api/generated/model/dashboardMetricsApiV1MetricsDashboardGetRangeKey";
import type { ApiError } from "@/api/mutator";
import { SignedIn, SignedOut, useAuth } from "@/auth/clerk";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { DashboardShell } from "@/components/templates/DashboardShell";
import DropdownSelect, {
  type DropdownSelectOption,
} from "@/components/ui/dropdown-select";
import { parseApiDatetime } from "@/lib/datetime";
import { useGatewaySessions } from "@/lib/hooks/use-gateway-sessions";
import { getTaskHistory } from "@/lib/services/gateway-rpc";

type RangeKey = DashboardMetricsApiV1MetricsDashboardGetRangeKey;
type BucketKey = "hour" | "day" | "week" | "month";

type SeriesPoint = {
  period: string;
  value: number;
};

type WipPoint = {
  period: string;
  inbox: number;
  in_progress: number;
  review: number;
  done: number;
};

type RangeSeries = {
  range: RangeKey;
  bucket: BucketKey;
  points: SeriesPoint[];
};

type WipRangeSeries = {
  range: RangeKey;
  bucket: BucketKey;
  points: WipPoint[];
};

const hourFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

const DASHBOARD_RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: "24h", label: "24 hours" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "1y", label: "1 year" },
];
const DASHBOARD_RANGE_SET = new Set<RangeKey>(
  DASHBOARD_RANGE_OPTIONS.map((option) => option.value)
);
const ALL_FILTER_VALUE = "all";
const DEFAULT_RANGE: RangeKey = "7d";

const formatPeriod = (value: string, bucket: BucketKey) => {
  const date = parseApiDatetime(value);
  if (!date) return "";
  if (bucket === "hour") return hourFormatter.format(date);
  if (bucket === "month") return monthFormatter.format(date);
  return dayFormatter.format(date);
};

const formatNumber = (value: number) => value.toLocaleString("en-US");
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatHours = (value: number | null) =>
  value === null || !Number.isFinite(value) ? "--" : `${value.toFixed(1)}h`;
const calcProgress = (values?: number[]) => {
  if (!values || values.length === 0) return 0;
  const max = Math.max(...values);
  if (!Number.isFinite(max) || max <= 0) return 0;
  const latest = values[values.length - 1] ?? 0;
  return Math.max(0, Math.min(100, Math.round((latest / max) * 100)));
};

function buildSeries(series: RangeSeries) {
  return series.points.map((point) => ({
    period: formatPeriod(point.period, series.bucket),
    value: Number(point.value ?? 0),
  }));
}

function buildWipSeries(series: WipRangeSeries) {
  return series.points.map((point) => ({
    period: formatPeriod(point.period, series.bucket),
    inbox: Number(point.inbox ?? 0),
    in_progress: Number(point.in_progress ?? 0),
    review: Number(point.review ?? 0),
    done: Number(point.done ?? 0),
  }));
}

function buildSparkline(series: RangeSeries) {
  return {
    values: series.points.map((point) => Number(point.value ?? 0)),
    labels: series.points.map((point) =>
      formatPeriod(point.period, series.bucket)
    ),
    bucket: series.bucket,
  };
}

function buildWipSparkline(series: WipRangeSeries, key: keyof WipPoint) {
  return {
    values: series.points.map((point) => Number(point[key] ?? 0)),
    labels: series.points.map((point) =>
      formatPeriod(point.period, series.bucket)
    ),
    bucket: series.bucket,
  };
}

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; color?: string }>;
  label?: string;
  formatter?: (value: number, name?: string) => string;
};

function TooltipCard({ active, payload, label, formatter }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-slate-900/95 px-3 py-2 text-xs text-slate-200 shadow-lg">
      {label ? <div className="text-slate-400">Period: {label}</div> : null}
      <div className="mt-1 space-y-1">
        {payload.map((entry, index) => (
          <div
            key={`${entry.name ?? "value"}-${index}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name ?? "Value"}
            </span>
            <span className="font-semibold text-slate-100">
              <span className="text-slate-400">Value: </span>
              {formatter
                ? formatter(Number(entry.value ?? 0), entry.name)
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtext,
  icon,
  colorScheme = "blue",
}: {
  title: string;
  value: string | React.ReactNode;
  subtext?: string;
  icon: React.ReactNode;
  colorScheme?: "blue" | "green" | "purple" | "red" | "emerald";
}) {
  const colors = {
    blue: "bg-[#1A233A] border-[#2A3B63] text-blue-400",
    green: "bg-[#14291D] border-[#1D402B] text-green-400",
    purple: "bg-[#251536] border-[#3D235C] text-purple-400",
    red: "bg-[#2D1616] border-[#4A2020] text-red-400",
    emerald: "bg-emerald-950/30 border-emerald-900/50 text-emerald-500",
  };

  const selectedColors = colors[colorScheme];

  return (
    <div
      className={`rounded-xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between h-32 relative overflow-hidden ${selectedColors}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-foreground/80 tracking-tight">
          {title}
        </p>
        <div
          className={`p-1.5 rounded-md ${selectedColors.replace("bg-", "bg-opacity-50 bg-")}`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <h3 className="font-mono text-3xl font-semibold text-foreground tracking-tighter">
          {value}
        </h3>
        {subtext && <p className={`text-xs ml-2 mb-1 opacity-70`}>{subtext}</p>}
      </div>
      {/* Decorative gradient blur */}
      <div
        className={`absolute -bottom-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-20 bg-current`}
      />
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm overflow-hidden flex flex-col hover:-translate-y-0.5 hover:shadow-md transition-all">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold text-foreground tracking-tight">
            {title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="h-56 flex-1">{children}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRangeParam = searchParams.get("range");
  const selectedGroupParam = searchParams.get("group");
  const selectedBoardParam = searchParams.get("board");
  const selectedRange: RangeKey =
    selectedRangeParam &&
    DASHBOARD_RANGE_SET.has(selectedRangeParam as RangeKey)
      ? (selectedRangeParam as RangeKey)
      : DEFAULT_RANGE;
  const selectedGroupId =
    selectedGroupParam && selectedGroupParam !== ALL_FILTER_VALUE
      ? selectedGroupParam
      : null;
  const selectedBoardId =
    selectedBoardParam && selectedBoardParam !== ALL_FILTER_VALUE
      ? selectedBoardParam
      : null;

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 30_000,
        refetchOnMount: "always",
      },
    }
  );
  const boardGroupsQuery = useListBoardGroupsApiV1BoardGroupsGet<
    listBoardGroupsApiV1BoardGroupsGetResponse,
    ApiError
  >(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 30_000,
        refetchOnMount: "always",
      },
    }
  );
  const gatewaysQuery = useListGatewaysApiV1GatewaysGet<
    listGatewaysApiV1GatewaysGetResponse,
    ApiError
  >(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 30_000,
        refetchOnMount: "always",
      },
    }
  );

  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? [...(boardsQuery.data.data.items ?? [])].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        : [],
    [boardsQuery.data]
  );
  const boardGroups = useMemo(
    () =>
      boardGroupsQuery.data?.status === 200
        ? [...(boardGroupsQuery.data.data.items ?? [])].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        : [],
    [boardGroupsQuery.data]
  );
  const gateways = useMemo(
    () =>
      gatewaysQuery.data?.status === 200
        ? [...(gatewaysQuery.data.data.items ?? [])].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        : [],
    [gatewaysQuery.data]
  );

  const [totalCronjobs, setTotalCronjobs] = useState(0);

  const { sessionsByGateway, gatewayOnline } = useGatewaySessions(gateways, {
    enabled: Boolean(isSignedIn),
  });

  // Fetch cronjobs from online gateways
  useEffect(() => {
    if (!isSignedIn || gateways.length === 0) {
      console.log("[Dashboard] No gateways or not signed in", {
        isSignedIn,
        gatewaysCount: gateways.length,
      });
      return;
    }

    const fetchCronjobs = async () => {
      console.log(
        "[Dashboard] Fetching cronjobs from",
        gateways.length,
        "gateways"
      );
      let total = 0;
      const timeout = 10_000;

      await Promise.allSettled(
        gateways.map(async (gateway) => {
          console.log(
            "[Dashboard] Fetching from gateway:",
            gateway.name,
            gateway.url
          );
          try {
            const jobs = await Promise.race([
              getTaskHistory({
                url: gateway.url,
                token: gateway.token ?? null,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("Gateway RPC timeout")),
                  timeout
                )
              ),
            ]);
            console.log(
              "[Dashboard] Gateway",
              gateway.name,
              "returned",
              jobs.length,
              "jobs"
            );
            total += jobs.length;
          } catch (err) {
            console.error(
              "[Dashboard] Failed to fetch cronjobs from gateway:",
              gateway.name,
              err
            );
            // Gateway offline or error - skip
          }
        })
      );

      console.log("[Dashboard] Total cronjobs:", total);
      setTotalCronjobs(total);
    };

    fetchCronjobs();
    const interval = setInterval(fetchCronjobs, 60_000); // Refresh every minute
    return () => clearInterval(interval);
  }, [isSignedIn, gateways]);

  const totalGateways = gateways.length;
  const onlineGateways = Array.from(gatewayOnline.values()).filter(
    (online) => online
  ).length;
  const totalSessions = Array.from(sessionsByGateway.values()).reduce(
    (sum, sessions) => sum + sessions.length,
    0
  );

  const filteredBoards = useMemo(
    () =>
      selectedGroupId
        ? boards.filter((board) => board.board_group_id === selectedGroupId)
        : boards,
    [boards, selectedGroupId]
  );
  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === selectedBoardId) ?? null,
    [boards, selectedBoardId]
  );
  const selectedGroup = useMemo(
    () => boardGroups.find((group) => group.id === selectedGroupId) ?? null,
    [boardGroups, selectedGroupId]
  );

  const boardGroupOptions = useMemo<DropdownSelectOption[]>(
    () => [
      { value: ALL_FILTER_VALUE, label: "All groups" },
      ...boardGroups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [boardGroups]
  );
  const boardOptions = useMemo<DropdownSelectOption[]>(
    () => [
      { value: ALL_FILTER_VALUE, label: "All boards" },
      ...filteredBoards.map((board) => ({
        value: board.id,
        label: board.name,
      })),
    ],
    [filteredBoards]
  );

  const metricsQuery = useDashboardMetricsApiV1MetricsDashboardGet<
    dashboardMetricsApiV1MetricsDashboardGetResponse,
    ApiError
  >(
    {
      range_key: selectedRange,
      board_id: selectedBoardId ?? undefined,
      group_id: selectedGroupId ?? undefined,
    },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 15_000,
        refetchOnMount: "always",
      },
    }
  );

  const metrics =
    metricsQuery.data?.status === 200 ? metricsQuery.data.data : null;

  const throughputSeries = useMemo(
    () => (metrics ? buildSeries(metrics.throughput.primary) : []),
    [metrics]
  );
  const cycleSeries = useMemo(
    () => (metrics ? buildSeries(metrics.cycle_time.primary) : []),
    [metrics]
  );
  const errorSeries = useMemo(
    () => (metrics ? buildSeries(metrics.error_rate.primary) : []),
    [metrics]
  );
  const wipSeries = useMemo(
    () => (metrics ? buildWipSeries(metrics.wip.primary) : []),
    [metrics]
  );

  const cycleSpark = useMemo(
    () => (metrics ? buildSparkline(metrics.cycle_time.primary) : null),
    [metrics]
  );
  const errorSpark = useMemo(
    () => (metrics ? buildSparkline(metrics.error_rate.primary) : null),
    [metrics]
  );
  const wipSpark = useMemo(
    () =>
      metrics ? buildWipSparkline(metrics.wip.primary, "in_progress") : null,
    [metrics]
  );

  const activeProgress = useMemo(
    () => (metrics ? Math.min(100, metrics.kpis.active_agents * 12.5) : 0),
    [metrics]
  );
  const wipProgress = useMemo(() => calcProgress(wipSpark?.values), [wipSpark]);
  const errorProgress = useMemo(
    () => calcProgress(errorSpark?.values),
    [errorSpark]
  );
  const cycleProgress = useMemo(
    () => calcProgress(cycleSpark?.values),
    [cycleSpark]
  );

  return (
    <DashboardShell>
      <SignedOut>
        <SignedOutPanel
          message="Sign in to access the dashboard."
          forceRedirectUrl="/onboarding"
          signUpForceRedirectUrl="/onboarding"
        />
      </SignedOut>
      <SignedIn>
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
          {metricsQuery.error ? (
            <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400 shadow-sm">
              {metricsQuery.error.message}
            </div>
          ) : null}

          {metricsQuery.isLoading && !metrics ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm animate-pulse">
              Loading mission control telemetry…
            </div>
          ) : null}

          {metrics ? (
            <>
              {/* Top Metrics Row */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Active Agents"
                  value={formatNumber(metrics.kpis.active_agents)}
                  icon={<Users className="h-4 w-4 text-blue-400" />}
                  colorScheme="blue"
                  subtext={`Max progress: ${activeProgress}%`}
                />
                <MetricCard
                  title="Tasks In Progress"
                  value={formatNumber(metrics.kpis.tasks_in_progress)}
                  icon={<PenSquare className="h-4 w-4 text-purple-400" />}
                  colorScheme="purple"
                  subtext={`Max progress: ${wipProgress}%`}
                />
                <MetricCard
                  title="Error Rate"
                  value={formatPercent(metrics.kpis.error_rate_pct)}
                  icon={<Activity className="h-4 w-4 text-emerald-500" />}
                  colorScheme="emerald"
                />
                <MetricCard
                  title="Median Cycle Time"
                  value={formatHours(metrics.kpis.median_cycle_time_hours_7d)}
                  icon={<Timer className="h-4 w-4 text-green-400" />}
                  colorScheme="green"
                />
              </div>

              {/* Secondary Metrics Row */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
                <MetricCard
                  title="Total Gateways"
                  value={formatNumber(totalGateways)}
                  icon={<Server className="h-4 w-4 text-blue-400" />}
                  colorScheme="blue"
                />
                <MetricCard
                  title="Online Gateways"
                  value={formatNumber(onlineGateways)}
                  icon={<Server className="h-4 w-4 text-emerald-500" />}
                  colorScheme="emerald"
                />
                <MetricCard
                  title="Active Sessions"
                  value={formatNumber(totalSessions)}
                  icon={<MonitorPlay className="h-4 w-4 text-purple-400" />}
                  colorScheme="purple"
                />
                <MetricCard
                  title="Cronjobs"
                  value={formatNumber(totalCronjobs)}
                  icon={<Timer className="h-4 w-4 text-green-400" />}
                  colorScheme="green"
                />
              </div>

              {/* Charts Row */}
              <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ChartCard title="Completed Tasks" subtitle="Throughput">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={throughputSeries}
                      margin={{ left: 4, right: 12 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="#e2e8f0"
                        strokeOpacity={0.1}
                      />
                      <XAxis
                        dataKey="period"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        width={40}
                      />
                      <Tooltip
                        content={
                          <TooltipCard formatter={(v) => formatNumber(v)} />
                        }
                        cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{
                          paddingTop: "8px",
                          fontSize: "12px",
                          color: "#64748b",
                        }}
                      />
                      <Bar
                        dataKey="value"
                        name="Completed"
                        fill="#3b82f6"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Avg Hours to Review" subtitle="Cycle time">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={cycleSeries}
                      margin={{ left: 4, right: 12 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="#e2e8f0"
                        strokeOpacity={0.1}
                      />
                      <XAxis
                        dataKey="period"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        width={40}
                      />
                      <Tooltip
                        content={
                          <TooltipCard formatter={(v) => `${v.toFixed(1)}h`} />
                        }
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{
                          paddingTop: "8px",
                          fontSize: "12px",
                          color: "#64748b",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name="Hours"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Failed Events" subtitle="Error rate">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={errorSeries}
                      margin={{ left: 4, right: 12 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="#e2e8f0"
                        strokeOpacity={0.1}
                      />
                      <XAxis
                        dataKey="period"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        width={40}
                      />
                      <Tooltip
                        content={
                          <TooltipCard formatter={(v) => formatPercent(v)} />
                        }
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{
                          paddingTop: "8px",
                          fontSize: "12px",
                          color: "#64748b",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name="Error rate"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Status Distribution"
                  subtitle="Work in progress"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={wipSeries} margin={{ left: 4, right: 12 }}>
                      <CartesianGrid
                        vertical={false}
                        stroke="#e2e8f0"
                        strokeOpacity={0.1}
                      />
                      <XAxis
                        dataKey="period"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        width={40}
                      />
                      <Tooltip
                        content={
                          <TooltipCard formatter={(v) => formatNumber(v)} />
                        }
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{
                          paddingTop: "8px",
                          fontSize: "12px",
                          color: "#64748b",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="inbox"
                        name="Inbox"
                        stackId="wip"
                        fill="#ea580c"
                        stroke="#ea580c"
                        fillOpacity={0.2}
                      />
                      <Area
                        type="monotone"
                        dataKey="in_progress"
                        name="In progress"
                        stackId="wip"
                        fill="#3b82f6"
                        stroke="#3b82f6"
                        fillOpacity={0.2}
                      />
                      <Area
                        type="monotone"
                        dataKey="review"
                        name="Review"
                        stackId="wip"
                        fill="#8b5cf6"
                        stroke="#8b5cf6"
                        fillOpacity={0.2}
                      />
                      <Area
                        type="monotone"
                        dataKey="done"
                        name="Done"
                        stackId="wip"
                        fill="#10b981"
                        stroke="#10b981"
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </>
          ) : null}
        </div>
      </SignedIn>
    </DashboardShell>
  );
}
