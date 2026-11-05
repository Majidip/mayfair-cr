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
  Clock, 
  AlertCircle, 
  ChevronRight, 
  Phone, 
  MapPin, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Filter, 
  X,
  CreditCard,
  Share2,
  DollarSign,
  TrendingUp,
  FileText
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

type Tab = 'dashboard' | 'shops' | 'quickpay' | 'bills' | 'audit';

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
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  // Search and Filters
  const [shopSearch, setShopSearch] = useState('');
  const [selectedBookerFilter, setSelectedBookerFilter] = useState('ALL');

  // Quick Pay State
  const [payBookerId, setPayBookerId] = useState('');
  const [payShopId, setPayShopId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today());
  const [payMode, setPayMode] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [paySuccessMsg, setPaySuccessMsg] = useState('');

  // Add Bill State
  const [showAddBillModal, setShowAddBillModal] = useState(false);
  const [newBillBookerId, setNewBillBookerId] = useState('');
  const [newBillShopId, setNewBillShopId] = useState('');
  const [newBillAmount, setNewBillAmount] = useState('');
  const [newBillDate, setNewBillDate] = useState(today());
  const [newBillNotes, setNewBillNotes] = useState('');
  const [billSubmitting, setBillSubmitting] = useState(false);

  // Fetch all live data from Supabase
  const loadData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [bizRes, bookersRes, shopsRes, billsRes, paymentsRes] = await Promise.all([
        supabase.from('businesses').select('*').order('name'),
        supabase.from('bookers').select('*').order('name'),
        supabase.from('shops').select('*').order('name'),
        supabase.from('bills').select('*').order('bill_date', { ascending: false }),
        supabase.from('payments').select('*').order('payment_date', { ascending: false })
      ]);

      if (bizRes.data) setBusinesses(bizRes.data);
      if (bookersRes.data) setBookers(bookersRes.data);
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
  }, []);

  useEffect(() => {
    loadData();

    // Auto-refresh every 30 seconds for live background sync
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Derived stats
  const stats = useMemo(() => {
    let totalOutstanding = 0;
    let totalBilled = 0;
    let totalPaid = 0;

    bills.forEach(b => {
      const bPayments = payments.filter(p => p.bill_id === b.id);
      const s = computeBillState(b, bPayments);
      totalOutstanding += s.outstanding;
      totalBilled += s.total;
      totalPaid += s.paid;
    });

    // Today's stats
    const todayStr = today();
    const todayPayments = payments.filter(p => p.payment_date === todayStr);
    const todayCash = todayPayments
      .filter(p => !p.payment_mode || p.payment_mode === 'Cash')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const todayNonCash = todayPayments
      .filter(p => p.payment_mode === 'Return' || p.payment_mode === 'Credit Note')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const todayOnline = todayPayments
      .filter(p => p.payment_mode === 'Online Transfer' || p.payment_mode === 'Cheque')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    return {
      totalOutstanding,
      totalBilled,
      totalPaid,
      todayTotal: todayCash + todayNonCash + todayOnline,
      todayCash,
      todayNonCash,
      todayOnline,
      totalShops: shops.length,
      totalBills: bills.length
    };
  }, [bills, payments, shops]);

  // Shop balances list
  const shopsWithBalance = useMemo(() => {
    return shops.map(shop => {
      const shopBills = bills.filter(b => b.shop_id === shop.id);
      let outstanding = 0;
      let overdueBillsCount = 0;

      shopBills.forEach(b => {
        const bPayments = payments.filter(p => p.bill_id === b.id);
        const s = computeBillState(b, bPayments);
        outstanding += s.outstanding;
        if (s.outstanding > 0 && getDaysOverdue(b.bill_date) > 30) {
          overdueBillsCount++;
        }
      });

      const booker = bookers.find(b => b.id === shop.booker_id);

      return {
        ...shop,
        bookerName: booker ? booker.name : 'Unknown',
        outstanding,
        billsCount: shopBills.length,
        overdueBillsCount
      };
    });
  }, [shops, bills, payments, bookers]);

  // Filtered shops
  const filteredShops = useMemo(() => {
    return shopsWithBalance.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(shopSearch.toLowerCase()) ||
        s.bookerName.toLowerCase().includes(shopSearch.toLowerCase()) ||
        (s.phone && s.phone.includes(shopSearch));
      const matchesBooker = selectedBookerFilter === 'ALL' || s.booker_id === selectedBookerFilter;
      return matchesSearch && matchesBooker;
    }).sort((a, b) => b.outstanding - a.outstanding);
  }, [shopsWithBalance, shopSearch, selectedBookerFilter]);

  // Handle Quick Payment Submit (FIFO distribution across shop bills)
  const handleQuickPaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(payAmount);
    if (!payShopId || isNaN(amountNum) || amountNum <= 0) {
      alert('Please select a shop and enter a valid payment amount.');
      return;
    }

    setPaySubmitting(true);
    try {
      // Find shop's unpaid/partial bills sorted by date ascending (FIFO)
      const shopBills = bills
        .filter(b => b.shop_id === payShopId)
        .sort((a, b) => new Date(a.bill_date).getTime() - new Date(b.bill_date).getTime());

      let remainingAmount = amountNum;
      const newPaymentRecords: any[] = [];

      for (const bill of shopBills) {
        if (remainingAmount <= 0) break;
        const bPayments = payments.filter(p => p.bill_id === bill.id);
        const { outstanding } = computeBillState(bill, bPayments);

        if (outstanding > 0) {
          const allocation = Math.min(remainingAmount, outstanding);
          newPaymentRecords.push({
            id: uid('pay'),
            bill_id: bill.id,
            amount: allocation,
            payment_date: payDate,
            payment_mode: payMode,
            notes: payNotes || null,
            createdAt: now(),
            updatedAt: now()
          });
          remainingAmount -= allocation;
        }
      }

      // If amount still remains (excess advance payment), allocate to most recent bill or first bill
      if (remainingAmount > 0 && shopBills.length > 0) {
        newPaymentRecords.push({
          id: uid('pay'),
          bill_id: shopBills[shopBills.length - 1].id,
          amount: remainingAmount,
          payment_date: payDate,
          payment_mode: payMode,
          notes: (payNotes ? payNotes + ' ' : '') + '(Advance/Excess)',
          createdAt: now(),
          updatedAt: now()
        });
      }

      if (newPaymentRecords.length === 0) {
        alert('This shop has no outstanding bills to allocate to.');
        setPaySubmitting(false);
        return;
      }

      // Insert into Supabase
      const { error } = await supabase.from('payments').insert(newPaymentRecords);
      if (error) throw error;

      setPaySuccessMsg(`✓ Rs. ${amountNum.toLocaleString()} successfully recorded & synced!`);
      setPayAmount('');
      setPayNotes('');
      setTimeout(() => setPaySuccessMsg(''), 4000);
      await loadData();
    } catch (err: any) {
      alert('Failed to save payment: ' + (err.message || err));
    } finally {
      setPaySubmitting(false);
    }
  };

  // Handle Add New Bill
  const handleAddBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(newBillAmount);
    if (!newBillShopId || !newBillBookerId || isNaN(amountNum) || amountNum <= 0) {
      alert('Please fill all required bill fields.');
      return;
    }

    setBillSubmitting(true);
    try {
      const booker = bookers.find(b => b.id === newBillBookerId);
      const newBill = {
        id: uid('bill'),
        shop_id: newBillShopId,
        booker_id: newBillBookerId,
        business_id: booker?.business_id || businesses[0]?.id || 'biz_mayfair',
        amount: amountNum,
        bill_date: newBillDate,
        notes: newBillNotes || null,
        createdAt: now(),
        updatedAt: now()
      };

      const { error } = await supabase.from('bills').insert([newBill]);
      if (error) throw error;

      alert('✓ Bill created and synced to cloud successfully!');
      setShowAddBillModal(false);
      setNewBillAmount('');
      setNewBillNotes('');
      await loadData();
    } catch (err: any) {
      alert('Failed to create bill: ' + (err.message || err));
    } finally {
      setBillSubmitting(false);
    }
  };

  // WhatsApp Share daily recovery report
  const handleShareWhatsApp = () => {
    const todayStr = today();
    const todayPayments = payments.filter(p => p.payment_date === todayStr);
    
    let text = `*📊 MAYFAIR DAILY RECOVERY REPORT*\n`;
    text += `*Date:* ${todayStr}\n`;
    text += `*Total Recovery:* ${formatCurrency(stats.todayTotal)}\n`;
    text += `💵 *Cash Handover:* ${formatCurrency(stats.todayCash)}\n`;
    text += `🔄 *Returns / Adjustments:* ${formatCurrency(stats.todayNonCash)}\n`;
    text += `🏦 *Online / Cheque:* ${formatCurrency(stats.todayOnline)}\n\n`;
    text += `*Total Market Balance:* ${formatCurrency(stats.totalOutstanding)}\n`;
    text += `_Auto-generated via Mayfair Mobile App_`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 max-w-lg mx-auto shadow-2xl relative pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <span className="font-black text-sm text-white tracking-wider">MF</span>
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight leading-tight flex items-center gap-1.5">
              Mayfair Manager
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Mayfair & Treet Cloud Sync</p>
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
            {/* TAB: DASHBOARD */}
            {activeTab === 'dashboard' && (
              <div className="space-y-4">
                {/* Total Outstanding Hero Card */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900/60 via-slate-900 to-slate-900 border border-indigo-500/30 p-5 shadow-xl">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Total Market Outstanding</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">Live</span>
                  </div>
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {formatCurrency(stats.totalOutstanding)}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Total Billed</span>
                      <span className="font-semibold text-slate-200">{formatCurrency(stats.totalBilled)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Total Recovered</span>
                      <span className="font-semibold text-emerald-400">{formatCurrency(stats.totalPaid)}</span>
                    </div>
                  </div>
                </div>

                {/* Today's Recovery Breakdown */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={18} className="text-rose-400" />
                      <h2 className="text-sm font-bold text-slate-200">Today's Collections</h2>
                    </div>
                    <button 
                      onClick={handleShareWhatsApp}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 active:scale-95 transition"
                    >
                      <Share2 size={13} />
                      WhatsApp
                    </button>
                  </div>

                  <div className="text-2xl font-bold text-emerald-400 mb-3">
                    {formatCurrency(stats.todayTotal)}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">💵 Cash</span>
                      <span className="text-xs font-bold text-emerald-300">{formatCurrency(stats.todayCash)}</span>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">🔄 Returns</span>
                      <span className="text-xs font-bold text-amber-300">{formatCurrency(stats.todayNonCash)}</span>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">🏦 Online</span>
                      <span className="text-xs font-bold text-sky-300">{formatCurrency(stats.todayOnline)}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Shortcuts */}
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setActiveTab('quickpay')}
                    className="p-4 rounded-2xl bg-gradient-to-br from-rose-600/20 to-rose-900/10 border border-rose-500/30 flex flex-col items-start gap-2 hover:border-rose-500/50 active:scale-95 transition text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                      <Zap size={20} />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-100 block">Record Payment</span>
                      <span className="text-[11px] text-slate-400">Quick market recovery</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => setShowAddBillModal(true)}
                    className="p-4 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-indigo-900/10 border border-indigo-500/30 flex flex-col items-start gap-2 hover:border-indigo-500/50 active:scale-95 transition text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                      <Plus size={20} />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-100 block">Add New Bill</span>
                      <span className="text-[11px] text-slate-400">Direct invoice entry</span>
                    </div>
                  </button>
                </div>

                {/* Booker Outstanding Summary */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Booker Balances</h3>
                  <div className="space-y-2">
                    {bookers.map(b => {
                      const bookerShops = shopsWithBalance.filter(s => s.booker_id === b.id);
                      const totalBal = bookerShops.reduce((sum, s) => sum + s.outstanding, 0);
                      return (
                        <div 
                          key={b.id}
                          onClick={() => {
                            setSelectedBookerFilter(b.id);
                            setActiveTab('shops');
                          }}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:bg-slate-800/50 active:scale-[0.98] transition cursor-pointer"
                        >
                          <div>
                            <span className="text-sm font-semibold text-slate-200 block">{b.name}</span>
                            <span className="text-[11px] text-slate-400">{bookerShops.length} shops</span>
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

            {/* TAB: SHOPS & LEDGERS */}
            {activeTab === 'shops' && (
              <div className="space-y-3">
                {/* Search & Booker Filter */}
                <div className="space-y-2 sticky top-[57px] z-20 bg-slate-950 pt-1 pb-2">
                  <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Search shop name, phone..."
                      value={shopSearch}
                      onChange={e => setShopSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
                    />
                    {shopSearch && (
                      <button 
                        onClick={() => setShopSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  {/* Horizontal Booker Pills */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    <button
                      onClick={() => setSelectedBookerFilter('ALL')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                        selectedBookerFilter === 'ALL'
                          ? 'bg-rose-500 text-white font-bold'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      All Bookers ({shops.length})
                    </button>
                    {bookers.map(b => (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBookerFilter(b.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                          selectedBookerFilter === b.id
                            ? 'bg-rose-500 text-white font-bold'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shops List */}
                <div className="space-y-2">
                  {filteredShops.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-sm">
                      No shops found matching your search.
                    </div>
                  ) : (
                    filteredShops.map(shop => (
                      <div 
                        key={shop.id}
                        onClick={() => setSelectedShop(shop)}
                        className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 active:scale-[0.99] transition cursor-pointer flex items-center justify-between shadow-sm"
                      >
                        <div className="flex-1 pr-2">
                          <h4 className="text-sm font-bold text-slate-100 leading-tight">{shop.name}</h4>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                            <span>{shop.bookerName}</span>
                            {shop.phone && <span>• {shop.phone}</span>}
                          </div>
                          {shop.overdueBillsCount > 0 && (
                            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-medium">
                              {shop.overdueBillsCount} Overdue Bills
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-extrabold text-rose-400">
                            {formatCurrency(shop.outstanding)}
                          </div>
                          <span className="text-[10px] text-slate-500 font-medium">Balance</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB: QUICK PAY */}
            {activeTab === 'quickpay' && (
              <div className="space-y-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={20} className="text-rose-400" />
                    <div>
                      <h2 className="text-base font-bold text-slate-100">Record Quick Payment</h2>
                      <p className="text-[11px] text-slate-400">Auto-distributes across shop bills FIFO</p>
                    </div>
                  </div>

                  {paySuccessMsg && (
                    <div className="mb-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                      <CheckCircle2 size={16} />
                      {paySuccessMsg}
                    </div>
                  )}

                  <form onSubmit={handleQuickPaySubmit} className="space-y-3.5">
                    {/* Booker Selector */}
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Select Booker</label>
                      <select 
                        value={payBookerId}
                        onChange={e => {
                          setPayBookerId(e.target.value);
                          setPayShopId('');
                        }}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-rose-500 transition"
                      >
                        <option value="">-- All Bookers --</option>
                        {bookers.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Shop Selector */}
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Select Shop *</label>
                      <select 
                        value={payShopId}
                        onChange={e => setPayShopId(e.target.value)}
                        required
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-rose-500 transition"
                      >
                        <option value="">-- Choose Shop --</option>
                        {shopsWithBalance
                          .filter(s => !payBookerId || s.booker_id === payBookerId)
                          .map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.bookerName}) - Bal: {formatCurrency(s.outstanding)}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Payment Amount */}
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Payment Amount (Rs.) *</label>
                      <input 
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={payAmount}
                        onChange={e => setPayAmount(e.target.value)}
                        required
                        className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-lg font-bold text-white focus:outline-none focus:border-rose-500 transition"
                      />
                    </div>

                    {/* Payment Mode */}
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Payment Mode</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['Cash', 'Return', 'Credit Note', 'Online Transfer', 'Cheque'].map(mode => (
                          <button
                            type="button"
                            key={mode}
                            onClick={() => setPayMode(mode)}
                            className={`p-2 rounded-xl text-xs font-bold transition ${
                              payMode === mode
                                ? mode === 'Cash' 
                                  ? 'bg-emerald-600 text-white' 
                                  : mode === 'Return' || mode === 'Credit Note'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-indigo-600 text-white'
                                : 'bg-slate-950 text-slate-400 border border-slate-800'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Payment Date & Notes */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">Date</label>
                        <input 
                          type="date"
                          value={payDate}
                          onChange={e => setPayDate(e.target.value)}
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">Notes</label>
                        <input 
                          type="text"
                          placeholder="Optional reference"
                          value={payNotes}
                          onChange={e => setPayNotes(e.target.value)}
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={paySubmitting}
                      className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-indigo-600 hover:from-rose-600 hover:to-indigo-700 active:scale-95 text-white font-bold text-sm shadow-lg shadow-rose-500/25 transition flex items-center justify-center gap-2"
                    >
                      {paySubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Syncing to Cloud...
                        </>
                      ) : (
                        <>
                          <Zap size={16} />
                          Confirm & Save Payment
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB: BILLS */}
            {activeTab === 'bills' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-200">Recent Bills</h3>
                  <button 
                    onClick={() => setShowAddBillModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold active:scale-95 transition"
                  >
                    <Plus size={14} />
                    New Bill
                  </button>
                </div>

                <div className="space-y-2">
                  {bills.slice(0, 50).map(bill => {
                    const bPayments = payments.filter(p => p.bill_id === bill.id);
                    const state = computeBillState(bill, bPayments);
                    const shop = shops.find(s => s.id === bill.shop_id);
                    const booker = bookers.find(b => b.id === bill.booker_id);

                    return (
                      <div 
                        key={bill.id}
                        className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-2"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-sm font-bold text-slate-100">{shop?.name || 'Unknown Shop'}</span>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {booker?.name} • Date: {bill.bill_date}
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            state.status === 'paid' 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : state.status === 'partial'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}>
                            {state.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-800/80 text-[11px]">
                          <div>
                            <span className="text-slate-500 block">Total</span>
                            <span className="font-bold text-slate-200">{formatCurrency(state.total)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Paid</span>
                            <span className="font-bold text-emerald-400">{formatCurrency(state.paid)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-500 block">Remaining</span>
                            <span className="font-bold text-rose-400">{formatCurrency(state.outstanding)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: AUDIT */}
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
                      <span className="text-slate-400">Today Total Recovery:</span>
                      <span className="font-bold text-white">{formatCurrency(stats.todayTotal)}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-emerald-400">💵 Physical Cash Handover:</span>
                      <span className="font-bold text-emerald-400">{formatCurrency(stats.todayCash)}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-amber-400">🔄 Non-Cash (Returns/Credits):</span>
                      <span className="font-bold text-amber-400">{formatCurrency(stats.todayNonCash)}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-sky-400">🏦 Bank / Online Transfer:</span>
                      <span className="font-bold text-sky-400">{formatCurrency(stats.todayOnline)}</span>
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

      {/* SHOP LEDGER MODAL */}
      {selectedShop && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl animate-slide-up">
            <div className="p-4 border-b border-slate-800 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-base text-white">{selectedShop.name}</h3>
                <p className="text-xs text-slate-400">
                  {bookers.find(b => b.id === selectedShop.booker_id)?.name}
                  {selectedShop.phone && ` • ${selectedShop.phone}`}
                </p>
              </div>
              <button 
                onClick={() => setSelectedShop(null)}
                className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-xs text-slate-400">Outstanding Balance:</span>
                <span className="text-base font-extrabold text-rose-400">
                  {formatCurrency(
                    bills
                      .filter(b => b.shop_id === selectedShop.id)
                      .reduce((sum, b) => {
                        const bPayments = payments.filter(p => p.bill_id === b.id);
                        return sum + computeBillState(b, bPayments).outstanding;
                      }, 0)
                  )}
                </span>
              </div>

              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-1">Bill History</h4>
              
              <div className="space-y-2">
                {bills.filter(b => b.shop_id === selectedShop.id).map(b => {
                  const bPayments = payments.filter(p => p.bill_id === b.id);
                  const state = computeBillState(b, bPayments);
                  return (
                    <div key={b.id} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="font-semibold text-slate-200">Date: {b.bill_date}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          state.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {state.status}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Total: {formatCurrency(state.total)}</span>
                        <span>Paid: {formatCurrency(state.paid)}</span>
                        <span className="font-bold text-rose-400">Bal: {formatCurrency(state.outstanding)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setPayShopId(selectedShop.id);
                  setPayBookerId(selectedShop.booker_id);
                  setSelectedShop(null);
                  setActiveTab('quickpay');
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-indigo-600 text-white font-bold text-sm active:scale-95 transition"
              >
                Pay Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD BILL MODAL */}
      {showAddBillModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl p-4 space-y-3 animate-slide-up">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="font-bold text-base text-white">Create New Bill</h3>
              <button 
                onClick={() => setShowAddBillModal(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddBillSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Select Booker *</label>
                <select 
                  value={newBillBookerId}
                  onChange={e => {
                    setNewBillBookerId(e.target.value);
                    setNewBillShopId('');
                  }}
                  required
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200"
                >
                  <option value="">-- Choose Booker --</option>
                  {bookers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Select Shop *</label>
                <select 
                  value={newBillShopId}
                  onChange={e => setNewBillShopId(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200"
                >
                  <option value="">-- Choose Shop --</option>
                  {shops
                    .filter(s => !newBillBookerId || s.booker_id === newBillBookerId)
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Bill Amount (Rs.) *</label>
                <input 
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={newBillAmount}
                  onChange={e => setNewBillAmount(e.target.value)}
                  required
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-lg font-bold text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Bill Date</label>
                <input 
                  type="date"
                  value={newBillDate}
                  onChange={e => setNewBillDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"
                />
              </div>

              <button
                type="submit"
                disabled={billSubmitting}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-rose-600 font-bold text-white text-sm"
              >
                {billSubmitting ? 'Saving to Cloud...' : 'Create & Sync Bill'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Mobile Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 max-w-lg mx-auto">
        <div className="grid grid-cols-5 py-2 px-1">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              activeTab === 'dashboard' ? 'text-rose-500' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard size={20} />
            <span className="text-[10px] mt-1 font-semibold">Summary</span>
          </button>

          <button 
            onClick={() => setActiveTab('shops')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              activeTab === 'shops' ? 'text-rose-500' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Store size={20} />
            <span className="text-[10px] mt-1 font-semibold">Shops</span>
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
            onClick={() => setActiveTab('bills')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              activeTab === 'bills' ? 'text-rose-500' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt size={20} />
            <span className="text-[10px] mt-1 font-semibold">Bills</span>
          </button>

          <button 
            onClick={() => setActiveTab('audit')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              activeTab === 'audit' ? 'text-rose-500' : 'text-slate-400 hover:text-slate-200'
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
