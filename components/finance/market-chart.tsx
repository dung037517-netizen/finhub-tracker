"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, BarChart3, CandlestickChart, LineChart as LineChartIcon } from "lucide-react";
import * as React from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/finance/chart-tooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  bollingerBands,
  describeReturns,
  exponentialMovingAverage,
  formatCurrency,
  formatSignedPercent,
  logReturns,
  relativeStrengthIndex,
  simpleMovingAverage,
  sliceTimeframe,
} from "@/lib/finance-engine";
import { cn } from "@/lib/utils";
import type { Candle, Quote, Timeframe } from "@/types/finance";

const TIMEFRAMES: readonly Timeframe[] = ["1W", "1M", "3M", "6M", "1Y", "ALL"];

type ChartStyle = "candlestick" | "area" | "line";

interface ChartRow {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  /** [low, high] — drives the candle body's vertical extent. */
  readonly range: readonly [number, number];
  readonly sma20: number | null;
  readonly sma50: number | null;
  readonly ema12: number | null;
  readonly bollingerUpper: number | null;
  readonly bollingerLower: number | null;
}

/* ------------------------------------------------------------------ */
/* Candlestick renderer                                                */
/* ------------------------------------------------------------------ */

interface CandleShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ChartRow;
}

/**
 * Custom bar shape that draws a full OHLC candle.
 *
 * Recharts has no native candlestick, so the bar is bound to the [low, high]
 * range and this shape converts each of the four prices back into pixels using
 * the bar's own geometry. That keeps the candle perfectly registered with the
 * y-axis without needing access to the internal scale.
 */
function CandleShape({ x, y, width, height, payload }: CandleShapeProps) {
  if (
    payload === undefined ||
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return null;
  }

  const { open, close, high, low } = payload;
  const span = high - low;

  // A doji (or a flat bar) has zero span; draw a single hairline instead of
  // dividing by zero.
  const priceToPixel = (price: number): number =>
    span === 0 ? y + height / 2 : y + ((high - price) / span) * height;

  const isUp = close >= open;
  const color = isUp ? "var(--gain)" : "var(--loss)";

  const bodyTop = priceToPixel(Math.max(open, close));
  const bodyBottom = priceToPixel(Math.min(open, close));
  const bodyHeight = Math.max(1, bodyBottom - bodyTop);

  const centre = x + width / 2;
  const bodyWidth = Math.max(1, Math.min(width * 0.72, 14));

  return (
    <g>
      {/* Wick */}
      <line
        x1={centre}
        x2={centre}
        y1={y}
        y2={y + height}
        stroke={color}
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
      {/* Body — hollow on up bars, filled on down bars, the convention that
          lets a trader read direction without relying on colour alone. */}
      <rect
        x={centre - bodyWidth / 2}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        fill={isUp ? "var(--background)" : color}
        stroke={color}
        strokeWidth={1.25}
      />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export interface MarketChartProps {
  symbol: string;
  name: string;
  candles: readonly Candle[];
  quote: Quote;
  /** Symbols the user can switch between. */
  symbols: readonly { readonly symbol: string; readonly name: string }[];
  onSymbolChange: (symbol: string) => void;
  className?: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function MarketChart({
  symbol,
  name,
  candles,
  quote,
  symbols,
  onSymbolChange,
  className,
}: MarketChartProps) {
  const [timeframe, setTimeframe] = React.useState<Timeframe>("3M");
  const [style, setStyle] = React.useState<ChartStyle>("candlestick");
  const [showSma, setShowSma] = React.useState(true);
  const [showBollinger, setShowBollinger] = React.useState(false);
  const [showRsi, setShowRsi] = React.useState(true);
  const [showVolume, setShowVolume] = React.useState(true);

  // Indicators are computed on the full history and then sliced, so a moving
  // average never "restarts" when the user narrows the timeframe — a subtle
  // correctness point that most dashboards get wrong.
  const rows = React.useMemo<ChartRow[]>(() => {
    const sma20 = simpleMovingAverage(candles, 20).points;
    const sma50 = simpleMovingAverage(candles, 50).points;
    const ema12 = exponentialMovingAverage(candles, 12).points;
    const bands = bollingerBands(candles, 20, 2);

    return candles.map((candle, index) => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      range: [candle.low, candle.high] as const,
      sma20: sma20[index]?.value ?? null,
      sma50: sma50[index]?.value ?? null,
      ema12: ema12[index]?.value ?? null,
      bollingerUpper: bands.upper[index]?.value ?? null,
      bollingerLower: bands.lower[index]?.value ?? null,
    }));
  }, [candles]);

  const visibleCandles = React.useMemo(
    () => sliceTimeframe(candles, timeframe),
    [candles, timeframe],
  );

  const visibleRows = React.useMemo(
    () => rows.slice(rows.length - visibleCandles.length),
    [rows, visibleCandles.length],
  );

  const rsiPoints = React.useMemo(() => {
    const series = relativeStrengthIndex(candles, 14).points;
    return series.slice(series.length - visibleCandles.length);
  }, [candles, visibleCandles.length]);

  const windowStats = React.useMemo(
    () => describeReturns(logReturns(visibleCandles.map((candle) => candle.close))),
    [visibleCandles],
  );

  const periodChange = React.useMemo(() => {
    if (visibleCandles.length < 2) return 0;
    const first = visibleCandles[0].close;
    const last = visibleCandles[visibleCandles.length - 1].close;
    return first === 0 ? 0 : last / first - 1;
  }, [visibleCandles]);

  const isUp = quote.change >= 0;

  // Pad the price axis so the candles never touch the plot edges.
  const priceDomain = React.useMemo<[number, number]>(() => {
    if (visibleRows.length === 0) return [0, 1];
    const lows = visibleRows.map((row) => row.low);
    const highs = visibleRows.map((row) => row.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const pad = (max - min) * 0.08 || max * 0.02;
    return [min - pad, max + pad];
  }, [visibleRows]);

  const latestRsi = rsiPoints[rsiPoints.length - 1]?.value ?? null;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b border-border">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="numeric text-lg">{symbol}</CardTitle>
              <Badge variant="outline">{name}</Badge>
            </div>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="numeric text-2xl font-semibold tabular-nums">
                {formatCurrency(quote.price)}
              </span>
              <span
                className={cn(
                  "numeric text-sm font-medium",
                  isUp ? "text-gain" : "text-loss",
                )}
              >
                {isUp ? "▲" : "▼"} {formatCurrency(Math.abs(quote.change))} (
                {formatSignedPercent(quote.changePercent)})
              </span>
              <CardDescription className="numeric text-xs">
                {timeframe} change{" "}
                <span className={periodChange >= 0 ? "text-gain" : "text-loss"}>
                  {formatSignedPercent(periodChange)}
                </span>
                {" · "}
                σ<sub>ann</sub> {(windowStats.annualizedVolatility * 100).toFixed(1)}%
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Select a symbol"
            >
              {symbols.map((entry) => (
                <button
                  key={entry.symbol}
                  type="button"
                  onClick={() => onSymbolChange(entry.symbol)}
                  aria-pressed={entry.symbol === symbol}
                  title={entry.name}
                  className={cn(
                    "numeric rounded-md border px-2 py-1 text-xs transition-colors",
                    entry.symbol === symbol
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {entry.symbol}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <div
                className="flex rounded-md border border-border p-0.5"
                role="group"
                aria-label="Chart style"
              >
                {(
                  [
                    { value: "candlestick", icon: CandlestickChart, label: "Candlesticks" },
                    { value: "area", icon: Activity, label: "Area" },
                    { value: "line", icon: LineChartIcon, label: "Line" },
                  ] as const
                ).map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStyle(option.value)}
                      aria-pressed={style === option.value}
                      aria-label={option.label}
                      title={option.label}
                      className={cn(
                        "rounded p-1.5 transition-colors",
                        style === option.value
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </button>
                  );
                })}
              </div>

              <div
                className="flex rounded-md border border-border p-0.5"
                role="group"
                aria-label="Timeframe"
              >
                {TIMEFRAMES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTimeframe(option)}
                    aria-pressed={timeframe === option}
                    className={cn(
                      "numeric rounded px-2 py-1 text-xs transition-colors",
                      timeframe === option
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <div className="h-80 w-full" aria-label={`${symbol} price chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleRows} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.42} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                minTickGap={40}
                tickFormatter={(value: number) => dateFormatter.format(new Date(value))}
              />

              <YAxis
                yAxisId="price"
                domain={priceDomain}
                orientation="right"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                width={64}
                tickFormatter={(value: number) => value.toFixed(value >= 1000 ? 0 : 2)}
              />

              {showVolume && (
                <YAxis yAxisId="volume" domain={[0, (max: number) => max * 4.5]} hide />
              )}

              <Tooltip
                content={
                  <ChartTooltip
                    decimals={2}
                    labelFormatter={(value) =>
                      typeof value === "number"
                        ? fullDateFormatter.format(new Date(value))
                        : String(value ?? "")
                    }
                  />
                }
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              />

              {showVolume && (
                <Bar
                  yAxisId="volume"
                  dataKey="volume"
                  name="Volume"
                  fill="var(--muted-foreground)"
                  opacity={0.22}
                  isAnimationActive={false}
                />
              )}

              {style === "candlestick" && (
                <Bar
                  yAxisId="price"
                  dataKey="range"
                  name="OHLC"
                  shape={<CandleShape />}
                  isAnimationActive={false}
                  legendType="none"
                />
              )}

              {style === "area" && (
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="close"
                  name="Close"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#price-fill)"
                  dot={false}
                  isAnimationActive={false}
                />
              )}

              {style === "line" && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="close"
                  name="Close"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}

              {showSma && (
                <>
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="sma20"
                    name="SMA 20"
                    stroke="var(--chart-2)"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="sma50"
                    name="SMA 50"
                    stroke="var(--chart-3)"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </>
              )}

              {showBollinger && (
                <>
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="bollingerUpper"
                    name="Bollinger +2σ"
                    stroke="var(--chart-4)"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="bollingerLower"
                    name="Bollinger −2σ"
                    stroke="var(--chart-4)"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </>
              )}

              <Legend
                wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                iconType="plainline"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <AnimatePresence initial={false}>
          {showRsi && (
            <motion.div
              key="rsi"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  RSI (14)
                </span>
                {latestRsi !== null && (
                  <Badge
                    variant={
                      latestRsi >= 70 ? "destructive" : latestRsi <= 30 ? "success" : "outline"
                    }
                  >
                    <span className="numeric">{latestRsi.toFixed(1)}</span>
                    {latestRsi >= 70 ? " overbought" : latestRsi <= 30 ? " oversold" : " neutral"}
                  </Badge>
                )}
              </div>
              <div className="h-28 w-full" aria-label="Relative strength index chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={[...rsiPoints]}
                    margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="time" hide />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 30, 50, 70, 100]}
                      orientation="right"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      stroke="var(--border)"
                      width={64}
                    />
                    {/* Wilder's conventional overbought / oversold zones. */}
                    <ReferenceArea y1={70} y2={100} fill="var(--loss)" fillOpacity={0.08} />
                    <ReferenceArea y1={0} y2={30} fill="var(--gain)" fillOpacity={0.08} />
                    <ReferenceLine y={70} stroke="var(--loss)" strokeDasharray="3 3" />
                    <ReferenceLine y={30} stroke="var(--gain)" strokeDasharray="3 3" />
                    <Tooltip
                      content={
                        <ChartTooltip
                          decimals={1}
                          labelFormatter={(value) =>
                            typeof value === "number"
                              ? fullDateFormatter.format(new Date(value))
                              : String(value ?? "")
                          }
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name="RSI"
                      stroke="var(--chart-4)"
                      strokeWidth={1.75}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
          {(
            [
              { id: "toggle-sma", label: "SMA 20 / 50", checked: showSma, onChange: setShowSma },
              {
                id: "toggle-bollinger",
                label: "Bollinger bands",
                checked: showBollinger,
                onChange: setShowBollinger,
              },
              { id: "toggle-rsi", label: "RSI (14)", checked: showRsi, onChange: setShowRsi },
              {
                id: "toggle-volume",
                label: "Volume",
                checked: showVolume,
                onChange: setShowVolume,
              },
            ] as const
          ).map((toggle) => (
            <div key={toggle.id} className="flex items-center gap-2">
              <Switch id={toggle.id} checked={toggle.checked} onCheckedChange={toggle.onChange} />
              <Label htmlFor={toggle.id} className="normal-case tracking-normal">
                {toggle.label}
              </Label>
            </div>
          ))}

          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <BarChart3 className="size-3.5" aria-hidden />
            <span className="numeric">{visibleCandles.length} bars</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
