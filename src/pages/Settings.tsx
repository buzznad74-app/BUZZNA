import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, generateUUID } from '../lib/db';
import { User, VerticalTheme } from '../types';
import { Save, UserPlus, KeyRound, Palette, Sparkles, CreditCard, MailOpen, HelpCircle } from 'lucide-react';
import { validateOfflineKey } from '../lib/license';

export const Settings: React.FC<{ addToast: (text: string, type: 'success' | 'error' | 'info' | 'sync') => void }> = ({ addToast }) => {
  const { activeBusiness, businessSettings, updateSettings, setThemeAndColor, allUsers, activeUser, updateBusiness, language, setLanguage, t } = useAuth();
  
  // Settings Tab Selector
  const [activeTab, setActiveTab] = useState<'branding' | 'financials' | 'daraja' | 'team' | 'billing'>('branding');

  // Theme states
  const [theme, setTheme] = useState<VerticalTheme>(businessSettings?.chosenTheme || VerticalTheme.RETAIL);
  const [brandColor, setBrandColor] = useState(businessSettings?.brandColor || 'indigo');

  // Revenue Target States
  const [dailyTarget, setDailyTarget] = useState(businessSettings?.dailyRevenueTarget || 10000);
  const [weeklyTarget, setWeeklyTarget] = useState(businessSettings?.weeklyRevenueTarget || 70000);
  const [monthlyTarget, setMonthlyTarget] = useState(businessSettings?.monthlyRevenueTarget || 300000);
  const [eodTime, setEodTime] = useState(businessSettings?.eodTime || '21:00');

  // Daraja credentials states
  const [paybill, setPaybill] = useState(businessSettings?.darajaPaybill || '');
  const [tillNumber, setTillNumber] = useState(businessSettings?.darajaTillNumber || '');
  const [encryptedKey, setEncryptedKey] = useState('●●●●●●●●●●●●●●●●●●●●●●●●●●●●');

  // New team member states
  const [newUname, setNewUname] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<'MANAGER' | 'CASHIER'>('CASHIER');
  const [newPass, setNewPass] = useState('');

  // Paystack Billing phone & email
  const [billingPhone, setBillingPhone] = useState('');
  const [billingEmail, setBillingEmail] = useState(activeUser?.emailAddress || '');
  const [isInitializingPayment, setIsInitializingPayment] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [offlineKey, setOfflineKey] = useState('');

  // Verify Paystack payment on mount/redirect
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('payment');
    const reference = params.get('reference');

    if (mode === 'verify' && reference) {
      const verifyPayment = async () => {
        setIsVerifyingPayment(true);
        setActiveTab('billing'); // force active tab to billing
        try {
          const res = await fetch(`/api/billing/paystack/verify/${reference}`);
          const data = await res.json();
          if (res.ok && data.success) {
            // Success! Fully activate standard subscription license
            await updateBusiness({
              licenseStatus: 'FULLY_ACTIVATED' as any,
              licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
            });
            addToast('Congratulations! Your SaaS annual subscription is fully activated. System unlocked.', 'success');
          } else {
            addToast(data.message || 'Licensing transaction verification failed. Please try again.', 'error');
          }
        } catch (err: any) {
          console.error("Payment verification failure:", err);
          addToast('Could not complete billing verification. Safe mode fallback active.', 'error');
        } finally {
          setIsVerifyingPayment(false);
          // Clean search parameters to prevent duplicate verification triggers
          const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
          window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        }
      };
      verifyPayment();
    }
  }, []);

  // Handle saving visual brand settings
  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setThemeAndColor(theme, brandColor);
      addToast('Branding updated! Interactive visual elements compiled.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Branding update failed.', 'error');
    }
  };

  // Handle saving operational targets
  const handleSaveFinancials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        dailyRevenueTarget: Number(dailyTarget),
        weeklyRevenueTarget: Number(weeklyTarget),
        monthlyRevenueTarget: Number(monthlyTarget),
        eodTime: eodTime
      });
      addToast('Operational revenue targets updated.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Financial targets update failed.', 'error');
    }
  };

  // Save encrypted Safaricom credentials
  const handleSaveDarajaKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        darajaPaybill: paybill,
        darajaTillNumber: tillNumber
      });
      addToast('Daraja direct merchant configurations sealed.', 'success');
    } catch (err: any) {
      addToast('Direct payment setup failed.', 'error');
    }
  };

  // Invite new team member
  const handleInviteTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUname || !newPhone || !newPass) {
      addToast('Name, phone number, and access PIN are required for team invitation.', 'error');
      return;
    }

    try {
      if (!activeBusiness) return;
      
      const newStaff: User = {
        userId: generateUUID(),
        tenantId: activeBusiness.tenantId,
        role: newRole,
        username: newUname,
        phoneNumber: newPhone,
        password: newPass,
        isActive: true,
        createdAt: new Date().toISOString()
      };

      await db.put('users', newStaff);
      addToast(`Invitation transmitted! Staff member ${newUname} registered with access PIN.`, 'success');
      
      // Reset states
      setNewUname('');
      setNewPhone('');
      setNewPass('');
    } catch (err) {
      addToast('Failed to add team member.', 'error');
    }
  };

  // Paystack standard checkout trigger
  const handleTriggerPaystack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingEmail) {
      addToast('Please provide your billing email address.', 'error');
      return;
    }

    setIsInitializingPayment(true);
    try {
      // Direct dynamic callback url resolution
      const callbackUrl = window.location.origin + window.location.pathname + "?payment=verify";
      
      const response = await fetch("/api/billing/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: billingEmail,
          amount: 14999, // KES 14,999
          callbackUrl,
          tenantId: activeBusiness?.tenantId
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize Paystack transaction.');
      }

      if (data.success && data.authorization_url) {
        if (data.mock) {
          addToast('PAYSTACK_SECRET_KEY not configured. Diverting to sandbox mockup payment flow.', 'info');
        } else {
          addToast('Redirecting securely to Paystack Checkout gateway...', 'success');
        }
        
        // Redirect to Paystack
        setTimeout(() => {
          window.location.href = data.authorization_url;
        }, 1200);
      } else {
        addToast('Paystack checkout initialization returned invalid signature.', 'error');
      }
    } catch (err: any) {
      console.error(err);
      addToast(err.message || 'Paystack handshake failed.', 'error');
    } finally {
      setIsInitializingPayment(false);
    }
  };

  const handleOfflineActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;
    
    if (!offlineKey.trim()) {
      addToast('Please enter an offline activation key.', 'error');
      return;
    }

    const isValid = validateOfflineKey(activeBusiness.legalName, offlineKey);
    if (isValid) {
      await updateBusiness({
        licenseStatus: 'FULLY_ACTIVATED' as any,
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
      });
      addToast('Congratulations! Offline license verification successful. System unlocked!', 'success');
      setOfflineKey('');
    } else {
      addToast('Invalid offline activation key signature for this business legal name.', 'error');
    }
  };

  return (
    <div className="space-y-6" id="settings-view">
      
      {/* Title & metadata bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-zinc-950 dark:text-white uppercase tracking-tight">System Settings & Personalization</h2>
          <p className="text-xs text-zinc-500 mt-1">Govern multi-tenant roles, brand visual themes, and merchant integrations</p>
        </div>
      </div>

      {/* Settings Grid Frame */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Horizontal Nav Bar */}
        <div className="lg:col-span-1 flex flex-col gap-1">
          <button
            onClick={() => setActiveTab('branding')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide cursor-pointer text-left transition-all ${
              activeTab === 'branding' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            }`}
            style={{ minHeight: '44px' }}
          >
            <Palette className="w-4 h-4 shrink-0" />
            <span>Visual Branding</span>
          </button>

          <button
            onClick={() => setActiveTab('financials')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide cursor-pointer text-left transition-all ${
              activeTab === 'financials' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            }`}
            style={{ minHeight: '44px' }}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Targets & EOD</span>
          </button>

          <button
            onClick={() => setActiveTab('daraja')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide cursor-pointer text-left transition-all ${
              activeTab === 'daraja' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            }`}
            style={{ minHeight: '44px' }}
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>M-Pesa Gateway</span>
          </button>

          <button
            onClick={() => setActiveTab('team')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide cursor-pointer text-left transition-all ${
              activeTab === 'team' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            }`}
            style={{ minHeight: '44px' }}
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span>Staff Roles</span>
          </button>

          <button
            onClick={() => setActiveTab('billing')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide cursor-pointer text-left transition-all ${
              activeTab === 'billing' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            }`}
            style={{ minHeight: '44px' }}
          >
            <CreditCard className="w-4 h-4 shrink-0" />
            <span>SaaS Subscription</span>
          </button>
        </div>

        {/* Content pane */}
        <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xs">
          
          {activeTab === 'branding' && (
            /* BRAND & THEME CUSTOMIZATION */
            <form onSubmit={handleSaveBranding} className="space-y-6">
              <div>
                <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white uppercase tracking-wider mb-2">Visual branding configuration</h3>
                <p className="text-xs text-zinc-500">Choose your industry vertical. The core visual elements (headings, colors, layout structures) update immediately across all terminal screens.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Industry Profile Preset</label>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as VerticalTheme)}
                    className="w-full px-3 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                  >
                    <option value="retail">General Retail Blue Preset</option>
                    <option value="butchery">Butchery Red Preset</option>
                    <option value="mitumba">Mitumba Apparel Emerald Preset</option>
                    <option value="hardware">Hardware / Agrovet Amber Preset</option>
                    <option value="cyber">Cyber Services Purple Preset</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Brand Color Accent</label>
                  <select
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                  >
                    <option value="indigo">Indigo Corporate</option>
                    <option value="red">Carnelian Red</option>
                    <option value="emerald">Vibrant Emerald</option>
                    <option value="amber">Warm Amber</option>
                    <option value="purple">Cosmic Purple</option>
                    <option value="blue">Safaricom Blue</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                <div className="max-w-md space-y-2">
                  <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">System Language (Lugha ya Mfumo)</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'EN' | 'SW')}
                    className="w-full px-3 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                  >
                    <option value="EN">Simple English (Simple English)</option>
                    <option value="SW">Kiswahili Rahisi (Simple Swahili)</option>
                  </select>
                  <p className="text-[10px] text-zinc-400">Setting ties system-wide dashboard and POS controls to the chosen language for all cashiers and terminal operators.</p>
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider py-3 px-6 rounded-xl cursor-pointer"
                style={{ minHeight: '44px' }}
              >
                <Save className="w-4 h-4" />
                <span>Save Brand Theme</span>
              </button>
            </form>
          )}

          {activeTab === 'financials' && (
            /* TARGETS & EOD */
            <form onSubmit={handleSaveFinancials} className="space-y-6">
              <div>
                <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white uppercase tracking-wider mb-2">Targets & automated EOD dispatch</h3>
                <p className="text-xs text-zinc-500">Configure your business revenue targets. The system compiles visual dashboards automatically based on these parameters.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Daily Sales Target (KES)</label>
                  <input
                    type="number"
                    value={dailyTarget}
                    onChange={(e) => setDailyTarget(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Weekly Target (KES)</label>
                  <input
                    type="number"
                    value={weeklyTarget}
                    onChange={(e) => setWeeklyTarget(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Monthly Target (KES)</label>
                  <input
                    type="number"
                    value={monthlyTarget}
                    onChange={(e) => setMonthlyTarget(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Automatic EOD Email Hour (Nairobi time)</label>
                  <input
                    type="time"
                    value={eodTime}
                    onChange={(e) => setEodTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider py-3 px-6 rounded-xl cursor-pointer"
                style={{ minHeight: '44px' }}
              >
                <Save className="w-4 h-4" />
                <span>Save Targets</span>
              </button>
            </form>
          )}

          {activeTab === 'daraja' && (
            /* DARAJA MPESA ENVELOPE */
            <form onSubmit={handleSaveDarajaKeys} className="space-y-6">
              <div>
                <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white uppercase tracking-wider mb-2">Safaricom Daraja API merchant credentials</h3>
                <p className="text-xs text-zinc-500">Provide keys to route direct payments directly into your merchant bank/till ledger. Your keys are cryptographically encrypted locally on other terminals.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Daraja Till Number (Lipa Na M-Pesa)</label>
                  <input
                    type="text"
                    value={tillNumber}
                    onChange={(e) => setTillNumber(e.target.value)}
                    placeholder="e.g., 557009"
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Daraja Paybill Shortcode (Option)</label>
                  <input
                    type="text"
                    value={paybill}
                    onChange={(e) => setPaybill(e.target.value)}
                    placeholder="e.g., 247247"
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-mono"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Daraja Consumer Passkey (Encrypted)</label>
                  <input
                    type="password"
                    value={encryptedKey}
                    onChange={(e) => setEncryptedKey(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider py-3 px-6 rounded-xl cursor-pointer"
                style={{ minHeight: '44px' }}
              >
                <Save className="w-4 h-4" />
                <span>Lock M-Pesa Credentials</span>
              </button>
            </form>
          )}

          {activeTab === 'team' && (
            /* TEAM & RBAC PERMISSIONS */
            <div className="space-y-6">
              <form onSubmit={handleInviteTeam} className="space-y-4">
                <div>
                  <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white uppercase tracking-wider mb-2">Team invitation & role allocation</h3>
                  <p className="text-xs text-zinc-500">Invite new till operator staff members. Assigned roles dictate access limits to dashboards, inventories, and refund sequences.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Full Staff Name</label>
                    <input
                      type="text"
                      required
                      value={newUname}
                      onChange={(e) => setNewUname(e.target.value)}
                      placeholder="e.g., Mwenda Manager"
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Safaricom Mobile Number</label>
                    <input
                      type="tel"
                      required
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="e.g., +254712345678"
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">RBAC Role Authority</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as any)}
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none text-sm"
                    >
                      <option value="CASHIER">Cashier (POS & Checkout Only)</option>
                      <option value="MANAGER">Manager (POS + Product Editor)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">Login PIN / Passcode</label>
                    <input
                      type="password"
                      required
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      placeholder="e.g., 1234"
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 focus:outline-none text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider py-3 px-6 rounded-xl cursor-pointer"
                  style={{ minHeight: '44px' }}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Transmit Invitation Code</span>
                </button>
              </form>

              {/* Active list */}
              <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="font-extrabold text-xs text-zinc-800 dark:text-zinc-200 uppercase tracking-wide mb-3">Active terminal operators directory</h4>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {allUsers.map(user => (
                    <div key={user.userId} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{user.username}</div>
                        <div className="text-xs text-zinc-400 font-mono">{user.phoneNumber}</div>
                      </div>
                      <span className={`text-[10px] font-mono uppercase font-bold px-2 py-1 rounded-md ${
                        user.role === 'OWNER' 
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30' 
                          : user.role === 'MANAGER'
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/30'
                            : 'bg-zinc-50 text-zinc-700 dark:bg-zinc-800'
                      }`}>
                        {user.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            /* PLATFORM SUBSCRIPTION SYSTEM (PAYSTACK STANDARD BILLING) */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                <div>
                  <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white uppercase tracking-wider mb-1">SaaS licensing & billing gateway</h3>
                  <p className="text-xs text-zinc-500">Configure your platform payment. Upgrades are securely handled in real-time via the Paystack gateway.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">License Status:</span>
                  <span className={`text-[10px] font-mono uppercase font-bold px-2.5 py-1 rounded-full ${
                    activeBusiness?.licenseStatus === 'FULLY_ACTIVATED'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30'
                  }`}>
                    {activeBusiness?.licenseStatus || 'TRIAL_ACTIVE'}
                  </span>
                </div>
              </div>

              {isVerifyingPayment ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <div>
                    <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white uppercase tracking-wide">Securing Licensing Signature</h4>
                    <p className="text-xs text-zinc-500 mt-1">Verifying your transaction reference directly with Paystack payment servers...</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Current License Card */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-4">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Current Tier</span>
                      <h4 className="font-extrabold text-base text-zinc-900 dark:text-white mt-1">
                        {activeBusiness?.licenseStatus === 'FULLY_ACTIVATED' ? 'Enterprise License' : '14-Day Free Trial'}
                      </h4>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-4">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Expiration Date</span>
                      <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white mt-1 font-mono">
                        {activeBusiness?.licenseExpiresAt
                          ? new Date(activeBusiness.licenseExpiresAt).toLocaleDateString('en-KE', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })
                          : 'N/A'}
                      </h4>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-4">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Linked Business</span>
                      <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white mt-1 truncate">
                        {activeBusiness?.legalName}
                      </h4>
                    </div>
                  </div>

                  {/* Payment Form Segment */}
                  <div className="bg-zinc-50 dark:bg-zinc-950/80 p-6 rounded-3xl border border-zinc-200/50 dark:border-zinc-800/60 flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-2 max-w-md">
                      <span className="text-[10px] font-mono font-bold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Upgrade System License</span>
                      <h4 className="font-extrabold text-zinc-900 dark:text-white text-lg">Enterprise Core License (1-Year)</h4>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        Unlocks unlimited operator staff terminals, automated EoD email digests, direct Safaricom Daraja Lipa Na M-Pesa api routing, and real-time cloud sync.
                      </p>
                      <div className="flex items-baseline gap-2 pt-1">
                        <span className="text-2xl font-extrabold text-zinc-900 dark:text-white font-mono">KES 14,999</span>
                        <span className="text-xs text-zinc-500 font-normal">/ billing year</span>
                      </div>
                    </div>

                    <form onSubmit={handleTriggerPaystack} className="space-y-4 max-w-sm w-full bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800/60 shadow-sm">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400">Paystack Billing Email Address</label>
                        <input
                          type="email"
                          required
                          value={billingEmail}
                          onChange={(e) => setBillingEmail(e.target.value)}
                          placeholder="e.g., owner@buzzna.com"
                          className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                        />
                        <p className="text-[10px] text-zinc-400">Paystack requires a valid email to deliver payment receipts.</p>
                      </div>

                      <button
                        type="submit"
                        disabled={isInitializingPayment}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2 transition-all"
                        style={{ minHeight: '44px' }}
                      >
                        {isInitializingPayment ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Initializing Gateway...</span>
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4" />
                            <span>Activate Annual License</span>
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                  {/* Offline Failsafe Activation Segment */}
                  <div className="bg-amber-50/45 dark:bg-amber-950/10 p-6 rounded-3xl border border-amber-200/50 dark:border-amber-900/40 flex flex-col md:flex-row md:items-center justify-between gap-8 mt-6">
                    <div className="space-y-2 max-w-md">
                      <span className="text-[10px] font-mono font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider">Offline Resilience Failsafe</span>
                      <h4 className="font-extrabold text-zinc-900 dark:text-white text-base">Manual Offline Activation</h4>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        Operating entirely offline? You can activate your SaaS license with zero municipal network connection using a cryptographic signature matching your business legal name.
                      </p>
                      <div className="pt-2">
                        <a 
                          href="/activation-generator.html" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          <span>Open Standalone Offline License Generator</span>
                          <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900">NEW WINDOW</span>
                        </a>
                      </div>
                    </div>

                    <form onSubmit={handleOfflineActivate} className="space-y-4 max-w-sm w-full bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800/60 shadow-sm">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400">Offline Activation Key</label>
                        <input
                          type="text"
                          required
                          value={offlineKey}
                          onChange={(e) => setOfflineKey(e.target.value)}
                          placeholder="BZN74-XXXXXX-XXXX-XXXX"
                          className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 text-xs font-mono focus:ring-2 focus:ring-amber-500/20 focus:outline-none uppercase tracking-wider text-amber-600 dark:text-amber-400"
                        />
                        <p className="text-[10px] text-zinc-400">Generated for "<b>{activeBusiness?.legalName}</b>"</p>
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2 transition-all"
                        style={{ minHeight: '44px' }}
                      >
                        <KeyRound className="w-4 h-4" />
                        <span>Verify & Activate License</span>
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
};

export default Settings;
