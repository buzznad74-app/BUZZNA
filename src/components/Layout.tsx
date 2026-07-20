import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeProvider';
import { syncEngine } from '../lib/sync';
import { db } from '../lib/db';
import { mailDispatcher } from '../lib/mail'; // added
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

  const [isOnline, setIsOnline] = useState(syncEngine.isOnline());
  const [isSyncing, setIsSyncing] = useState(syncEngine.isSyncing());
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    return () => { unsubscribeSync(); unsubscribeDb(); };
  }, []);

  const handleForceSync = async () => {
    if (!isOnline) {
      addToast(t('sync.offline_error'), 'error');
      return;
    }
    addToast(t('sync.initiating'), 'sync');
    const { successCount, failedCount } = await syncEngine.forceSync();
    if (successCount > 0) {
      addToast(t('sync.success').replace('{count}', successCount.toString()), 'success');
    } else if (failedCount > 0) {
      addToast(t('sync.conflict').replace('{count}', failedCount.toString()), 'error');
    } else {
      addToast(t('sync.already_synced'), 'success');
    }
  };

  const toggleNetworkSimulation = () => {
    const nextState =!isOnline;
    syncEngine.setNetworkState(nextState);
    setIsOnline(nextState);
    mailDispatcher.sendSystemEvent({ // new: log network event
      event: nextState? 'network.online' : 'network.offline',
      userId: activeUser?.id
    });
    addToast(
      nextState? t('network.online_simulated') : t('network.offline_simulated'),
      nextState? 'success' : 'error'
    );
  };

  const handleLanguageChange = (lang: 'EN' | 'SW') => {
    setLanguage(lang);
    mailDispatcher.sendSystemEvent({ // new: log language change
      event: 'user.language_change',
      userId: activeUser?.id,
      meta: { language: lang }
    });
  };

  const handleLogout = () => {
    mailDispatcher.sendWelcome({ // new: goodbye email if configured
      type: 'session_end',
      userId: activeUser?.id,
      businessId: activeBusiness?.id
    });
    logout();
  };

  const getBrandAccentClasses = () => {
    const custom = businessSettings?.customTheme; // NEW: Owner dynamic theme
    if (custom) {
      return {
        bg: `bg-[${custom.primary}] hover:brightness-90 text-white`,
        text: `text-[${custom.primary}]`,
        border: `border-[${custom.primary}]/20`,
        ring: `focus:ring-[${custom.primary}]`,
        gradient: `from-[${custom.primary}] to-[${custom.secondary}]`,
        activeBg: `bg-[${custom.primary}]/10 text-[${custom.primary}]`
      };
    }
    const theme = businessSettings?.chosenTheme || 'retail';
    switch (theme) {
      case 'butchery': return { bg: 'bg-red-600 hover:bg-red-700 text-white', text: 'text-red-600', border: 'border-red-200', ring: 'focus:ring-red-500', gradient: 'from-red-600 to-rose-700', activeBg: 'bg-red-50 text-red-700' };
      case 'mitumba': return { bg: 'bg-emerald-600 hover:bg-emerald-700 text-white', text: 'text-emerald-600', border: 'border-emerald-200', ring: 'focus:ring-emerald-500', gradient: 'from-emerald-600 to-teal-700', activeBg: 'bg-emerald-50 text-emerald-700' };
      case 'hardware': return { bg: 'bg-amber-600 hover:bg-amber-700 text-white', text: 'text-amber-600', border: 'border-amber-200', ring: 'focus:ring-amber-500', gradient: 'from-amber-600 to-orange-700', activeBg: 'bg-amber-50 text-amber-700' };
      case 'cyber': return { bg: 'bg-purple-600 hover:bg-purple-700 text-white', text: 'text-purple-600', border: 'border-purple-200', ring: 'focus:ring-purple-500', gradient: 'from-purple-600 to-fuchsia-700', activeBg: 'bg-purple-50 text-purple-700' };
      default: return { bg: 'bg-blue-600 hover:bg-blue-700 text-white', text: 'text-blue-600', border: 'border-blue-200', ring: 'focus:ring-blue-500', gradient: 'from-blue-600 to-indigo-700', activeBg: 'bg-blue-50 text-blue-700' };
    }
  };

  const brand = getBrandAccentClasses();
  const themeBg = isDarkMode? 'bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900';
  const themeBorder = isDarkMode? 'border-zinc-800' : 'border-zinc-200';

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

  const userRole = activeUser?.role || 'CASHIER';
  const filteredNavItems = navigationItems.filter(item => {
    if (userRole === 'OWNER') return true;
    if (userRole === 'MANAGER') return item.role!== 'OWNER';
    return item.role === 'CASHIER';
  });

  const getTrialDaysRemaining = () => {
    if (!activeBusiness) return 0;
    const expiry = new Date(activeBusiness.licenseExpiresAt).getTime();
    const diff = expiry - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };
  const trialDays = getTrialDaysRemaining();

  return (
    <div className={`min-h-screen flex-col transition-colors duration-200 ${themeBg}`} id="app-viewport">

      <header className={`sticky top-0 z-40 w-full ${themeBg} border-b ${themeBorder} shadow-sm px-2 sm:px-3 py-2 flex items-center justify-between`} id="app-header">

        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`p-2 -ml-1 hover:bg-zinc-100/10 rounded-lg transition-colors`}
            aria-label={t('tooltip.toggle_menu')}
          >
            {mobileMenuOpen? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <img
            src={businessSettings?.logoUrl || "https://res.cloudinary.com/plj6rk0o/image/upload/v1783949717/og-image_rxcpkm.jpg"}
            alt={t('global.logo_alt')}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg object-cover shadow-md border-zinc-100 flex-shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <h1 className={`text-xs sm:text-sm font-extrabold tracking-tight uppercase flex items-center gap-1.5 leading-none truncate`}>
              {activeBusiness?.tradeName || 'BuzzNa D74'}
            </h1>
            <p className="text-[8px] sm:text-[10px] text-zinc-500 font-mono tracking-wider mt-0.5 uppercase leading-none truncate">
              {businessSettings?.chosenTheme? t('global.vertical').replace('{theme}', t(`verticals.${businessSettings.chosenTheme}`)) : t('global.multi_sector')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {trialDays > 0 && (
            <div className="hidden lg:flex items-center gap-1 bg-amber-50 border-amber-200 px-2 py-1.5 rounded-lg text-amber-800 text-xs font-bold">
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span>{t('global.trial')}: {trialDays} {t('global.days_left')}</span>
            </div>
          )}

          {syncQueueCount > 0? (
            <button
              onClick={handleForceSync}
              className={`hidden sm:flex items-center gap-1 ${brand.activeBg} border ${brand.border} px-2 py-1.5 rounded-lg text-xs font-bold transition-colors`}
              id="header-sync-queue-btn"
              title={t('tooltip.force_sync')}
            >
              <RefreshCw className={`w-3 h-3 flex-shrink-0 ${isSyncing? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{syncQueueCount} {t('global.unsynced')}</span>
            </button>
          ) : (
            <span className="hidden sm:flex items-center gap-1 bg-emerald-50 border-emerald-200 px-2 py-1.5 rounded-lg text-emerald-700 text-xs font-bold">
              <RefreshCw className="w-3 h-3 flex-shrink-0" />
              <span className="hidden md:inline">{t('global.synced')}</span>
            </span>
          )}

          <button
            onClick={toggleNetworkSimulation}
            className={`p-2 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
              isOnline? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
            }`}
            style={{ minWidth: '36px', minHeight: '36px' }}
            title={isOnline? t('tooltip.online') : t('tooltip.offline')}
            id="network-simulator-toggle"
          >
            {isOnline? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4 animate-bounce" />}
          </button>

          <div className="flex bg-zinc-100/10 p-0.5 rounded-lg border border-zinc-200/20" id="lang-switcher">
            <button
              onClick={() => handleLanguageChange('EN')}
              className={`px-2 py-1.5 text-[10px] font-black rounded transition-all cursor-pointer ${language === 'EN'? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-400 hover:text-zinc-600'}`}
              style={{ minHeight: '28px' }}
              title={t('tooltip.switch_en')}
            >
              EN
            </button>
            <button
              onClick={() => handleLanguageChange('SW')}
              className={`px-2 py-1.5 text-[10px] font-black rounded transition-all cursor-pointer ${language === 'SW'? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-400 hover:text-zinc-600'}`}
              style={{ minHeight: '28px' }}
              title={t('tooltip.switch_sw')}
            >
              SW
            </button>
          </div>

          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg ${isDarkMode? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-zinc-100 hover:bg-zinc-200'} border ${themeBorder} transition-all`}
            style={{ minWidth: '36px', minHeight: '36px' }}
            id="theme-display-mode-toggle"
            aria-label={t('tooltip.toggle_theme')}
          >
            {isDarkMode? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="hidden lg:flex flex-col text-right ml-1 pr-2 border-r border-zinc-200/20">
            <span className="text-xs font-bold">{activeUser?.username}</span>
            <span className="text-[10px] text-zinc-500 font-mono tracking-wider">{activeUser?.role}</span>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 text-zinc-500 border border-transparent transition-all flex items-center justify-center"
            style={{ minWidth: '36px', minHeight: '36px' }}
            id="logout-btn"
            title={t('tooltip.logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex-col md:flex-row overflow-hidden">

        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)}>
            <aside className={`w-64 ${themeBg} border-r ${themeBorder} h-full overflow-y-auto flex flex-col py-2 px-2`} onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col gap-1 flex-1">
                {filteredNavItems.map(item => {
                  const IconComp = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${isActive? brand.activeBg + ' font-bold shadow-xs' : 'text-zinc-600 hover:bg-zinc-50/10'}`}
                      style={{ minHeight: '40px' }}
                      id={`sidebar-nav-${item.id}`}
                    >
                      <IconComp className={`w-4 h-4 flex-shrink-0 ${isActive? brand.text : 'text-zinc-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-zinc-400 font-mono flex-col gap-1 pt-3 border-t border-zinc-100/10">
                <div>{t('global.app_version').replace('{version}', '1.0')}</div>
                <div>{t('global.support')}: {businessSettings?.supportEmail || 'support@buzznad74.com'}</div>
              </div>
            </aside>
          </div>
        )}

        <aside className={`hidden md:flex flex-col w-56 lg:w-64 ${themeBg} border-r ${themeBorder} py-2 px-2 overflow-y-auto flex-shrink-0 justify-between`} id="desktop-sidebar">
          <div className="flex flex-col gap-1">
            {filteredNavItems.map(item => {
              const IconComp = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${isActive? brand.activeBg + ' font-bold shadow-xs' : 'text-zinc-600 hover:bg-zinc-50/10'}`}
                  style={{ minHeight: '40px' }}
                  id={`sidebar-nav-${item.id}`}
                >
                  <IconComp className={`w-4 h-4 flex-shrink-0 ${isActive? brand.text : 'text-zinc-400'}`} />
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-zinc-400 font-mono flex-col gap-1 pt-3 border-t border-zinc-100/10">
            <div>{t('global.app_version').replace('{version}', '1.0')}</div>
            <div>{t('global.support')}: {businessSettings?.supportEmail || 'support@buzznad74.com'}</div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-2 sm:p-3 pb-20 md:pb-3" id="primary-content-viewport">
          {children}
        </main>
      </div>

      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 ${themeBg} border-t ${themeBorder} px-1 py-1 shadow-xl flex items-center justify-around`} id="mobile-footer-nav">
        {filteredNavItems.slice(0, 5).map(item => {
          const IconComp = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-all cursor-pointer ${isActive? brand.text + ' font-bold' : 'text-zinc-500 hover:text-zinc-900'}`}
              style={{ minWidth: '44px', minHeight: '44px' }}
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
