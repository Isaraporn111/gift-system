"use strict";
// No-login public form + Supabase Auth for admin only.
// The public Edge Function + RPC, NOT the browser, is the stock mutation boundary.
// UI migration phase 2: original style, filtered queue, catalog gallery, team lists and dashboard.
const C = window.APP_CONFIG || {};
const $ = id => document.getElementById(id);
const e = s => String(s ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const ui = { publicTab:'form', trackCode:'', trackResult:null, trackError:'', trackBusy:false, publicRows:[], teams:[], staff:[], qTeam:'', qPerson:'', qStatus:'pending', dashTest:false, dashTeam:'', dashAll:false, adminExtraError:'', noteError:'', publicPayload:null, publicLocked:false, user:null, profile:null, stock:[], adminProducts:[], editProductId:'TEST-ONLY-001', requests:[], items:[], notes:[], tab:'stock', adminOrderFilter:'all', adminOrderSearch:'', busy:false, message:'', viewMode:'public', showAdminLogin:false, publicData:null, publicError:'', publicBusy:false, publicTeam:'', publicMember:'', publicProduct:'TEST-ONLY-001', publicQty:1, publicNonce:null, publicCaptcha:'', turnstileWidgetId:null, publicResult:null };
const sbReady = typeof window.supabase?.createClient === 'function' &&
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(C.supabaseUrl || '') &&
  /^sb_publishable_/.test(C.supabasePublishableKey || '') &&
  !C.supabasePublishableKey.includes('REPLACE');
const db = sbReady ? window.supabase.createClient(C.supabaseUrl, C.supabasePublishableKey) : null;
function msg(t, good=true){ui.message=`<div class="notice ${good?'good':'bad'}" role="status">${e(t)}</div>`;render();}
function requireOk(res,where){if(res.error)throw new Error(`${where}: ${res.error.message}`);return res.data;}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function pretty(iso){return iso?new Date(iso).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'-'}
function showError(err){console.error('[Gift Preview]',err);msg(err?.message||String(err),false)}
function header(){
 const admin=ui.user&&ui.profile?.role==='admin';
 const publicMode=ui.viewMode==='public';
 $('top').innerHTML=`<div><h1>🎁 เบิกของขวัญ GOT</h1><div class="sub">${e(C.companyName||'Get On Technology')} • Supabase Preview</div></div><div class="top-actions">${admin?`<span class="pill">${e(ui.profile.display_name)} • admin</span>`:''}<button class="btn ghost sm" id="switch-mode">${publicMode?'🔐 เข้าระบบ Admin':'🎁 กลับหน้าเบิก'}</button>${admin&&!publicMode?'<button class="btn ghost sm" id="logout">ออกจากระบบ</button>':''}</div>`;
 $('switch-mode').onclick=()=>{if(ui.busy||ui.publicBusy||ui.trackBusy)return;
   if(ui.publicLocked&&ui.viewMode==='public'){alert('กรุณาตรวจคำขอเดิมก่อนออกจากหน้าเบิก');return;}ui.message='';
   if(ui.viewMode==='public'){
     ui.showAdminLogin=!admin;ui.viewMode='admin';ui.tab='admin-orders';if(admin)loadData().catch(showError);
   } else {ui.viewMode='public';ui.showAdminLogin=false;loadPublicCatalog().catch(showError);}
   render();
 };
 const log=$('logout');if(log)log.onclick=async()=>{if(ui.busy||ui.publicBusy||ui.trackBusy)return;await db.auth.signOut();ui.user=null;ui.profile=null;ui.stock=[];ui.adminProducts=[];ui.requests=[];ui.items=[];ui.notes=[];ui.teams=[];ui.staff=[];ui.tab='admin-orders';ui.message='';ui.viewMode='public';ui.showAdminLogin=false;ui.publicTab='form';ui.trackCode='';ui.trackResult=null;ui.trackError='';render()};
}
function render(){header();
 if(!sbReady){$('nav').innerHTML='';$('view').innerHTML='<div class="card"><h2>ยังไม่ได้ตั้งค่า Supabase</h2><p>เปิดไฟล์ <code>config.js</code> และใส่ Project URL กับ Publishable Key ของโปรเจกต์จริง</p><p class="sub">ใช้เฉพาะ Publishable Key ห้ามใช้ Secret Key</p></div>';return}
 if(ui.viewMode==='public'){
   $('nav').innerHTML=[['form','เบิกของขวัญ'],['track','คำขอของฉัน / การแจ้งเตือน']].map(([id,t])=>`<button data-public-tab="${id}" aria-selected="${ui.publicTab===id}">${t}</button>`).join('');
   $('nav').querySelectorAll('[data-public-tab]').forEach(b=>b.onclick=()=>{if(ui.publicBusy||ui.trackBusy)return;ui.publicTab=b.dataset.publicTab;ui.trackResult=null;ui.trackError='';render()});
   $('view').innerHTML=ui.publicTab==='track'?trackingView():publicView();
   if(ui.publicTab==='track')attachTracking();else attachPublic();return;
 }
 if(!ui.user || ui.profile?.role!=='admin'){
   $('nav').innerHTML='';$('view').innerHTML=`<div class="card form-card"><h2>🔐 เข้าสู่ระบบ Admin</h2><p class="sub">พนักงานทั่วไปไม่ต้อง Login — กด “กลับหน้าเบิก” ด้านบน</p><form id="login-form"><div class="fld"><label for="email">อีเมล Admin (Supabase Auth)</label><input id="email" type="email" required autocomplete="username"></div><div class="fld"><label for="password">รหัสผ่าน Admin</label><input id="password" type="password" required autocomplete="current-password"></div><button class="btn" type="submit" ${ui.busy?'disabled':''}>${ui.busy?'กำลังตรวจสอบ...':'เข้าสู่หลังบ้าน'}</button></form>${ui.message}</div>`;
   $('login-form').onsubmit=async ev=>{
     ev.preventDefault();const em=$('email').value,pass=$('password').value;ui.busy=true;
     try{const d=requireOk(await db.auth.signInWithPassword({email:em,password:pass}),'Login');
       const profile=requireOk(await db.from('profiles').select('company_id,display_name,role').eq('id',d.user.id).single(),'ตรวจสิทธิ์');
       if(profile.role!=='admin'){await db.auth.signOut();throw new Error('บัญชีนี้ไม่มีสิทธิ์ Admin');}
       ui.user=d.user;ui.profile=profile;ui.tab='admin-orders';ui.message='';ui.showAdminLogin=false;await loadData();
     }catch(err){showError(err)}finally{ui.busy=false;render()}
   };return;
 }
 let isAdmin=true;
 const tabs=[['admin-orders','คำขอเบิก'],['admin-stock','จัดการสต็อก'],['people','ทีมและรายชื่อ'],['dash','Dashboard'],['notes','การแจ้งเตือน'+(ui.notes.filter(n=>!n.is_read).length?' ('+ui.notes.filter(n=>!n.is_read).length+')':'')]];
 $('nav').innerHTML=tabs.map(([id,text])=>`<button type="button" data-tab="${id}" aria-selected="${ui.tab===id}">${text}</button>`).join('');
 $('nav').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(ui.busy)return;ui.tab=b.dataset.tab;ui.message='';render()});
 $('view').innerHTML=ui.message+({stock:stockView,mine:requestsView,request:submitView,'admin-stock':adminStockView,'admin-orders':adminOrdersView,people:peopleView,dash:dashView,notes:notesView,admin:adminView}[ui.tab]||stockView)();
 attach();
}
function stockView(){
 let cards=ui.stock.map(g=>`<div class="product-mini"><div class="pxc">${giftThumb(g,64)}</div><strong>${e(g.name)}</strong><div class="sub">รหัส ${e(g.id)}</div><div class="num">${Number(g.qty)} ชิ้น</div><div class="sub">จุดแจ้งเตือน ${Number(g.min_qty)}</div></div>`).join('');
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
  const table=all.map(p=>`<tr><td><div class="admin-stock-thumb">${giftThumb(p,48)}<strong>${e(p.id)}</strong></div>${p.id==='TEST-ONLY-001'?`<div style="margin-top:8px"><label class="btn ghost sm" style="display:inline-block;cursor:pointer">${p.image_path?'เปลี่ยนรูป':'เพิ่มรูปทดสอบ'}<input type="file" accept="image/jpeg,image/png,image/webp" data-photo-id="${e(p.id)}" hidden ${ui.busy?'disabled':''}></label>${p.image_path?` <button class="btn ghost sm" data-photo-remove="${e(p.id)}">เอารูปออก</button>`:''}</div>`:''}</td><td>${e(p.name)}</td><td>${Number(p.qty)}</td><td>${Number(p.min_qty)}</td><td>${p.active?'เปิด':'ปิด'}</td><td><button class="btn ghost sm" type="button" data-select-stock="${e(p.id)}">เลือกแก้ไข</button></td></tr>`).join('');
  return `<div class="card">
    <div class="toolbar"><h2>Admin: จัดการสินค้าและสต็อก</h2><button class="btn ghost sm" data-refresh>รีเฟรช</button></div>
    <div class="notice">⚠️ แม้เป็น Preview แต่การบันทึกจะเปลี่ยนข้อมูลใน Supabase จริงทันที เริ่มทดลองกับ <b>TEST-ONLY-001</b> เท่านั้นก่อน และอย่า Merge เข้า main</div>
    <div class="scroll"><table><thead><tr><th>รูป / รหัส</th><th>สินค้า</th><th>คงเหลือ</th><th>จุดเตือน</th><th>สถานะ</th><th></th></tr></thead><tbody>${table||'<tr><td colspan="6">ไม่มีสินค้า</td></tr>'}</tbody></table></div>
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
    if(!id.startsWith('TEST-ONLY-'))throw Error('Preview ให้เพิ่มเฉพาะรหัส TEST-ONLY-*');
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
    if(!original.id.startsWith('TEST-ONLY-'))throw Error('Preview ให้แก้ไขเฉพาะรหัส TEST-ONLY-*');
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
// Admin orders: show requests within the admin's RLS scope, with test-only delivery updates.
// Production orders stay read-only in this Preview. Actual authorization is enforced by gift_set_given RPC.
function testOnlyRequest(r, lines){
  return r && !r.cancelled && r.team === 'TEST_ONLY' &&
    r.name === 'Member Test' && lines.length > 0 && lines.every(it=>it.product_id==='TEST-ONLY-001');
}
function adminOrdersView(){
  if(ui.profile?.role!=='admin')return '<div class="card"><h2>ไม่มีสิทธิ์เข้าถึง</h2></div>';
  const itemsBy={};ui.items.forEach(it=>(itemsBy[it.request_id]??=[]).push(it));
  const total=ui.requests.length, open=ui.requests.filter(r=>!r.cancelled).length; const status=r=>r.cancelled?'cancel':((itemsBy[r.id]||[]).length&&(itemsBy[r.id]||[]).every(i=>Number(i.given)>=Number(i.qty))?'done':'pending');
  const q=ui.adminOrderSearch.toLocaleLowerCase('th').trim();
  const filtered=ui.requests.filter(r=>{
    const lines=itemsBy[r.id]||[];
    if(ui.qTeam&&r.team!==ui.qTeam||ui.qPerson&&r.name!==ui.qPerson||ui.qStatus!=='all'&&status(r)!==ui.qStatus)return false;
    if(ui.adminOrderFilter==='open' && r.cancelled)return false;
    if(ui.adminOrderFilter==='cancelled' && !r.cancelled)return false;
    if(ui.adminOrderFilter==='test' && r.team!=='TEST_ONLY')return false;
    return !q || [String(r.id),r.name,r.team,r.customer_company,...lines.map(it=>it.gift)]
      .some(t=>String(t??'').toLocaleLowerCase('th').includes(q));
  });
  filtered.sort((a,b)=> (status(a)==='pending'?0:1)-(status(b)==='pending'?0:1) || (status(a)==='pending'?String(a.need).localeCompare(String(b.need)):Number(b.id)-Number(a.id)));
  const cards=filtered.map(r=>{
    const lines=itemsBy[r.id]||[];
    const test=testOnlyRequest(r,lines);
    const rows=lines.map(it=>`<div class="line"><span>${e(it.gift)} • เบิก ${Number(it.qty)} ชิ้น</span><span>ส่งมอบ ${Number(it.given)} ชิ้น</span></div>`).join('');
    const edit=test?adminV2Controls(r,lines):'<p class="sub">'+(r.cancelled?'คำขอนี้ยกเลิกแล้ว — อ่านอย่างเดียว':'ไม่เข้าเงื่อนไขคำขอทดสอบ — Preview อ่านอย่างเดียว')+'</p>';
    return `<article class="request-card"><div class="toolbar"><h3>คำขอ #${Number(r.id)} • ${e(r.customer_company)}</h3>
      <span class="tag ${status(r)==='done'?'done':status(r)==='cancel'?'low':'wait'}">${status(r)==='done'?'Done':status(r)==='cancel'?'Cancel':'Pending'}</span></div>
      <div class="sub">ผู้ขอ: ${e(r.name)} • ทีม: ${e(r.team)} • ต้องการวันที่ ${e(r.need)}</div>
      <div class="sub">สร้างเมื่อ ${pretty(r.created_at)}</div>
      ${rows||'<div class="empty">ไม่มีรายการเบิก</div>'}${edit}</article>`;
  }).join('');
  return `<div class="card"><div class="toolbar"><h2>Admin: จัดการคำขอเบิก</h2><button class="btn ghost sm" data-refresh>รีเฟรช</button></div>
    <div class="notice">⚠️ Preview เชื่อมฐานข้อมูล GOT จริง • คำขอจริงเป็นแบบอ่านอย่างเดียว • แก้ไขเฉพาะ TEST_ONLY / Member Test / TEST-ONLY-001 ที่ยังไม่ยกเลิกเท่านั้น</div>
    <p class="sub">คำขอที่โหลดล่าสุด ${total} รายการ (สูงสุด 100) • ยังไม่ยกเลิก ${open} รายการ</p>
    <form id="admin-orders-filter" class="field-row">
      <div><label for="order-search">ค้นหาเลขคำขอ / ทีม / ผู้ขอ / บริษัท / สินค้า</label><input id="order-search" value="${e(ui.adminOrderSearch)}" placeholder="เช่น TEST_ONLY"></div>
      <div><label for="order-status">แสดง</label><select id="order-status">
        <option value="all" ${ui.adminOrderFilter==='all'?'selected':''}>คำขอทั้งหมด</option>
        <option value="open" ${ui.adminOrderFilter==='open'?'selected':''}>ยังไม่ยกเลิก</option>
        <option value="cancelled" ${ui.adminOrderFilter==='cancelled'?'selected':''}>ยกเลิกแล้ว</option>
        <option value="test" ${ui.adminOrderFilter==='test'?'selected':''}>ทีม TEST_ONLY</option>
      </select></div>
      <div style="align-self:end"><button type="submit" class="btn sm">ค้นหา</button></div>
    </form>
    </div><div class="ql">${queueSide(status)}<section><div class="bar"><div><h2>${e(ui.qPerson||ui.qTeam||'ทุกทีม')}</h2><div class="sub">${filtered.length} คำขอ</div></div><div class="chips">${[['pending','Pending'],['done','Done'],['cancel','Cancel'],['all','ทั้งหมด']].map(([v,t])=>`<button class="chip ${ui.qStatus===v?'on':''}" data-q-status="${v}">${t}</button>`).join('')}</div></div>${cards||'<div class="card empty">ไม่พบคำขอตามเงื่อนไข</div>'}</section></div>`;
}
function adminView(){
 const test=ui.requests.filter(r=>r.team==='TEST_ONLY');const html=test.map(r=>`<div class="request-card"><b>คำขอ #${Number(r.id)}</b> — ${e(r.customer_company)} • ${r.cancelled?'ยกเลิกแล้ว':'ยังไม่ยกเลิก'}<div class="request-actions" style="margin-top:10px"><button class="btn danger sm" data-cancel="${Number(r.id)}" ${r.cancelled||ui.busy?'disabled':''}>ยกเลิกคำขอทดสอบ #${Number(r.id)}</button></div></div>`).join('');
 return `<div class="card"><h2>Admin: ตรวจคำขอและคืนสต็อก</h2><div class="notice">Preview เปิดให้ยกเลิกเฉพาะคำขอทีม TEST_ONLY ที่มีแต่สินค้า TEST-ONLY-001 เท่านั้น (เช็กเพิ่มก่อนเรียก RPC)</div>${html||'<p class="empty">ยังไม่มีคำขอทดสอบ</p>'}<p class="sub">ฟีเจอร์จัดการสินค้าอยู่ที่เมนู “จัดการสินค้า” • ส่วนเพิ่มทีม/ผู้ใช้ Dashboard และส่งมอบ ยังไม่ได้ย้ายเข้าหน้านี้ กรุณาอย่า Merge ไป main</p></div>`}
function attach(){
 document.querySelectorAll('[data-photo-id]').forEach(x=>x.onchange=()=>{if(x.files?.[0])saveTestPhoto(x.dataset.photoId,x.files[0])});
 document.querySelectorAll('[data-photo-remove]').forEach(x=>x.onclick=()=>saveTestPhoto(x.dataset.photoRemove,null));
 document.querySelectorAll('[data-q-team]').forEach(b=>b.onclick=()=>{ui.qTeam=b.dataset.qTeam;ui.qPerson='';render()});
 document.querySelectorAll('[data-q-person]').forEach(b=>b.onclick=()=>{ui.qPerson=b.dataset.qPerson;render()});
 document.querySelectorAll('[data-q-status]').forEach(b=>b.onclick=()=>{ui.qStatus=b.dataset.qStatus;render()});
 if($('dash-test'))$('dash-test').onchange=ev=>{ui.dashTest=ev.target.checked;ui.dashTeam='';render()};
 document.querySelectorAll('[data-dash-team]').forEach(b=>b.onclick=()=>{ui.dashTeam=ui.dashTeam===b.dataset.dashTeam?'':b.dataset.dashTeam;render()});
 if($('dash-all'))$('dash-all').onclick=()=>{ui.dashAll=!ui.dashAll;render()};
 if($('mark-notes'))$('mark-notes').onclick=async()=>{if(ui.busy||ui.profile?.role!=='admin'||!confirm('ทำเครื่องหมายการแจ้งเตือน Marketing ทั้งบริษัทว่าอ่านแล้ว?'))return;ui.busy=true;render();try{requireOk(await db.rpc('gift_mark_read',{p_marketing:true}),'การแจ้งเตือน');await loadData();msg('บันทึกสถานะอ่านแล้ว')}catch(err){showError(err)}finally{ui.busy=false;render()}};
 document.querySelectorAll('[data-people-action]').forEach(b=>b.onclick=()=>peopleAction(b));
document.querySelectorAll('[data-refresh]').forEach(b=>b.onclick=()=>loadData().catch(showError));
 const searchForm=$('admin-orders-filter');if(searchForm)searchForm.onsubmit=ev=>{ev.preventDefault();ui.adminOrderSearch=$('order-search').value;ui.adminOrderFilter=$('order-status').value;render()};
 document.querySelectorAll('[data-v2-action]').forEach(b=>b.onclick=()=>saveV2Action(b));
 const add=$('admin-add-product');if(add)add.onsubmit=createAdminProduct;
 const edit=$('admin-edit-product');if(edit)edit.onsubmit=saveAdminProduct;
 const picker=$('product-editor-select');if(picker)picker.onchange=()=>{ui.editProductId=picker.value;render()};
 document.querySelectorAll('[data-select-stock]').forEach(b=>b.onclick=()=>{ui.editProductId=b.dataset.selectStock;render();$('product-editor-select')?.scrollIntoView({behavior:'smooth',block:'center'})});
 const submit=$('submit-form');if(submit)submit.onsubmit=async ev=>{ev.preventDefault();if(ui.profile.role!=='member')return;if(!confirm('ยืนยันสร้างคำขอทดลอง TEST-ONLY-001 จำนวน 1 ชิ้น?'))return;const company=String($('customer').value).trim(), need=$('need').value;if(!company||!need)return showError(new Error('กรุณากรอกบริษัทและวันที่'));ui.busy=true;render();try{const data=requireOk(await db.rpc('gift_submit',{p_customer_company:company,p_need:need,p_items:[{gift:'TEST ONLY - สินค้าทดสอบ',qty:1}]}),'gift_submit');await loadData();msg('สร้างคำขอทดสอบ #'+data.id+' สำเร็จ')}catch(err){showError(err)}finally{ui.busy=false;render()}};
 document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{const id=Number(b.dataset.cancel);try{const r=ui.requests.find(x=>Number(x.id)===id);if(!r||r.cancelled||r.team!=='TEST_ONLY'||r.name!=='Member Test')throw new Error('คำขอไม่ใช่รายการทดสอบ');let its=ui.items.filter(x=>Number(x.request_id)===id);if(!its.length||its.some(x=>x.product_id!=='TEST-ONLY-001')||its.every(x=>Number(x.given)>=Number(x.qty)))throw new Error('ยกเลิกได้เฉพาะคำขอสินค้าทดสอบที่ยังส่งมอบไม่ครบ');if(!confirm('ยืนยันยกเลิกคำขอทดสอบ #'+id+' และคืนสต็อก?'))return;ui.busy=true;render();requireOk(await db.rpc('gift_cancel',{p_request_id:id}),'gift_cancel');await loadData();msg('ยกเลิกคำขอ #'+id+' และคืนสต็อกสำเร็จ')}catch(err){showError(err)}finally{ui.busy=false;render()}})
}
async function loadData(){if(!ui.user)return;const profile=requireOk(await db.from('profiles').select('company_id,display_name,role').eq('id',ui.user.id).single(),'profile');if(!profile)throw new Error('ไม่พบโปรไฟล์');ui.profile=profile;
 if(profile.role!=='admin' && (ui.tab==='admin'||ui.tab==='admin-stock'||ui.tab==='admin-orders'))ui.tab='stock';
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
 ui.adminExtraError='';ui.noteError='';
 if(profile.role==='admin'){
   const extra=await Promise.all([db.from('teams').select('id,name').eq('company_id',company).order('name'),db.from('team_members').select('id,team_id,name').eq('company_id',company).order('name'),db.from('staff').select('id,name').eq('company_id',company).order('name'),db.from('notifications').select('id,to_name,body,is_read,created_at').eq('company_id',company).eq('to_name','mkt').order('id',{ascending:false}).limit(100)]);
   ui.teams=[];ui.staff=[];ui.notes=[];
   if(extra.slice(0,3).some(x=>x.error))ui.adminExtraError='โหลดทีม/รายชื่อไม่ครบ: '+extra.slice(0,3).filter(x=>x.error).map(x=>x.error.message).join('; ');
   else{ui.teams=(extra[0].data||[]).map(t=>({...t,members:(extra[1].data||[]).filter(m=>String(m.team_id)===String(t.id))}));ui.staff=extra[2].data||[];}
   if(extra[3].error)ui.noteError=extra[3].error.message;else ui.notes=extra[3].data||[];
 }
 ui.message='';render();
}

// PUBLIC: no-login catalog is served by a limited Supabase Edge Function. No service key in browser.
function edgeUrl(){return String(C.supabaseUrl||'').replace(/\/$/,'')+'/functions/v1/gift-public'}
function publicView(){
 const catalog=ui.publicData;
 const result=ui.publicResult?`<div class="notice good" role="status"><strong>ส่งคำขอสำเร็จ #${Number(ui.publicResult)}</strong> — เก็บรหัสติดตามด้านล่างไว้ด้วย${trackingReceiptHTML()}</div>`:'';
 if(!catalog)return `<div class="card"><h2>เบิกของขวัญโดยไม่ต้อง Login</h2>${result}${ui.message}${ui.publicError?`<div class="notice bad">${e(ui.publicError)}</div>`:'<div class="empty">กำลังโหลดข้อมูล...</div>'}<button class="btn ghost sm" id="public-retry">ลองโหลดอีกครั้ง</button></div>`;
 const teams=catalog.teams||[],team=teams.find(t=>t.name===ui.publicTeam),products=catalog.products||[];
 const disabled=ui.publicBusy||ui.publicLocked?'disabled':'';
 const gal=products.map(p=>{const n=ui.publicRows.filter(x=>x.id===p.id).reduce((a,x)=>a+Number(x.qty),0);return `<button type="button" class="gcard ${n?'on':''}" data-pick="${e(p.id)}" ${p.qty<=0||disabled?'disabled':''}>${giftThumb(p,64)}<span class="gn">${e(p.name)}</span><span class="sub">เหลือ ${Number(p.qty)} ชิ้น</span>${n?`<span class="badge">${n}</span>`:''}</button>`}).join('');
 const rows=ui.publicRows.map((it,i)=>{const p=products.find(x=>x.id===it.id);return `<div class="irow">${giftThumb(p,40)}<select aria-label="ของขวัญรายการ ${i+1}" data-pub-id="${i}" required ${disabled}><option value="">เลือกของขวัญ</option>${products.map(x=>`<option value="${e(x.id)}" ${it.id===x.id?'selected':''} ${x.qty<=0&&it.id!==x.id?'disabled':''}>${e(x.name)} (เหลือ ${Number(x.qty)})</option>`).join('')}</select><input aria-label="จำนวนรายการ ${i+1}" type="number" min="1" max="20" step="1" required data-pub-qty="${i}" value="${Number(it.qty)}" ${disabled}><button type="button" class="btn ghost sm" data-pub-remove="${i}" ${disabled}>ลบ</button></div>`}).join('');
 return `<div class="hero"><div>${giftThumb(null,64)}</div><div><div class="hero-t">HAPPY NEW YEAR!</div><div class="sub">เลือกของขวัญให้ลูกค้า • ไม่ต้อง Login</div></div></div><div class="card"><h2>ฟอร์มเบิกของขวัญ</h2>${catalog.testMode?'<div class="notice">🧪 PREVIEW: รับเบิกเฉพาะ TEST_ONLY / TEST-ONLY-001</div>':''}${result}${ui.message}<form id="public-form"><div class="grid"><div><label for="pub-team">ทีม</label><select id="pub-team" required ${disabled}><option value="">เลือกทีมก่อน</option>${teams.map(t=>`<option ${t.name===ui.publicTeam?'selected':''} value="${e(t.name)}">${e(t.name)}</option>`).join('')}</select></div><div><label for="pub-member">ชื่อผู้เบิก</label><select id="pub-member" required ${!team||disabled?'disabled':''}><option value="">เลือกชื่อ</option>${(team?.members||[]).map(n=>`<option ${n===ui.publicMember?'selected':''} value="${e(n)}">${e(n)}</option>`).join('')}</select></div><div><label for="pub-company">บริษัทลูกค้าที่รับของ</label><input id="pub-company" required maxlength="120" value="${e(ui.publicCustomer||'')}" placeholder="ชื่อบริษัทที่จะนำไปมอบ" ${disabled}></div><div><label for="pub-need">วันที่ต้องการรับของ</label><input id="pub-need" type="date" required min="${today()}" value="${e(ui.publicNeed||today())}" ${disabled}></div></div><h2 style="margin-top:22px">รายการของขวัญ</h2><div class="sub" style="margin-bottom:10px">กดที่รูปเพื่อเพิ่มลงรายการ หรือเลือกจากช่องด้านล่าง (สูงสุด 10 รายการ รวม 20 ชิ้น)</div><div class="gal">${gal||'<div class="empty">ยังไม่มีสินค้า</div>'}</div><div class="public-items">${rows}</div><p><button type="button" class="btn ghost sm" id="public-add-row" ${disabled||ui.publicRows.length>=10?'disabled':''}>+ เพิ่มของขวัญอีกรายการ</button></p><div class="fld"><label>ยืนยันว่าไม่ใช่ระบบอัตโนมัติ</label><div id="gift-turnstile"></div></div>${ui.publicLocked?'<div class="notice">คำขอก่อนหน้าอาจถูกบันทึกแล้ว ระบบล็อกข้อมูลเดิมไว้เพื่อให้ลองส่งซ้ำด้วยรหัสเดิมเท่านั้น</div>':''}<button class="btn" type="submit" ${ui.publicBusy||!products.length?'disabled':''}>${ui.publicBusy?'กำลังบันทึก...':ui.publicLocked?'ตรวจ / ส่งคำขอเดิมอีกครั้ง':'ส่งคำขอเบิก (ตัดสต็อกทันที)'}</button></form><p class="sub">โปรดตรวจข้อมูลก่อนส่ง • หากบันทึกไม่สำเร็จ อย่าส่งคำขอใหม่จนกว่าจะตรวจรายการเดิม</p></div>`;
}
function mountTurnstile(action='gift_submit'){
  const node=$('gift-turnstile');if(!node)return;
  if(ui.turnstileWidgetId!==null && window.turnstile){try{window.turnstile.remove(ui.turnstileWidgetId)}catch{}}
  ui.turnstileWidgetId=null;ui.publicCaptcha='';
  if(!C.turnstileSiteKey || C.turnstileSiteKey.includes('REPLACE')){
    node.textContent='ยังไม่ได้ใส่ Turnstile Site Key ใน config.js';return;
  }
  if(!window.turnstile){node.textContent='CAPTCHA กำลังโหลด...';setTimeout(()=>{if(node.isConnected&&window.turnstile)mountTurnstile(action);else if(node.isConnected)node.textContent='CAPTCHA โหลดไม่ได้ กรุณารีเฟรชหน้าเว็บ'},1500);return;}
  ui.turnstileWidgetId=window.turnstile.render(node,{
    sitekey:C.turnstileSiteKey, action,
    callback(token){ui.publicCaptcha=token},
    'expired-callback':()=>{ui.publicCaptcha=''},
    'error-callback':()=>{ui.publicCaptcha=''},
  });
}
function attachPublic(){
 if($('public-retry'))$('public-retry').onclick=()=>loadPublicCatalog();
 const form=$('public-form');if(!form)return;
 const remember=()=>{if(ui.publicLocked)return;ui.publicCustomer=$('pub-company').value;ui.publicNeed=$('pub-need').value;ui.publicTeam=$('pub-team').value;ui.publicMember=$('pub-member').value;document.querySelectorAll('[data-pub-id]').forEach(x=>ui.publicRows[Number(x.dataset.pubId)].id=x.value);document.querySelectorAll('[data-pub-qty]').forEach(x=>ui.publicRows[Number(x.dataset.pubQty)].qty=Number(x.value));};
 form.oninput=()=>remember();
 $('pub-team').onchange=()=>{remember();ui.publicMember='';render()};
 $('pub-member').onchange=()=>remember();
 document.querySelectorAll('[data-pub-id]').forEach(x=>x.onchange=()=>{remember();render()});
 document.querySelectorAll('[data-pub-qty]').forEach(x=>x.onchange=()=>{remember()});
 document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{remember();const id=b.dataset.pick;const x=ui.publicRows.find(r=>r.id===id),p=ui.publicData.products.find(p=>p.id===id);if(x){if(x.qty>=Math.min(20,p.qty))return alert('จำนวนเกินสต็อก');x.qty++}else{const blank=ui.publicRows.find(r=>!r.id);if(blank){blank.id=id;blank.qty=1}else if(ui.publicRows.length<10)ui.publicRows.push({id,qty:1});else return alert('สูงสุด 10 รายการ')}render()});
 $('public-add-row').onclick=()=>{remember();if(ui.publicRows.length<10)ui.publicRows.push({id:'',qty:1});render()};
 document.querySelectorAll('[data-pub-remove]').forEach(b=>b.onclick=()=>{remember();ui.publicRows.splice(Number(b.dataset.pubRemove),1);render()});
 mountTurnstile();
 form.onsubmit=async ev=>{ev.preventDefault();if(ui.publicBusy)return;remember();const token=ui.publicCaptcha;if(!token)return alert('กรุณายืนยัน CAPTCHA ก่อนส่งคำขอ');
 let payload=ui.publicPayload;
 if(!ui.publicLocked){if(getReceipts().some(x=>!x.id)){alert('มีคำขอก่อนหน้าที่ยังไม่ยืนยัน กรุณาตรวจรหัสในเมนูคำขอของฉันก่อน');return;}const team=ui.publicTeam,member=ui.publicMember,customer=String(ui.publicCustomer||'').trim(),need=ui.publicNeed||today();const rows=ui.publicRows;if(!team||!member||!customer||!need||!rows.length||rows.some(x=>!x.id||!Number.isInteger(x.qty)||x.qty<1||x.qty>20))return alert('กรุณากรอกข้อมูลและรายการให้ครบ');const totals=new Map();rows.forEach(x=>totals.set(x.id,(totals.get(x.id)||0)+x.qty));const items=[...totals].sort(([a],[b])=>a.localeCompare(b)).map(([id,qty])=>({id,qty}));if(items.reduce((a,x)=>a+x.qty,0)>20||items.some(x=>x.qty>Number(ui.publicData.products.find(p=>p.id===x.id)?.qty||0)))return alert('จำนวนรวมเกิน 20 ชิ้น หรือเกินสต็อก');if(!confirm('ยืนยันส่งคำขอเบิกและตัดสต็อกทันที?'))return;payload={action:'submit',team,member,customerCompany:customer,need,items,nonce:crypto.randomUUID()};ui.publicPayload=payload;saveReceipt(payload.nonce,null);}
 ui.publicBusy=true;ui.publicResult=null;ui.lastReceipt=null;ui.message='';render();
 try{const res=await fetch(edgeUrl(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,captchaToken:token})});const data=await res.json();if(!res.ok||data.ok!==true){if(!ui.publicLocked&&[400,403,413,415].includes(res.status)){removeReceipt(payload.nonce);ui.publicPayload=null;}throw new Error(data.error||'ไม่สามารถบันทึกคำขอได้');}ui.publicResult=data.id;ui.trackCode=payload.nonce;ui.lastReceipt=payload.nonce;saveReceipt(payload.nonce,data.id);ui.publicPayload=null;ui.publicLocked=false;ui.publicRows=[];ui.publicCustomer='';await loadPublicCatalog(false);}
 catch(err){ui.publicLocked=!!ui.publicPayload;ui.message=`<div class="notice bad" role="alert">${e(err?.message||String(err))} ${ui.publicLocked?'โปรดส่งคำขอเดิมด้วยรหัสเดิมเท่านั้น หากยังไม่ได้ผลให้ Admin ตรวจสอบ • รหัสติดตาม: '+e(payload.nonce):'กรุณาตรวจข้อมูลก่อนลองอีกครั้ง'}</div>`;}finally{ui.publicBusy=false;render()}};
}
async function loadPublicCatalog(shouldRender=true){
  try{
    const r=await fetch(edgeUrl(),{method:'GET',cache:'no-store'});
    const data=await r.json();if(!r.ok||data.ok!==true)throw new Error(data.error||'โหลดข้อมูลไม่ได้');
    ui.publicData=data;ui.publicError='';
    if(!data.teams?.some(t=>t.name===ui.publicTeam)){ui.publicTeam='';ui.publicMember=''}
    if(!data.products?.some(p=>p.id===ui.publicProduct))ui.publicProduct=data.products?.[0]?.id||'';
  }catch(err){ui.publicError=err?.message||String(err);ui.publicData=null}
  if(shouldRender)render();
}

async function boot(){
  if(!sbReady){render();return}
  try{
    const res=await db.auth.getUser();
    if(res.data?.user){
      const p=await db.from('profiles').select('company_id,display_name,role').eq('id',res.data.user.id).maybeSingle();
      if(!p.error && p.data?.role==='admin'){
        ui.user=res.data.user;ui.profile=p.data;
        // Never automatically force visitors to see an admin page.
      } else { await db.auth.signOut(); }
    }
  }catch(err){console.warn('Auth restore:',err?.message)}
  render();await loadPublicCatalog();
}

const PIXEL_GIFT=["...kk..kk...","..kyykkyyk..","..kyyyyyyk..","...kkyykk...",".kkkkyykkkk.",".krrryyrrrk.",".krrryyrrrk.",".kkkkyykkkk.",".krrryyrrrk.",".krrryyrrrk.",".krrryyrrrk.",".kkkkkkkkkk."];
function giftThumb(p,size){const path=p?.image_path;if(typeof path==='string'&&path&&/^[A-Za-z0-9_\-./]+$/.test(path)&&!path.includes('..')&&!path.startsWith('/')){const url=String(C.supabaseUrl).replace(/\/$/,'')+'/storage/v1/object/public/gift-images/'+path.split('/').map(encodeURIComponent).join('/');return `<img class="thumb" width="${size}" height="${size}" style="width:${size}px;height:${size}px" src="${e(url)}" alt="">`;}return `<div class="thumb ph" style="width:${size}px;height:${size}px"><svg class="px" viewBox="0 0 12 12" width="${Math.floor(size*.75)}" height="${Math.floor(size*.75)}" shape-rendering="crispEdges" aria-hidden="true">${PIXEL_GIFT.map((row,y)=>[...row].map((c,x)=>c==='.'?'':`<rect x="${x}" y="${y}" width="1" height="1" fill="${{k:'var(--pk)',y:'#ffd24a',r:'#e0384f'}[c]}"/>`).join('')).join('')}</svg></div>`;}
async function saveTestPhoto(id,file){
 if(ui.busy||ui.profile?.role!=='admin'||id!=='TEST-ONLY-001')return;
 const p=ui.adminProducts.find(x=>x.id===id);if(!p)return;
 const company=ui.profile.company_id,old=p.image_path;
 if(file&&(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>1048576))return showError(Error('ใช้ JPG, PNG หรือ WebP ขนาดไม่เกิน 1 MB'));
 if(!confirm(file?'ยืนยันอัปโหลดรูปสินค้าทดสอบ? รูปจะเข้าถึงได้แบบสาธารณะ':'ยืนยันเอารูปออกจากสินค้าทดสอบ?'))return;
 ui.busy=true;render();let path='';
 try{if(file){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];path=company+'/'+id+'/'+crypto.randomUUID()+'.'+ext;requireOk(await db.storage.from('gift-images').upload(path,file,{contentType:file.type,upsert:false}),'อัปโหลดรูป');}
 let query=db.from('products').update({image_path:path}).eq('company_id',company).eq('id',id);query=old==null?query.is('image_path',null):query.eq('image_path',old);const rows=requireOk(await query.select('id'),'บันทึกรูป');if(rows.length!==1)throw Error('ค่าเดิมเปลี่ยนไปแล้ว กรุณารีเฟรชและตรวจรูป');await loadData();await loadPublicCatalog(false);msg(file?'บันทึกรูปสินค้าทดสอบแล้ว':'นำรูปออกจากรายการแล้ว');
 }catch(err){showError(err)}finally{ui.busy=false;render()}
}
function queueSide(status){const pending=fn=>ui.requests.filter(r=>status(r)==='pending'&&fn(r)).length;const count=n=>`<span class="cnt ${n?'':'z'}">${n}</span>`;const teams=[...new Set([...ui.teams.map(t=>t.name),...ui.requests.map(r=>r.team)])].sort();return `<aside class="side"><button class="tn ${!ui.qTeam?'on':''}" data-q-team="">ทุกทีม ${count(pending(()=>true))}</button>${teams.map(t=>`<button class="tn ${ui.qTeam===t?'on':''}" data-q-team="${e(t)}">${e(t)} ${count(pending(r=>r.team===t))}</button>${ui.qTeam===t?[...new Set([...(ui.teams.find(x=>x.name===t)?.members||[]).map(m=>m.name),...ui.requests.filter(r=>r.team===t).map(r=>r.name)])].map(n=>`<button class="pn ${ui.qPerson===n?'on':''}" data-q-person="${e(n)}">${e(n)} ${count(pending(r=>r.team===t&&r.name===n))}</button>`).join(''):''}`).join('')}</aside>`;}
function peopleView(){return `<div class="card"><div class="toolbar"><h2>ทีมและรายชื่อ</h2><button class="btn ghost sm" data-refresh>รีเฟรช</button></div><div class="notice">รายชื่อจริงอ่านอย่างเดียวใน Preview • เพิ่ม/ลบได้เฉพาะรายการแยกทดสอบที่ขึ้นต้น TEST_UI_ ไม่แก้ทีม TEST_ONLY ที่ใช้เบิกสินค้า</div>${ui.adminExtraError?`<div class="notice bad">${e(ui.adminExtraError)}</div>`:''}<h2>รายชื่อทีม Marketing</h2>${ui.staff.map(m=>`<div class="person-row toolbar"><span>${e(m.name)}</span>${m.name.startsWith('TEST_UI_')?`<button class="btn ghost sm" data-people-action="staff-delete" data-id="${e(m.id)}">ลบ</button>`:''}</div>`).join('')||'<div class="empty">ไม่มีรายชื่อ</div>'}<div class="irow3" style="margin-top:12px"><input id="new-staff" placeholder="TEST_UI_ ชื่อทดสอบ"><button class="btn sm" data-people-action="staff-add">เพิ่มชื่อทดสอบ</button></div></div><div class="people-grid">${ui.teams.map(t=>`<div class="card"><div class="toolbar"><h2>${e(t.name)}</h2><span class="cnt">${t.members.length}</span></div>${t.members.map(m=>`<div class="person-row toolbar"><span>${e(m.name)}</span>${t.name.startsWith('TEST_UI_')&&m.name.startsWith('TEST_UI_')?`<button class="btn ghost sm" data-people-action="member-delete" data-id="${e(m.id)}" data-team="${e(t.id)}">ลบ</button>`:''}</div>`).join('')||'<p class="sub">ยังไม่มีสมาชิก</p>'}${t.name.startsWith('TEST_UI_')?`<div class="irow3"><input id="member-${e(t.id)}" placeholder="TEST_UI_ ชื่อสมาชิก"><button class="btn sm" data-people-action="member-add" data-team="${e(t.id)}">เพิ่ม</button></div>${!t.members.length?`<button class="btn ghost sm" data-people-action="team-delete" data-id="${e(t.id)}">ลบทีมทดสอบ</button>`:''}`:''}</div>`).join('')}</div><div class="card" style="margin-top:16px"><h2>เพิ่มทีมผู้เบิกทดสอบ</h2><div class="irow3"><input id="new-team" placeholder="TEST_UI_ ทีมใหม่"><button class="btn" data-people-action="team-add">เพิ่มทีม</button></div></div>`;}
async function peopleAction(b){if(ui.busy||ui.profile?.role!=='admin'||ui.adminExtraError)return;const a=b.dataset.peopleAction,c=ui.profile.company_id,id=b.dataset.id,t=ui.teams.find(x=>String(x.id)===b.dataset.team);let q,table,record,name;try{if(a==='staff-add'||a==='team-add'||a==='member-add'){table=a==='staff-add'?'staff':a==='team-add'?'teams':'team_members';if(a==='member-add'&&!t?.name.startsWith('TEST_UI_'))throw Error('ไม่ใช่ทีมทดสอบ');name=String($(a==='staff-add'?'new-staff':a==='team-add'?'new-team':'member-'+t.id)?.value||'').trim();if(!name.startsWith('TEST_UI_')||name.length>80||name.length<=8)throw Error('ชื่อทดสอบต้องขึ้นต้น TEST_UI_ และไม่เกิน 80 ตัวอักษร');if(!confirm('เพิ่ม '+name+' ในฐานข้อมูลทดสอบ?'))return;record={company_id:c,name,...(a==='member-add'?{team_id:t.id}:{})};ui.busy=true;render();q=db.from(table).insert(record).select('id');}else{table=a==='staff-delete'?'staff':a==='team-delete'?'teams':'team_members';record=table==='staff'?ui.staff.find(x=>String(x.id)===id):table==='teams'?ui.teams.find(x=>String(x.id)===id):t?.members.find(x=>String(x.id)===id);if(!record?.name.startsWith('TEST_UI_')||table==='team_members'&&!t?.name.startsWith('TEST_UI_')||table==='teams'&&record.members.length)throw Error('ลบได้เฉพาะรายการทดสอบที่ไม่มีข้อมูลเกี่ยวข้อง');if(!confirm('ลบ '+record.name+' ?'))return;ui.busy=true;render();q=db.from(table).delete().eq('company_id',c).eq('id',id).eq('name',record.name).select('id');}const rows=requireOk(await q,'ทีมและรายชื่อ');if(rows?.length!==1)throw Error('ไม่สามารถยืนยันการบันทึกได้');await loadData();msg('บันทึกรายการทดสอบแล้ว');}catch(err){showError(err)}finally{ui.busy=false;render()}}
function notesView(){return `<div class="card"><div class="toolbar"><h2>การแจ้งเตือน Marketing</h2><div><button class="btn ghost sm" data-refresh>รีเฟรช</button> <button class="btn sm" id="mark-notes" ${ui.busy||!ui.notes.some(n=>!n.is_read)?'disabled':''}>อ่านทั้งหมด</button></div></div><p class="sub">ล่าสุดสูงสุด 100 รายการ • การอ่านทั้งหมดจะเปลี่ยนสถานะของ Marketing จริง</p>${ui.noteError?`<div class="notice bad">${e(ui.noteError)}</div>`:''}${ui.notes.map(n=>`<div class="alert ${n.is_read?'':'unread'}">${e(n.body)}<small>${pretty(n.created_at)} · ${n.is_read?'อ่านแล้ว':'ยังไม่อ่าน'}</small></div>`).join('')||'<div class="empty">ยังไม่มีการแจ้งเตือน</div>'}</div>`;}
function dashBars(map,click=false){const arr=[...map].sort((a,b)=>b[1]-a[1]);const max=Math.max(1,...arr.map(x=>x[1]));return arr.map(([k,v])=>`<${click?'button':'div'} class="row ${click?'lr':''}" ${click?`data-dash-team="${e(k)}"`:''}><span>${e(k)}</span><div class="track"><div class="fill" style="width:${100*v/max}%"></div></div><b>${v}</b></${click?'button':'div'}>`).join('')||'<div class="empty">ยังไม่มีข้อมูล</div>';}
function dashView(){const rs=ui.requests.filter(r=>!r.cancelled&&(ui.dashTest||r.team!=='TEST_ONLY'&&!String(r.team).startsWith('TEST_UI_')));const byT=new Map(),byG=new Map(),byC=new Map(),byP=new Map();let total=0,pending=0;const inc=(m,k,v)=>m.set(k,(m.get(k)||0)+v);rs.forEach(r=>{const its=ui.items.filter(i=>Number(i.request_id)===Number(r.id));if(!its.length||its.some(i=>Number(i.given)<Number(i.qty)))pending++;const key=JSON.stringify([r.team,r.name]);let p=byP.get(key)||{name:r.name,team:r.team,n:0,items:new Map()};its.forEach(i=>{const q=Number(i.qty);total+=q;inc(byT,r.team,q);inc(byG,i.gift,q);inc(byC,r.customer_company,q);p.n+=q;inc(p.items,i.gift,q)});byP.set(key,p)});const stock=ui.stock.filter(p=>ui.dashTest||!String(p.id).startsWith('TEST-ONLY-')),low=stock.filter(p=>p.qty<=p.min_qty).length,max=Math.max(1,...stock.map(p=>Number(p.qty)),...stock.map(p=>Number(p.min_qty)));const rank=[...byP.values()].sort((a,b)=>b.n-a.n);const detail=rank.filter(p=>p.team===ui.dashTeam);return `<div class="toolbar" style="margin-bottom:12px"><span class="sub">ข้อมูลจริงจาก Supabase • จากคำขอล่าสุดสูงสุด 100 รายการ (ไม่ใช่รายงานทุกช่วงเวลา) • ไม่รวมคำขอยกเลิก</span><label><input id="dash-test" type="checkbox" style="width:auto" ${ui.dashTest?'checked':''}> รวมข้อมูลทดสอบ</label><button class="btn ghost sm" data-refresh>รีเฟรช</button></div><div class="kpis">${[[total,'ชิ้นที่เบิกทั้งหมด'],[rs.length,'คำขอ'],[pending,'คำขอ pending'],[low,'รายการใกล้หมด']].map(([n,t])=>`<div class="kpi"><b>${n}</b><span>${t}</span></div>`).join('')}</div><div class="dash2"><div class="card"><h2>ยอดเบิกรายทีม</h2>${dashBars(byT,true)}<p class="sub">${ui.dashTeam?e(ui.dashTeam):'กดที่ชื่อทีมเพื่อดูรายละเอียด'}</p>${detail.map(p=>`<div class="line"><span>${e(p.name)}<br><small>${[...p.items].map(([g,n])=>e(g)+' × '+n).join(', ')}</small></span><b>${p.n}</b></div>`).join('')}</div><div class="card"><h2>ของขวัญที่เบิกมากที่สุด</h2>${dashBars(byG)}</div></div><div class="card"><div class="toolbar"><h2>ใครเบิกอะไรไปบ้าง</h2><button class="btn ghost sm" id="dash-all">${ui.dashAll?'แสดง 5 อันดับแรก':'ดูทั้งหมด ('+rank.length+' คน)'}</button></div><div class="scroll"><table><thead><tr><th>ผู้เบิก</th><th>รวม (ชิ้น)</th><th>รายการ</th></tr></thead><tbody>${(ui.dashAll?rank:rank.slice(0,5)).map(p=>`<tr><td>${e(p.name)}<br><span class="sub">${e(p.team)}</span></td><td>${p.n}</td><td>${[...p.items].map(([g,n])=>e(g)+' × '+n).join('<br>')}</td></tr>`).join('')}</tbody></table></div></div><div class="dash2"><div class="card"><h2>ลูกค้าที่เบิกมากที่สุด</h2>${dashBars(new Map([...byC].sort((a,b)=>b[1]-a[1]).slice(0,5)))}</div><div class="card"><h2>สต็อกคงเหลือ</h2><p class="sub">เส้นแดง = จุดแจ้งเตือน</p>${stock.map(p=>`<div class="row"><span>${e(p.name)}</span><div class="track"><div class="fill" style="width:${100*Number(p.qty)/max}%"></div><div class="min" style="left:${100*Number(p.min_qty)/max}%"></div></div><b>${Number(p.qty)}</b></div>`).join('')}</div></div>`;}


// V2: tracking is a per-request capability (random UUID), never a lookup by name/ID.
const RECEIPT_KEY='got-gift-v2-session-receipts';
const UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function getReceipts(){try{const a=JSON.parse(sessionStorage.getItem(RECEIPT_KEY)||'[]');return Array.isArray(a)?a.filter(x=>UUID4.test(x?.code||'')).slice(0,50):[]}catch{return []}}
function putReceipts(a){try{sessionStorage.setItem(RECEIPT_KEY,JSON.stringify(a.slice(0,50)))}catch{}}
function saveReceipt(code,id){if(!UUID4.test(code))return;const a=getReceipts();const old=a.find(x=>x.code===code);putReceipts([{code,id:id??old?.id??null,seen:old?.seen||0},...a.filter(x=>x.code!==code)]);}
function removeReceipt(code){putReceipts(getReceipts().filter(x=>x.code!==code))}
function trackingReceiptHTML(){return ui.lastReceipt?`<p><label>รหัสติดตามส่วนตัว (ห้ามแชร์)</label><input readonly aria-label="รหัสติดตามส่วนตัว" value="${e(ui.lastReceipt)}" onclick="this.select()"></p><p class="sub">คัดลอกเก็บไว้เพื่อดูคำขอหรือการแจ้งเตือนโดยไม่ Login</p>`:''}
function trackingView(){
 const rows=getReceipts(),r=ui.trackResult;
 const done=r&&!r.cancelled&&r.items.length&&r.items.every(i=>Number(i.given)>=Number(i.qty));
 const saved=rows.find(x=>x.code===ui.trackCode),seen=Number(saved?.seen||0);
 const events=r?.events||[];const unseen=events.filter(x=>Number(x.id)>seen).length;
 return `<div class="card"><h2>คำขอของฉัน</h2><p class="sub">ใช้รหัสติดตามส่วนตัวของแต่ละคำขอ ไม่ต้องเข้าสู่ระบบ ไม่สามารถค้นจากชื่อหรือเลขคำขออย่างเดียว</p><div class="notice">เก็บรหัสไว้เอง • ระบบจำรหัสเฉพาะ session ของแท็บ • ก่อนออกจากเครื่องที่ใช้ร่วมกันให้ล้างรายการ</div>${rows.length?`<div class="toolbar"><label>คำขอที่บันทึกในแท็บนี้</label><button class="btn ghost sm" id="track-clear" ${ui.trackBusy?'disabled':''}>ล้างรายการในเครื่อง</button></div><div class="chips">${rows.map((x,i)=>`<button class="chip" data-track-index="${i}" ${ui.trackBusy?'disabled':''}>${x.id?'#'+Number(x.id):'คำขอที่ยังไม่ยืนยัน'}</button>`).join('')}</div>`:''}<form id="track-form" style="margin-top:16px"><div class="fld"><label for="track-code">รหัสติดตาม</label><input id="track-code" required maxlength="36" autocomplete="off" spellcheck="false" value="${e(ui.trackCode)}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" ${ui.trackBusy?'disabled':''}></div><div class="fld"><label>ยืนยันว่าไม่ใช่ระบบอัตโนมัติ</label><div id="gift-turnstile"></div></div><button class="btn" ${ui.trackBusy?'disabled':''}>${ui.trackBusy?'กำลังตรวจสอบ...':'ตรวจสอบคำขอ'}</button></form>${ui.trackError?`<div class="notice bad" role="alert">${e(ui.trackError)}</div>`:''}</div>${r?`<div class="request-card"><div class="toolbar"><h2>คำขอ #${Number(r.id)} • ${e(r.customer_company)}</h2><span class="tag ${r.cancelled?'low':done?'done':'wait'}">${r.cancelled?'Cancel':done?'Done':'Pending'}</span></div><div class="sub">ต้องการรับ ${e(r.need)}</div>${r.items.map(i=>`<div class="line"><span>${e(i.gift)} • เบิก ${Number(i.qty)} ชิ้น</span><span>ส่งมอบ ${Number(i.given)} ชิ้น</span></div>`).join('')}</div><div class="card"><div class="toolbar"><h2>การแจ้งเตือนของคำขอนี้${unseen?' ('+unseen+')':''}</h2><button class="btn ghost sm" id="track-read">อ่านทั้งหมดในแท็บนี้</button></div>${events.map(x=>`<div class="alert ${Number(x.id)>seen?'unread':''}">${e(x.body)}<small>${pretty(x.created_at)}</small></div>`).join('')}<div class="alert">ส่งคำขอเบิกเรียบร้อยแล้ว<small>${pretty(r.created_at)}</small></div><p class="sub">ประวัติการเปลี่ยนแปลงเริ่มเก็บหลังติดตั้ง V2 • กดตรวจสอบคำขออีกครั้งเพื่ออัปเดตสถานะ</p></div>`:''}`;
}
function attachTracking(){
 const rows=getReceipts();document.querySelectorAll('[data-track-index]').forEach(b=>b.onclick=()=>{ui.trackCode=rows[Number(b.dataset.trackIndex)]?.code||'';ui.trackResult=null;ui.trackError='';render()});
 if($('track-clear'))$('track-clear').onclick=()=>{if(ui.publicLocked)return alert('ยังมีคำขอเดิมรอตรวจสอบ กรุณาตรวจสถานะก่อน');if(confirm('ล้างรหัสที่จำไว้ในแท็บนี้? หากมีคำขอที่ยังไม่ยืนยัน ให้ Admin ตรวจสอบก่อนล้าง ไม่ได้ลบคำขอจากฐานข้อมูล')){putReceipts([]);ui.trackCode='';ui.trackResult=null;ui.trackError='';ui.lastReceipt=null;ui.publicResult=null;render()}};
 if($('track-read'))$('track-read').onclick=()=>{const a=getReceipts();const x=a.find(x=>x.code===ui.trackCode);if(x){x.seen=Math.max(x.seen||0,...(ui.trackResult.events||[]).map(n=>Number(n.id)));putReceipts(a);render()}};
 const form=$('track-form');if(!form)return;
 $('track-code').oninput=()=>{ui.trackCode=$('track-code').value;ui.trackResult=null;document.querySelectorAll('#view > .request-card, #view > .card:nth-of-type(n+2)').forEach(n=>n.remove());};
 mountTurnstile('gift_track');
 form.onsubmit=async ev=>{ev.preventDefault();if(ui.trackBusy)return;const code=$('track-code').value.trim().toLowerCase(),token=ui.publicCaptcha;ui.trackResult=null;ui.trackError='';
 if(!UUID4.test(code)||!token){ui.trackError='กรุณากรอกรหัสติดตามที่ถูกต้องและยืนยัน CAPTCHA';render();return;}
 ui.trackCode=code;ui.trackBusy=true;render();
 try{const res=await fetch(edgeUrl(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'track',code,captchaToken:token})});const data=await res.json();if(!res.ok||data.ok!==true||!data.request||!Array.isArray(data.request.items))throw Error(data.error||'ตรวจสอบคำขอไม่ได้');ui.trackResult=data.request;saveReceipt(code,data.request.id);if(ui.publicPayload?.nonce===code){ui.publicPayload=null;ui.publicLocked=false;ui.publicResult=data.request.id;ui.lastReceipt=code;ui.publicRows=[];ui.publicCustomer='';ui.message='';await loadPublicCatalog(false);}}
 catch(err){ui.trackError=String(err?.message||err);}finally{ui.trackBusy=false;render()}};
}
function adminV2Controls(r,lines){
 const id=Number(r.id);
 const done=lines.every(it=>Number(it.given)>=Number(it.qty));
 return `<div class="notice">เฉพาะคำขอทดสอบ: แก้จำนวนเบิก / ส่งมอบ / ยกเลิก • ไม่ต้องมอบหมายผู้ดูแล</div>${lines.map((it,j)=>`<div class="irow2"><span>${e(it.gift)}</span><label>จำนวนเบิก<input id="v2-qty-${id}-${j}" type="number" min="${Math.max(1,Number(it.given))}" max="20" step="1" value="${Number(it.qty)}" ${ui.busy?'disabled':''}></label><label>ส่งมอบแล้ว<input id="v2-given-${id}-${j}" type="number" min="${Number(it.given)}" max="20" step="1" value="${Number(it.given)}" ${ui.busy?'disabled':''}></label></div><p><button class="btn ghost sm" data-v2-action="save" data-rid="${id}" data-line="${j}" ${ui.busy?'disabled':''}>บันทึกจำนวนรายการนี้</button></p>`).join('')}<div class="request-actions"><button class="btn sm" data-v2-action="deliver_all" data-rid="${id}" ${done||ui.busy?'disabled':''}>ส่งมอบครบทั้งหมด</button><button class="btn danger sm" data-v2-action="cancel" data-rid="${id}" ${done||ui.busy?'disabled':''}>Cancel / คืนสต็อกส่วนที่ยังไม่ส่ง</button></div><p class="sub">เพิ่มจำนวนเบิกจะหักสต็อกเพิ่ม • ลดจำนวนจะคืนเฉพาะส่วนที่ยังไม่ส่งมอบ • ส่งมอบไม่หักสต็อกซ้ำ</p>`;
}
async function saveV2Action(b){
 if(ui.busy||ui.profile?.role!=='admin')return;
 const id=Number(b.dataset.rid),r=ui.requests.find(x=>Number(x.id)===id),lines=ui.items.filter(x=>Number(x.request_id)===id),action=b.dataset.v2Action;
 if(!testOnlyRequest(r,lines))return showError(Error('ไม่ใช่คำขอทดสอบ'));
 let qty=null,given=null,gift=null,description='';
 if(action==='save'){
 const j=Number(b.dataset.line),it=lines[j];if(!it)return;
 const q=$('v2-qty-'+id+'-'+j),g=$('v2-given-'+id+'-'+j);qty=Number(q.value);given=Number(g.value);gift=it.gift;
 if(q.value===''||g.value===''||!Number.isInteger(qty)||!Number.isInteger(given)||qty<1||qty>20||given<Number(it.given)||given>qty||qty<Number(it.given))return showError(Error('จำนวนไม่ถูกต้อง ห้ามลดต่ำกว่ายอดส่งมอบแล้ว'));
 if(qty===Number(it.qty)&&given===Number(it.given))return msg('ไม่มีจำนวนเปลี่ยนแปลง');
 description=`จำนวนเบิก ${it.qty} → ${qty} / ส่งมอบ ${it.given} → ${given} (สต็อกเปลี่ยนเฉพาะผลต่างจำนวนเบิก)`;
 }else if(action==='deliver_all'){description='ส่งมอบครบทั้งหมด โดยไม่หักสต็อกซ้ำ';}
 else if(action==='cancel'){description='ยกเลิกและคืนเฉพาะสต็อกส่วนที่ยังไม่ได้ส่งมอบ';}else return;
 if(!confirm('ยืนยันคำขอทดสอบ #'+id+'?\n'+description))return;
 // All V2 mutations use the server-side preview guard and optimistic snapshot comparison.
 const expected={handler:r.handler||'',items:lines.map(i=>({gift:i.gift,qty:Number(i.qty),given:Number(i.given),product_id:i.product_id})).sort((a,b)=>a.gift<b.gift?-1:a.gift>b.gift?1:0)};
 ui.busy=true;render();try{const result=requireOk(await db.rpc('gift_v2_admin',{p_request_id:id,p_action:action,p_expected:expected,p_gift:gift,p_qty:qty,p_given:given,p_handler:null}),'บันทึกคำขอ');if(result!==true)throw Error('ระบบยังไม่ยืนยันผล กรุณารีเฟรชก่อนลองอีกครั้ง');await loadData();msg('บันทึกคำขอทดสอบ #'+id+' สำเร็จ');}
 catch(err){showError(err)}finally{ui.busy=false;render()}
}
boot();
