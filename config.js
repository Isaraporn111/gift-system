// ตั้งค่าบริษัทในเครือ: 1 บริษัท = 1 บรรทัด
// code  = รหัสสั้น ๆ ภาษาอังกฤษ (ใช้ต่อท้ายลิงก์ เช่น .../#alpha)
// name  = ชื่อที่แสดงบนหน้าเว็บ
// api   = URL ของ Web app ที่ได้จากการ Deploy Apps Script ของบริษัทนั้น (ลงท้ายด้วย /exec)
window.APP_CONFIG = {
  companies: [
    { code: "Get On", name: "Get On Technology", api: "https://script.google.com/macros/s/AKfycbwgWTRNqoIwWO2FN4IGP6L7uNT5ZUjKiykg_Q9uJ2wq9Rh4F-_8_VgU31b574hnSAlFUw/exec" }
  ]
};
