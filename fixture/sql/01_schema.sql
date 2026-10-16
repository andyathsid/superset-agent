\set ON_ERROR_STOP on

BEGIN;

CREATE SCHEMA IF NOT EXISTS mcp_test_public;
CREATE SCHEMA IF NOT EXISTS mcp_test_sales;
CREATE SCHEMA IF NOT EXISTS mcp_test_support;
CREATE SCHEMA IF NOT EXISTS mcp_test_finance;
CREATE SCHEMA IF NOT EXISTS mcp_test_security;

CREATE TABLE IF NOT EXISTS mcp_test_public.regions (
    region_code varchar(8) PRIMARY KEY,
    region_name varchar(80) NOT NULL,
    timezone varchar(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_test_sales.products (
    product_id varchar(16) PRIMARY KEY,
    sku varchar(32) NOT NULL UNIQUE,
    product_name varchar(120) NOT NULL,
    category varchar(40) NOT NULL,
    unit_price numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
    unit_cost numeric(14, 2) NOT NULL CHECK (unit_cost >= 0),
    is_active boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_test_sales.customers (
    customer_id varchar(16) PRIMARY KEY,
    tenant_id varchar(40) NOT NULL,
    region_code varchar(8) NOT NULL REFERENCES mcp_test_public.regions(region_code),
    country_code char(2) NOT NULL,
    customer_name varchar(120) NOT NULL,
    email varchar(160) NOT NULL,
    segment varchar(32) NOT NULL,
    joined_date date NOT NULL,
    is_active boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_test_sales.orders (
    order_id varchar(16) PRIMARY KEY,
    order_ts timestamptz NOT NULL,
    customer_id varchar(16) NOT NULL REFERENCES mcp_test_sales.customers(customer_id),
    tenant_id varchar(40) NOT NULL,
    region_code varchar(8) NOT NULL REFERENCES mcp_test_public.regions(region_code),
    product_id varchar(16) NOT NULL REFERENCES mcp_test_sales.products(product_id),
    status varchar(24) NOT NULL,
    sales_channel varchar(24) NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_price numeric(14, 2) NOT NULL,
    discount_pct numeric(5, 2) NOT NULL,
    gross_amount numeric(16, 2) NOT NULL,
    net_amount numeric(16, 2) NOT NULL,
    cost_amount numeric(16, 2) NOT NULL,
    profit_amount numeric(16, 2) NOT NULL,
    currency_code char(3) NOT NULL,
    sales_rep varchar(100) NOT NULL,
    shipping_city varchar(100) NOT NULL,
    payment_method varchar(32) NOT NULL,
    fraud_score numeric(5, 1) NOT NULL,
    is_priority boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_test_support.tickets (
    ticket_id varchar(16) PRIMARY KEY,
    opened_ts timestamptz NOT NULL,
    customer_id varchar(16) NOT NULL REFERENCES mcp_test_sales.customers(customer_id),
    tenant_id varchar(40) NOT NULL,
    region_code varchar(8) NOT NULL REFERENCES mcp_test_public.regions(region_code),
    priority varchar(16) NOT NULL,
    status varchar(16) NOT NULL,
    subject varchar(160) NOT NULL,
    description text NOT NULL,
    assigned_team varchar(32) NOT NULL,
    satisfaction_score smallint,
    contains_untrusted_marker boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_test_finance.payroll (
    employee_id varchar(16) PRIMARY KEY,
    tenant_id varchar(40) NOT NULL,
    region_code varchar(8) NOT NULL REFERENCES mcp_test_public.regions(region_code),
    employee_name varchar(120) NOT NULL,
    work_email varchar(160) NOT NULL,
    department varchar(40) NOT NULL,
    job_level smallint NOT NULL,
    annual_salary numeric(16, 2) NOT NULL,
    annual_bonus numeric(16, 2) NOT NULL,
    currency_code char(3) NOT NULL,
    bank_account_token varchar(64) NOT NULL,
    tax_identifier varchar(64) NOT NULL,
    hire_date date NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_test_security.access_audit (
    event_id varchar(16) PRIMARY KEY,
    event_ts timestamptz NOT NULL,
    principal varchar(160) NOT NULL,
    role_name varchar(80) NOT NULL,
    tool_name varchar(80) NOT NULL,
    resource_name varchar(160) NOT NULL,
    decision varchar(16) NOT NULL,
    reason_code varchar(64) NOT NULL,
    source_ip inet NOT NULL,
    query_preview text NOT NULL
);

COMMIT;
