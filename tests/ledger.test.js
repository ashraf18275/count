import test from 'node:test';
import assert from 'node:assert/strict';
import {toMinor,fromMinor,balanceAfterSale,customerBalance,supplierBalance,calcProfit,calcStock,buildCustomerLedger,buildSupplierLedger} from '../src/ledger.js';
import {filterTransactionsByDateRange,summarizePeriod} from '../src/reporting.js';
test('money converts to integer piastres without floating point drift',()=>{assert.equal(toMinor('50000'),5000000);assert.equal(toMinor('12.35'),1235);assert.equal(fromMinor(1235),12.35);});
test('rejects negative and non-finite money',()=>{assert.throws(()=>toMinor(-1));assert.throws(()=>toMinor('abc'));});
test('sale balance allows overpayment and represents customer credit as a negative balance',()=>{assert.equal(balanceAfterSale(1200000,700000),500000);assert.equal(balanceAfterSale(100,150),-50);assert.throws(()=>balanceAfterSale(100,-1));});
test('customer ledger tracks credit sales and later collections',()=>{const tx=[{type:'sale',amountMinor:1200000,paidMinor:700000},{type:'sale',amountMinor:500000,paidMinor:0},{type:'payment',amountMinor:200000}];assert.equal(customerBalance(0,tx),800000);assert.equal(customerBalance(300000,tx),1100000);});
test('split cash and bank payments add once to the customer account',()=>{const tx=[{type:'sale',amountMinor:100000,paidMinor:60000,paidCashMinor:40000,paidBankMinor:20000},{type:'payment',amountMinor:30000,paidCashMinor:10000,paidBankMinor:20000}];assert.equal(customerBalance(0,tx),10000);});
test('supplier debt is invoice value minus split payments and later settlements',()=>{const tx=[{type:'inbound',amountMinor:1000000,paidMinor:400000,paidCashMinor:250000,paidBankMinor:150000},{type:'supplier_payment',amountMinor:200000,paidCashMinor:50000,paidBankMinor:150000}];assert.equal(supplierBalance(0,tx),400000);assert.equal(supplierBalance(50000,tx),450000);});
test('supplier statement provides running balances in transaction date order',()=>{const rows=buildSupplierLedger(0,[{type:'supplier_payment',amountMinor:20000,createdAt:'2026-01-02T10:00:00.000Z'},{type:'inbound',amountMinor:100000,paidMinor:30000,createdAt:'2026-01-01T10:00:00.000Z'}]);assert.deepEqual(rows.map(r=>r.balanceMinor),[0,70000,50000]);});
test('profit equals sales minus cost of goods and expenses',()=>{assert.equal(calcProfit([{type:'sale',amountMinor:1200000,costMinor:800000},{type:'expense',amountMinor:100000}]),300000);});
test('stock increases on purchases and decreases by cost, not sale price',()=>{assert.equal(calcStock(0,[{type:'inbound',amountMinor:5000000},{type:'sale',amountMinor:1200000,costMinor:800000}]),4200000);});
test('customer ledger exposes each transaction and cumulative balance',()=>{const rows=buildCustomerLedger(300000,[{type:'sale',amountMinor:1200000,paidMinor:700000,createdAt:'2026-01-01T10:00:00.000Z'},{type:'payment',amountMinor:200000,createdAt:'2026-01-02T10:00:00.000Z'}]);assert.deepEqual(rows.map(r=>r.balanceMinor),[300000,800000,600000]);assert.equal(rows[1].changeMinor,500000);assert.equal(rows[2].changeMinor,-200000);});
test('no sales or expenses means zero profit',()=>assert.equal(calcProfit([{type:'inbound',amountMinor:5000000}]),0));

test('historical customer purchases and later payments remain individually visible with a running balance',()=>{const rows=buildCustomerLedger(0,[{id:'old-1',type:'sale',amountMinor:500000,paidMinor:300000,paidCashMinor:200000,paidVodafoneMinor:100000,paidBankMinor:0,createdAt:'2026-10-01T10:00:00.000Z',note:'فاتورة أولى'},{id:'old-2',type:'sale',amountMinor:300000,paidMinor:150000,paidCashMinor:50000,paidVodafoneMinor:100000,paidBankMinor:0,createdAt:'2026-10-08T10:00:00.000Z',note:'فاتورة ثانية'},{id:'new-pay',type:'payment',amountMinor:50000,paidCashMinor:0,paidVodafoneMinor:50000,paidBankMinor:0,createdAt:'2026-10-09T10:00:00.000Z',note:'تحصيل لاحق'}]);assert.deepEqual(rows.map(r=>r.balanceMinor),[0,200000,350000,300000]);assert.deepEqual(rows.slice(1).map(r=>r.note),['فاتورة أولى','فاتورة ثانية','تحصيل لاحق']);});
test('createId always returns a non-empty key on Android WebView and modern browsers',async()=>{const {createId}=await import('../src/db.js');const id=createId();assert.equal(typeof id,'string');assert.ok(id.length>=8);});

test('sale overpayment first offsets prior customer debt, then creates customer credit if surplus remains',()=>{const oldDebt=200000;assert.equal(customerBalance(oldDebt,[{type:'sale',amountMinor:300000,paidMinor:500000}]),0);assert.equal(customerBalance(100000,[{type:'sale',amountMinor:300000,paidMinor:500000}]),-100000);});
test('customer ledger labels can be derived from positive, negative, and zero running balances',()=>{const rows=buildCustomerLedger(200000,[{type:'sale',amountMinor:300000,paidMinor:500000,createdAt:'2026-10-19T10:00:00.000Z'}]);assert.deepEqual(rows.map(r=>r.balanceMinor),[200000,0]);const credit=buildCustomerLedger(0,[{type:'sale',amountMinor:300000,paidMinor:500000,createdAt:'2026-10-19T10:00:00.000Z'}]);assert.equal(credit[1].balanceMinor,-200000);});

import {quantityToHalfUnits,itemStockHalfUnits,inventoryItems,saleLineTotals,saleInvoiceTotals,normalizeItemName} from '../src/ledger.js';
test('inventory quantities support half pieces and reject invalid fractions',()=>{assert.equal(quantityToHalfUnits(0.5),1);assert.equal(quantityToHalfUnits(2.5),5);assert.throws(()=>quantityToHalfUnits(0.25));assert.throws(()=>quantityToHalfUnits(0));});
test('inventory stock is calculated per item and sales deduct exact half-piece quantities',()=>{const tx=[{id:'i1',type:'inbound',itemName:'شاحن',quantity:4,unitCostMinor:50000,createdAt:'2026-10-01T00:00:00.000Z'},{id:'s1',type:'sale',lineItems:[{itemName:'شاحن',quantity:0.5}],createdAt:'2026-10-02T00:00:00.000Z'}];assert.equal(itemStockHalfUnits(tx,'شاحن'),7);assert.equal(inventoryItems(tx)[0].stockHalfUnits,7);});
test('sale line total and cost are calculated from unit prices and fractional quantity',()=>{assert.deepEqual(saleLineTotals({quantity:0.5,unitPriceMinor:70000,unitCostMinor:50000}),{amountMinor:35000,costMinor:25000});});

test('customer ledger preserves sale item names and half-piece quantities for statement rendering',()=>{const rows=buildCustomerLedger(0,[{id:'sale-half',type:'sale',amountMinor:35000,paidMinor:0,lineItems:[{itemName:'سماعة',quantity:0.5,unitPriceMinor:70000,amountMinor:35000,costMinor:25000}],createdAt:'2026-10-19T10:00:00.000Z'}]);assert.equal(rows[1].lineItems[0].itemName,'سماعة');assert.equal(rows[1].lineItems[0].quantity,0.5);assert.equal(rows[1].lineItems[0].unitPriceMinor,70000);});
test('multi-item invoice totals sum manually priced lines using recorded last-cost snapshots',()=>{assert.deepEqual(saleInvoiceTotals([{quantity:2,unitPriceMinor:10000,unitCostMinor:7000},{quantity:0.5,unitPriceMinor:30000,unitCostMinor:20000}]),{amountMinor:35000,costMinor:24000});});
test('multi-item sale deducts stock independently for each item',()=>{const tx=[{type:'inbound',itemName:'شاحن',quantity:4,createdAt:'2026-10-01T00:00:00.000Z'},{type:'inbound',itemName:'كابل',quantity:3,createdAt:'2026-10-01T00:00:00.000Z'},{type:'sale',lineItems:[{itemName:'شاحن',quantity:1.5},{itemName:'كابل',quantity:0.5}],createdAt:'2026-10-02T00:00:00.000Z'}];assert.equal(itemStockHalfUnits(tx,'شاحن'),5);assert.equal(itemStockHalfUnits(tx,'كابل'),5);});
test('sale invoice rejects empty line arrays and zero selling prices',()=>{assert.throws(()=>saleInvoiceTotals([]));assert.throws(()=>saleInvoiceTotals([{quantity:1,unitPriceMinor:0,unitCostMinor:10}]));});

test('opening stock contributes to available quantity without increasing financial stock value',()=>{const tx=[{type:'stock_opening',itemName:'سماعة',quantity:3,unitCostMinor:10000,amountMinor:0,createdAt:'2026-10-01T00:00:00.000Z'}];assert.equal(itemStockHalfUnits(tx,'سماعة'),6);assert.equal(inventoryItems(tx)[0].stockHalfUnits,6);assert.equal(calcStock(0,tx),0);});

test('item names normalize repeated whitespace so stock matching is stable',()=>{assert.equal(normalizeItemName('  شاحن   سريع  '),normalizeItemName('شاحن سريع'));});


test('historical sales still affect customer balance but are excluded from stock and profit', async () => {
  const {calcStock,calcProfit,itemStockHalfUnits,customerBalance}=await import('../src/ledger.js');
  const tx=[
    {id:'in-old',type:'inbound',itemName:'شاحن',quantity:4,unitCostMinor:50000,amountMinor:200000,createdAt:'2026-01-01T00:00:00.000Z'},
    {id:'old-sale',type:'sale',historical:true,customerId:'c1',amountMinor:150000,costMinor:0,paidMinor:50000,lineItems:[{itemName:'شاحن',quantity:2,unitPriceMinor:75000,unitCostMinor:0}],createdAt:'2026-01-02T00:00:00.000Z'},
    {id:'new-sale',type:'sale',customerId:'c1',amountMinor:80000,costMinor:40000,paidMinor:0,lineItems:[{itemName:'شاحن',quantity:1,unitPriceMinor:80000,unitCostMinor:40000}],createdAt:'2026-10-19T00:00:00.000Z'}
  ];
  assert.equal(customerBalance(0,tx),180000);
  assert.equal(itemStockHalfUnits(tx,'شاحن'),6);
  assert.equal(calcStock(0,tx),160000);
  assert.equal(calcProfit(tx),40000);
});

test('date-range helper includes both boundaries and summarizes only selected operations',()=>{
 const items=[
  {id:'a',type:'sale',createdAt:'2026-10-01T08:00:00.000Z',amountMinor:10000,costMinor:4000},
  {id:'b',type:'expense',createdAt:'2026-10-15T12:00:00.000Z',amountMinor:2000},
  {id:'c',type:'sale',createdAt:'2026-10-16T00:00:00.000Z',amountMinor:5000,costMinor:2000},
  {id:'d',type:'sale',historical:true,createdAt:'2026-10-10T12:00:00.000Z',amountMinor:9000,costMinor:6000}
 ];
 const period=filterTransactionsByDateRange(items,'2026-10-01','2026-10-15');
 assert.deepEqual(period.map(t=>t.id),['a','b','d']);
 assert.deepEqual(summarizePeriod(period),{sales:19000,saleCost:4000,expenses:2000,purchases:0,customerCollections:0,supplierPayments:0,profit:4000,count:3});
 assert.deepEqual(filterTransactionsByDateRange(items,'2026-10-16','2026-10-01'),[]);
});
