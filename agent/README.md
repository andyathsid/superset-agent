# Superset Agent Backend

A LangChain agent served by Aegra through a LangGraph-compatible API. It connects
to an existing Apache Superset MCP server to discover datasets, query data, and
work with Superset objects. Aegra stores conversation state in PostgreSQL.

The agent supports OpenAI, OpenRouter, Anthropic, Ollama, and custom
OpenAI-compatible endpoints. The frontend can select a model for each run;
environment variables supply the default model.

## Requirements

- Python 3.12 or 3.13 and uv.
- Docker with Docker Compose for the local PostgreSQL service.
- An available Superset MCP endpoint and a model endpoint.

## Run locally

From the repository root:

```bash
cd agent
cp .env.example .env
uv sync
```

Edit `.env` to match your model and existing Superset connection. For example,
to use Ollama:

```dotenv
MODEL_PROVIDER=ollama
MODEL_NAME=LiquidAI/lfm2.5-2.6b:q4_k_m
MODEL_BASE_URL=http://127.0.0.1:11434/v1
MODEL_API_KEY=ollama

SUPERSET_MCP_URL=http://localhost:5008/mcp
SUPERSET_MCP_API_KEY=
SUPERSET_DEFAULT_DATASET=wb_health_population
```

Make sure Ollama is running and the model is available:

```bash
ollama pull LiquidAI/lfm2.5-2.6b:q4_k_m
```

For a hosted model, change `MODEL_PROVIDER`, `MODEL_NAME`, `MODEL_BASE_URL`, and
`MODEL_API_KEY` together. Supported provider values are `openai`, `openrouter`,
`anthropic`, `ollama`, and `custom`. OpenAI-compatible endpoints use a base URL
ending in `/v1`; Anthropic uses `https://api.anthropic.com`.


Set `SUPERSET_MCP_API_KEY` when the MCP endpoint requires an API key. Superset
applies the permissions of the user associated with that key.

Start the development server from `agent/`:

```bash
uv run aegra dev
```

This starts the PostgreSQL service from `docker-compose.yml` when needed and
runs the API with hot reload at `http://localhost:2026`. Redis is not required
for this development mode. If port `5432` is occupied, change `POSTGRES_PORT`
in `.env`. To use an existing PostgreSQL database, configure the `POSTGRES_*`
values and run `uv run aegra dev --no-db-check`.

Check the API and MCP connection:

```bash
curl --fail http://localhost:2026/health
curl --fail http://localhost:2026/mcp-servers/status
```

Then follow the [frontend setup](../frontend/README.md). The graph ID is
`superset_agent`, as defined in `aegra.json`.

## Checks and tests

Run from `agent/`:

```bash
uv run pyright
uv run pytest
```

Integration tests are skipped unless `E2E=1`. To test the agent against your
configured model and MCP endpoint:

```bash
E2E=1 uv run pytest -s tests/test_agent.py
```

The security integration test assumes the test users, datasets, and permissions
already exist. For example, set `SUPERSET_MCP_API_KEY_SALES_NA` in `.env` to a key owned by
`mcp_sales_na`, load it in the integration test, then run:

```bash
E2E=1 uv run pytest -s tests/test_security.py
```

This test calls MCP directly, without an LLM. It checks that the expected public,
sales, and support datasets are visible while `payroll` and `access_audit` are
hidden.
