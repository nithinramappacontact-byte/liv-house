# Concurrency Console — Click-a-thon 2026, SonyLIV track

Foreground-only concurrency analytics on ClickHouse Cloud, with a React/MUI
console, per-query latency telemetry, and OpenTelemetry export to ClickStack.

## Run it

```bash
cp .env.example .env      # fill in ClickHouse credentials
docker compose up --build
```

- Console — http://localhost:5173
- API — http://localhost:8080/api/health
- OTLP collector — localhost:4317 (gRPC), localhost:4318 (HTTP)

`sql/ddl.sql` must have been applied to the ClickHouse service first: the
console reads `conc_minute` and `content_join`, and shows an empty state
until the rollup in section 6a has run.

## Services

| Service | What it does |
|---|---|
| `web` | React 18 + MUI 6 + MUI X Charts. Vite dev server, proxies `/api` to the API container. |
| `api` | Express. Owns the ClickHouse connection and all SQL. Instrumented with OpenTelemetry. |
| `otel-collector` | `clickhouse/clickstack-otel-collector`. Receives OTLP traces and logs, writes to ClickStack. |

The browser never holds ClickHouse credentials — every query goes through
the API, which is also where query timing is captured.

## Pages

**Overview** — peak concurrency and the minute it happened, average
concurrency, peak concurrent viewers, foreground session-minutes,
peak-to-average ratio, concurrency over time, peak/average by hour,
per-platform peaks, and most-watched titles. All filterable by date range,
platform, country and content type.

**Segment analysis** — pick a dimension (platform, country, content type,
title), then see per-segment peak, peak minute, average, session-minutes
and share, plus a multi-series time chart and concentration metrics. Same
filters apply.

## Query telemetry

Both pages carry a telemetry strip showing, per query:

- **ClickHouse ms** — server-side execution, read from the `statistics`
  block of the response. Excludes network transit, JSON parsing and all
  React rendering.
- **Round trip ms** — wall time including network, shown alongside so the
  gap is visible.
- **Rows read / bytes read** — what the query actually touched.

Every one of these is also attached to an OTel span
(`clickhouse.<query_name>`) and emitted as a structured log, so the same
numbers are queryable in ClickStack.

## Query design

Three rules govern every KPI query:

1. `sessions` is `SimpleAggregateFunction(max, UInt32)`, so it is collapsed
   with `max()` at its own grain before anything else. Summing raw rows
   would double-count every refresh.
2. Concurrency is additive **across dimensions** at a fixed minute — a
   session has exactly one platform, one country, one title — but not
   across minutes. So: sum across dimensions, then max over minutes.
3. Peak is never stored. Different dimension combinations peak at
   different minutes, which the platform table on the Overview page shows
   directly.

Average concurrency divides by *every* minute in the range, not by minutes
that happen to have rows. Minutes with zero viewing would otherwise vanish
and inflate the number.

Long ranges are bucketed for charting by `max()`, never `avg()` —
averaging would flatten exactly the value the page exists to show.

## Notes

`.env` is gitignored. Rotate the ClickHouse password before publishing
this repo.
