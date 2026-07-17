import React, { createContext, useContext, useState, useEffect } from 'react';
import { Business, BusinessSettings, User, VerticalTheme, LicenseStatus } from '../types';
import { db, generateUUID } from '../lib/db';
import { translate } from '../lib/translations';
import { supabase } from '../lib/sync'; // <-- Added Supabase Import

interface AuthContextType {
  activeBusiness: Business | null;
  businessSettings: BusinessSettings | null;
  activeUser: User | null;
  allUsers: User[];
  isDemoMode: boolean;
  onboardingStep: number;
  language: 'EN' | 'SW';
  setLanguage: (lang: 'EN' | 'SW') => Promise<void>;
  t: (key: string) => string;
  login: (username: string, pinOrPass: string) => Promise<boolean>;
  logout: () => void;
  fastSwitchUser: (userId: string, pin: string) => Promise<boolean>;
  registerBusiness: (details: {
    legalName: string;
    tradeName?: string;
    industry: string;
    country: string;
    currency: string;
    language: string;
    timezone: string;
    ownerName: string;
    ownerPhone: string;
    ownerEmail?: string;
    password?: string;
  }) => Promise<void>;
  updateSettings: (settings: Partial<BusinessSettings>) => Promise<void>;
  updateBusiness: (business: Partial<Business>) => Promise<void>;
  setThemeAndColor: (theme: VerticalTheme, color: string) => Promise<void>;
  setOnboardingStep: (step: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(1); // Onboarding wizard step
  
  // Fully Bilingual State Engine (English / Kiswahili)
  const [language, setLanguageState] = useState<'EN' | 'SW'>('EN');

  // Load initial session on startup
  useEffect(() => {
    const loadSession = async () => {
      // Find businesses
      const businesses = await db.getAll<Business>('businesses');
      if (businesses.length > 0) {
        const bus = businesses[0];
        setActiveBusiness(bus);

        // Detect and set business-owner tied language settings
        const preferredLang = localStorage.getItem('preferred_language');
        if (preferredLang === 'SW' || preferredLang === 'EN') {
          setLanguageState(preferredLang);
        } else if (bus.language === 'SW' || bus.language === 'kiswahili' || bus.language?.toUpperCase().includes('SW')) {
          setLanguageState('SW');
        } else {
          setLanguageState('EN');
        }

        // Find settings
        const settings = await db.getById<BusinessSettings>('business_settings', bus.tenantId);
        if (settings) {
          setBusinessSettings(settings);
        }

        // Find users
        const users = await db.getAll<User>('users');
        setAllUsers(users);

        // Check if there was an active user session in localStorage
        const cachedUserId = localStorage.getItem('active_user_id');
        if (cachedUserId) {
          const usr = users.find(u => u.userId === cachedUserId);
          if (usr) {
            setActiveUser(usr);
          }
        }
      }
    };

    // Listen for database changes to sync lists automatically
    const unsubscribe = db.subscribe(loadSession);
    loadSession();

    return () => unsubscribe();
  }, []);

  // Standard Login (Using password check for OWNER, PIN check for cashier/manager)
  const login = async (username: string, pinOrPass: string): Promise<boolean> => {
    const users = await db.getAll<User>('users');
    const matched = users.find(u => u.username.toLowerCase().trim() === username.toLowerCase().trim());
    
    if (matched) {
      // If a password or PIN is registered for this user, strictly verify it
      if (matched.password && matched.password !== pinOrPass) {
        return false;
      }
      setActiveUser(matched);
      localStorage.setItem('active_user_id', matched.userId);
      return true;
    }
    return false;
  };

  // Fast hand-off user state switcher (WebAuthn/PIN simulation)
  const fastSwitchUser = async (userId: string, pin: string): Promise<boolean> => {
    const users = await db.getAll<User>('users');
    const matched = users.find(u => u.userId === userId);
    
    if (matched) {
      if (matched.password && matched.password !== pin) {
        return false;
      }
      setActiveUser(matched);
      localStorage.setItem('active_user_id', matched.userId);
      return true;
    }
    return false;
  };

  const logout = () => {
    setActiveUser(null);
    localStorage.removeItem('active_user_id');
  };

  // Wizard register onboarding
  const registerBusiness = async (details: {
    legalName: string;
    tradeName?: string;
    industry: string;
    country: string;
    currency: string;
    language: string;
    timezone: string;
    ownerName: string;
    ownerPhone: string;
    ownerEmail?: string;
    password?: string;
  }) => {
    const tenantId = generateUUID();

    const newBusiness: Business = {
      tenantId,
      legalName: details.legalName,
      tradeName: details.tradeName || details.legalName,
      industry: details.industry,
      country: details.country,
      currency: details.currency,
      language: details.language,
      timezone: details.timezone,
      licenseStatus: LicenseStatus.TRIAL_ACTIVE,
      licenseExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14-day trial
      createdAt: new Date().toISOString()
    };

    // Determine vertical theme based on industry selection
    let theme: VerticalTheme = VerticalTheme.RETAIL;
    let brandColor = 'indigo';
    const ind = details.industry.toLowerCase();
    
    if (ind.includes('butch') || ind.includes('meat')) {
      theme = VerticalTheme.BUTCHERY;
      brandColor = 'red';
    } else if (ind.includes('mitumba') || ind.includes('cloth') || ind.includes('apparel')) {
      theme = VerticalTheme.MITUMBA;
      brandColor = 'emerald';
    } else if (ind.includes('hard') || ind.includes('cement')) {
      theme = VerticalTheme.HARDWARE;
      brandColor = 'amber';
    } else if (ind.includes('cyber') || ind.includes('internet') || ind.includes('service')) {
      theme = VerticalTheme.CYBER;
      brandColor = 'purple';
    }

    const newSettings: BusinessSettings = {
      tenantId,
      chosenTheme: theme,
      brandColor,
      dailyRevenueTarget: 10000,
      weeklyRevenueTarget: 70000,
      monthlyRevenueTarget: 300000,
      darajaPaybill: '247247',
      darajaTillNumber: '557009'
    };

    const newOwner: User = {
      userId: generateUUID(),
      tenantId,
      role: 'OWNER',
      username: details.ownerName,
      phoneNumber: details.ownerPhone,
      emailAddress: details.ownerEmail,
      isActive: true,
      createdAt: new Date().toISOString(),
      password: details.password
    };

    // DIRECT SUPABASE INTEGRATION (Replaces the broken /api/register-onboarding fetch call)
    
    const { error: bizError } = await supabase.from('businesses').insert([newBusiness]);
    if (bizError) throw new Error(bizError.message || "Failed to initialize business in Cloud.");

    const { error: settingsError } = await supabase.from('business_settings').insert([newSettings]);
    if (settingsError) throw new Error(settingsError.message || "Failed to initialize settings in Cloud.");

    const { error: ownerError } = await supabase.from('users').insert([newOwner]);
    if (ownerError) throw new Error(ownerError.message || "Failed to initialize owner in Cloud.");

    // Commit to local DB (Offline fallback & instantaneous UI)
    await db.put('businesses', newBusiness);
    await db.put('business_settings', newSettings);
    await db.put('users', newOwner);

    // Load newly created state
    setActiveBusiness(newBusiness);
    setBusinessSettings(newSettings);
    setActiveUser(newOwner);
    localStorage.setItem('active_user_id', newOwner.userId);
  };

  const updateSettings = async (settings: Partial<BusinessSettings>) => {
    if (!businessSettings || !activeBusiness) return;
    const nextSettings = { ...businessSettings, ...settings };
    await db.put('business_settings', nextSettings);
    setBusinessSettings(nextSettings);
  };

  const updateBusiness = async (biz: Partial<Business>) => {
    if (!activeBusiness) return;
    const nextBusiness = { ...activeBusiness, ...biz };
    await db.put('businesses', nextBusiness);
    setActiveBusiness(nextBusiness);
  };

  const setThemeAndColor = async (theme: VerticalTheme, color: string) => {
    await updateSettings({ chosenTheme: theme, brandColor: color });
  };

  const setLanguage = async (lang: 'EN' | 'SW') => {
    setLanguageState(lang);
    localStorage.setItem('preferred_language', lang);
    if (activeBusiness) {
      const updatedBus = { ...activeBusiness, language: lang };
      await db.put('businesses', updatedBus);
      setActiveBusiness(updatedBus);
    }
  };

  const t = (key: string) => {
    return translate(language, key);
  };

  return (
    <AuthContext.Provider value={{
      activeBusiness,
      businessSettings,
      activeUser,
      allUsers,
      isDemoMode,
      onboardingStep,
      language,
      setLanguage,
      t,
      login,
      logout,
      fastSwitchUser,
      registerBusiness,
      updateSettings,
      updateBusiness,
      setThemeAndColor,
      setOnboardingStep
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
