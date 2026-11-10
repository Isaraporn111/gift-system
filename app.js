"use strict";
// Preview-only UI. Supabase RLS remains the authorization boundary.
// Original full admin dashboard features require separate migration.
const C = window.APP_CONFIG || {};
const $ = id => document.getElementById(id);
const e = s => String(s ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const ui = { user:null, profile:null, stock:[], adminProducts:[], editProductId:'TEST-ONLY-001', requests:[], items:[], notes:[], tab:'stock', busy:false, message:'' };
const sbReady = typeof window.supabase?.createClient === 'function' &&
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(C.supabaseUrl || '') &&
  /^sb_publishable_/.test(C.supabasePublishableKey || '') &&
  !C.supabasePublishableKey.includes('REPLACE');
const db = sbReady ? window.supabase.createClient(C.supabaseUrl, C.supabasePublishableKey) : null;
function msg(t, good=true){ui.message=`<div class="notice ${good?'good':'bad'}" role="status">${e(t)}</div>`;render();}
function requireOk(res,where){if(res.error)throw new Error(`${where}: ${res.error.message}`);return res.data;}
function today(){let dt=new Date();dt.setHours(dt.getHours()-dt.getTimezoneOffset()/60);return dt.toISOString().slice(0,10)}
function pretty(iso){return iso?new Date(iso).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'-'}
function showError(err){console.error('[Gift Preview]',err);msg(err?.message||String(err),false)}
function header(){
 $('top').innerHTML=`<div><h1>🎁 เบิกของขวัญ GOT</h1><div class="sub">Supabase Preview • 8-bit</div></div><div class="top-actions">${ui.user?`<span class="pill">${e(ui.profile?.display_name)} • ${e(ui.profile?.role)}</span><button class="btn ghost sm" id="logout">ออกจากระบบ</button>`:''}</div>`;
 const log=$('logout');if(log)log.onclick=async()=>{await db.auth.signOut();ui.user=null;ui.profile=null;ui.stock=[];ui.adminProducts=[];ui.requests=[];ui.items=[];ui.notes=[];ui.tab='stock';ui.message='';render()};
}
function render(){header();
 if(!sbReady){$('nav').innerHTML='';$('view').innerHTML='<div class="card"><h2>ยังไม่ได้ตั้งค่า Supabase</h2><p>เปิดไฟล์ <code>config.js</code> และใส่ Project URL กับ Publishable Key ของโปรเจกต์จริง</p><p class="sub">ใช้เฉพาะ Publishable Key ห้ามใช้ Secret Key</p></div>';return}
 if(!ui.user || !ui.profile){ $('nav').innerHTML='';$('view').innerHTML=`<div class="card form-card"><h2>เข้าสู่ระบบ</h2><form id="login-form"><div class="fld"><label for="email">อีเมล Supabase Auth</label><input id="email" type="email" required autocomplete="username"></div><div class="fld"><label for="password">รหัสผ่าน</label><input id="password" type="password" required autocomplete="current-password"></div><button class="btn" type="submit" ${ui.busy?'disabled':''}>${ui.busy?'กำลังตรวจสอบ...':'เข้าสู่ระบบ'}</button></form>${ui.message}</div>`;
 $('login-form').onsubmit=async ev=>{ev.preventDefault();let em=$('email').value,pass=$('password').value;ui.busy=true;render();try{const d=requireOk(await db.auth.signInWithPassword({email:em,password:pass}),'Login');ui.user=d.user;ui.message='';await loadData()}catch(err){showError(err)}finally{ui.busy=false;render()}};return}
 let isAdmin=ui.profile?.role==='admin';
 const tabs=[['stock','รายการสินค้า'],['mine',isAdmin?'คำขอทั้งหมด':'คำขอของฉัน'],['request','เบิกของทดสอบ']];if(isAdmin){tabs.push(['admin-stock','จัดการสินค้า']);tabs.push(['admin','Admin ทดสอบ']);}
 $('nav').innerHTML=tabs.map(([id,text])=>`<button type="button" data-tab="${id}" aria-selected="${ui.tab===id}">${text}</button>`).join('');
 $('nav').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ui.tab=b.dataset.tab;ui.message='';render()});
 $('view').innerHTML=ui.message+({stock:stockView,mine:requestsView,request:submitView,'admin-stock':adminStockView,admin:adminView}[ui.tab]||stockView)();
 attach();
}
function stockView(){
 let cards=ui.stock.map(g=>`<div class="product-mini"><div class="pxc" style="font-size:32px" aria-hidden="true">🎁</div><strong>${e(g.name)}</strong><div class="sub">รหัส ${e(g.id)}</div><div class="num">${Number(g.qty)} ชิ้น</div><div class="sub">จุดแจ้งเตือน ${Number(g.min_qty)}</div></div>`).join('');
 return `<div class="card"><div class="toolbar"><h2>สต็อกของขวัญ</h2><button class="btn ghost sm" data-refresh>รีเฟรช</button></div><p class="sub">รายการสินค้าของบริษัทที่บัญชีมีสิทธิ์เข้าถึง • ยังไม่ย้ายรูปภาพ</p><div class="product-grid">${cards||'<div class="empty">ยังไม่มีสินค้า</div>'}</div></div>`}
function requestsView(){
 const itemsBy={};ui.items.forEach(it=>(itemsBy[it.request_id]??=[]).push(it));
 const html=ui.requests.map(r=>{let lines=(itemsBy[r.id]||[]).map(it=>`<div class="line"><span>${e(it.gift)} · เบิก ${Number(it.qty)} ชิ้น</span><span>ส่งมอบ ${Number(it.given)} ชิ้น</span></div>`).join('');return `<article class="request-card"><div class="toolbar"><h3>คำขอ #${Number(r.id)} • ${e(r.customer_company)}</h3><span class="pill">${r.cancelled?'ยกเลิกแล้ว':'ยังไม่ยกเลิก'}</span></div><div class="sub">${e(r.name)} / ${e(r.team)} • ต้องการ ${e(r.need)} • สร้างเมื่อ ${pretty(r.created_at)}</div>${lines||'<p class="sub">ไม่มีรายการ</p>'}</article>`}).join('');
 return `<div class="card"><div class="toolbar"><h2>${ui.profile.role==='admin'?'คำขอในบริษัท':'คำขอของฉัน'}</h2><button class="btn ghost sm" data-refresh>รีเฟรช</button></div>${html||'<div class="empty">ยังไม่มีคำขอ</div>'}</div>`}
function submitView(){let test=ui.stock.find(g=>g.id==='TEST-ONLY-001');return `<div class="card"><h2>ทดสอบเบิกสินค้า (Preview)</h2><div class="notice">จำกัดการทดสอบไว้ที่รหัส <b>TEST-ONLY-001</b> เท่านั้น เพื่อไม่แตะสต็อกจริง • ใช้บัญชี Member Test ที่เชื่อมทีม TEST_ONLY</div><p>ยอดปัจจุบัน: <strong>${test?test.qty:'ไม่พบสินค้า TEST-ONLY-001'} ชิ้น</strong></p><form id="submit-form"><div class="field-row"><div><label for="customer">บริษัทผู้รับ (ทดสอบ)</label><input id="customer" required value="GOT - TEST ONLY" maxlength="120"></div><div><label for="need">วันที่ต้องการรับ</label><input id="need" type="date" required min="${today()}" value="${today()}"></div></div><button class="btn" type="submit" ${!test||test.qty<1||ui.busy||ui.profile.role==='admin'?'disabled':''}>เบิก TEST-ONLY-001 จำนวน 1 ชิ้น</button>${ui.profile.role==='admin'?'<p class="sub">ทดสอบเบิกด้วยบัญชี Member Test เท่านั้น</p>':''}</form></div>`}
// Admin stock manager. The database RLS, not this UI, enforces admin writes.
// Product deletion is deliberately unsupported, so historical request references remain valid.
function adminStockView(){
  if(ui.profile?.role!=='admin')return '<div class="card"><h2>ไม่มีสิทธิ์เข้าถึง</h2></div>';
  const all=ui.adminProducts;
  const selected=all.find(p=>p.id===ui.editProductId)||all[0];
  if(selected)ui.editProductId=selected.id;
  const options=all.map(p=>`<option value="${e(p.id)}" ${selected&&p.id===selected.id?'selected':''}>${e(p.id)} — ${e(p.name)}${p.active?'':' (ปิดใช้งาน)'}</option>`).join('');
  const table=all.map(p=>`<tr><td><strong>${e(p.id)}</strong></td><td>${e(p.name)}</td><td>${Number(p.qty)}</td><td>${Number(p.min_qty)}</td><td>${p.active?'เปิด':'ปิด'}</td><td><button class="btn ghost sm" type="button" data-select-stock="${e(p.id)}">เลือกแก้ไข</button></td></tr>`).join('');
  return `<div class="card">
    <div class="toolbar"><h2>Admin: จัดการสินค้าและสต็อก</h2><button class="btn ghost sm" data-refresh>รีเฟรช</button></div>
    <div class="notice">⚠️ แม้เป็น Preview แต่การบันทึกจะเปลี่ยนข้อมูลใน Supabase จริงทันที เริ่มทดลองกับ <b>TEST-ONLY-001</b> เท่านั้นก่อน และอย่า Merge เข้า main</div>
    <div class="scroll"><table><thead><tr><th>รหัส</th><th>สินค้า</th><th>คงเหลือ</th><th>จุดเตือน</th><th>สถานะ</th><th></th></tr></thead><tbody>${table||'<tr><td colspan="6">ไม่มีสินค้า</td></tr>'}</tbody></table></div>
  </div>
  <div class="card">
    <h2>เพิ่มสินค้าใหม่</h2>
    <form id="admin-add-product">
      <div class="field-row">
        <div><label for="new-product-id">รหัสสินค้า (ห้ามซ้ำ)</label><input id="new-product-id" required placeholder="TEST-ONLY-002" maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9_-]*"></div>
        <div><label for="new-product-name">ชื่อสินค้า</label><input id="new-product-name" required maxlength="120" placeholder="สินค้าทดสอบใหม่"></div>
        <div><label for="new-product-qty">จำนวนเริ่มต้น</label><input id="new-product-qty" type="number" min="0" max="1000000" step="1" required value="0"></div>
        <div><label for="new-product-min">จุดแจ้งเตือน</label><input id="new-product-min" type="number" min="0" max="1000000" step="1" required value="0"></div>
      </div>
      <button type="submit" class="btn" ${ui.busy?'disabled':''}>+ เพิ่มสินค้า</button>
    </form>
  </div>
  <div class="card">
    <h2>แก้ไขสินค้า / ปรับสต็อก</h2>
    ${selected?`<div class="fld"><label for="product-editor-select">เลือกสินค้าที่ต้องการแก้ไข</label><select id="product-editor-select">${options}</select></div>
    <form id="admin-edit-product">
      <p class="sub">รหัส <strong>${e(selected.id)}</strong> เปลี่ยนไม่ได้ เพื่อรักษาการเชื่อมกับประวัติการเบิก</p>
      <div class="field-row">
        <div><label for="edit-product-name">ชื่อสินค้า</label><input id="edit-product-name" required maxlength="120" value="${e(selected.name)}"></div>
        <div><label for="edit-product-qty">จำนวนคงเหลือ</label><input id="edit-product-qty" required type="number" min="0" max="1000000" step="1" value="${Number(selected.qty)}"></div>
        <div><label for="edit-product-min">จุดแจ้งเตือน</label><input id="edit-product-min" required type="number" min="0" max="1000000" step="1" value="${Number(selected.min_qty)}"></div>
        <div><label for="edit-product-active">สถานะสินค้า</label><select id="edit-product-active"><option value="true" ${selected.active?'selected':''}>เปิดใช้งาน</option><option value="false" ${!selected.active?'selected':''}>ปิดใช้งาน</option></select></div>
      </div>
      <p class="sub">การเปลี่ยนจำนวนจะใช้ตรวจยอดเดิมก่อนบันทึก เพื่อป้องกันการเขียนทับยอดที่เพิ่งถูกเบิกโดยผู้อื่น หากยอดเปลี่ยนระหว่างทำงาน ระบบจะให้รีเฟรชแทน</p>
      <button type="submit" class="btn" ${ui.busy?'disabled':''}>บันทึกการแก้ไข</button>
    </form>`:'<div class="empty">ยังไม่มีสินค้าให้แก้ไข</div>'}
  </div>`;
}
function validateProduct(id,name,qty,minQty){
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(id))throw new Error('รหัสต้องเป็นอักษรอังกฤษ ตัวเลข - หรือ _ ความยาวไม่เกิน 40 ตัว');
  if(!name||name.length>120)throw new Error('กรุณากรอกชื่อสินค้าไม่เกิน 120 อักษร');
  if(!Number.isSafeInteger(qty)||qty<0||qty>1000000||!Number.isSafeInteger(minQty)||minQty<0||minQty>1000000)throw new Error('จำนวนและจุดเตือนต้องเป็นจำนวนเต็ม 0–1,000,000');
}
async function createAdminProduct(ev){
  ev.preventDefault();
  if(ui.profile?.role!=='admin'||ui.busy)return;
  try{
    const id=$('new-product-id').value.trim(), name=$('new-product-name').value.trim();
    const qty=Number($('new-product-qty').value), min_qty=Number($('new-product-min').value);
    validateProduct(id,name,qty,min_qty);
    if(!id.startsWith('TEST-ONLY-')&&!confirm('สินค้านี้ไม่ใช่รหัส TEST-ONLY-*\nยืนยันเพิ่มสินค้าในฐานข้อมูล GOT จริง?'))return;
    if(!confirm(`เพิ่มสินค้า ${id} — ${name} จำนวน ${qty} ชิ้น?`))return;
    ui.busy=true;
    const res=await db.from('products').insert({company_id:ui.profile.company_id,id,name,qty,min_qty,active:true}).select('id').single();
    requireOk(res,'เพิ่มสินค้า');
    ui.editProductId=id;
    await loadData();
    msg(`เพิ่มสินค้า ${id} สำเร็จ`);
  }catch(err){showError(err)}finally{ui.busy=false;render()}
}
async function saveAdminProduct(ev){
  ev.preventDefault();
  if(ui.profile?.role!=='admin'||ui.busy)return;
  try{
    const original=ui.adminProducts.find(p=>p.id===ui.editProductId);
    if(!original)throw new Error('ไม่พบสินค้าที่เลือก กรุณารีเฟรช');
    const name=$('edit-product-name').value.trim();
    const qty=Number($('edit-product-qty').value), min_qty=Number($('edit-product-min').value);
    const active=$('edit-product-active').value==='true';
    validateProduct(original.id,name,qty,min_qty);
    if(name===original.name&&qty===original.qty&&min_qty===original.min_qty&&active===original.active)return msg('ไม่มีข้อมูลเปลี่ยนแปลง');
    if(!original.id.startsWith('TEST-ONLY-')&&!confirm(`⚠️ กำลังแก้สินค้า GOT จริง (${original.id})\nยืนยันจะดำเนินการ?`))return;
    if(!confirm(`ยืนยันแก้ ${original.id}?\nจำนวน: ${original.qty} → ${qty}\nสถานะ: ${original.active?'เปิด':'ปิด'} → ${active?'เปิด':'ปิด'}`))return;
    ui.busy=true;
    const res=await db.from('products')
      .update({name,qty,min_qty,active})
      .eq('company_id',ui.profile.company_id).eq('id',original.id)
      .eq('qty',original.qty).eq('name',original.name)
      .eq('min_qty',original.min_qty).eq('active',original.active)
      .select('id');
    const rows=requireOk(res,'แก้ไขสินค้า')||[];
    if(rows.length!==1)throw new Error('ข้อมูลสินค้าเปลี่ยนระหว่างแก้ไข หรือไม่มีสิทธิ์ กรุณารีเฟรชก่อนลองอีกครั้ง');
    await loadData();
    msg(`บันทึกสินค้า ${original.id} สำเร็จ`);
  }catch(err){showError(err)}finally{ui.busy=false;render()}
}
function adminView(){
 const test=ui.requests.filter(r=>r.team==='TEST_ONLY');const html=test.map(r=>`<div class="request-card"><b>คำขอ #${Number(r.id)}</b> — ${e(r.customer_company)} • ${r.cancelled?'ยกเลิกแล้ว':'ยังไม่ยกเลิก'}<div class="request-actions" style="margin-top:10px"><button class="btn danger sm" data-cancel="${Number(r.id)}" ${r.cancelled||ui.busy?'disabled':''}>ยกเลิกคำขอทดสอบ #${Number(r.id)}</button></div></div>`).join('');
 return `<div class="card"><h2>Admin: ตรวจคำขอและคืนสต็อก</h2><div class="notice">Preview เปิดให้ยกเลิกเฉพาะคำขอทีม TEST_ONLY ที่มีแต่สินค้า TEST-ONLY-001 เท่านั้น (เช็กเพิ่มก่อนเรียก RPC)</div>${html||'<p class="empty">ยังไม่มีคำขอทดสอบ</p>'}<p class="sub">ฟีเจอร์จัดการสินค้าอยู่ที่เมนู “จัดการสินค้า” • ส่วนเพิ่มทีม/ผู้ใช้ Dashboard และส่งมอบ ยังไม่ได้ย้ายเข้าหน้านี้ กรุณาอย่า Merge ไป main</p></div>`}
function attach(){document.querySelectorAll('[data-refresh]').forEach(b=>b.onclick=()=>loadData().catch(showError));
 const add=$('admin-add-product');if(add)add.onsubmit=createAdminProduct;
 const edit=$('admin-edit-product');if(edit)edit.onsubmit=saveAdminProduct;
 const picker=$('product-editor-select');if(picker)picker.onchange=()=>{ui.editProductId=picker.value;render()};
 document.querySelectorAll('[data-select-stock]').forEach(b=>b.onclick=()=>{ui.editProductId=b.dataset.selectStock;render();$('product-editor-select')?.scrollIntoView({behavior:'smooth',block:'center'})});
 const submit=$('submit-form');if(submit)submit.onsubmit=async ev=>{ev.preventDefault();if(ui.profile.role!=='member')return;if(!confirm('ยืนยันสร้างคำขอทดลอง TEST-ONLY-001 จำนวน 1 ชิ้น?'))return;const company=String($('customer').value).trim(), need=$('need').value;if(!company||!need)return showError(new Error('กรุณากรอกบริษัทและวันที่'));ui.busy=true;render();try{const data=requireOk(await db.rpc('gift_submit',{p_customer_company:company,p_need:need,p_items:[{gift:'TEST ONLY - สินค้าทดสอบ',qty:1}]}),'gift_submit');await loadData();msg('สร้างคำขอทดสอบ #'+data.id+' สำเร็จ')}catch(err){showError(err)}finally{ui.busy=false;render()}};
 document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{const id=Number(b.dataset.cancel);try{const r=ui.requests.find(x=>Number(x.id)===id);if(!r||r.cancelled||r.team!=='TEST_ONLY')throw new Error('คำขอไม่ใช่รายการทดสอบ');let its=ui.items.filter(x=>Number(x.request_id)===id);if(!its.length||its.some(x=>x.product_id!=='TEST-ONLY-001'))throw new Error('คำขอนี้มีรายการที่ไม่ใช่สินค้าทดสอบ');if(!confirm('ยืนยันยกเลิกคำขอทดสอบ #'+id+' และคืนสต็อก?'))return;ui.busy=true;render();requireOk(await db.rpc('gift_cancel',{p_request_id:id}),'gift_cancel');await loadData();msg('ยกเลิกคำขอ #'+id+' และคืนสต็อกสำเร็จ')}catch(err){showError(err)}finally{ui.busy=false;render()}})
}
async function loadData(){if(!ui.user)return;const profile=requireOk(await db.from('profiles').select('company_id,display_name,role').eq('id',ui.user.id).single(),'profile');if(!profile)throw new Error('ไม่พบโปรไฟล์');ui.profile=profile;
 if(profile.role!=='admin' && (ui.tab==='admin'||ui.tab==='admin-stock'))ui.tab='stock';
 const company=profile.company_id;
 ui.adminProducts=[];
 if(profile.role==='admin'){
   ui.adminProducts=requireOk(await db.from('products').select('company_id,id,name,qty,min_qty,image_path,active').eq('company_id',company).order('id'),'admin products')||[];
   ui.stock=ui.adminProducts.filter(p=>p.active);
 } else {
   ui.stock=requireOk(await db.from('products').select('company_id,id,name,qty,min_qty,image_path,active').eq('company_id',company).eq('active',true).order('id'),'products')||[];
 }
 ui.requests=requireOk(await db.from('requests').select('id,requester_id,team,name,customer_company,need,handler,cancelled,cancel_at,created_at').eq('company_id',company).order('id',{ascending:false}).limit(100),'requests')||[];
 const ids=ui.requests.map(r=>r.id);
 ui.items=ids.length?requireOk(await db.from('request_items').select('request_id,company_id,product_id,gift,qty,given').in('request_id',ids),'request_items')||[]:[];
 ui.message='';render();
}
async function boot(){if(!sbReady){render();return}try{const res=await db.auth.getUser();if(res.error)throw res.error;if(res.data.user){ui.user=res.data.user;await loadData()}}catch(err){console.warn('Auto session:',err.message)}render()}
boot();
