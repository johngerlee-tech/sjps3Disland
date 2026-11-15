// Google Firebase 免費雲端設定 (方案 B：真實 Google 帳號登入 + Firestore 即時同步)
// 使用方式：
// 1. 至 https://console.firebase.google.com/ 建立免費專案 (Spark Plan 0 元)
// 2. 啟用 Authentication -> Sign-in method -> 開啟「Google」登入，並將學校網域加入「已授權網域」
// 3. 啟用 Firestore Database (選擇 asia-east1 台灣機房)，設定讀寫規則後將下方 enabled 改為 true 並貼上專案金鑰

window.FIREBASE_CONFIG = {
  enabled: true,
  apiKey: "AIzaSyAISnpp7NKO_iP9XrMGOAc9CtlldIPuapk",
  authDomain: "sjps-eae30.firebaseapp.com",
  projectId: "sjps-eae30",
  storageBucket: "sjps-eae30.firebasestorage.app",
  messagingSenderId: "756133657143",
  appId: "1:756133657143:web:a86afb2637f4da84bc9db2",
  measurementId: "G-PZD7XTCYE5"
};
