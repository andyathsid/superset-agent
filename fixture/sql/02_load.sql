\set ON_ERROR_STOP on

/*
Run this file with psql from the repository root after generating the fixture.
The transaction rolls back on a duplicate key or malformed row. The destination
tables are expected to be empty.
*/

BEGIN;

\copy mcp_test_public.regions FROM 'fixture/generated/regions.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy mcp_test_sales.products FROM 'fixture/generated/products.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy mcp_test_sales.customers FROM 'fixture/generated/customers.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy mcp_test_sales.orders FROM 'fixture/generated/orders.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy mcp_test_support.tickets FROM 'fixture/generated/support_tickets.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy mcp_test_finance.payroll FROM 'fixture/generated/payroll.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy mcp_test_security.access_audit FROM 'fixture/generated/access_audit.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

COMMIT;

ANALYZE mcp_test_public.regions;
ANALYZE mcp_test_sales.products;
ANALYZE mcp_test_sales.customers;
ANALYZE mcp_test_sales.orders;
ANALYZE mcp_test_support.tickets;
ANALYZE mcp_test_finance.payroll;
ANALYZE mcp_test_security.access_audit;
