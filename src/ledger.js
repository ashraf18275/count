// All monetary values are integer piastres to avoid floating-point drift.
export const toMinor = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('المبلغ يجب أن يكون رقمًا موجبًا أو صفرًا');
  return Math.round((n + Number.EPSILON) * 100);
};
export const fromMinor = minor => minor / 100;
export const balanceAfterSale = (saleMinor, paidMinor) => {
  if (!Number.isSafeInteger(saleMinor) || !Number.isSafeInteger(paidMinor) || saleMinor < 0 || paidMinor < 0 || paidMinor > saleMinor) throw new Error('بيانات البيع أو السداد غير صحيحة');
  return saleMinor - paidMinor;
};
export const customerBalance = (openingMinor, transactions) => transactions.reduce((balance, tx) => {
  if (tx.type === 'sale') return balance + tx.amountMinor - tx.paidMinor;
  if (tx.type === 'payment') return balance - tx.amountMinor;
  if (tx.type === 'credit') return balance - tx.amountMinor;
  return balance;
}, openingMinor);
export const calcProfit = transactions => transactions.reduce((sum, tx) => {
  if (tx.type === 'sale') return sum + tx.amountMinor - tx.costMinor;
  if (tx.type === 'expense') return sum - tx.amountMinor;
  return sum;
}, 0);
export const calcStock = (openingMinor, transactions) => transactions.reduce((sum, tx) => {
  if (tx.type === 'inbound') return sum + tx.amountMinor;
  if (tx.type === 'sale') return sum - tx.costMinor;
  if (tx.type === 'stock_adjustment') return sum + tx.amountMinor;
  return sum;
}, openingMinor);