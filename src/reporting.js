export function dateKey(value){
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))return '';
 return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
export function filterTransactionsByDateRange(transactions,from,to){
 if(!Array.isArray(transactions)||!from||!to||from>to)return [];
 return transactions.filter(tx=>{const day=dateKey(tx.createdAt);return day!==''&&day>=from&&day<=to;});
}
export function summarizePeriod(transactions){
 const sum=(type,field='amountMinor')=>transactions.filter(tx=>tx.type===type).reduce((total,tx)=>total+(Number(tx[field])||0),0);
 const sales=sum('sale');
 const saleCost=transactions.filter(tx=>tx.type==='sale'&&!tx.historical).reduce((total,tx)=>total+(Number(tx.costMinor)||0),0);
 const expenses=sum('expense');
 const purchases=sum('inbound');
 const customerCollections=sum('payment');
 const supplierPayments=sum('supplier_payment');
 const profit=transactions.reduce((total,tx)=>{if(tx.type==='sale')return total+(tx.historical?0:(Number(tx.amountMinor)||0)-(Number(tx.costMinor)||0));if(tx.type==='expense')return total-(Number(tx.amountMinor)||0);return total;},0);
 return {sales,saleCost,expenses,purchases,customerCollections,supplierPayments,profit,count:transactions.length};
}
