import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeProvider';
import { syncEngine } from '../lib/sync';
import { db } from '../lib/db';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Clock, 
  CreditCard, 
  Settings, 
  LogOut, 
  Wifi, 
  WifiOff, 
  Moon, 
  Sun, 
  RefreshCw, 
  AlertTriangle,
  Receipt,
  FileSpreadsheet,
  Coins,
  Menu,
  X
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  addToast: (text: string, type: 'success' | 'error' | 'info' | 'sync') => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, addToast }) => {
  const { activeBusiness, businessSettings, activeUser, logout, setThemeAndColor, language, setLanguage, t } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  
  // Realtime States
  const [isOnline, setIsOnline] = useState(syncEngine.isOnline());
  const [isSyncing, setIsSyncing] = useState(syncEngine.isSyncing());
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync state tracking
  useEffect(() => {
    const handleSyncChange = (online: boolean, syncing: boolean) => {
      setIsOnline(online);
      setIsSyncing(syncing);
    };

    const updateQueueCount = async () => {
      try {
        const queue = await db.getAll('sync_queue');
        setSyncQueueCount(queue.length);
      } catch (err) {
        console.error(err);
      }
    };

    const unsubscribeSync = syncEngine.subscribe(handleSyncChange);
    const unsubscribeDb = db.subscribe(updateQueueCount);

    updateQueueCount();

    return () => {
      unsubscribeSync();
      unsubscribeDb();
    };
  }, []);

  // Sync Action Trigger
  const handleForceSync = async () => {
    if (!isOnline) {
      addToast('Cannot sync: connection is offline!', 'error');
      return;
    }
    addToast('Initiating sequence: replicating local changes to cloud...', 'sync');
    const { successCount, failedCount } = await syncEngine.forceSync();
    if (successCount > 0) {
      addToast(`Sync Successful: Replicated ${successCount} entries to cloud.`, 'success');
    } else if (failedCount > 0) {
      addToast(`Sync warning: ${failedCount} entries encountered conflict.`, 'error');
    } else {
      addToast('Local state is already fully synchronized with Cloud ledger.', 'success');
    }
  };

  // Toggle Network Online State (Local sandbox simulator)
  const toggleNetworkSimulation = () => {
    const nextState = !isOnline;
    syncEngine.setNetworkState(nextState);
    setIsOnline(nextState);
    addToast(
      nextState 
        ? 'Network Simulated ONLINE. Background sync workers active.' 
        : 'Network Simulated OFFLINE. All POS sales will execute locally.',
      nextState ? 'success' : 'error'
    );
  };

  // Theme Visual Styling Helper
  const getBrandAccentClasses = () => {
    const theme = businessSettings?.chosenTheme || 'retail';
    switch (theme) {
      case 'butchery':
        return {
          bg: 'bg-red-600 hover:bg-red-700 text-white',
          text: 'text-red-600 dark:text-red-400',
          border: 'border-red-200 dark:border-red-800',
          ring: 'focus:ring-red-500',
          gradient: 'from-red-600 to-rose-700',
          activeBg: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
        };
      case 'mitumba':
        return {
          bg: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          text: 'text-emerald-600 dark:text-emerald-400',
          border: 'border-emerald-200 dark:border-emerald-800',
          ring: 'focus:ring-emerald-500',
          gradient: 'from-emerald-600 to-teal-700',
          activeBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
        };
      case 'hardware':
        return {
          bg: 'bg-amber-600 hover:bg-amber-700 text-white',
          text: 'text-amber-600 dark:text-amber-400',
          border: 'border-amber-200 dark:border-amber-800',
          ring: 'focus:ring-amber-500',
          gradient: 'from-amber-600 to-orange-700',
          activeBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
        };
      case 'cyber':
        return {
          bg: 'bg-purple-600 hover:bg-purple-700 text-white',
          text: 'text-purple-600 dark:text-purple-400',
          border: 'border-purple-200 dark:border-purple-800',
          ring: 'focus:ring-purple-500',
          gradient: 'from-purple-600 to-fuchsia-700',
          activeBg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
        };
      default: // Retail Blue
        return {
          bg: 'bg-blue-600 hover:bg-blue-700 text-white',
          text: 'text-blue-600 dark:text-blue-400',
          border: 'border-blue-200 dark:border-blue-800',
          ring: 'focus:ring-blue-500',
          gradient: 'from-blue-600 to-indigo-700',
          activeBg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
        };
    }
  };

  const brand = getBrandAccentClasses();

  // Navigation Tabs configuration
  const navigationItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, role: 'CASHIER' },
    { id: 'pos', label: t('nav.pos'), icon: ShoppingCart, role: 'CASHIER' },
    { id: 'inventory', label: t('nav.inventory'), icon: Package, role: 'MANAGER' },
    { id: 'sales', label: t('nav.sales'), icon: Receipt, role: 'CASHIER' },
    { id: 'crm', label: t('nav.crm'), icon: Users, role: 'CASHIER' },
    { id: 'expenses', label: t('nav.expenses'), icon: Coins, role: 'MANAGER' },
    { id: 'shift', label: t('nav.shift'), icon: Clock, role: 'CASHIER' },
    { id: 'settings', label: t('nav.settings'), icon: Settings, role: 'OWNER' }
  ];

  // Filter items based on active user role
  const userRole = activeUser?.role || 'CASHIER';
  const filteredNavItems = navigationItems.filter(item => {
    if (userRole === 'OWNER') return true;
    if (userRole === 'MANAGER') return item.role !== 'OWNER';
    return item.role === 'CASHIER';
  });

  // Calculate Trial Remaining
  const getTrialDaysRemaining = () => {
    if (!activeBusiness) return 0;
    const expiry = new Date(activeBusiness.licenseExpiresAt).getTime();
    const diff = expiry - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const trialDays = getTrialDaysRemaining();

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200" id="app-viewport">
      
      {/* Dynamic Header */}
      <header className="sticky top-0 z-40 w-full bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shadow-sm px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between" id="app-header">
        
        {/* Brand Header - Mobile Menu Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 -ml-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <img 
            src="https://res.cloudinary.com/plj6rk0o/image/upload/v1783949717/og-image_rxcpkm.jpg" 
            alt="BuzzNa Logo" 
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg object-cover shadow-md border border-zinc-100 dark:border-zinc-800 flex-shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-extrabold tracking-tight uppercase text-zinc-900 dark:text-white flex items-center gap-1.5 leading-none truncate">
              {activeBusiness?.tradeName || 'BuzzNa D74'}
            </h1>
            <p className="text-[8px] sm:text-[10px] text-zinc-500 font-mono tracking-wider mt-0.5 uppercase leading-none truncate">
              {businessSettings?.chosenTheme ? `${businessSettings.chosenTheme} vertical` : 'multi-sector OS'}
            </p>
          </div>
        </div>

        {/* System Operations Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          
          {/* Trial Visual countdown card - Hidden on small screens */}
          {trialDays > 0 && (
            <div className="hidden lg:flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-2.5 py-1.5 rounded-lg text-amber-800 dark:text-amber-400 text-[10px] font-semibold whitespace-nowrap">
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span>{t('global.trial')}: <b>{trialDays} {t('global.days_left')}</b></span>
            </div>
          )}

          {/* Sync Status Badge - Responsive */}
          {syncQueueCount > 0 ? (
            <button 
              onClick={handleForceSync}
              className="hidden sm:flex items-center gap-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-900 px-2.5 py-1.5 rounded-lg text-blue-800 dark:text-blue-400 text-[10px] font-semibold hover:shadow-sm transition-all cursor-pointer"
              id="header-sync-queue-btn"
              title="Force Sync pending events"
            >
              <RefreshCw className={`w-3 h-3 flex-shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{syncQueueCount} {t('global.unsynced')}</span>
            </button>
          ) : (
            <span className="hidden sm:flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-2.5 py-1.5 rounded-lg text-emerald-800 dark:text-emerald-400 text-[10px] font-semibold">
              <RefreshCw className="w-3 h-3 flex-shrink-0" />
              <span className="hidden md:inline">{t('global.synced')}</span>
            </span>
          )}

          {/* Simulated Offline Network Gate Toggler */}
          <button
            onClick={toggleNetworkSimulation}
            className={`p-2 rounded-lg border flex items-center justify-center transition-all cursor-pointer text-sm ${
              isOnline 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-400 hover:bg-emerald-100' 
                : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400 hover:bg-red-100'
            }`}
            style={{ minWidth: '40px', minHeight: '40px' }}
            title={isOnline ? 'Simulated Online' : 'Simulated Offline'}
            id="network-simulator-toggle"
          >
            {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4 animate-bounce" />}
          </button>

          {/* Language Switcher - Compact */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700" id="lang-switcher">
            <button
              onClick={() => setLanguage('EN')}
              className={`px-2 py-1.5 text-[10px] font-black rounded transition-all cursor-pointer ${
                language === 'EN'
                  ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }}`}
              style={{ minHeight: '30px' }}
              title="Switch to English"
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('SW')}
              className={`px-2 py-1.5 text-[10px] font-black rounded transition-all cursor-pointer ${
                language === 'SW'
                  ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
              style={{ minHeight: '30px' }}
              title="Badili hadi Kiswahili"
            >
              SW
            </button>
          </div>

          {/* Theme display toggler */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition-all cursor-pointer"
            style={{ minWidth: '40px', minHeight: '40px' }}
            id="theme-display-mode-toggle"
            aria-label="Toggle visual contrast theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Quick Active user widget - Desktop only */}
          <div className="hidden lg:flex flex-col text-right ml-2 pr-2 border-r border-zinc-200 dark:border-zinc-800">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{activeUser?.username}</span>
            <span className="text-[10px] text-zinc-500 font-mono tracking-wider">{activeUser?.role}</span>
          </div>

          {/* Logout Action */}
          <button
            onClick={logout}
            className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 text-zinc-500 border border-transparent transition-all flex items-center justify-center cursor-pointer"
            style={{ minWidth: '40px', minHeight: '40px' }}
            id="logout-btn"
            title="Log out of system"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Body frame */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)}>
            <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 h-full overflow-y-auto flex flex-col py-3 px-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col gap-1 flex-1">
                {filteredNavItems.map(item => {
                  const IconComp = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                        isActive 
                          ? brand.activeBg + ' font-bold shadow-xs' 
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                      style={{ minHeight: '44px' }}
                      id={`sidebar-nav-${item.id}`}
                    >
                      <IconComp className={`w-4 h-4 flex-shrink-0 ${isActive ? brand.text : 'text-zinc-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-zinc-400 font-mono flex flex-col gap-1 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div>BuzzNa D74 OS v1.0</div>
                <div>Support: 0790435584</div>
              </div>
            </aside>
          </div>
        )}
        
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden md:flex flex-col w-56 lg:w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 py-3 px-2 overflow-y-auto flex-shrink-0 justify-between" id="desktop-sidebar">
          <div className="flex flex-col gap-1">
            {filteredNavItems.map(item => {
              const IconComp = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    isActive 
                      ? brand.activeBg + ' font-bold shadow-xs' 
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                  style={{ minHeight: '44px' }}
                  id={`sidebar-nav-${item.id}`}
                >
                  <IconComp className={`w-4 h-4 flex-shrink-0 ${isActive ? brand.text : 'text-zinc-400'}`} />
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-zinc-400 font-mono flex flex-col gap-1 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <div>BuzzNa D74 OS v1.0</div>
            <div>Support: 0790435584</div>
          </div>
        </aside>

        {/* Active Content Frame */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 pb-20 md:pb-4" id="primary-content-viewport">
          {children}
        </main>
      </div>

      {/* Mobile Sticky Footer Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-1 py-1 shadow-xl flex items-center justify-around" id="mobile-footer-nav">
        {filteredNavItems.slice(0, 5).map(item => {
          const IconComp = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-0.5 p-2 rounded-lg transition-all cursor-pointer ${
                isActive 
                  ? brand.text + ' font-bold' 
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900'
              }`}
              style={{ minWidth: '48px', minHeight: '48px' }}
              id={`mobile-nav-${item.id}`}
            >
              <IconComp className="w-5 h-5 flex-shrink-0" />
              <span className="text-[8px] font-bold tracking-tight">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default Layout;
