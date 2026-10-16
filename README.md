# superset-agent

This project is a LangChain agent served by [Aegra](https://github.com/aegra/aegra). It connects to Apache Superset's MCP server to inspect datasets, query data, and manage Superset objects.

## Requirements

- Git
- Docker Engine with Docker Compose
- [uv](https://docs.astral.sh/uv/)
- [Ollama](https://ollama.com/) for local inference, or an OpenRouter API key

The examples below assume you cloned the [Apache Superset repository](https://github.com/apache/superset/tree/master) as sibling repositories like this:

```text
workspace/
├── superset/
└── superset-agent/
```

Run the commands below from the `superset-agent` repository root unless a
section explicitly says otherwise.

## Quick start

### 1. Configure Superset

In Superset cloned repository, create `superset/docker/pythonpath_dev/superset_config_docker.py` with :

```python
MCP_AUTH_ENABLED = False
MCP_API_KEY_ENABLED = False
MCP_DEV_USERNAME = "admin"
MCP_RBAC_ENABLED = True
```

The non-development Compose configuration disables example loading by default.
Create `superset/docker/.env-local`, which is also ignored by the Superset
repository, and enable the built-in examples before the first startup:

```dotenv
SUPERSET_LOAD_EXAMPLES=yes
```

Start Superset and its MCP service:

```bash
docker compose -f ../superset/docker-compose-non-dev.yml up -d
```

The one-shot `superset-init` service applies migrations, creates the default
`admin` user, initializes permissions, and runs `superset load_examples` when
`SUPERSET_LOAD_EXAMPLES=yes`. Loading the examples can take several minutes.
Check its result with:

```bash
docker compose -f ../superset/docker-compose-non-dev.yml \
  ps -a superset-init
docker compose -f ../superset/docker-compose-non-dev.yml \
  logs superset-init
```

Continue after `superset-init` exits with status `0`. Superset should then have
an `examples` database connection and built-in datasets such as
`wb_health_population`. The source data is maintained in the
[Superset examples-data repository](https://github.com/apache-superset/examples-data).

The local endpoints used by this project are:

- Superset: `http://localhost:8089`
- Superset MCP: `http://localhost:5008/mcp`

### 2. Configure the agent

```bash
cd agent
cp .env.example .env
```

Keep the MCP API key empty and select a Superset example dataset that exists in your instance:

```dotenv
SUPERSET_MCP_URL="http://localhost:5008/mcp"
SUPERSET_MCP_API_KEY=""
SUPERSET_DEFAULT_DATASET="wb_health_population"
```

With no key, [`create_tools`](agent/src/agent/tools.py) gives the MCP URL directly to `MCPAdapter`. Superset runs those calls as the configured `MCP_DEV_USERNAME`.

### 3. Select a model

Ollama is the default provider:

```dotenv
PROVIDER="ollama"
OLLAMA_MODEL="LiquidAI/lfm2.5-2.6b:q4_k_m"
OLLAMA_HOST="http://127.0.0.1:11434"
OLLAMA_NUM_CTX="32768"
```

Pull the model before starting the agent. Default model is Q4 K M quantized version of LFM-2.5-2.6b:

```bash
ollama pull LiquidAI/lfm2.5-2.6b:q4_k_m
```

To use OpenRouter instead:

```dotenv
PROVIDER="openrouter"
OPENROUTER_API_KEY="your-openrouter-key"
OPENROUTER_MODEL="liquid/lfm-2.5-2.6b:free"
```

### 4. Start the agent

For quick development start with hot reload via aegra commands:

```bash
uv sync
uv run aegra dev
```

Check the service:

```bash
curl --fail http://localhost:2026/health
```

### 5. Chat with the agent

After Aegra is running, you can interact with the agent through [LangChain Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui) via their deployed site [agentchat.vercel.app](https://agentchat.vercel.app). In the connection form, use:

- Deployment URL: `http://localhost:2026`
- Assistant / Graph ID: `superset_agent`

A LangSmith API key is not required when connecting to the local Aegra server.

## Local development

For further local development and testing, especially for security implementation, first complete the database, Superset roles, users, and RLS setup in the [fixture README](fixture/README.md).

### 1. Enable API keys in Superset

In `superset/docker/pythonpath_dev/superset_config.py` at `FEATURE_FLAGS` dictionary, enable the management UI:

```python
FEATURE_FLAGS = {
    # Existing flags...
    "FAB_API_KEY_ENABLED": True,
}
```

In `superset/docker/pythonpath_dev/superset_config_docker.py`, use:

```python
MCP_AUTH_ENABLED = False
FAB_API_KEY_ENABLED = True
MCP_API_KEY_ENABLED = True
MCP_DEV_USERNAME = None
MCP_RBAC_ENABLED = True
```

`MCP_AUTH_ENABLED` controls JWT authentication. API-key authentication is enabled separately. Recreate the web and MCP services after changing the configuration if you build the services from previous quick start setup:

```bash
docker compose -f ../superset/docker-compose-non-dev.yml up -d \
  --no-deps \
  --force-recreate \
  superset superset-mcp
```

Synchronize Superset's permission records after enabling the API-key feature:

```bash
docker compose -f ../superset/docker-compose-non-dev.yml exec superset \
  superset init
```

Run this once after enabling the feature. Without it, the `ApiKey` permissions may not appear in the role editor.

### 2. Create a key for the selected Superset user

In Superset, create a small role such as `MCP API Key Self Service` and give it these permissions:

- `can list on ApiKey` (`can_list`)
- `can create on ApiKey` (`can_create`)
- `can get on ApiKey` (`can_get`)
- `can revoke on ApiKey` (`can_revoke`)

Assign the role to the test user. Then sign in as that user and open **Info > API Keys > + API Key**.

For ordinary agent development, place one user's key in `agent/.env`:

```dotenv
SUPERSET_MCP_URL="http://localhost:5008/mcp"
SUPERSET_MCP_API_KEY="sst_key_owned_by_mcp_sales_na"
SUPERSET_DEFAULT_DATASET="mcp_test_sales.orders"
```

The key determines the Superset user for that agent process. Superset then applies that user's roles, dataset permissions, and RLS rules. To work as another user, use that user's key and restart the agent.

For the integration suite, keep separate ignored environment values:

```dotenv
SUPERSET_MCP_API_KEY_PUBLIC="sst_..."
SUPERSET_MCP_API_KEY_SALES_NA="sst_..."
SUPERSET_MCP_API_KEY_SALES_NA_SQL="sst_..."
SUPERSET_MCP_API_KEY_ACME="sst_..."
```

Never commit the real key values.

## Tests (WIP)

Run the integration test:

```bash
cd agent
E2E=1 uv run pytest -s tests/test_agent.py
```

Run the direct security example after completing the authenticated fixture setup:

```bash
cd agent
E2E=1 uv run pytest -s \
  tests/test_security_integration.py
```

The security test uses the `mcp_sales_na` API key and directly calls `list_datasets`. It checks that the sales datasets are visible and that `payroll` and `access_audit` are hidden. Direct MCP calls are used for authorization assertions because they do not depend on an LLM's wording or tool choice.

## Deployment (WIP)

[`agent/compose.superset.yml`](agent/compose.superset.yml) runs Aegra against the cloned Superset checkout's PostgreSQL and MCP services. It expects an external network named `superset-agent-shared`, plus the `superset-postgres` and `superset-mcp` aliases in Superset's Compose file.

Create the network once:

```bash
docker network create superset-agent-shared
```

A fresh Superset clone does not define those network aliases. In
`superset/docker-compose-non-dev.yml`, change the `db` service to use the
pgvector image and attach it to the shared network:

```yaml
services:
  db:
    image: pgvector/pgvector:pg17-trixie
    networks:
      default:
      agent_shared:
        aliases:
          - superset-postgres
```

Attach the existing `superset-mcp` service to the same network:

```yaml
services:
  superset-mcp:
    networks:
      default:
      agent_shared:
        aliases:
          - superset-mcp
```

Declare the external network next to the existing `default` network:

```yaml
networks:
  default:
    # Keep the existing default network configuration.

  agent_shared:
    name: superset-agent-shared
    external: true
```

Apply the Compose changes before starting the agent stack:

```bash
docker compose -f ../superset/docker-compose-non-dev.yml up -d \
  --force-recreate \
  db superset-mcp
```

The Aegra database is separate from the fixture database. Create it in Superset's PostgreSQL instance:

```bash
docker exec -it superset_db psql -U superset -d postgres
```

```sql
CREATE ROLE superset_agent LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE superset_agent OWNER superset_agent;
\connect superset_agent
CREATE EXTENSION IF NOT EXISTS vector;
```

Set the matching `POSTGRES_*` values in `agent/.env`, then start the stack:

```bash
cd agent
docker compose -f compose.superset.yml up -d --build
```

[`agent/docker-compose.yml`](agent/docker-compose.yml) instead runs the agent with its own PostgreSQL and Redis services when the Superset MCP endpoint is hosted separately.
