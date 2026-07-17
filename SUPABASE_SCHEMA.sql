-- BuzzNa D74 Supabase Schema (Production-Ready Multi-Tenant)
-- Execute this in Supabase SQL Editor to initialize your database

DROP TABLE IF EXISTS payment_allocations CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales_transactions CASCADE;
DROP TABLE IF EXISTS customer_credit_ledger CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS inventory_events CASCADE;
DROP TABLE IF EXISTS till_sessions CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS product_categories CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS business_settings CASCADE;
DROP TABLE IF EXISTS businesses CASCADE;
DROP TABLE IF EXISTS buzzna_records CASCADE;
DROP TABLE IF EXISTS sync_queue CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- BUSINESSES (Tenant Master)
CREATE TABLE businesses (
  tenantId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legalName VARCHAR(255) NOT NULL,
  tradeName VARCHAR(255),
  industry VARCHAR(100),
  country VARCHAR(100) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'KES',
  language VARCHAR(10) DEFAULT 'EN',
  timezone VARCHAR(50),
  licenseStatus VARCHAR(50) DEFAULT 'TRIAL_ACTIVE',
  licenseExpiresAt TIMESTAMP WITH TIME ZONE,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_businesses_country ON businesses(country);
CREATE INDEX idx_businesses_licenseStatus ON businesses(licenseStatus);

-- BUSINESS_SETTINGS
CREATE TABLE business_settings (
  tenantId UUID PRIMARY KEY REFERENCES businesses(tenantId) ON DELETE CASCADE,
  chosenTheme VARCHAR(50) DEFAULT 'retail',
  brandColor VARCHAR(50) DEFAULT 'indigo',
  dailyRevenueTarget DECIMAL(12, 2) DEFAULT 10000,
  weeklyRevenueTarget DECIMAL(12, 2) DEFAULT 70000,
  monthlyRevenueTarget DECIMAL(12, 2) DEFAULT 300000,
  darajaPaybill VARCHAR(50),
  darajaTillNumber VARCHAR(50),
  darajaApiKey VARCHAR(255),
  eodTime VARCHAR(10),
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- USERS
CREATE TABLE users (
  userId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenantId UUID NOT NULL REFERENCES businesses(tenantId) ON DELETE CASCADE,
  role VARCHAR(50) CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER')),
  username VARCHAR(100) NOT NULL,
  phoneNumber VARCHAR(20),
  emailAddress VARCHAR(255),
  isActive BOOLEAN DEFAULT TRUE,
  password VARCHAR(255),
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenantId, username)
);
CREATE INDEX idx_users_tenantId ON users(tenantId);

-- PRODUCT_CATEGORIES
CREATE TABLE product_categories (
  categoryId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenantId UUID NOT NULL REFERENCES businesses(tenantId) ON DELETE CASCADE,
  categoryName VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenantId, categoryName)
);
CREATE INDEX idx_product_categories_tenantId ON product_categories(tenantId);

-- PRODUCTS
CREATE TABLE products (
  productId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenantId UUID NOT NULL REFERENCES businesses(tenantId) ON DELETE CASCADE,
  categoryId UUID REFERENCES product_categories(categoryId) ON DELETE SET NULL,
  barcode VARCHAR(100),
  productName VARCHAR(255) NOT NULL,
  costFloor DECIMAL(12, 2) NOT NULL,
  retailPrice DECIMAL(12, 2) NOT NULL,
  currentQuantity INTEGER DEFAULT 0,
  isSerialized BOOLEAN DEFAULT FALSE,
  expiryDate DATE,
  supplierId VARCHAR(255),
  imageUrl VARCHAR(500),
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_products_tenantId ON products(tenantId);
CREATE INDEX idx_products_categoryId ON products(categoryId);
CREATE INDEX idx_products_barcode ON products(barcode);

-- INVENTORY_EVENTS
CREATE TABLE inventory_events (
  eventId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenantId UUID NOT NULL REFERENCES businesses(tenantId) ON DELETE CASCADE,
  productId UUID NOT NULL REFERENCES products(productId) ON DELETE CASCADE,
  userId UUID NOT NULL REFERENCES users(userId) ON DELETE CASCADE,
  eventType VARCHAR(50) NOT NULL CHECK (eventType IN ('STOCK_ADD', 'SALE_DISPATCH', 'SPOILAGE', 'DAMAGE', 'THEFT_LOSS', 'REFUND_RETURN', 'STOCK_CORRECTION')),
  quantityDelta INTEGER NOT NULL,
  reasonCode VARCHAR(100),
  terminalTimestamp TIMESTAMP WITH TIME ZONE,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_inventory_events_tenantId ON inventory_events(tenantId);
CREATE INDEX idx_inventory_events_productId ON inventory_events(productId);
CREATE INDEX idx_inventory_events_eventType ON inventory_events(eventType);

-- TILL_SESSIONS
CREATE TABLE till_sessions (
  sessionId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenantId UUID NOT NULL REFERENCES businesses(tenantId) ON DELETE CASCADE,
  userId UUID NOT NULL REFERENCES users(userId) ON DELETE CASCADE,
  openingFloat DECIMAL(12, 2) NOT NULL DEFAULT 0,
  expectedCashBalance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  actualCashBalance DECIMAL(12, 2),
  sessionStatus VARCHAR(50) CHECK (sessionStatus IN ('OPEN', 'CLOSED')) DEFAULT 'OPEN',
  openedAt TIMESTAMP WITH TIME ZONE NOT NULL,
  closedAt TIMESTAMP WITH TIME ZONE,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_till_sessions_tenantId ON till_sessions(tenantId);
CREATE INDEX idx_till_sessions_sessionStatus ON till_sessions(sessionStatus);

-- CUSTOMERS
CREATE TABLE customers (
  customerId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenantId UUID NOT NULL REFERENCES businesses(tenantId) ON DELETE CASCADE,
  customerName VARCHAR(255) NOT NULL,
  phoneNumber VARCHAR(20),
  emailAddress VARCHAR(255),
  creditLimit DECIMAL(12, 2) DEFAULT 0,
  existingDebt DECIMAL(12, 2) DEFAULT 0,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenantId, phoneNumber)
);
CREATE INDEX idx_customers_tenantId ON customers(tenantId);

-- SALES_TRANSACTIONS
CREATE TABLE sales_transactions (
  transactionId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenantId UUID NOT NULL REFERENCES businesses(tenantId) ON DELETE CASCADE,
  sessionId UUID NOT NULL REFERENCES till_sessions(sessionId) ON DELETE CASCADE,
  customerId UUID REFERENCES customers(customerId) ON DELETE SET NULL,
  paymentMethod VARCHAR(50) CHECK (paymentMethod IN ('CASH', 'MPESA', 'DEBT', 'SPLIT')) NOT NULL,
  paymentStatus VARCHAR(50) CHECK (paymentStatus IN ('PENDING', 'PAID', 'REFUNDED', 'FAILED')) DEFAULT 'PAID',
  grossTotal DECIMAL(12, 2) NOT NULL,
  taxAmount DECIMAL(12, 2) DEFAULT 0,
  discountAmount DECIMAL(12, 2) DEFAULT 0,
  terminalTimestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_sales_transactions_tenantId ON sales_transactions(tenantId);
CREATE INDEX idx_sales_transactions_sessionId ON sales_transactions(sessionId);

-- SALE_ITEMS
CREATE TABLE sale_items (
  itemId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transactionId UUID NOT NULL REFERENCES sales_transactions(transactionId) ON DELETE CASCADE,
  productId UUID NOT NULL REFERENCES products(productId) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  unitPrice DECIMAL(12, 2) NOT NULL,
  totalPrice DECIMAL(12, 2) NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_sale_items_transactionId ON sale_items(transactionId);

-- CUSTOMER_CREDIT_LEDGER
CREATE TABLE customer_credit_ledger (
  ledgerId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenantId UUID NOT NULL REFERENCES businesses(tenantId) ON DELETE CASCADE,
  customerId UUID NOT NULL REFERENCES customers(customerId) ON DELETE CASCADE,
  transactionId UUID REFERENCES sales_transactions(transactionId) ON DELETE SET NULL,
  amountDelta DECIMAL(12, 2) NOT NULL,
  runningBalance DECIMAL(12, 2) NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_customer_credit_ledger_tenantId ON customer_credit_ledger(tenantId);
CREATE INDEX idx_customer_credit_ledger_customerId ON customer_credit_ledger(customerId);

-- EXPENSES
CREATE TABLE expenses (
  expenseId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenantId UUID NOT NULL REFERENCES businesses(tenantId) ON DELETE CASCADE,
  expenseName VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  recordedBy VARCHAR(255),
  incurredDate DATE NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_expenses_tenantId ON expenses(tenantId);

-- PAYMENT_ALLOCATIONS
CREATE TABLE payment_allocations (
  allocationId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transactionId UUID NOT NULL REFERENCES sales_transactions(transactionId) ON DELETE CASCADE,
  allocatedMethod VARCHAR(50) CHECK (allocatedMethod IN ('CASH', 'MPESA', 'DEBT', 'SPLIT')) NOT NULL,
  allocatedAmount DECIMAL(12, 2) NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_payment_allocations_transactionId ON payment_allocations(transactionId);

-- SYNC_QUEUE
CREATE TABLE sync_queue (
  queueId UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entityType VARCHAR(50) NOT NULL CHECK (entityType IN ('sale', 'inventory_event', 'customer', 'customer_credit', 'expense', 'till_session')),
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processedAt TIMESTAMP WITH TIME ZONE,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_sync_queue_processed ON sync_queue(processed);

-- BUZZNA_RECORDS (for IndexedDB sync)
CREATE TABLE buzzna_records (
  id VARCHAR(255) PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  tenant_id VARCHAR(255),
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_buzzna_records_table_name ON buzzna_records(table_name);
CREATE INDEX idx_buzzna_records_tenant_id ON buzzna_records(tenant_id);

-- ENABLE RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE till_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE buzzna_records ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES (Allow all for development; add auth.uid() filters in production)
CREATE POLICY "businesses_allow_all" ON businesses FOR ALL USING (true);
CREATE POLICY "business_settings_allow_all" ON business_settings FOR ALL USING (true);
CREATE POLICY "users_allow_all" ON users FOR ALL USING (true);
CREATE POLICY "product_categories_allow_all" ON product_categories FOR ALL USING (true);
CREATE POLICY "products_allow_all" ON products FOR ALL USING (true);
CREATE POLICY "inventory_events_allow_all" ON inventory_events FOR ALL USING (true);
CREATE POLICY "till_sessions_allow_all" ON till_sessions FOR ALL USING (true);
CREATE POLICY "sales_transactions_allow_all" ON sales_transactions FOR ALL USING (true);
CREATE POLICY "sale_items_allow_all" ON sale_items FOR ALL USING (true);
CREATE POLICY "customers_allow_all" ON customers FOR ALL USING (true);
CREATE POLICY "customer_credit_ledger_allow_all" ON customer_credit_ledger FOR ALL USING (true);
CREATE POLICY "expenses_allow_all" ON expenses FOR ALL USING (true);
CREATE POLICY "payment_allocations_allow_all" ON payment_allocations FOR ALL USING (true);
CREATE POLICY "sync_queue_allow_all" ON sync_queue FOR ALL USING (true);
CREATE POLICY "buzzna_records_allow_all" ON buzzna_records FOR ALL USING (true);
