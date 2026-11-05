import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Store, 
  Zap, 
  Receipt, 
  ShieldCheck, 
  RefreshCw, 
  Search, 
  Plus, 
  CheckCircle2, 
  ChevronRight, 
  X,
  Share2,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Building2,
  Check,
  Save,
  ArrowRight,
  Filter,
  DollarSign,
  ChevronDown,
  Phone,
  Clock,
  Layers
} from 'lucide-react';
import { supabase } from './supabase';
import { 
  Bill, 
  Payment, 
  Shop, 
  Booker, 
  Business, 
  computeBillState, 
  formatCurrency, 
  getDaysOverdue 
} from './utils/calculations';
import { uid, today, now } from './utils/id';

type Tab = 'dashboard' | 'quickpay' | 'quickbills' | 'shops' | 'audit';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Core Data
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [bookers, setBookers] = useState<Booker[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Selected Shop Modal for detailed ledger
  const [selectedShop, setSelectedShop] = useState<(Shop & { outstanding?: number; bookerName?: string }) | null>(null);

  // Search and Filters for Shops tab
  const [shopSearch, setShopSearch] = useState('');
  const [selectedBookerFilter, setSelectedBookerFilter] = useState('ALL');
  const [shopDisplayLimit, setShopDisplayLimit] = useState(40);

  // ==================== BATCH QUICK PAY STATE ====================
  const [payBookerId, setPayBookerId] = useState('');
  const [payDate, setPayDate] = useState(today());
  const [payMode, setPayMode] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [paySearch, setPaySearch] = useState('');
  const [payOnlyDue, setPayOnlyDue] = useState(true);
  
  // Map of shopId -> payment amount string
  const [payAmounts, setPayAmounts] = useState<{ [shopId: string]: string }>({});
  // Map of shopId -> selected specific billId (or 'FIFO')
  const [paySelectedBills, setPaySelectedBills] = useState<{ [shopId: string]: string }>({});
  
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [paySuccessMsg, setPaySuccessMsg] = useState('');

  // ==================== BATCH QUICK BILLS STATE ====================
  const [billBookerId, setBillBookerId] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [billSearch, setBillSearch] = useState('');
  const [billNotes, setBillNotes] = useState('');
  // Map of shopId -> new bill amount string
  const [billAmounts, setBillAmounts] = useState<{ [shopId: string]: string }>({});
  const [billSubmitting, setBillSubmitting] = useState(false);
  const [billSuccessMsg, setBillSuccessMsg] = useState('');

  // Fetch all live data from Supabase
  const loadData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [bizRes, bookersRes, shopsRes, billsRes, paymentsRes] = await Promise.all([
        supabase.from('businesses').select('*').limit(100).order('name'),
        supabase.from('bookers').select('*').limit(100).order('name'),
        supabase.from('shops').select('*').limit(5000).order('name'),
        supabase.from('bills').select('*').limit(20000).order('bill_date', { ascending: false }),
        supabase.from('payments').select('*').limit(25000).order('payment_date', { ascending: false })
      ]);

      if (bizRes.data) setBusinesses(bizRes.data);
      if (bookersRes.data) {
        setBookers(bookersRes.data);
        if (!payBookerId && bookersRes.data.length > 0) {
          setPayBookerId(bookersRes.data[0].id);
        }
        if (!billBookerId && bookersRes.data.length > 0) {
          setBillBookerId(bookersRes.data[0].id);
        }
      }
      if (shopsRes.data) setShops(shopsRes.data);
      if (billsRes.data) setBills(billsRes.data);
      if (paymentsRes.data) setPayments(paymentsRes.data);
      
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSyncTime(nowTime);
    } catch (err) {
      console.error('Failed to sync cloud data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [payBookerId, billBookerId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 25000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Derived stats with 100% PARITY to Desktop DashboardView.tsx
  const stats = useMemo(() => {
    const totalBilled = bills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalOutstanding = Math.max(0, totalBilled - totalPaid);

    const todayStr = today();
    const currentMonth = todayStr.slice(0, 7);

    let activeDatePayments = payments.filter(p => p.payment_date === todayStr);
    let activeRecoveryLabel = 'Daily Recovery (Today)';

    if (activeDatePayments.length === 0 && payments.length > 0) {
      const latestDate = payments[0]?.payment_date || todayStr;
      activeDatePayments = payments.filter(p => p.payment_date === latestDate);
      activeRecoveryLabel = `Daily Recovery (${latestDate})`;
    }

    const dailyCollection = activeDatePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const dailyCash = activeDatePayments
      .filter(p => !p.mode || p.mode.toLowerCase() === 'cash')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const dailyNonCash = activeDatePayments
      .filter(p => p.mode && (p.mode.toLowerCase().includes('return') || p.mode.toLowerCase().includes('credit')))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const dailyOnline = activeDatePayments
      .filter(p => p.mode && (p.mode.toLowerCase().includes('online') || p.mode.toLowerCase().includes('bank') || p.mode.toLowerCase().includes('cheque')))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const monthlyCollection = payments
      .filter(p => p.payment_date && p.payment_date.startsWith(currentMonth))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    let overdueBills = 0;
    bills.forEach(b => {
      const bPayments = payments.filter(p => p.bill_id === b.id);
      const paid = bPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const bal = Number(b.amount || 0) - paid;
      if (bal > 0 && b.due_date && b.due_date < todayStr) {
        overdueBills++;
      }
    });

    return {
      totalOutstanding,
      totalBilled,
      totalPaid,
      dailyCollection,
      dailyCash,
      dailyNonCash,
      dailyOnline,
      monthlyCollection,
      overdueBills,
      activeShops: shops.length,
      totalBills: bills.length,
      activeRecoveryLabel
    };
  }, [bills, payments, shops]);

  // Pre-indexed payments map by billId
  const billPaymentsMap = useMemo(() => {
    const map = new Map<string, Payment[]>();
    payments.forEach(p => {
      if (!map.has(p.bill_id)) map.set(p.bill_id, []);
      map.get(p.bill_id)!.push(p);
    });
    return map;
  }, [payments]);

  // Pre-indexed bills map by shopId
  const shopBillsMap = useMemo(() => {
    const map = new Map<string, Bill[]>();
    bills.forEach(b => {
      if (!map.has(b.shop_id)) map.set(b.shop_id, []);
      map.get(b.shop_id)!.push(b);
    });
    return map;
  }, [bills]);

  // Shop balances map for quick calculations
  const shopBalances = useMemo(() => {
    const map = new Map<string, { outstanding: number; overdueCount: number; billCount: number }>();
    const todayStr = today();

    shops.forEach(shop => {
      const sBills = shopBillsMap.get(shop.id) || [];
      let outstanding = 0;
      let overdueCount = 0;

      sBills.forEach(b => {
        const bPays = billPaymentsMap.get(b.id) || [];
        const state = computeBillState(b, bPays);
        outstanding += state.outstanding;
        if (state.outstanding > 0 && b.due_date && b.due_date < todayStr) {
          overdueCount++;
        }
      });

      map.set(shop.id, { outstanding, overdueCount, billCount: sBills.length });
    });

    return map;
  }, [shops, shopBillsMap, billPaymentsMap]);

  // Shops with enriched balance data
  const shopsWithBalance = useMemo(() => {
    return shops.map(shop => {
      const bInfo = shopBalances.get(shop.id) || { outstanding: 0, overdueCount: 0, billCount: 0 };
      const booker = bookers.find(b => b.id === shop.booker_id);
      return {
        ...shop,
        bookerName: booker ? booker.name : 'Unassigned',
        outstanding: bInfo.outstanding,
        billsCount: bInfo.billCount,
        overdueBillsCount: bInfo.overdueCount
      };
    });
  }, [shops, shopBalances, bookers]);

  // Filtered shops for General Shops tab
  const filteredShops = useMemo(() => {
    return shopsWithBalance.filter(s => {
      const query = shopSearch.trim().toLowerCase();
      const matchesSearch = !query || 
        s.name.toLowerCase().includes(query) ||
        s.bookerName.toLowerCase().includes(query) ||
        (s.contact && s.contact.toLowerCase().includes(query)) ||
        (s.address && s.address.toLowerCase().includes(query));
      const matchesBooker = selectedBookerFilter === 'ALL' || s.booker_id === selectedBookerFilter;
      return matchesSearch && matchesBooker;
    }).sort((a, b) => b.outstanding - a.outstanding);
  }, [shopsWithBalance, shopSearch, selectedBookerFilter]);

  // ==================== BATCH QUICK PAY LOGIC WITH BILL DROPDOWN ====================
  const payBookerShops = useMemo(() => {
    return shopsWithBalance
      .filter(s => s.booker_id === payBookerId)
      .filter(s => !payOnlyDue || s.outstanding > 0)
      .filter(s => {
        const q = paySearch.trim().toLowerCase();
        return !q || s.name.toLowerCase().includes(q) || (s.contact && s.contact.toLowerCase().includes(q));
      })
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [shopsWithBalance, payBookerId, payOnlyDue, paySearch]);

  const payBatchTotal = useMemo(() => {
    return Object.values(payAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  }, [payAmounts]);

  const payBatchCount = useMemo(() => {
    return Object.values(payAmounts).filter(val => (parseFloat(val) || 0) > 0).length;
  }, [payAmounts]);

  // Helper to get pending/due bills for a shop
  const getShopDueBills = useCallback((shopId: string) => {
    const sBills = (shopBillsMap.get(shopId) || [])
      .slice()
      .sort((a, b) => new Date(a.bill_date).getTime() - new Date(b.bill_date).getTime());

    return sBills.map(bill => {
      const bPays = billPaymentsMap.get(bill.id) || [];
      const state = computeBillState(bill, bPays);
      return {
        ...bill,
        ...state
      };
    }).filter(b => b.outstanding > 0);
  }, [shopBillsMap, billPaymentsMap]);

  // Submit Batch Payments (Handles BOTH Specific Bill Allocation and FIFO)
  const handleBatchPaySubmit = async () => {
    if (payBatchCount === 0 || payBatchTotal <= 0) {
      alert('Please enter payment amounts for at least one shop.');
      return;
    }

    setPaySubmitting(true);
    try {
      const allOps: any[] = [];

      for (const [shopId, amountStr] of Object.entries(payAmounts)) {
        const totalPay = parseFloat(amountStr) || 0;
        if (totalPay <= 0) continue;

        const targetBillId = paySelectedBills[shopId];
        const shopDueBills = getShopDueBills(shopId);

        // CASE 1: SPECIFIC BILL SELECTED IN DROPDOWN
        if (targetBillId && targetBillId !== 'FIFO') {
          const specificBill = shopDueBills.find(b => b.id === targetBillId);
          allOps.push({
            id: uid('pay'),
            bill_id: targetBillId,
            amount: totalPay,
            payment_date: payDate,
            mode: payMode,
            ref: (payNotes ? payNotes + ' • ' : '') + `Targeted Bill (${specificBill?.bill_date || ''})`,
            createdAt: now(),
            updatedAt: now()
          });
        } 
        // CASE 2: DEFAULT FIFO (AUTO-DISTRIBUTE ACROSS OLDEST BILLS)
        else {
          let remaining = totalPay;
          for (const bill of shopDueBills) {
            if (remaining <= 0) break;
            const allocation = Math.min(remaining, bill.outstanding);
            allOps.push({
              id: uid('pay'),
              bill_id: bill.id,
              amount: allocation,
              payment_date: payDate,
              mode: payMode,
              ref: payNotes || '',
              createdAt: now(),
              updatedAt: now()
            });
            remaining -= allocation;
          }

          // Excess advance to latest bill
          if (remaining > 0 && shopDueBills.length > 0) {
            allOps.push({
              id: uid('pay'),
              bill_id: shopDueBills[shopDueBills.length - 1].id,
              amount: remaining,
              payment_date: payDate,
              mode: payMode,
              ref: (payNotes ? payNotes + ' ' : '') + '(Advance)',
              createdAt: now(),
              updatedAt: now()
            });
          }
        }
      }

      if (allOps.length === 0) {
        alert('No valid bill allocations could be created.');
        setPaySubmitting(false);
        return;
      }

      const { error } = await supabase.from('payments').insert(allOps);
      if (error) throw error;

      setPaySuccessMsg(`✓ Successfully processed ${payBatchCount} shops (${formatCurrency(payBatchTotal)})!`);
      setPayAmounts({});
      setPaySelectedBills({});
      setTimeout(() => setPaySuccessMsg(''), 5000);
      await loadData();
    } catch (err: any) {
      alert('Failed to save batch payments: ' + (err.message || err));
    } finally {
      setPaySubmitting(false);
    }
  };

  // ==================== BATCH QUICK BILLS LOGIC ====================
  const billBookerShops = useMemo(() => {
    return shopsWithBalance
      .filter(s => s.booker_id === billBookerId)
      .filter(s => {
        const q = billSearch.trim().toLowerCase();
        return !q || s.name.toLowerCase().includes(q) || (s.contact && s.contact.toLowerCase().includes(q));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [shopsWithBalance, billBookerId, billSearch]);

  const billBatchTotal = useMemo(() => {
    return Object.values(billAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  }, [billAmounts]);

  const billBatchCount = useMemo(() => {
    return Object.values(billAmounts).filter(val => (parseFloat(val) || 0) > 0).length;
  }, [billAmounts]);

  const handleBatchBillSubmit = async () => {
    if (billBatchCount === 0 || billBatchTotal <= 0) {
      alert('Please enter bill amounts for at least one shop.');
      return;
    }

    setBillSubmitting(true);
    try {
      const booker = bookers.find(b => b.id === billBookerId);
      const bizId = booker?.business_id || businesses[0]?.id || 'biz_mfl6h6zu_7597';

      const newBills: any[] = [];
      for (const [shopId, val] of Object.entries(billAmounts)) {
        const amount = parseFloat(val) || 0;
        if (amount <= 0) continue;

        newBills.push({
          id: uid('bill'),
          shop_id: shopId,
          booker_id: billBookerId,
          business_id: bizId,
          amount: amount,
          bill_date: billDate,
          due_date: billDate,
          notes: billNotes || '',
          createdAt: now(),
          updatedAt: now()
        });
      }

      const { error } = await supabase.from('bills').insert(newBills);
      if (error) throw error;

      setBillSuccessMsg(`✓ Successfully created ${billBatchCount} bills (${formatCurrency(billBatchTotal)})!`);
      setBillAmounts({});
      setTimeout(() => setBillSuccessMsg(''), 5000);
      await loadData();
    } catch (err: any) {
      alert('Failed to generate bills: ' + (err.message || err));
    } finally {
      setBillSubmitting(false);
    }
  };

  // WhatsApp Share daily recovery report
  const handleShareWhatsApp = () => {
    const todayStr = today();
    let text = `*📊 MAYFAIR DAILY RECOVERY REPORT*\n`;
    text += `*Date:* ${todayStr}\n`;
    text += `*Total Recovery:* ${formatCurrency(stats.dailyCollection)}\n`;
    text += `💵 *Cash Handover:* ${formatCurrency(stats.dailyCash)}\n`;
    text += `🔄 *Returns / Adjustments:* ${formatCurrency(stats.dailyNonCash)}\n`;
    text += `🏦 *Online / Cheque:* ${formatCurrency(stats.dailyOnline)}\n\n`;
    text += `*Total Market Balance:* ${formatCurrency(stats.totalOutstanding)}\n`;
    text += `_Auto-generated via Mayfair Mobile App_`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 max-w-lg mx-auto shadow-2xl relative pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <span className="font-black text-sm text-white tracking-wider">MF</span>
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight leading-tight flex items-center gap-1.5">
              Mayfair Manager
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Mayfair Cloud Live</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={loadData}
            disabled={refreshing}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-slate-300"
            title="Refresh Live Data"
          >
            <RefreshCw size={17} className={refreshing ? 'animate-spin text-rose-400' : ''} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-3">
            <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-slate-400 font-medium">Connecting to Mayfair Cloud...</p>
          </div>
        ) : (
          <>
            {/* ============================================================== */}
            {/* TAB: DASHBOARD (EXACT 100% PARITY TO DESKTOP VIEW)            */}
            {/* ============================================================== */}
            {activeTab === 'dashboard' && (
              <div className="space-y-4">
                {/* 1. TOTAL OUTSTANDING HERO CARD */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900/60 via-slate-900 to-slate-900 border border-indigo-500/40 p-5 shadow-xl">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">TOTAL OUTSTANDING</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">REPORTED</span>
                  </div>
                  <div className="text-3xl font-black text-indigo-400 tracking-tight">
                    {formatCurrency(stats.totalOutstanding)}
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400">
                    OVERALL PORTFOLIO • {stats.activeShops} SHOPS
                  </div>
                </div>

                {/* 2. RECOVERY STATS ROW */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 shadow-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">DAILY RECOVERY</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">REPORTED</span>
                    </div>
                    <div className="text-xl font-extrabold text-emerald-400 my-1">
                      {formatCurrency(stats.dailyCollection)}
                    </div>
                    <span className="text-[10px] text-slate-400 block">{stats.activeRecoveryLabel}</span>
                  </div>

                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 shadow-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">MONTHLY RECOVERY</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-semibold">REPORTED</span>
                    </div>
                    <div className="text-xl font-extrabold text-indigo-400 my-1">
                      {formatCurrency(stats.monthlyCollection)}
                    </div>
                    <span className="text-[10px] text-slate-400 block">MONTH-TO-DATE</span>
                  </div>
                </div>

                {/* 3. OVERDUE & ACTIVE SHOPS ROW */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 shadow-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">OVERDUE BILLS</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-semibold">ACTION</span>
                    </div>
                    <div className="text-xl font-extrabold text-rose-500 my-1">
                      {stats.overdueBills} INVOICES
                    </div>
                    <span className="text-[10px] text-slate-400 block">ACTION REQUIRED</span>
                  </div>

                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 shadow-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">ACTIVE SHOPS</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-semibold">COVERAGE</span>
                    </div>
                    <div className="text-xl font-extrabold text-sky-400 my-1">
                      {stats.activeShops}
                    </div>
                    <span className="text-[10px] text-slate-400 block">NETWORK COVERAGE</span>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setActiveTab('quickpay')}
                    className="p-4 rounded-2xl bg-gradient-to-br from-rose-600/20 to-rose-900/10 border border-rose-500/30 flex flex-col items-start gap-2 hover:border-rose-500/50 active:scale-95 transition text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                      <Zap size={20} />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-100 block">Quick Payments</span>
                      <span className="text-[11px] text-slate-400">Batch market recovery</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => setActiveTab('quickbills')}
                    className="p-4 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-indigo-900/10 border border-indigo-500/30 flex flex-col items-start gap-2 hover:border-indigo-500/50 active:scale-95 transition text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                      <Receipt size={20} />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-100 block">Quick Bills</span>
                      <span className="text-[11px] text-slate-400">Batch invoice generation</span>
                    </div>
                  </button>
                </div>

                {/* Booker Outstanding Summary */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Mayfair Booker Balances</h3>
                  <div className="space-y-2">
                    {bookers.map(b => {
                      const bShops = shopsWithBalance.filter(s => s.booker_id === b.id);
                      const totalBal = bShops.reduce((sum, s) => sum + s.outstanding, 0);
                      return (
                        <div 
                          key={b.id}
                          onClick={() => {
                            setPayBookerId(b.id);
                            setActiveTab('quickpay');
                          }}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:bg-slate-800/50 active:scale-[0.98] transition cursor-pointer"
                        >
                          <div>
                            <span className="text-sm font-semibold text-slate-200 block">{b.name}</span>
                            <span className="text-[11px] text-slate-400">{bShops.length} shops</span>
                          </div>
                          <div className="text-right flex items-center gap-1.5">
                            <span className="text-xs font-bold text-rose-400">{formatCurrency(totalBal)}</span>
                            <ChevronRight size={14} className="text-slate-500" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB: QUICK PAY (BATCH RECOVERY WITH BILL DROPDOWNS)            */}
            {/* ============================================================== */}
            {activeTab === 'quickpay' && (
              <div className="space-y-3">
                {/* Header Card */}
                <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                        <Zap size={17} />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-100">Quick Payments (Batch)</h2>
                        <p className="text-[10px] text-slate-400">Select bill or auto-FIFO distribute</p>
                      </div>
                    </div>
                    {payBatchCount > 0 && (
                      <button
                        onClick={() => {
                          setPayAmounts({});
                          setPaySelectedBills({});
                        }}
                        className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {/* Booker & Date Selector */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Booker</label>
                      <select 
                        value={payBookerId}
                        onChange={e => {
                          setPayBookerId(e.target.value);
                          setPayAmounts({});
                          setPaySelectedBills({});
                        }}
                        className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200"
                      >
                        {bookers.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Date</label>
                      <input 
                        type="date"
                        value={payDate}
                        onChange={e => setPayDate(e.target.value)}
                        className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200"
                      />
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2 scrollbar-none">
                    {['Cash', 'Return', 'Credit Note', 'Online Transfer', 'Cheque'].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayMode(m)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                          payMode === m 
                            ? m === 'Cash' 
                              ? 'bg-emerald-600 text-white' 
                              : m === 'Return' || m === 'Credit Note'
                              ? 'bg-amber-600 text-white'
                              : 'bg-indigo-600 text-white'
                            : 'bg-slate-950 text-slate-400 border border-slate-800'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  {/* Search and Toggle Filter */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input 
                        type="text"
                        placeholder="Search shops..."
                        value={paySearch}
                        onChange={e => setPaySearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500"
                      />
                    </div>
                    <button
                      onClick={() => setPayOnlyDue(!payOnlyDue)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border transition ${
                        payOnlyDue ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      {payOnlyDue ? 'Only Due' : 'All Shops'}
                    </button>
                  </div>
                </div>

                {paySuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 size={16} />
                    {paySuccessMsg}
                  </div>
                )}

                {/* Shops Batch List with Bill Dropdown */}
                <div className="space-y-2.5 pb-20">
                  {payBookerShops.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      No shops found matching filter for this booker.
                    </div>
                  ) : (
                    payBookerShops.map(shop => {
                      const val = payAmounts[shop.id] || '';
                      const hasVal = (parseFloat(val) || 0) > 0;
                      const dueBills = getShopDueBills(shop.id);
                      const selectedBillId = paySelectedBills[shop.id] || 'FIFO';
                      const selectedBillObj = dueBills.find(b => b.id === selectedBillId);

                      return (
                        <div 
                          key={shop.id}
                          className={`p-3.5 rounded-2xl border transition space-y-2.5 ${
                            hasVal 
                              ? 'bg-rose-950/25 border-rose-500/50 shadow-md ring-1 ring-rose-500/20' 
                              : 'bg-slate-900/90 border-slate-800/80 shadow-sm'
                          }`}
                        >
                          {/* Top Row: Shop Name, Due, Amount Input */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0 pr-1">
                              <h4 className="text-xs font-bold text-slate-100 truncate">{shop.name}</h4>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                                <span>Total Due: <strong className="text-rose-400">{formatCurrency(shop.outstanding)}</strong></span>
                                <span>• {dueBills.length} due {dueBills.length === 1 ? 'bill' : 'bills'}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Quick Auto-fill button */}
                              {shop.outstanding > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const fillAmt = selectedBillObj ? selectedBillObj.outstanding : shop.outstanding;
                                    setPayAmounts({ ...payAmounts, [shop.id]: String(fillAmt) });
                                  }}
                                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 active:scale-95 transition"
                                  title="Fill Exact Due Amount"
                                >
                                  {selectedBillObj ? 'Fill Bill' : 'Full Due'}
                                </button>
                              )}

                              {/* Amount input */}
                              <input 
                                type="number"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={val}
                                onChange={e => setPayAmounts({ ...payAmounts, [shop.id]: e.target.value })}
                                className={`w-28 p-2 rounded-xl text-right text-xs font-black outline-none border transition ${
                                  hasVal
                                    ? 'bg-rose-500/20 border-rose-500 text-rose-300 focus:ring-2 focus:ring-rose-500/40'
                                    : 'bg-slate-950 border-slate-800 text-white focus:border-rose-500'
                                }`}
                              />
                            </div>
                          </div>

                          {/* BILL SELECTION DROPDOWN: Which bill to pay against */}
                          {dueBills.length > 0 && (
                            <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-1">
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-semibold flex items-center gap-1">
                                  <Layers size={11} className="text-indigo-400" />
                                  Target Bill:
                                </span>
                                {selectedBillObj && (
                                  <span className="text-rose-400 font-bold">
                                    Bill Due: {formatCurrency(selectedBillObj.outstanding)}
                                  </span>
                                )}
                              </div>

                              <div className="relative">
                                <select
                                  value={selectedBillId}
                                  onChange={e => {
                                    const newBillId = e.target.value;
                                    setPaySelectedBills({ ...paySelectedBills, [shop.id]: newBillId });
                                    // If user changes bill and already entered amount, they can adjust or keep
                                  }}
                                  className={`w-full p-2 pr-7 rounded-xl text-[11px] font-medium appearance-none border transition outline-none ${
                                    selectedBillId !== 'FIFO'
                                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200'
                                      : 'bg-slate-950 border-slate-800 text-slate-300'
                                  }`}
                                >
                                  <option value="FIFO">⚡ Auto FIFO (Settle Oldest Bills First)</option>
                                  {dueBills.map(b => (
                                    <option key={b.id} value={b.id}>
                                      Bill Date: {b.bill_date} • Due: {formatCurrency(b.outstanding)} (Total: {formatCurrency(b.total)})
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Sticky Batch Save Bar */}
                {payBatchCount > 0 && (
                  <div className="fixed bottom-16 left-0 right-0 max-w-lg mx-auto p-3 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex items-center justify-between z-30 shadow-2xl">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">{payBatchCount} Shops Selected</span>
                      <span className="text-base font-black text-rose-400">{formatCurrency(payBatchTotal)}</span>
                    </div>

                    <button
                      onClick={handleBatchPaySubmit}
                      disabled={paySubmitting}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-indigo-600 hover:from-rose-600 hover:to-indigo-700 active:scale-95 text-white font-bold text-xs shadow-lg shadow-rose-500/30 flex items-center gap-2"
                    >
                      {paySubmitting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Saving Batch...
                        </>
                      ) : (
                        <>
                          <Save size={15} />
                          Save Batch ({payBatchCount})
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB: QUICK BILLS (BATCH INVOICE ENTRY)                         */}
            {/* ============================================================== */}
            {activeTab === 'quickbills' && (
              <div className="space-y-3">
                {/* Header Card */}
                <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                        <Receipt size={17} />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-100">Quick Bills (Batch)</h2>
                        <p className="text-[10px] text-slate-400">Generate multiple invoices for booker</p>
                      </div>
                    </div>
                    {billBatchCount > 0 && (
                      <button
                        onClick={() => setBillAmounts({})}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {/* Booker & Bill Date */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Booker</label>
                      <select 
                        value={billBookerId}
                        onChange={e => {
                          setBillBookerId(e.target.value);
                          setBillAmounts({});
                        }}
                        className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200"
                      >
                        {bookers.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Bill Date</label>
                      <input 
                        type="date"
                        value={billDate}
                        onChange={e => setBillDate(e.target.value)}
                        className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200"
                      />
                    </div>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                      type="text"
                      placeholder="Filter shops to invoice..."
                      value={billSearch}
                      onChange={e => setBillSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500"
                    />
                  </div>
                </div>

                {billSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 size={16} />
                    {billSuccessMsg}
                  </div>
                )}

                {/* Shops Batch List */}
                <div className="space-y-2 pb-20">
                  {billBookerShops.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      No shops found for this booker.
                    </div>
                  ) : (
                    billBookerShops.map(shop => {
                      const val = billAmounts[shop.id] || '';
                      const hasVal = (parseFloat(val) || 0) > 0;

                      return (
                        <div 
                          key={shop.id}
                          className={`p-3 rounded-xl border transition flex items-center justify-between gap-2 ${
                            hasVal 
                              ? 'bg-indigo-950/30 border-indigo-500/50 shadow-md' 
                              : 'bg-slate-900/90 border-slate-800/80'
                          }`}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <h4 className="text-xs font-bold text-slate-100 truncate">{shop.name}</h4>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                              <span>Current Balance: <strong className="text-slate-300">{formatCurrency(shop.outstanding)}</strong></span>
                            </div>
                          </div>

                          <div className="w-32">
                            <input 
                              type="number"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={val}
                              onChange={e => setBillAmounts({ ...billAmounts, [shop.id]: e.target.value })}
                              className={`w-full p-2 rounded-xl text-right text-xs font-extrabold outline-none border transition ${
                                hasVal
                                  ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 focus:ring-2 focus:ring-indigo-500/40'
                                  : 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Sticky Batch Bill Save Bar */}
                {billBatchCount > 0 && (
                  <div className="fixed bottom-16 left-0 right-0 max-w-lg mx-auto p-3 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex items-center justify-between z-30 shadow-2xl">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">{billBatchCount} Bills To Generate</span>
                      <span className="text-base font-black text-indigo-400">{formatCurrency(billBatchTotal)}</span>
                    </div>

                    <button
                      onClick={handleBatchBillSubmit}
                      disabled={billSubmitting}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-rose-600 hover:from-indigo-600 hover:to-rose-700 active:scale-95 text-white font-bold text-xs shadow-lg shadow-indigo-500/30 flex items-center gap-2"
                    >
                      {billSubmitting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Generating Batch...
                        </>
                      ) : (
                        <>
                          <Save size={15} />
                          Generate All ({billBatchCount})
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB: SHOPS & LEDGERS (COMPLETELY REDESIGNED & POLISHED)        */}
            {/* ============================================================== */}
            {activeTab === 'shops' && (
              <div className="space-y-3 pb-20">
                {/* Search & Booker Filter Box */}
                <div className="bg-slate-900/95 border border-slate-800/90 rounded-2xl p-3 shadow-md space-y-2.5">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Search shop name, area, phone..."
                      value={shopSearch}
                      onChange={e => {
                        setShopSearch(e.target.value);
                        setShopDisplayLimit(40); // Reset page limit on search
                      }}
                      className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
                    />
                    {shopSearch && (
                      <button 
                        onClick={() => setShopSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Horizontal Booker Filter Bar */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none items-center">
                    <button
                      onClick={() => {
                        setSelectedBookerFilter('ALL');
                        setShopDisplayLimit(40);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                        selectedBookerFilter === 'ALL'
                          ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      All ({shops.length})
                    </button>
                    {bookers.map(b => (
                      <button
                        key={b.id}
                        onClick={() => {
                          setSelectedBookerFilter(b.id);
                          setShopDisplayLimit(40);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                          selectedBookerFilter === b.id
                            ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>

                  {/* Result Count Status */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1 border-t border-slate-800/60">
                    <span>Showing {Math.min(filteredShops.length, shopDisplayLimit)} of {filteredShops.length} shops</span>
                    <span className="text-rose-400 font-semibold">
                      Total: {formatCurrency(filteredShops.reduce((s, sh) => s + sh.outstanding, 0))}
                    </span>
                  </div>
                </div>

                {/* Shops List */}
                <div className="space-y-2">
                  {filteredShops.length === 0 ? (
                    <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/80 text-slate-500 text-xs">
                      No shops found matching your search.
                    </div>
                  ) : (
                    <>
                      {filteredShops.slice(0, shopDisplayLimit).map(shop => (
                        <div 
                          key={shop.id}
                          onClick={() => setSelectedShop(shop)}
                          className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 active:scale-[0.99] transition cursor-pointer flex items-center justify-between shadow-sm"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                            {/* Shop Initial Badge */}
                            <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center font-black text-xs text-rose-400 shrink-0">
                              {shop.name.slice(0, 2).toUpperCase()}
                            </div>

                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-slate-100 truncate leading-tight">{shop.name}</h4>
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                                <span className="text-slate-300 font-medium">{shop.bookerName}</span>
                                {shop.contact && <span className="truncate">• {shop.contact}</span>}
                              </div>
                              {shop.overdueBillsCount > 0 && (
                                <span className="inline-flex items-center gap-1 mt-1 text-[9px] px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold">
                                  <Clock size={10} />
                                  {shop.overdueBillsCount} Overdue
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right flex items-center gap-2 shrink-0">
                            <div>
                              <div className="text-xs font-black text-rose-400">
                                {formatCurrency(shop.outstanding)}
                              </div>
                              <span className="text-[10px] text-slate-500 font-medium">Balance</span>
                            </div>
                            <ChevronRight size={15} className="text-slate-600" />
                          </div>
                        </div>
                      ))}

                      {/* Load More Button */}
                      {filteredShops.length > shopDisplayLimit && (
                        <div className="pt-2 text-center">
                          <button
                            onClick={() => setShopDisplayLimit(prev => prev + 50)}
                            className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 active:scale-95 transition"
                          >
                            Load More Shops ({filteredShops.length - shopDisplayLimit} remaining)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB: AUDIT & REPORTS                                           */}
            {/* ============================================================== */}
            {activeTab === 'audit' && (
              <div className="space-y-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={20} className="text-indigo-400" />
                      <h2 className="text-base font-bold text-slate-100">End-of-Day Audit</h2>
                    </div>
                    <button
                      onClick={handleShareWhatsApp}
                      className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"
                    >
                      <Share2 size={12} />
                      WhatsApp
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-slate-400">{stats.activeRecoveryLabel}:</span>
                      <span className="font-bold text-white">{formatCurrency(stats.dailyCollection)}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-emerald-400">💵 Physical Cash Handover:</span>
                      <span className="font-bold text-emerald-400">{formatCurrency(stats.dailyCash)}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-amber-400">🔄 Non-Cash (Returns/Credits):</span>
                      <span className="font-bold text-amber-400">{formatCurrency(stats.dailyNonCash)}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-sky-400">🏦 Bank / Online Transfer:</span>
                      <span className="font-bold text-sky-400">{formatCurrency(stats.dailyOnline)}</span>
                    </div>
                  </div>
                </div>

                {/* Cloud Status Card */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-xs space-y-2">
                  <span className="font-bold text-slate-300 block">Cloud Status & Sync</span>
                  <div className="flex justify-between text-slate-400">
                    <span>Database:</span>
                    <span className="text-slate-200">Supabase Cloud (Mayfair Schema)</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Business:</span>
                    <span className="text-rose-400 font-bold">Mayfair Only (100% Isolated)</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Total Outstanding:</span>
                    <span className="text-indigo-400 font-bold">{formatCurrency(stats.totalOutstanding)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Last Sync:</span>
                    <span className="text-emerald-400">{lastSyncTime || 'Just now'}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Active Connection:</span>
                    <span className="text-emerald-400 font-semibold">🟢 Encrypted TLS (Worldwide)</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ============================================================== */}
      {/* SHOP LEDGER MODAL DRAWER                                       */}
      {/* ============================================================== */}
      {selectedShop && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl animate-slide-up">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-base text-white">{selectedShop.name}</h3>
                <p className="text-xs text-slate-400">
                  {bookers.find(b => b.id === selectedShop.booker_id)?.name}
                  {selectedShop.contact && ` • ${selectedShop.contact}`}
                  {selectedShop.address && ` • ${selectedShop.address}`}
                </p>
              </div>
              <button 
                onClick={() => setSelectedShop(null)}
                className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {/* Balance Summary Card */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-[11px] text-slate-400 uppercase font-bold block">Outstanding Balance</span>
                  <span className="text-xs text-slate-500">Unsettled credit</span>
                </div>
                <span className="text-lg font-black text-rose-400">
                  {formatCurrency(
                    bills
                      .filter(b => b.shop_id === selectedShop.id)
                      .reduce((sum, b) => {
                        const bPayments = billPaymentsMap.get(b.id) || [];
                        return sum + computeBillState(b, bPayments).outstanding;
                      }, 0)
                  )}
                </span>
              </div>

              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-1">
                Bill by Bill Ledger ({bills.filter(b => b.shop_id === selectedShop.id).length} Bills)
              </h4>
              
              <div className="space-y-2">
                {bills
                  .filter(b => b.shop_id === selectedShop.id)
                  .sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime())
                  .map(b => {
                    const bPayments = billPaymentsMap.get(b.id) || [];
                    const state = computeBillState(b, bPayments);
                    return (
                      <div key={b.id} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-200">Date: {b.bill_date}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            state.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {state.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-800/80 text-[11px]">
                          <div>
                            <span className="text-slate-500 block">Total</span>
                            <span className="font-semibold text-slate-300">{formatCurrency(state.total)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Paid</span>
                            <span className="font-semibold text-emerald-400">{formatCurrency(state.paid)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-500 block">Due</span>
                            <span className="font-black text-rose-400">{formatCurrency(state.outstanding)}</span>
                          </div>
                        </div>

                        {/* List payments for this bill if any */}
                        {bPayments.length > 0 && (
                          <div className="pt-1.5 border-t border-slate-900 space-y-1">
                            <span className="text-[10px] text-slate-500 block font-semibold">Payment History:</span>
                            {bPayments.map(p => (
                              <div key={p.id} className="flex justify-between text-[10px] text-slate-400 bg-slate-900/40 px-2 py-1 rounded">
                                <span>{p.payment_date} ({p.mode || 'Cash'})</span>
                                <span className="text-emerald-400 font-bold">{formatCurrency(p.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Footer Action */}
            <div className="p-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setPayBookerId(selectedShop.booker_id);
                  const bal = shopBalances.get(selectedShop.id)?.outstanding || 0;
                  setPayAmounts({ [selectedShop.id]: String(bal) });
                  setSelectedShop(null);
                  setActiveTab('quickpay');
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-indigo-600 text-white font-bold text-sm active:scale-95 transition"
              >
                Pay in Quick Payments
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Mobile Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 max-w-lg mx-auto">
        <div className="grid grid-cols-5 py-2 px-1">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              activeTab === 'dashboard' ? 'text-rose-500 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard size={20} />
            <span className="text-[10px] mt-1 font-semibold">Summary</span>
          </button>

          <button 
            onClick={() => setActiveTab('quickpay')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              activeTab === 'quickpay' ? 'text-rose-500 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-rose-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-rose-500/30 -mt-3">
              <Zap size={16} />
            </div>
            <span className="text-[10px] mt-0.5 font-semibold">Quick Pay</span>
          </button>

          <button 
            onClick={() => setActiveTab('quickbills')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              activeTab === 'quickbills' ? 'text-rose-500 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt size={20} />
            <span className="text-[10px] mt-1 font-semibold">Quick Bills</span>
          </button>

          <button 
            onClick={() => setActiveTab('shops')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              activeTab === 'shops' ? 'text-rose-500 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Store size={20} />
            <span className="text-[10px] mt-1 font-semibold">Shops</span>
          </button>

          <button 
            onClick={() => setActiveTab('audit')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              activeTab === 'audit' ? 'text-rose-500 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck size={20} />
            <span className="text-[10px] mt-1 font-semibold">Audit</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
