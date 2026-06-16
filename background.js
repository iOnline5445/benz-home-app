chrome.action.onClicked.addListener((tab) => {
  // เปิดลิงก์หน้าเว็บออนไลน์ตัวจริงที่คุณใช้งานเป็นประจำ
  chrome.tabs.create({ url: "https://ionline5445.github.io/benz-home-app/index.html" });
  
  // หมายเหตุ: หากต้องการให้เปิดระบบในเครื่อง (Laragon) แทน ให้แก้ URL ด้านบนเป็น:
  // "http://localhost/benzhomeagency/index.html"
});
