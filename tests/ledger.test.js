import test from 'node:test';
import assert from 'node:assert/strict';
import {toMinor,fromMinor,balanceAfterSale,customerBalance,calcProfit,calcStock} from '../src/ledger.js';

test('money converts to integer piastres without floating point drift',()=>{
 assert.equal(toMinor('50000'),5000000);
 assert.equal(toMinor('12.35'),1235);
 assert.equal(fromMinor(1235),12.35);
});
test('rejects negative and non-finite money',()=>{
 assert.throws(()=>toMinor(-1));
 assert.throws(()=>toMinor('abc'));
});
test('sale balance is correct and overpayment is rejected',()=>{
 assert.equal(balanceAfterSale(1200000,700000),500000);
 assert.throws(()=>balanceAfterSale(100,101));
});
test('customer ledger tracks credit sales and later collections',()=>{
 const tx=[{type:'sale',amountMinor:1200000,paidMinor:700000},{type:'sale',amountMinor:500000,paidMinor:0},{type:'payment',amountMinor:200000}];
 assert.equal(customerBalance(0,tx),800000);
 assert.equal(customerBalance(300000,tx),1100000);
});
test('profit equals sales minus cost of goods and expenses',()=>{
 const tx=[{type:'sale',amountMinor:1200000,costMinor:800000},{type:'expense',amountMinor:100000}];
 assert.equal(calcProfit(tx),300000);
});
test('stock increases on purchases and decreases by cost, not sale price',()=>{
 const tx=[{type:'inbound',amountMinor:5000000},{type:'sale',amountMinor:1200000,costMinor:800000}];
 assert.equal(calcStock(0,tx),4200000);
});
test('no sales or expenses means zero profit',()=>assert.equal(calcProfit([{type:'inbound',amountMinor:5000000}]),0));