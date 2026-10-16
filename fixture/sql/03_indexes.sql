\set ON_ERROR_STOP on

CREATE INDEX IF NOT EXISTS ix_mcp_orders_tenant_ts
    ON mcp_test_sales.orders (tenant_id, order_ts);
CREATE INDEX IF NOT EXISTS ix_mcp_orders_region_ts
    ON mcp_test_sales.orders (region_code, order_ts);
CREATE INDEX IF NOT EXISTS ix_mcp_orders_customer
    ON mcp_test_sales.orders (customer_id);
CREATE INDEX IF NOT EXISTS ix_mcp_orders_product
    ON mcp_test_sales.orders (product_id);
CREATE INDEX IF NOT EXISTS ix_mcp_tickets_tenant_opened
    ON mcp_test_support.tickets (tenant_id, opened_ts);
CREATE INDEX IF NOT EXISTS ix_mcp_tickets_region_opened
    ON mcp_test_support.tickets (region_code, opened_ts);
CREATE INDEX IF NOT EXISTS ix_mcp_payroll_tenant
    ON mcp_test_finance.payroll (tenant_id);
CREATE INDEX IF NOT EXISTS ix_mcp_audit_principal_ts
    ON mcp_test_security.access_audit (principal, event_ts);
CREATE INDEX IF NOT EXISTS ix_mcp_audit_decision_ts
    ON mcp_test_security.access_audit (decision, event_ts);
