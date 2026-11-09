// ตั้งค่าบริษัทในเครือ: 1 บริษัท = 1 บรรทัด
// code  = รหัสสั้น ๆ ภาษาอังกฤษ (ใช้ต่อท้ายลิงก์ เช่น .../#alpha)
// name  = ชื่อที่แสดงบนหน้าเว็บ
// api   = URL ของ Web app ที่ได้จากการ Deploy Apps Script ของบริษัทนั้น (ลงท้ายด้วย /exec)
window.APP_CONFIG = {
  companies: [
    { code: "alpha", name: "บริษัท อัลฟ่า จำกัด", api: "https://script.google.com/macros/s/XXXX-ใส่-URL-ของอัลฟ่า/exec" },
    { code: "beta",  name: "บริษัท เบต้า จำกัด",  api: "https://script.google.com/macros/s/XXXX-ใส่-URL-ของเบต้า/exec" }
  ]
};
