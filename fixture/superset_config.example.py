"""Security-test settings to merge into a non-production superset_config.py."""

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

# Current Superset releases already define per-engine DISALLOWED_SQL_FUNCTIONS
# and DISALLOWED_SQL_TABLES dictionaries. Their PostgreSQL defaults include
# pg_sleep, large-object functions, sensitive catalogs, and selected
# information_schema views. Preserve those defaults. If this test instance adds
# entries, copy and extend the complete "postgresql" set for the deployed
# version instead of replacing it with a flat set.

# Use this profile in a separate test run to prove global tool removal:
#
# MCP_DISABLED_TOOLS = {
#     "execute_sql",
#     "save_sql_query",
# }
