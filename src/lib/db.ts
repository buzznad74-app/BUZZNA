import {
  Business,
  BusinessSettings,
  User,
  Category,
  Product,
  InventoryEvent,
  InventoryEventType,
  TillSession,
  SalesTransaction,
  SaleItem,
  Customer,
  CustomerCreditLedgerEntry,
  Expense,
  SyncQueueItem,
  VerticalTheme,
  LicenseStatus,
  PaymentMethod,
  PaymentAllocation
} from '../types';

// Helper to generate UUIDs
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class AppDatabase {
  private dbName = 'buzzna_d74_db';
  private version = 1;
  private db: IDBDatabase | null = null;
  private changeListeners: Set<() => void> = new Set();

  constructor() {
    this.initDatabase();
  }

  private initDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve(this.db);
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object stores if they don't exist
        const stores = [
          'businesses',
          'business_settings',
          'users',
          'product_categories',
          'products',
          'inventory_events',
          'till_sessions',
          'sales_transactions',
          'sale_items',
          'customers',
          'customer_credit_ledger',
          'expenses',
          'sync_queue'
        ];

        stores.forEach(store => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: this.getKeyPath(store) });
          }
        });
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.seedInitialData();
        this.syncFromSupabase().catch(err => console.warn(err));
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB failed to open:', request.error);
        reject(request.error);
      };
    });
  }

  private getKeyPath(store: string): string {
    switch (store) {
      case 'businesses': return 'tenantId';
      case 'business_settings': return 'tenantId';
      case 'users': return 'userId';
      case 'product_categories': return 'categoryId';
      case 'products': return 'productId';
      case 'inventory_events': return 'eventId';
      case 'till_sessions': return 'sessionId';
      case 'sales_transactions': return 'transactionId';
      case 'sale_items': return 'itemId';
      case 'customers': return 'customerId';
      case 'customer_credit_ledger': return 'ledgerId';
      case 'expenses': return 'expenseId';
      case 'sync_queue': return 'queueId';
      default: return 'id';
    }
  }

  // Reactive Subscription
  public subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.changeListeners.forEach(listener => {
      try {
        listener();
      } catch (err) {
        console.error('Error in db change listener:', err);
      }
    });
  }

  // Generic DB Operations wrapped in Promises
  private getStore(name: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    return this.initDatabase().then(db => {
      const transaction = db.transaction(name, mode);
      return transaction.objectStore(name);
    });
  }

  public async getAll<T>(storeName: string): Promise<T[]> {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  public async getById<T>(storeName: string, id: string): Promise<T | null> {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result as T || null);
      request.onerror = () => reject(request.error);
    });
  }

  public async put<T>(storeName: string, item: T): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    this.notifyListeners();

    // Background push to Supabase via server-side proxy
    if (storeName !== 'sync_queue') {
      try {
        fetch(`/api/db/${storeName}/upsert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item })
        }).catch(err => console.warn(`Supabase sync failed for ${storeName}:`, err));
      } catch (e) {
        console.warn(e);
      }
    }
  }

  public async delete(storeName: string, id: string): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    this.notifyListeners();

    // Background deletion in Supabase via server-side proxy
    if (storeName !== 'sync_queue') {
      try {
        fetch(`/api/db/${storeName}/${id}`, {
          method: 'DELETE'
        }).catch(err => console.warn(`Supabase delete sync failed for ${storeName}:`, err));
      } catch (e) {
        console.warn(e);
      }
    }
  }

  public async clearStore(storeName: string): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    this.notifyListeners();

    // Background clear in Supabase via server-side proxy
    if (storeName !== 'sync_queue') {
      try {
        fetch(`/api/db/${storeName}/clear`, {
          method: 'POST'
        }).catch(err => console.warn(`Supabase clear sync failed for ${storeName}:`, err));
      } catch (e) {
        console.warn(e);
      }
    }
  }

  // Background cloud database retrieval to keep IndexedDB completely up-to-date with Supabase
  public async syncFromSupabase(): Promise<void> {
    const syncStores = [
      'businesses',
      'business_settings',
      'users',
      'product_categories',
      'products',
      'inventory_events',
      'till_sessions',
      'sales_transactions',
      'sale_items',
      'customers',
      'customer_credit_ledger',
      'expenses'
    ];

    try {
      for (const store of syncStores) {
        const response = await fetch(`/api/db/${store}`);
        if (response.ok) {
          const items = await response.json();
          if (Array.isArray(items) && items.length > 0) {
            const localStore = await this.getStore(store, 'readwrite');
            
            // Clear local IndexedDB store to prevent outdated/stale copies
            await new Promise<void>((res, rej) => {
              const req = localStore.clear();
              req.onsuccess = () => res();
              req.onerror = () => rej(req.error);
            });

            // Write all fresh Cloud master records
            for (const item of items) {
              await new Promise<void>((res, rej) => {
                const req = localStore.put(item);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
              });
            }
          }
        }
      }
      this.notifyListeners();
      console.log('Successfully completed background cloud sync from Supabase.');
    } catch (err) {
      console.warn("Supabase background cloud sync is paused or offline:", err);
    }
  }

  // Seeding completely disabled to guarantee brand-new clean production-ready databases
  private async seedInitialData(): Promise<void> {
    // No-op for production readiness
    return;
  }

  // --- Domain Logic Methods (Event Sourcing & Integrity Guards) ---

  // Re-calculate quantities based on append-only events
  public async recalculateProductQuantity(productId: string): Promise<number> {
    const events = await this.getAll<InventoryEvent>('inventory_events');
    const productEvents = events.filter(e => e.productId === productId);
    const sum = productEvents.reduce((acc, e) => acc + e.quantityDelta, 0);
    return sum;
  }

  // Add Product Category with Unique Guard
  public async addCategory(tenantId: string, categoryName: string): Promise<Category> {
    const categories = await this.getAll<Category>('product_categories');
    const duplicate = categories.find(
      c => c.tenantId === tenantId && c.categoryName.toLowerCase().trim() === categoryName.toLowerCase().trim()
    );
    if (duplicate) {
      throw new Error(`Category "${categoryName}" already exists for this business.`);
    }

    const categoryId = generateUUID();
    const newCategory: Category = { categoryId, tenantId, categoryName };
    await this.put('product_categories', newCategory);
    return newCategory;
  }

  // Add Product with cost guard
  public async addProduct(product: Omit<Product, 'currentQuantity'>, initialQuantity: number = 0): Promise<Product> {
    if (product.retailPrice < product.costFloor) {
      throw new Error(`Integrity Error: Retail Price (KES ${product.retailPrice}) cannot be below Cost Price (KES ${product.costFloor}).`);
    }

    const fullProduct: Product = {
      ...product,
      currentQuantity: initialQuantity
    };

    await this.put('products', fullProduct);

    // Automatically create initial STOCK_ADD event if currentQuantity > 0
    if (fullProduct.currentQuantity > 0) {
      const activeUser = localStorage.getItem('active_user_id') || 'demo-owner-id';
      const eventId = generateUUID();
      const event: InventoryEvent = {
        eventId,
        tenantId: product.tenantId,
        productId: product.productId,
        userId: activeUser,
        eventType: InventoryEventType.STOCK_ADD,
        quantityDelta: fullProduct.currentQuantity,
        reasonCode: 'INITIAL_STOCK_SEED',
        terminalTimestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      await this.put('inventory_events', event);
    }

    return fullProduct;
  }

  // Record custom inventory event
  public async recordInventoryEvent(event: InventoryEvent): Promise<void> {
    await this.put('inventory_events', event);
    
    // Update product quantity projection
    const product = await this.getById<Product>('products', event.productId);
    if (product) {
      const newQty = product.currentQuantity + event.quantityDelta;
      product.currentQuantity = newQty;
      await this.put('products', product);
    }
  }

  // Register complete Sale Checkout transaction
  public async executeSaleCheckout(
    transaction: SalesTransaction,
    items: Omit<SaleItem, 'itemId' | 'transactionId'>[],
    splitAllocations: Omit<PaymentAllocation, 'allocationId' | 'transactionId'>[] = []
  ): Promise<void> {
    // 1. Double check shift session status
    const session = await this.getById<TillSession>('till_sessions', transaction.sessionId);
    if (!session || session.sessionStatus === 'CLOSED') {
      throw new Error('Transaction Rejected: Shift session is closed or missing. Open till to continue.');
    }

    // 2. Validate cost floors on items (prevent bargain below margins)
    for (const item of items) {
      const product = await this.getById<Product>('products', item.productId);
      if (product) {
        if (item.unitPrice < product.costFloor) {
          throw new Error(`Checkout Blocked: Bargain price KES ${item.unitPrice} on "${product.productName}" is below cost price (KES ${product.costFloor}).`);
        }
      }
    }

    // 3. Save Sales Transaction record
    await this.put('sales_transactions', transaction);

    // 4. Save Sales items & append dispatch event-sourced records
    const activeUser = localStorage.getItem('active_user_id') || 'demo-owner-id';
    for (const item of items) {
      const itemId = generateUUID();
      const saleItem: SaleItem = {
        ...item,
        itemId,
        transactionId: transaction.transactionId
      };
      await this.put('sale_items', saleItem);

      // Append stock subtraction event (SALE_DISPATCH)
      const eventId = generateUUID();
      const invEvent: InventoryEvent = {
        eventId,
        tenantId: transaction.tenantId,
        productId: item.productId,
        userId: activeUser,
        eventType: InventoryEventType.SALE_DISPATCH,
        quantityDelta: -item.quantity, // Negative delta
        reasonCode: 'POS_CHECKOUT_DISPATCH',
        terminalTimestamp: transaction.terminalTimestamp,
        createdAt: new Date().toISOString()
      };
      await this.recordInventoryEvent(invEvent);
    }

    // 5. Save payment allocations if split
    if (transaction.paymentMethod === PaymentMethod.SPLIT) {
      for (const allocation of splitAllocations) {
        const allocationId = generateUUID();
        const pAlloc: PaymentAllocation = {
          ...allocation,
          allocationId,
          transactionId: transaction.transactionId
        };
        await this.put('payment_allocations', pAlloc);

        // If split involves debt allocation, update customer ledger
        if (allocation.allocatedMethod === PaymentMethod.DEBT && transaction.customerId) {
          await this.adjustCustomerDebt(
            transaction.tenantId,
            transaction.customerId,
            allocation.allocatedAmount,
            transaction.transactionId
          );
        }
      }
    } else if (transaction.paymentMethod === PaymentMethod.DEBT && transaction.customerId) {
      // Full debt transaction
      await this.adjustCustomerDebt(
        transaction.tenantId,
        transaction.customerId,
        transaction.grossTotal,
        transaction.transactionId
      );
    }

    // 6. Automatically increment expected cash balance if Cash is utilized
    if (transaction.paymentMethod === PaymentMethod.CASH) {
      session.expectedCashBalance += transaction.grossTotal;
      await this.put('till_sessions', session);
    } else if (transaction.paymentMethod === PaymentMethod.SPLIT) {
      const cashAlloc = splitAllocations.find(a => a.allocatedMethod === PaymentMethod.CASH);
      if (cashAlloc) {
        session.expectedCashBalance += cashAlloc.allocatedAmount;
        await this.put('till_sessions', session);
      }
    }

    // 7. Put into sync queue
    await this.enqueueSync('sale', { transaction, items, splitAllocations });
  }

  // Refund Sale & Restore stock (Anti-Fraud Gate)
  public async executeRefund(transactionId: string): Promise<void> {
    const tx = await this.getById<SalesTransaction>('sales_transactions', transactionId);
    if (!tx) throw new Error('Transaction record not found.');
    if (tx.paymentStatus === 'REFUNDED') throw new Error('Transaction has already been fully refunded.');

    // Isolate products, restock delta & update ledger
    tx.paymentStatus = 'REFUNDED';
    await this.put('sales_transactions', tx);

    const allItems = await this.getAll<SaleItem>('sale_items');
    const txItems = allItems.filter(item => item.transactionId === transactionId);
    
    const activeUser = localStorage.getItem('active_user_id') || 'demo-owner-id';

    for (const item of txItems) {
      // Create compensating positive inventory event (REFUND_RETURN)
      const eventId = generateUUID();
      const invEvent: InventoryEvent = {
        eventId,
        tenantId: tx.tenantId,
        productId: item.productId,
        userId: activeUser,
        eventType: InventoryEventType.REFUND_RETURN,
        quantityDelta: item.quantity, // Positive restoration delta
        reasonCode: 'CUSTOMER_REFUND_RETURN',
        terminalTimestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      await this.recordInventoryEvent(invEvent);
    }

    // Adjust customer debt if the sale was on debt
    if (tx.paymentMethod === PaymentMethod.DEBT && tx.customerId) {
      await this.adjustCustomerDebt(tx.tenantId, tx.customerId, -tx.grossTotal, tx.transactionId);
    } else if (tx.paymentMethod === PaymentMethod.SPLIT && tx.customerId) {
      const allocations = await this.getAll<PaymentAllocation>('payment_allocations');
      const txAllocations = allocations.filter(a => a.transactionId === transactionId);
      const debtAlloc = txAllocations.find(a => a.allocatedMethod === PaymentMethod.DEBT);
      if (debtAlloc) {
        await this.adjustCustomerDebt(tx.tenantId, tx.customerId, -debtAlloc.allocatedAmount, tx.transactionId);
      }
    }

    // Queue sync
    await this.enqueueSync('inventory_event', { refundTxId: transactionId });
  }

  // Void alias for Sales log compatibility
  public async voidSalesTransaction(transactionId: string): Promise<void> {
    return this.executeRefund(transactionId);
  }

  // Customer Debt Controller
  public async adjustCustomerDebt(
    tenantId: string,
    customerId: string,
    delta: number,
    transactionId?: string
  ): Promise<void> {
    const customer = await this.getById<Customer>('customers', customerId);
    if (!customer) throw new Error('Customer not found.');

    const currentDebt = customer.existingDebt;
    const nextDebt = currentDebt + delta;

    // Credit limit ceiling validation
    if (delta > 0 && nextDebt > customer.creditLimit) {
      throw new Error(`Credit Limit Breached: Customer "${customer.customerName}" has a credit limit of KES ${customer.creditLimit}. Outstanding debt is KES ${customer.existingDebt}. Adding KES ${delta} would breach the ceiling.`);
    }

    customer.existingDebt = Math.max(0, nextDebt);
    await this.put('customers', customer);

    // Save credit ledger entry
    const ledgerId = generateUUID();
    const ledgerEntry: CustomerCreditLedgerEntry = {
      ledgerId,
      tenantId,
      customerId,
      transactionId,
      amountDelta: delta,
      runningBalance: customer.existingDebt,
      createdAt: new Date().toISOString()
    };
    await this.put('customer_credit_ledger', ledgerEntry);
    
    // Enqueue Sync
    await this.enqueueSync('customer_credit', ledgerEntry);
  }

  // --- Synchronization Queue Logic ---
  public async enqueueSync(entityType: SyncQueueItem['entityType'], payload: any): Promise<void> {
    const queueId = generateUUID();
    const syncItem: SyncQueueItem = {
      queueId,
      entityType,
      payload,
      createdAt: new Date().toISOString()
    };
    await this.put('sync_queue', syncItem);
  }
}

export const db = new AppDatabase();
export default db;
