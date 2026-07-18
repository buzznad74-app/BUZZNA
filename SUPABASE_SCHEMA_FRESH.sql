-- BuzzNa D74 Enterprise Operating System
-- Complete Supabase PostgreSQL Schema - FRESH INSTALL
-- WARNING: This script DROPS ALL existing tables and data
-- Use only for fresh setup or complete database reset

-- ============================================
-- DROP ALL EXISTING OBJECTS (Clean slate)
-- ============================================

-- Drop all views first (dependencies)
DROP VIEW IF EXISTS customer_aging CASCADE;
DROP VIEW IF EXISTS product_stock_status CASCADE;
DROP VIEW IF EXISTS daily_sales_summary CASCADE;

-- Drop all functions and triggers
DROP FUNCTION IF EXISTS update_product_quantity() CASCADE;

-- Drop all tables (in order of foreign key dependencies)
DROP TABLE IF EXISTS buzzna_records CASCADE;
DROP TABLE IF EXISTS sync_queue CASCADE;
DROP TABLE IF EXISTS payment_allocations CASCADE;
DROP TABLE IF EXISTS customer_credit_ledger CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales_transactions CASCADE;
DROP TABLE IF EXISTS till_sessions CASCADE;
DROP TABLE IF EXISTS inventory_events CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS product_categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS business_settings CASCADE;
DROP TABLE IF EXISTS businesses CASCADE;

-- ============================================
-- CREATE CLEAN SCHEMA
-- ============================================

-- TABLE: businesses (Tenant Master Records)
CREATE TABLE businesses (
  tenant_id UUID PRIMARY KEY,
  legal_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255),
  industry VARCHAR(100),
  country VARCHAR(100),
  currency VARCHAR(10) DEFAULT 'KES',
  language VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'Africa/Nairobi',
  license_status VARCHAR(50) DEFAULT 'TRIAL_ACTIVE',
  license_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_businesses_created_at ON businesses(created_at DESC);
CREATE INDEX idx_businesses_tenant_id ON businesses(tenant_id);

-- TABLE: business_settings (Operational Config)
CREATE TABLE business_settings (
  tenant_id UUID PRIMARY KEY REFERENCES businesses(tenant_id) ON DELETE CASCADE,
  chosen_theme VARCHAR(50),
  brand_color VARCHAR(50),
  daily_revenue_target NUMERIC(12, 2) DEFAULT 0,
  weekly_revenue_target NUMERIC(12, 2) DEFAULT 0,
  monthly_revenue_target NUMERIC(12, 2) DEFAULT 0,
  daraja_paybill VARCHAR(50),
  daraja_till_number VARCHAR(50),
  daraja_api_key VARCHAR(255),
  eod_time VARCHAR(10),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_settings_tenant_id ON business_settings(tenant_id);

-- TABLE: users (Staff Access Control)
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'CASHIER',
  username VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  email_address VARCHAR(255),
  password VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, username)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_user_id ON users(user_id);

-- TABLE: product_categories (Catalog Organization)
CREATE TABLE product_categories (
  category_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id) ON DELETE CASCADE,
  category_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, category_name)
);

CREATE INDEX idx_product_categories_tenant_id ON product_categories(tenant_id);

-- TABLE: products (Inventory Master)
CREATE TABLE products (
  product_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_categories(category_id) ON DELETE SET NULL,
  barcode VARCHAR(100),
  product_name VARCHAR(255) NOT NULL,
  cost_floor NUMERIC(12, 2) NOT NULL,
  retail_price NUMERIC(12, 2) NOT NULL,
  current_quantity NUMERIC(12, 2) DEFAULT 0,
  is_serialized BOOLEAN DEFAULT FALSE,
  expiry_date DATE,
  supplier_id VARCHAR(255),
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, barcode)
);

CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_product_id ON products(product_id);

-- TABLE: inventory_events (Event Sourcing)
CREATE TABLE inventory_events (
  event_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  quantity_delta NUMERIC(12, 2) NOT NULL,
  reason_code VARCHAR(100),
  terminal_timestamp TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_events_tenant_id ON inventory_events(tenant_id);
CREATE INDEX idx_inventory_events_product_id ON inventory_events(product_id);
CREATE INDEX idx_inventory_events_user_id ON inventory_events(user_id);
CREATE INDEX idx_inventory_events_created_at ON inventory_events(created_at DESC);

-- TABLE: till_sessions (POS Shift Management)
CREATE TABLE till_sessions (
  session_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  opening_float NUMERIC(12, 2) DEFAULT 0,
  expected_cash_balance NUMERIC(12, 2) DEFAULT 0,
  actual_cash_balance NUMERIC(12, 2),
  session_status VARCHAR(50) DEFAULT 'OPEN',
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_till_sessions_tenant_id ON till_sessions(tenant_id);
CREATE INDEX idx_till_sessions_user_id ON till_sessions(user_id);
CREATE INDEX idx_till_sessions_status ON till_sessions(session_status);
CREATE INDEX idx_till_sessions_created_at ON till_sessions(created_at DESC);

-- TABLE: customers (Customer Master)
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id) ON DELETE CASCADE,
  customer_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  email_address VARCHAR(255),
  credit_limit NUMERIC(12, 2) DEFAULT 0,
  existing_debt NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX idx_customers_customer_id ON customers(customer_id);

-- TABLE: sales_transactions (POS Checkouts)
CREATE TABLE sales_transactions (
  transaction_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES till_sessions(session_id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(customer_id) ON DELETE SET NULL,
  payment_method VARCHAR(50) DEFAULT 'CASH',
  payment_status VARCHAR(50) DEFAULT 'PENDING',
  gross_total NUMERIC(12, 2) NOT NULL,
  tax_amount NUMERIC(12, 2) DEFAULT 0,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  terminal_timestamp TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_transactions_tenant_id ON sales_transactions(tenant_id);
CREATE INDEX idx_sales_transactions_session_id ON sales_transactions(session_id);
CREATE INDEX idx_sales_transactions_customer_id ON sales_transactions(customer_id);
CREATE INDEX idx_sales_transactions_created_at ON sales_transactions(created_at DESC);

-- TABLE: sale_items (Transaction Line Items)
CREATE TABLE sale_items (
  item_id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES sales_transactions(transaction_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  quantity NUMERIC(12, 2) NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  total_price NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sale_items_transaction_id ON sale_items(transaction_id);
CREATE INDEX idx_sale_items_product_id ON sale_items(product_id);

-- TABLE: payment_allocations (Split Payments)
CREATE TABLE payment_allocations (
  allocation_id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES sales_transactions(transaction_id) ON DELETE CASCADE,
  allocated_method VARCHAR(50) NOT NULL,
  allocated_amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_allocations_transaction_id ON payment_allocations(transaction_id);

-- TABLE: customer_credit_ledger (Debt Tracking)
CREATE TABLE customer_credit_ledger (
  ledger_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES sales_transactions(transaction_id) ON DELETE SET NULL,
  amount_delta NUMERIC(12, 2) NOT NULL,
  running_balance NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_credit_ledger_tenant_id ON customer_credit_ledger(tenant_id);
CREATE INDEX idx_customer_credit_ledger_customer_id ON customer_credit_ledger(customer_id);
CREATE INDEX idx_customer_credit_ledger_transaction_id ON customer_credit_ledger(transaction_id);

-- TABLE: expenses (Operational Expenses)
CREATE TABLE expenses (
  expense_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id) ON DELETE CASCADE,
  expense_name VARCHAR(255) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  recorded_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  incurred_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_tenant_id ON expenses(tenant_id);
CREATE INDEX idx_expenses_created_at ON expenses(created_at DESC);

-- TABLE: buzzna_records (Unified Sync Cache)
CREATE TABLE buzzna_records (
  id VARCHAR(255) PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  tenant_id UUID,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buzzna_records_table_name ON buzzna_records(table_name);
CREATE INDEX idx_buzzna_records_tenant_id ON buzzna_records(tenant_id);
CREATE INDEX idx_buzzna_records_created_at ON buzzna_records(created_at DESC);

-- TABLE: sync_queue (Background Synchronization)
CREATE TABLE sync_queue (
  queue_id UUID PRIMARY KEY,
  entity_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_queue_created_at ON sync_queue(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (Multi-Tenant Isolation)
-- ============================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE till_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE buzzna_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- ============================================
-- VIEWS (Business Intelligence)
-- ============================================

CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT
  st.tenant_id,
  DATE(st.created_at) as sale_date,
  COUNT(DISTINCT st.transaction_id) as transaction_count,
  SUM(st.gross_total) as total_revenue,
  SUM(st.tax_amount) as total_tax,
  SUM(st.discount_amount) as total_discounts,
  AVG(st.gross_total) as avg_transaction_value
FROM sales_transactions st
GROUP BY st.tenant_id, DATE(st.created_at)
ORDER BY sale_date DESC;

CREATE OR REPLACE VIEW product_stock_status AS
SELECT
  p.product_id,
  p.tenant_id,
  p.product_name,
  p.current_quantity,
  p.retail_price,
  p.cost_floor,
  (p.retail_price - p.cost_floor) as margin,
  CASE
    WHEN p.current_quantity = 0 THEN 'OUT_OF_STOCK'
    WHEN p.current_quantity < 5 THEN 'LOW_STOCK'
    WHEN p.expiry_date < CURRENT_DATE THEN 'EXPIRED'
    ELSE 'IN_STOCK'
  END as stock_status
FROM products p;

CREATE OR REPLACE VIEW customer_aging AS
SELECT
  c.customer_id,
  c.tenant_id,
  c.customer_name,
  c.existing_debt,
  c.credit_limit,
  MAX(ccl.created_at) as last_transaction_date,
  CURRENT_DATE - COALESCE(MAX(ccl.created_at)::DATE, CURRENT_DATE) as days_since_last_tx
FROM customers c
LEFT JOIN customer_credit_ledger ccl ON c.customer_id = ccl.customer_id
GROUP BY c.customer_id, c.tenant_id, c.customer_name, c.existing_debt, c.credit_limit;
-- ============================================
-- FUNCTIONS & TRIGGERS (Operational Logic)
-- ============================================

CREATE OR REPLACE FUNCTION update_product_quantity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET current_quantity = current_quantity + NEW.quantity_delta,
      updated_at = NOW()
  WHERE product_id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_event_update_quantity
AFTER INSERT ON inventory_events
FOR EACH ROW
EXECUTE FUNCTION update_product_quantity();

-- ============================================
-- CONFIRMATION: Database is ready
-- ============================================
-- Run this query to verify all tables are created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- Expected: 13 tables (businesses, business_settings, users, product_categories, products, 
--           inventory_events, till_sessions, customers, sales_transactions, sale_items, 
--           payment_allocations, customer_credit_ledger, expenses, buzzna_records, sync_queue)
-- ============================================
