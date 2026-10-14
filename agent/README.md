# superset-agent

WIP LangChain agent served by [Aegra](https://github.com/aegra/aegra). It connects to [Apache Superset&#39;s](https://github.com/apache/superset) MCP server to inspect datasets, query data, and manage charts and dashboards.

## Requirements

- Git
- Docker Engine with Docker Compose
- An [OpenRouter](https://openrouter.ai/) API key
- [uv](https://docs.astral.sh/uv/) for local Python development

## Set up Superset and the agent together

This setup gives Superset and Aegra one PostgreSQL server with separate `superset` and `superset_agent` databases.

### 1. Clone both repositories

Place the repositories next to each other:

```text
workspace/
├── superset/
└── superset-agent/
```

```bash
git clone https://github.com/apache/superset.git
git clone https://github.com/andyathsid/superset-agent.git
```

Use Superset's `master` branch because the MCP service is currently part of the active Superset codebase.

### 2. Configure Superset Docker Compose

Create the shared Docker network:

```bash
docker network create superset-agent-shared
```

In `superset/docker-compose-non-dev.yml`, update the existing `db` service:

```yaml
db:
  image: pgvector/pgvector:pg17-trixie
  container_name: superset_db
  restart: unless-stopped
  env_file:
    - path: docker/.env
      required: true
    - path: docker/.env-local
      required: false
  ports:
    - "127.0.0.1:5432:5432"
  volumes:
    - db_home:/var/lib/postgresql/data
    - ./docker/docker-entrypoint-initdb.d:/docker-entrypoint-initdb.d
  networks:
    default:
    agent_shared:
      aliases:
        - superset-postgres
```

Add the shared network to the existing `superset-mcp` service:

```yaml
superset-mcp:
  # Keep the existing build, command, environment, and volume settings.
  ports:
    - "127.0.0.1:5008:5008"
  networks:
    default:
    agent_shared:
      aliases:
        - superset-mcp
```

Declare the external network at the bottom of the file alongside the existing `default` network:

```yaml
networks:
  default:
    # Keep the existing default network settings.

  agent_shared:
    name: superset-agent-shared
    external: true
```

For local development, ensure `superset/docker/pythonpath_dev/superset_config.py` contains:

```python
MCP_AUTH_ENABLED = False
MCP_DEV_USERNAME = "admin"
```

The username must match an existing Superset user. This fixed-user configuration is only suitable for local development.

Start Superset and its MCP service:

```bash
cd superset
docker compose -f docker-compose-non-dev.yml up -d
```

Superset is available at `http://localhost:8089` and MCP at `http://localhost:5008/mcp`.

### 3. Create the agent database

Open PostgreSQL using Superset's database user:

```bash
docker exec -it superset_db psql -U superset -d postgres
```

Create a separate role and database for Aegra. Use the same password later in the agent's `.env` file.

```sql
CREATE ROLE superset_agent LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE superset_agent OWNER superset_agent;
\connect superset_agent
CREATE EXTENSION IF NOT EXISTS vector;
```

Exit `psql` with `\q`.

### 4. Configure and start the agent

From the directory containing this README:

```bash
cp .env.example .env
```

Set at least these values in `.env`:

```dotenv
OPENROUTER_API_KEY="your-openrouter-key"
POSTGRES_USER="superset_agent"
POSTGRES_PASSWORD="choose-a-password"
POSTGRES_DB="superset_agent"
SUPERSET_DEFAULT_DATASET="wb_health_population"
```

The database password must match the password used in `CREATE ROLE`. Set `SUPERSET_DEFAULT_DATASET` to a dataset available in your Superset instance.

Start the integration stack to also run Aegra:

```bash
docker compose -f compose.superset.yml up -d --build
```

Check the services:

```bash
docker compose -f compose.superset.yml ps
curl --fail http://localhost:2026/health
```

### 5. Chat with the agent

After Aegra is running, you can interact with the agent through [LangChain Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui). In the connection form, use:

- Deployment URL: `http://localhost:2026`
- Assistant / Graph ID: `superset_agent`

A LangSmith API key is not required when connecting to the local Aegra server.

## Local agent development

For local agent development with hot reload, keep Superset and its database running using the shared Superset PostgreSQL and MCP described above, then run the agent directly on the host:

```bash
uv sync
uv run aegra dev --no-db-check
```

For this mode, keep these values in `.env`:

```dotenv
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
SUPERSET_MCP_URL="http://localhost:5008/mcp"
REDIS_BROKER_ENABLED="false"
```

Run tests with:

```bash
uv run pytest
```

Run the real agent and Superset MCP integration test with:

```bash
E2E=1 uv run pytest -s tests/test_agent.py
```

## Compose files

- `compose.superset.yml` runs the agent against the shared Superset PostgreSQL and MCP services described above.
- `docker-compose.yml` runs the agent with its own PostgreSQL and Redis services when connecting to a separate Superset MCP endpoint.
