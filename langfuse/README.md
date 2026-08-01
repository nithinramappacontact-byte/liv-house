# Langfuse integration

Two jobs, both wired into `lc-agent`.

## 1. Tracing

`lc-agent/langfuse_trace.py` attaches a LangChain `CallbackHandler` to every
agent run. Each trace captures the LLM calls **and every MCP tool call** —
which means the exact SQL the agent sent to ClickHouse is recorded alongside
the answer it produced.

That is the part worth demoing. A concurrency number in a chat window is
unverifiable; a trace showing `run_select_query` with the SQL, the rows
returned, and the answer derived from them is evidence.

Traces are tagged `lc-agent`, the agent id, and `concurrency`, and grouped by
LibreChat conversation id as the session, so a multi-turn conversation reads
as one thread in the Langfuse UI.

If `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` are unset, tracing silently
no-ops and the agents run normally.

## 2. Prompt management

`lc-agent/langfuse_prompts.py` fetches each agent's system prompt from
Langfuse by name and label at run time. Publish a new `production` version in
the Langfuse UI and the agents pick it up within the SDK's cache TTL — no
rebuild, no restart.

The agent graph is cached by `(agent_id, prompt_version)`, so a new version
rebuilds the graph rather than being ignored.

### Publishing the starting prompts

```bash
docker compose exec lc-agent python push_agent_prompts.py
docker compose exec lc-agent python push_agent_prompts.py --list
```

### What is deliberately NOT in the prompts

Schema and the three concurrency correctness rules live in
`lc-agent/config.py` as `CLICKHOUSE_TOOL_HINT`, appended automatically to
whichever prompt is resolved.

This split matters. Prompts in Langfuse are editable by anyone with UI
access; the rules that stop an agent writing plausible-but-wrong SQL are not.
Someone tuning tone in the Langfuse UI cannot accidentally delete the
instruction that says peak must be recomputed rather than summed.
