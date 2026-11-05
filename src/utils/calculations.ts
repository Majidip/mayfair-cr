export interface Bill {
  id: string;
  amount: number;
  bill_date: string;
  shop_id: string;
  booker_id: string;
  business_id?: string;
  notes?: string;
  createdAt?: string;
}

export interface Payment {
  id: string;
  bill_id: string;
  amount: number;
  payment_date: string;
  payment_mode?: string;
  notes?: string;
  createdAt?: string;
}

export interface Shop {
  id: string;
  name: string;
  booker_id: string;
  contact?: string;
  phone?: string;
  address?: string;
  credit_limit?: number;
  credit_enabled?: number;
}

export interface Booker {
  id: string;
  name: string;
  business_id: string;
  business_name?: string;
  phone?: string;
}

export interface Business {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
}

export const computeBillState = (bill: Bill, payments: Payment[] = []) => {
  const total = Number(bill.amount || 0); 
  const paid = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0); 
  const outstanding = Math.max(0, total - paid); 
  const status = paid <= 0 ? 'unpaid' : (paid >= total ? 'paid' : 'partial'); 
  
  return {
    total,
    paid,
    outstanding,
    status
  };
};

export const formatCurrency = (amount: number) => {
  return '₨ ' + Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

export const getDaysOverdue = (billDate: string) => {
  if (!billDate) return 0;
  const bill = new Date(billDate);
  const now = new Date();
  const diffTime = now.getTime() - bill.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};
