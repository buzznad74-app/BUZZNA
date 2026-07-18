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
import { supabase } from './sync';

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
          'payment_allocations',
          'sync_queue'
        ];

        stores.forEach(store => {
          if (!db.objectStoreNames.contains(store)) {
            const os = db.createObjectStore(store, { keyPath: this.getKeyPath(store) });
            // Add indexes for common queries
            if (store === 'products') os.createIndex('tenantId', 'tenantId');
            if (store === 'sales_transactions') os.createIndex('tenantId', 'tenantId');
            if (store === 'customers') os.createIndex('tenantId', 'tenantId');
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
      case 'payment_allocations': return 'allocationId';
      case 'sync_queue': return 'queueId';
      default: return 'id';
    }
  }

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

    if (storeName !== 'sync_queue') {
      try {
        const itemAny = item as any;
        const id = String(
          itemAny.tenantId ||
          itemAny.productId ||
          itemAny.categoryId ||
          itemAny.userId ||
          itemAny.customerId ||
          itemAny.transactionId ||
          itemAny.itemId ||
          itemAny.expenseId ||
          itemAny.sessionId ||
          itemAny.ledgerId ||
          itemAny.allocationId ||
          `local_${Date.now()}`
        );
        const tenantId = itemAny.tenantId || null;

        supabase
          .from('buzzna_records')
          .upsert({
            id,
            table_name: storeName,
            tenant_id: tenantId ? String(tenantId) : null,
            data: item,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' })
          .catch(err => console.warn(`Supabase sync failed for ${storeName}:`, err));
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

    if (storeName !== 'sync_queue') {
      try {
        supabase
          .from('buzzna_records')
          .delete()
          .eq('id', id)
          .eq('table_name', storeName)
          .catch(err => console.warn(`Supabase delete sync failed for ${storeName}:`, err));
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
  }

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
        try {
          const { data, error } = await supabase
            .from('buzzna_records')
            .select('data')
            .eq('table_name', store);

          if (error) {
            console.warn(`Supabase query error for ${store}:`, error);
            continue;
          }

          const items = (data || []).map((row: any) => row.data);
          if (Array.isArray(items) && items.length > 0) {
            const localStore = await this.getStore(store, 'readwrite');
            
            await new Promise<void>((res, rej) => {
              const req = localStore.clear();
              req.onsuccess = () => res();
              req.onerror = () => rej(req.error);
            });

            for (const item of items) {
              await new Promise<void>((res, rej) => {
                const req = localStore.put(item);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
              });
            }
          }
        } catch (storeErr) {
          console.warn(`Error syncing store ${store}:`, storeErr);
        }
      }
      this.notifyListeners();
      console.log('Sync complete');
    } catch (err) {
      console.warn('Sync failed:', err);
    }
  }

  private async seedInitialData(): Promise<void> {
    return;
  }

  public async recalculateProductQuantity(productId: string): Promise<number> {
    const events = await this.getAll<InventoryEvent>('inventory_events');
    const productEvents = events.filter(e => e.productId === productId);
    const sum = productEvents.reduce((acc, e) => acc + e.quantityDelta, 0);
    return sum;
  }

  public async addCategory(tenantId: string, categoryName: string): Promise<Category> {
    const categories = await this.getAll<Category>('product_categories');
    const duplicate = categories.find(
      c => c.tenantId === tenantId && c.categoryName.toLowerCase().trim() === categoryName.toLowerCase().trim()
    );
    if (duplicate) {
      throw new Error(`Category "${categoryName}" already exists.`);
    }

    const categoryId = generateUUID();
    const newCategory: Category = { categoryId, tenantId, categoryName };
    await this.put('product_categories', newCategory);
    return newCategory;
  }

  public async addProduct(product: Omit<Product, 'currentQuantity'>, initialQuantity: number = 0): Promise<Product> {
    if (product.retailPrice < product.costFloor) {
      throw new Error(`Retail Price (KES ${product.retailPrice}) cannot be below Cost Price (KES ${product.costFloor}).`);
    }

    const fullProduct: Product = {
      ...product,
      currentQuantity: initialQuantity
    };

    await this.put('products', fullProduct);

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

  public async recordInventoryEvent(event: InventoryEvent): Promise<void> {
    await this.put('inventory_events', event);
    
    const product = await this.getById<Product>('products', event.productId);
    if (product) {
      const newQty = product.currentQuantity + event.quantityDelta;
      product.currentQuantity = newQty;
      await this.put('products', product);
    }
  }

  public async executeSaleCheckout(
    transaction: SalesTransaction,
    items: Omit<SaleItem, 'itemId' | 'transactionId'>[],
    splitAllocations: Omit<PaymentAllocation, 'allocationId' | 'transactionId'>[] = []
  ): Promise<void> {
    const session = await this.getById<TillSession>('till_sessions', transaction.sessionId);
    if (!session || session.sessionStatus === 'CLOSED') {
      throw new Error('Shift session is closed or missing.');
    }

    for (const item of items) {
      const product = await this.getById<Product>('products', item.productId);
      if (product) {
        if (item.unitPrice < product.costFloor) {
          throw new Error(`Bargain price KES ${item.unitPrice} on "${product.productName}" is below cost price (KES ${product.costFloor}).`);
        }
      }
    }

    await this.put('sales_transactions', transaction);

    const activeUser = localStorage.getItem('active_user_id') || 'demo-owner-id';
    for (const item of items) {
      const itemId = generateUUID();
      const saleItem: SaleItem = {
        ...item,
        itemId,
        transactionId: transaction.transactionId
      };
      await this.put('sale_items', saleItem);

      const eventId = generateUUID();
      const invEvent: InventoryEvent = {
        eventId,
        tenantId: transaction.tenantId,
        productId: item.productId,
        userId: activeUser,
        eventType: InventoryEventType.SALE_DISPATCH,
        quantityDelta: -item.quantity,
        reasonCode: 'POS_CHECKOUT_DISPATCH',
        terminalTimestamp: transaction.terminalTimestamp,
        createdAt: new Date().toISOString()
      };
      await this.recordInventoryEvent(invEvent);
    }

    if (transaction.paymentMethod === PaymentMethod.SPLIT) {
      for (const allocation of splitAllocations) {
        const allocationId = generateUUID();
        const pAlloc: PaymentAllocation = {
          ...allocation,
          allocationId,
          transactionId: transaction.transactionId
        };
        await this.put('payment_allocations', pAlloc);

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
      await this.adjustCustomerDebt(
        transaction.tenantId,
        transaction.customerId,
        transaction.grossTotal,
        transaction.transactionId
      );
    }

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

    await this.enqueueSync('sale', { transaction, items, splitAllocations });
  }

  public async executeRefund(transactionId: string): Promise<void> {
    const tx = await this.getById<SalesTransaction>('sales_transactions', transactionId);
    if (!tx) throw new Error('Transaction not found.');
    if (tx.paymentStatus === 'REFUNDED') throw new Error('Transaction already refunded.');

    tx.paymentStatus = 'REFUNDED';
    await this.put('sales_transactions', tx);

    const allItems = await this.getAll<SaleItem>('sale_items');
    const txItems = allItems.filter(item => item.transactionId === transactionId);
    
    const activeUser = localStorage.getItem('active_user_id') || 'demo-owner-id';

    for (const item of txItems) {
      const eventId = generateUUID();
      const invEvent: InventoryEvent = {
        eventId,
        tenantId: tx.tenantId,
        productId: item.productId,
        userId: activeUser,
        eventType: InventoryEventType.REFUND_RETURN,
        quantityDelta: item.quantity,
        reasonCode: 'CUSTOMER_REFUND_RETURN',
        terminalTimestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      await this.recordInventoryEvent(invEvent);
    }

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

    await this.enqueueSync('inventory_event', { refundTxId: transactionId });
  }

  public async voidSalesTransaction(transactionId: string): Promise<void> {
    return this.executeRefund(transactionId);
  }

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

    if (delta > 0 && nextDebt > customer.creditLimit) {
      throw new Error(`Credit Limit Exceeded: Customer has limit of KES ${customer.creditLimit}. Current debt: KES ${customer.existingDebt}.`);
    }

    customer.existingDebt = Math.max(0, nextDebt);
    await this.put('customers', customer);

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
    
    await this.enqueueSync('customer_credit', ledgerEntry);
  }

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
