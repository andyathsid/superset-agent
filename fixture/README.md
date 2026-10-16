# Superset MCP security fixture

This directory contains deterministic synthetic data for Superset MCP security and guardrail tests. It supports tests for Superset RBAC, row-level security, SQL permissions, warehouse read-only access, response-size handling, tool restrictions, and untrusted text returned by a tool.

The large preset contains more than 1.3 million rows and is about 283 MiB with the current seed. All identities, emails, tokens, tax identifiers, and IP addresses are synthetic. Generated CSV files are ignored by Git.

## What gets created

| Dataset                            | Rows in the large preset | Intended access                        |
| ---------------------------------- | -----------------------: | -------------------------------------- |
| `mcp_test_public.regions`        |                        4 | All fixture users                      |
| `mcp_test_sales.products`        |                      500 | Sales users                            |
| `mcp_test_sales.customers`       |                   50,000 | Sales users, scoped by RLS             |
| `mcp_test_sales.orders`          |                1,000,000 | Sales users, scoped by RLS             |
| `mcp_test_support.tickets`       |                   50,000 | Sales and support users, scoped by RLS |
| `mcp_test_finance.payroll`       |                   10,000 | Finance users only                     |
| `mcp_test_security.access_audit` |                  200,000 | Security users only                    |

The setup has two security layers:

1. PostgreSQL login roles limit what the Superset database connection can do.
2. Superset users, roles, dataset permissions, and RLS limit what each application user can see.

Superset users do not connect directly to PostgreSQL. Superset checks their application permissions, then queries PostgreSQL through the configured read-only warehouse login.

## Prerequisites

- The `superset` and `superset-agent` repositories as a sibling directories.
- Superset is running from `docker-compose-non-dev.yml`.
- PostgreSQL is reachable through the `superset_db` container.
- `uv`, `curl`, and `jq` are installed on the host.

The commands below start from the `superset-agent` repository root.

## 1. Generate and validate the fixture

The generator supports `tiny`, `small`, `medium`, and `large`. Use `tiny` for a quick smoke test. Use `large` for the expected counts recorded below and for response-size tests.

```bash
cd fixture
uv run python generate_data.py --size large
uv run python validate_data.py
cd ..
```

Generation is deterministic for a given size and seed. Add `--overwrite` when intentionally replacing existing generated files.

[`generated/manifest.json`](generated/manifest.json) records hashes, row counts, and expected aggregates. Integration tests should read the manifest instead of embedding counts for a different preset or seed.

## 2. Create the PostgreSQL database

Create a dedicated analytics database. This is separate from Superset's metadata database, even though both databases can run in the same PostgreSQL container.

```bash
cd ../superset
docker compose -f docker-compose-non-dev.yml exec db \
  createdb -U superset superset_mcp_test
cd ../superset-agent
```

If the database already exists, `createdb` reports that fact and no new database is needed.

## 3. Load the schema and data

The SQL loader uses `psql` client-side `\copy`. Copy the fixture into the database container, then run `psql` with `/tmp` as its working directory so the relative CSV paths resolve correctly:

```bash
docker cp ./fixture/. superset_db:/tmp/fixture

docker exec -w /tmp superset_db \
  psql -U superset -d superset_mcp_test \
  -f fixture/sql/01_schema.sql

docker exec -w /tmp superset_db \
  psql -U superset -d superset_mcp_test \
  -f fixture/sql/02_load.sql

docker exec -w /tmp superset_db \
  psql -U superset -d superset_mcp_test \
  -f fixture/sql/03_indexes.sql

docker exec -w /tmp superset_db \
  psql -U superset -d superset_mcp_test \
  -f fixture/sql/04_warehouse_roles.sql
```

The loader expects empty tables and runs the data load in a transaction. Use a fresh database when reloading the fixture.

## 4. Create read-only PostgreSQL logins

[`04_warehouse_roles.sql`](sql/04_warehouse_roles.sql) creates two `NOLOGIN` group roles that hold table permissions:

- `mcp_test_all_reader` can select from every fixture schema.
- `mcp_test_sales_reader` can select from public, sales, and support schemas.

Create login roles that Superset can authenticate as, then grant each login membership in the appropriate group role:

```bash
cd ../superset
docker compose -f docker-compose-non-dev.yml exec db \
  psql -U superset -d superset_mcp_test
```

Run this SQL once:

```sql
CREATE ROLE superset_mcp_all_ro
    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE ROLE superset_mcp_sales_ro
    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

GRANT mcp_test_all_reader TO superset_mcp_all_ro;
GRANT mcp_test_sales_reader TO superset_mcp_sales_ro;

GRANT CONNECT ON DATABASE superset_mcp_test
    TO superset_mcp_all_ro, superset_mcp_sales_ro;

ALTER ROLE superset_mcp_all_ro
    SET default_transaction_read_only = on;

ALTER ROLE superset_mcp_sales_ro
    SET default_transaction_read_only = on;

\password superset_mcp_all_ro
\password superset_mcp_sales_ro
```

Exit with `\q`.

The login roles hold credentials. The group roles hold permissions. The all-reader login is useful for testing Superset's own RBAC because PostgreSQL can serve every fixture table while Superset decides which application user can access each dataset. The sales-only login provides an additional warehouse boundary for separate defense-in-depth tests.

The roles have no write privileges, and their transactions default to read-only mode. Keep Superset's **Allow DML** option disabled for these connections.

## 5. Add the database connection to Superset

Sign in to Superset as an administrator and open **Settings > Data > Data Connections > + New > Database**.

Use these values:

| Field        | Value                               |
| ------------ | ----------------------------------- |
| Display name | `MCP Test Warehouse`              |
| Host         | `db`                              |
| Port         | `5432`                            |
| Database     | `superset_mcp_test`               |
| Username     | `superset_mcp_all_ro`             |
| Password     | The password set with `\password` |

Test the connection, save it, and leave **Allow DML** disabled.

## 6. Register the seven Superset datasets

You can add each table in the Superset UI **Datasources > + New > Database**, or register them through the REST API. The API approach is repeatable and returns the existing dataset when it is already registered.

Set the Superset URL and obtain an access token:

```bash
export SUPERSET_URL="http://localhost:8089"
export SUPERSET_USERNAME="admin"
read -rsp "Superset password: " SUPERSET_PASSWORD
echo

ACCESS_TOKEN=$(
  jq -n \
    --arg username "$SUPERSET_USERNAME" \
    --arg password "$SUPERSET_PASSWORD" \
    '{username: $username, password: $password, provider: "db", refresh: true}' |
  curl --fail-with-body --silent --show-error \
    -X POST "$SUPERSET_URL/api/v1/security/login" \
    -H "Content-Type: application/json" \
    --data-binary @- |
  jq -r '.access_token'
)
```

Find the Superset database ID:

```bash
DATABASE_ID=$(
  curl --fail-with-body --silent --show-error \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    "$SUPERSET_URL/api/v1/database/?q=(page_size:100)" |
  jq -r '.result[] | select(.database_name == "MCP Test Warehouse") | .id'
)

echo "Database ID: $DATABASE_ID"
```

Register a table with this shell function:

```bash
register_dataset() {
  local schema_name=$1
  local table_name=$2

  jq -n \
    --argjson database_id "$DATABASE_ID" \
    --arg schema "$schema_name" \
    --arg table_name "$table_name" \
    '{database_id: $database_id, schema: $schema, table_name: $table_name}' |
  curl --fail-with-body --silent --show-error \
    -X POST "$SUPERSET_URL/api/v1/dataset/get_or_create/" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @-
  echo
}
```

Register all seven datasets:

```bash
register_dataset mcp_test_public regions
register_dataset mcp_test_sales products
register_dataset mcp_test_sales customers
register_dataset mcp_test_sales orders
register_dataset mcp_test_support tickets
register_dataset mcp_test_finance payroll
register_dataset mcp_test_security access_audit
```

## 7. Create Superset roles and users

In **Settings > Security > List Roles** Keep the built-in `Gamma` role unchanged. Create small custom roles that contain only the fixture dataset permissions, then assign `Gamma` plus one custom role to each test user.

| Custom role           | Dataset permissions                                               | SQL Lab |
| --------------------- | ----------------------------------------------------------------- | ------- |
| `MCP Public Reader` | `regions`                                                       | No      |
| `MCP Sales NA`      | `regions`, `products`, `customers`, `orders`, `tickets` | No      |
| `MCP Acme Tenant`   | `regions`, `products`, `customers`, `orders`, `tickets` | No      |

Create these users in **Settings > Security > List Users**:

| Username                | Roles                                    |
| -------------------- | ---------------------------------------- |
| `mcp_public`       | `Gamma`, `MCP Public Reader`         |
| `mcp_sales_na`     | `Gamma`, `MCP Sales NA`              |
| `mcp_sales_na_sql` | `Gamma`, `MCP Sales NA`, `sql_lab` |
| `mcp_acme`         | `Gamma`, `MCP Acme Tenant`           |

Do not assign `Admin`, `Alpha`, `all_datasource_access`, or database-wide access to restricted test users. Those permissions would bypass the dataset boundary the tests are intended to observe.

## 8. Create the RLS rules

Open **Settings > Security > Row Level Security** and create two regular filters:

| Rule name               | Clause                    | Tables                                 | Role                |
| ----------------------- | ------------------------- | -------------------------------------- | ------------------- |
| `mcp_sales_na_region` | `region_code = 'NA'`    | `customers`, `orders`, `tickets` | `MCP Sales NA`    |
| `mcp_acme_tenant`     | `tenant_id = 'acme_us'` | `customers`, `orders`, `tickets` | `MCP Acme Tenant` |

Apply each rule consistently to every scoped table. This prevents a join from exposing rows through an unfiltered table.

Verify the rules in Explore before testing MCP:

- Login as `mcp_sales_na`, group `orders` by `region_code`. The large fixture returns only `NA: 250432`.
- Login as `mcp_acme`, group `orders` by `tenant_id`. The large fixture returns only `acme_us: 125493`.

For another size or seed, read the expected values from [`generated/manifest.json`](generated/manifest.json).

## 9. Configure MCP guardrails

Merge the active settings from [`superset_config.example.py`](superset_config.example.py) into `superset/docker/pythonpath_dev/superset_config_docker.py`. The current response guard uses `token_limit`:

```python
MCP_RBAC_ENABLED = True

MCP_RESPONSE_SIZE_CONFIG = {
    "enabled": True,
    "token_limit": 25_000,
    "warn_threshold_pct": 80,
    "max_list_items": 100,
    "excluded_tools": [
        "health_check",
        "generate_explore_link",
        "open_sql_lab_with_context",
        "search_tools",
    ],
}

SQL_MAX_ROW = 10_000
```

`excluded_tools` skips response-size processing for those tool results. It does not remove the tools and does not bypass RBAC. Use `MCP_DISABLED_TOOLS` in a separate server profile when testing tool removal.

## 10. Enable per-user MCP API keys

Per-user keys let one running MCP server serve multiple test identities. Configure Superset as described in the [agent README](../README.md#local-security-development-with-api-keys).

After enabling the API-key settings, synchronize Superset's permission records:

```bash
docker compose -f ../superset/docker-compose-non-dev.yml exec superset \
  superset init
```

Create a small role such as `MCP API Key Self Service` in **Settings > Security > List Roles** with `can list on ApiKey`, `can create on ApiKey`, `can get on ApiKey`, and `can revoke on ApiKey`. Assign it to the four fixture users, then create one unscoped key while signed in as each user in **Settings > User > Info > API Keys**. An unscoped key uses the user's existing Superset RBAC permissions.

Store the keys only in the ignored `agent/.env` file:

```dotenv
SUPERSET_MCP_API_KEY_PUBLIC="sst_..."
SUPERSET_MCP_API_KEY_SALES_NA="sst_..."
SUPERSET_MCP_API_KEY_SALES_NA_SQL="sst_..."
SUPERSET_MCP_API_KEY_ACME="sst_..."
```

## 11. Run the example security integration test

From `agent/`:

```bash
SECURITY_E2E=1 uv run pytest -s \
  tests/test_security_integration.py
```

The example implements the `dataset_subset_listing` case from [`security_test_cases.json`](security_test_cases.json). It creates a FastMCP client with the `mcp_sales_na` key, calls `list_datasets`, and verifies the visible and hidden datasets through native Superset RBAC.

## Useful verification queries

As an administrator or an appropriately scoped user, these aggregates expose the fixture's RLS dimensions:

```sql
SELECT region_code, COUNT(*)
FROM mcp_test_sales.orders
GROUP BY region_code
ORDER BY region_code;

SELECT tenant_id, COUNT(*)
FROM mcp_test_sales.orders
GROUP BY tenant_id
ORDER BY tenant_id;
```

The support data contains inert `UNTRUSTED_TEST_MARKER` strings and long descriptions. Treat these values as tool data. They exist to test prompt-injection handling and response-size controls.

Do not run destructive SQL just to prove a denial. The fixture's read-only PostgreSQL credentials provide the final warehouse boundary, while Superset RBAC, RLS, and MCP controls enforce application-level policy.
