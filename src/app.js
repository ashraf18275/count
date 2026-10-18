import {readAll,transact,put,deleteAll,replaceAll} from './db.js';
import {toMinor,fromMinor,calcProfit,calcStock,customerBalance,balanceAfterSale,buildCustomerLedger} from './ledger.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('ar-EG',{style:'currency',currency:'EGP',maximumFractionDigits:2}).format(fromMinor(n||0));
const dateText=iso=>new Date(iso).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}), now=()=>new Date().toISOString();
let customers=[],transactions=[],toastTimer;
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function balance(c){return customerBalance(c.openingMinor||0,transactions.filter(t=>t.customerId===c.id));}
function record(title,sub,amount,cls){return '<article class="record"><div><strong>'+esc(title)+'</strong><p>'+esc(sub)+'</p></div><span class="amount '+(cls||'')+'">'+money(amount)+'</span></article>';}
function txLabel(t){return ({inbound:'وارد بضاعة',sale:'بيع',expense:'مصروف',payment:'تحصيل',stock_adjustment:'تسوية مخزون'}[t.type]||'معاملة');}
function render(){
 const stock=calcStock(0,transactions),profit=calcProfit(transactions),today=new Date().toISOString().slice(0,10),todayTx=transactions.filter(t=>t.createdAt.slice(0,10)===today);
 $('#stockValue').textContent=money(stock);
 $('#customerDebt').textContent=money(customers.reduce((s,c)=>s+Math.max(0,balance(c)),0));
 $('#todaySales').textContent=money(todayTx.filter(t=>t.type==='sale').reduce((s,t)=>s+t.amountMinor,0));
 $('#todayExpenses').textContent=money(todayTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amountMinor,0));
 $('#netProfit').textContent=money(profit);
 const options='<option value="">اختر العميل</option>'+customers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
 $('#saleCustomer').innerHTML=options; $('#paymentCustomer').innerHTML=options;
 $('#customerList').innerHTML=customers.length?customers.map(c=>'<article class="record"><div><strong>'+esc(c.name)+'</strong><p>الرصيد: '+money(balance(c))+' '+(balance(c)>0?'— عليه':balance(c)<0?'— له':'— متزن')+'</p><p>أضيف في '+dateText(c.createdAt)+'</p><button data-history="'+esc(c.id)+'">عرض كشف الحساب</button></div><span class="amount">'+money(Math.abs(balance(c)))+'</span></article>').join():'<p>لا يوجد عملاء بعد.</p>';
 $('#stockLedger').innerHTML=transactions.filter(t=>['inbound','sale','stock_adjustment'].includes(t.type)).slice().reverse().map(t=>record(txLabel(t),dateText(t.createdAt)+(t.note?' · '+t.note:''),t.type==='sale'?-t.costMinor:t.amountMinor,t.type==='sale'?'negative':'positive')).join('')||'<p>لا توجد حركة مخزون بعد.</p>';
 $('#expenseList').innerHTML=transactions.filter(t=>t.type==='expense').slice().reverse().map(t=>record(t.category,dateText(t.createdAt)+(t.note?' · '+t.note:''),-t.amountMinor,'negative')).join('')||'<p>لا توجد مصروفات بعد.</p>';
 $('#accountsList').innerHTML=customers.length?customers.map(c=>'<article class="record"><div><strong>'+esc(c.name)+'</strong><p>الرصيد الحالي '+(balance(c)>0?'عليه':balance(c)<0?'له':'متزن')+'</p><button data-history="'+esc(c.id)+'">عرض جميع المعاملات</button></div><span class="amount">'+money(Math.abs(balance(c)))+'</span></article>').join(''):'<p>أضف عميلًا لعرض حسابه.</p>';
 $('#reportSummary').innerHTML='<p>قيمة المخزون الحالية: <strong>'+money(stock)+'</strong></p><p>إجمالي المبيعات: <strong>'+money(transactions.filter(t=>t.type==='sale').reduce((s,t)=>s+t.amountMinor,0))+'</strong></p><p>إجمالي تكلفة البضاعة المباعة: <strong>'+money(transactions.filter(t=>t.type==='sale').reduce((s,t)=>s+t.costMinor,0))+'</strong></p><p>إجمالي المصروفات: <strong>'+money(transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amountMinor,0))+'</strong></p><p>صافي الربح المسجل: <strong>'+money(profit)+'</strong></p>';
 $('#allTransactions').innerHTML=transactions.slice().reverse().slice(0,100).map(t=>record(txLabel(t),dateText(t.createdAt)+(t.note?' · '+t.note:''),t.type==='expense'?-t.amountMinor:t.type==='sale'?t.amountMinor:t.amountMinor,t.type==='expense'?'negative':'')).join('')||'<p>لا توجد عمليات بعد.</p>';
}
async function refresh(){[customers,transactions]=await Promise.all([readAll('customers'),readAll('transactions')]);customers.sort((a,b)=>a.name.localeCompare(b.name,'ar'));transactions.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));render();}
function go(page){$$('.page').forEach(p=>p.classList.toggle('active',p.id===page));$$('nav button').forEach(b=>b.classList.toggle('selected',b.dataset.go===page));window.scrollTo({top:0,behavior:'smooth'});}
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('#inboundForm').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.currentTarget),amountMinor=toMinor(f.get('amount'));if(amountMinor<=0)return toast('أدخل قيمة أكبر من صفر');await put('transactions',{id:crypto.randomUUID(),type:'inbound',amountMinor,note:String(f.get('note')||'').trim(),createdAt:now()});e.currentTarget.reset();await refresh();toast('تم حفظ الوارد وتحديث المخزون');}catch(err){toast('تعذر الحفظ: '+err.message);}});
$('#customerForm').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.currentTarget),name=String(f.get('name')).trim();if(!name)return;const exists=customers.some(c=>c.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase());if(exists)return toast('هذا العميل مسجل بالفعل');await put('customers',{id:crypto.randomUUID(),name,openingMinor:toMinor(f.get('opening')||0),createdAt:now()});e.currentTarget.reset();await refresh();toast('تم إضافة العميل');}catch(err){toast('تعذر الحفظ: '+err.message);}});
function updatePreview(){const f=new FormData($('#saleForm'));try{const amount=toMinor(f.get('amount')||0),paid=toMinor(f.get('paid')||0);$('#salePreview').textContent=paid>amount?'تحذير: المدفوع أكبر من قيمة البيع':'المتبقي على العميل: '+money(balanceAfterSale(amount,paid));}catch{$('#salePreview').textContent='راجع قيمة البيع والمبلغ المدفوع';}}
$('#saleForm').addEventListener('input',updatePreview);
$('#saleForm').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.currentTarget),customerId=String(f.get('customerId')),amountMinor=toMinor(f.get('amount')),costMinor=toMinor(f.get('cost')),paidMinor=toMinor(f.get('paid'));if(!customers.some(c=>c.id===customerId))return toast('اختر عميلًا صحيحًا');if(amountMinor<=0)return toast('قيمة البيع يجب أن تكون أكبر من صفر');if(paidMinor>amountMinor)return toast('المبلغ المدفوع لا يمكن أن يتجاوز قيمة البيع');const currentStock=calcStock(0,transactions);if(costMinor>currentStock)return toast('تكلفة البيع أكبر من المخزون المسجل');if(costMinor>amountMinor&&!confirm('تكلفة البضاعة أعلى من سعر البيع. ستُسجّل العملية بخسارة. هل تريد المتابعة؟'))return;await put('transactions',{id:crypto.randomUUID(),type:'sale',customerId,amountMinor,costMinor,paidMinor,note:String(f.get('note')||'').trim(),createdAt:now()});e.currentTarget.reset();updatePreview();await refresh();toast('تم حفظ البيع وتحديث المخزون وحساب العميل');}catch(err){toast('تعذر حفظ البيع: '+err.message);}});
$('#paymentForm').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.currentTarget),customerId=String(f.get('customerId')),amountMinor=toMinor(f.get('amount'));if(!customers.some(c=>c.id===customerId))return toast('اختر عميلًا صحيحًا');if(amountMinor<=0)return toast('أدخل مبلغًا أكبر من صفر');const c=customers.find(x=>x.id===customerId);if(balance(c)<=0)return toast('لا يوجد رصيد مدين على هذا العميل');if(amountMinor>balance(c))return toast('المبلغ أكبر من المديونية الحالية للعميل');await put('transactions',{id:crypto.randomUUID(),type:'payment',customerId,amountMinor,note:String(f.get('note')||'تحصيل من العميل').trim(),createdAt:now()});e.currentTarget.reset();await refresh();toast('تم تسجيل التحصيل وتحديث حساب العميل');}catch(err){toast('تعذر تسجيل التحصيل: '+err.message);}});
$('#expenseForm').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.currentTarget),amountMinor=toMinor(f.get('amount'));if(amountMinor<=0)return toast('أدخل قيمة مصروف أكبر من صفر');await put('transactions',{id:crypto.randomUUID(),type:'expense',amountMinor,category:String(f.get('category')).trim(),note:String(f.get('note')||'').trim(),createdAt:now()});e.currentTarget.reset();await refresh();toast('تم تسجيل المصروف');}catch(err){toast('تعذر تسجيل المصروف: '+err.message);}});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-history]');
 if(!b)return;
 const c=customers.find(x=>x.id===b.dataset.history);
 if(!c)return;
 const rows=buildCustomerLedger(c.openingMinor||0,transactions.filter(t=>t.customerId===c.id));
 let html='<article class="record"><div><strong>كشف حساب: '+esc(c.name)+'</strong><p>الرصيد الافتتاحي: '+money(c.openingMinor||0)+'</p><p>الرصيد الحالي: '+money(balance(c))+' '+(balance(c)>0?'عليه':balance(c)<0?'له':'متزن')+'</p><button id="backAccounts">العودة لقائمة العملاء</button></div></article>';
 for(const row of rows){
   if(row.type==='opening'){
     if(row.amountMinor!==0)html+=record('رصيد افتتاحي','قبل أول معاملة · الرصيد بعد العملية: '+money(row.balanceMinor),row.changeMinor,row.changeMinor>0?'negative':'positive');
     continue;
   }
   let details='';
   if(row.type==='sale')details='قيمة البيع '+money(row.amountMinor)+' · المدفوع '+money(row.paidMinor||0)+' · المتبقي '+money(row.amountMinor-(row.paidMinor||0));
   else if(row.type==='payment')details='تحصيل من العميل';
   else if(row.type==='credit')details='تسوية رصيد';
   html+=record(txLabel(row),dateText(row.createdAt)+' · '+details+(row.note?' · '+row.note:'')+' · الرصيد بعد العملية: '+money(row.balanceMinor),row.changeMinor,row.changeMinor>0?'negative':'positive');
 }
 $('#accountsList').innerHTML=html;
 go('accounts');
 const back=$('#backAccounts');
 if(back)back.addEventListener('click',()=>refresh().then(()=>go('accounts')));
});
$('#exportBtn').addEventListener('click',async()=>{try{const data={format:'tijara-accounting-backup',version:1,exportedAt:now(),customers:await readAll('customers'),transactions:await readAll('transactions'),meta:await readAll('meta')};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tijara-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url);toast('تم تجهيز النسخة الاحتياطية');}catch(err){toast('تعذر التصدير: '+err.message);}});
$('#importFile').addEventListener('change',async e=>{const file=e.target.files&&e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='tijara-accounting-backup'||data.version!==1||!Array.isArray(data.customers)||!Array.isArray(data.transactions))throw new Error('صيغة النسخة غير صحيحة');if(!confirm('سيتم استبدال كل البيانات الحالية بالنسخة المختارة. هل تريد المتابعة؟'))return;await replaceAll(data);await refresh();toast('تمت استعادة النسخة الاحتياطية');}catch(err){toast('تعذر الاستعادة: '+err.message);}finally{e.target.value='';}});
$('#clearBtn').addEventListener('click',async()=>{if(!confirm('سيتم حذف جميع العملاء والعمليات نهائيًا من هذا الجهاز. صدّر نسخة احتياطية أولًا. هل أنت متأكد؟'))return;if(!confirm('تأكيد أخير: حذف كل البيانات؟'))return;try{await deleteAll();await refresh();toast('تم مسح البيانات');}catch(err){toast('تعذر المسح: '+err.message);}});
window.addEventListener('online',()=>$('#connection').textContent='متصل بالإنترنت');window.addEventListener('offline',()=>$('#connection').textContent='يعمل دون إنترنت');
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
refresh().catch(err=>toast('تعذر فتح قاعدة البيانات: '+err.message));
