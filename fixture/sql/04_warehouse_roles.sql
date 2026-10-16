\set ON_ERROR_STOP on

/*
Optional PostgreSQL group roles for testing the warehouse boundary. Creating
roles requires CREATEROLE. Grant one of these roles to the login used by the
corresponding Superset database connection.
*/

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_test_all_reader') THEN
        CREATE ROLE mcp_test_all_reader NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_test_sales_reader') THEN
        CREATE ROLE mcp_test_sales_reader NOLOGIN;
    END IF;
END;
$roles$;

REVOKE ALL ON SCHEMA mcp_test_finance FROM PUBLIC;
REVOKE ALL ON SCHEMA mcp_test_security FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA mcp_test_finance FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA mcp_test_security FROM PUBLIC;

GRANT USAGE ON SCHEMA mcp_test_public, mcp_test_sales, mcp_test_support
    TO mcp_test_sales_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA
    mcp_test_public, mcp_test_sales, mcp_test_support
    TO mcp_test_sales_reader;

GRANT USAGE ON SCHEMA
    mcp_test_public, mcp_test_sales, mcp_test_support,
    mcp_test_finance, mcp_test_security
    TO mcp_test_all_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA
    mcp_test_public, mcp_test_sales, mcp_test_support,
    mcp_test_finance, mcp_test_security
    TO mcp_test_all_reader;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON ALL TABLES IN SCHEMA
    mcp_test_public, mcp_test_sales, mcp_test_support,
    mcp_test_finance, mcp_test_security
    FROM mcp_test_all_reader, mcp_test_sales_reader;
