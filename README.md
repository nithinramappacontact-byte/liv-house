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

## LibreChat + MCP + Langfuse

Three more services turn the same ClickHouse tables into a conversational
surface, with every agent run traced.

```
LibreChat  ──▶  lc-agent  ──▶  mcp-clickhouse  ──▶  ClickHouse Cloud
   :3080         :3002            :8000
                    │
                    └──▶ Langfuse Cloud  (traces + live system prompts)
```

| Service | Role |
|---|---|
| `librechat` + `mongodb` | Chat UI at :3080. Agents appear in the model dropdown. |
| `lc-agent` | FastAPI serving an OpenAI-compatible `/v1/chat/completions`, backed by LangGraph ReAct agents. |
| `mcp-clickhouse` | Official `mcp-clickhouse` in HTTP transport. Exposes `run_select_query`, `list_databases`, `list_tables`. |

**Why a self-hosted MCP server.** ClickHouse Cloud's remote MCP authenticates
via OAuth browser sign-in. That works for LibreChat's own UI agents (a human
is present, and it is configured in `librechat.yaml`) but a headless agent
cannot complete it. The container takes a static bearer token instead.

### One router, three specialists

```
             liv-analyst  (Grok 4.5)
                  │  no database access — routes only
    ┌─────────────┼─────────────┐
liv-concurrency  liv-segment  liv-capacity     (OpenRouter)
    └─────────────┼─────────────┘
              mcp-clickhouse ──▶ ClickHouse Cloud
```

- **liv-analyst** — the one to pick in LibreChat. Decides which specialist a question needs, calls more than one when it spans areas, and synthesises. Has no DB tools, so it cannot produce a number without a specialist fetching one.
- **liv-concurrency** — peak and the minute it happened, peak vs average, filtered slices.
- **liv-segment** — concurrency by platform, country, content type or title, and whether segments peak at the same time.
- **liv-capacity** — translates peak/average into a provisioning recommendation.

**Why Grok on top, OpenRouter underneath.** The router makes one call per turn
and its only job is tool selection, which is where model quality shows most —
picking the wrong specialist wastes the whole turn. The specialists run several
calls each in a ReAct loop, so they are where volume and cost accumulate. Grok
where the decision is; cheap models where the grinding is.

**Why the specialists are tools rather than a classifier.** A hand-written
router picks exactly one branch. Tool-calling lets the supervisor consult two
specialists for a question that spans both, and Langfuse renders the result as
one nested trace — router, specialist, MCP call, the actual SQL. Adding a fourth
specialist is an `AGENT_4_*` block; no routing code changes.

`AGENT_N_DESCRIPTION` in `docker-compose.yml` is what the router sees as each
tool's description. It is the routing logic — keep it sharp.

### The tool hint is the load-bearing part

`lc-agent/config.py` holds `CLICKHOUSE_TOOL_HINT`, appended to every system
prompt. It states the schema and the three rules an LLM would otherwise get
wrong:

1. `sessions` is a max-semantics column — collapse before aggregating.
2. Sum across dimensions, then max over minutes. Never the reverse.
3. Peak is never stored and never rolled up.

Plus: average divides by every minute in the range, and users merge rather
than sum. Without this an agent writes SQL that looks right and returns
numbers that are wrong.

It lives in code rather than in the Langfuse prompt on purpose — see
`langfuse/README.md`.

### Setup

```bash
# 1. Add OPENROUTER_KEY (specialists) and XAI_API_KEY (router) to .env
#    Grok has no free tier — buy credits at console.x.ai
# 2. Add Langfuse keys to .env — optional, agents run without them
docker compose up -d --build

# 3. Publish the agent prompts to Langfuse (includes liv-router-agent)
docker compose exec lc-agent python push_agent_prompts.py

# 4. Register at http://localhost:3080, pick "Concurrency Agents"
```

Verify the chain before demoing:

```bash
curl -s localhost:3002/health              # if you expose the port
docker compose exec lc-agent curl -s localhost:3002/health
```

That response also lists `supervisor` and `delegates`, so it confirms the
routing wiring in one call. `langfuse_tracing: true` means traces are flowing.

`sql/agent_smoke_tests.md` has eight questions with verifiable answers,
including two traps that only a correctly-hinted agent refuses.
