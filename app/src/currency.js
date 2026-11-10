// Approximate conversion of USD cost estimates (INR uses India-specific prices), as on the website
export const FX = { USD: [1, "$"], INR: [88, "₹"], EUR: [0.86, "€"], GBP: [0.75, "£"], JPY: [150, "¥"], CNY: [7.1, "CN¥"], AUD: [1.52, "A$"], CAD: [1.38, "C$"], SGD: [1.29, "S$"], AED: [3.67, "AED "], SAR: [3.75, "SAR "], BDT: [122, "৳"], PKR: [282, "Rs "], NPR: [141, "NPR "], LKR: [300, "LKR "], NGN: [1500, "₦"], KES: [129, "KSh "], ZAR: [17.6, "R "], BRL: [5.4, "R$"], MXN: [18.5, "MX$"], IDR: [16300, "Rp "], PHP: [57, "₱"] };
const TZCUR = { "Asia/Calcutta": "INR", "Asia/Kolkata": "INR", "Europe/London": "GBP", "Asia/Tokyo": "JPY", "Asia/Shanghai": "CNY", "Australia/Sydney": "AUD", "Asia/Dubai": "AED", "Asia/Singapore": "SGD", "Asia/Dhaka": "BDT", "Asia/Karachi": "PKR", "Asia/Kathmandu": "NPR", "Africa/Lagos": "NGN", "Africa/Nairobi": "KES", "Africa/Johannesburg": "ZAR" };
export function defaultCurrency() {
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (TZCUR[tz]) return TZCUR[tz]; if (/^Europe\//.test(tz)) return "EUR"; } catch {}
  return "USD";
}
const num = v => { const n = Number(v); return isFinite(n) && n >= 0 ? n : null; };
function fmt(cur, lo, hi) {
  const [rate, sym] = FX[cur] || FX.USD;
  const f = n => { const v = n * rate; const r = v >= 1000 ? Math.round(v / 10) * 10 : v >= 100 ? Math.round(v) : Math.round(v * 10) / 10; return sym + r.toLocaleString(); };
  if (lo == null && hi == null) return "—";
  if (hi == null || hi === lo) return f(lo ?? hi);
  return f(lo ?? 0) + " – " + f(hi);
}
export function costText(t, cur) {
  const a = v => (Array.isArray(v) ? v : []);
  if (cur === "INR" && a(t.inr).length) { const lo = num(t.inr[0]), hi = num(t.inr[1]); if (lo != null || hi != null) return fmt(cur, (lo ?? hi) / 88, (hi ?? lo) / 88); }
  return fmt(cur, num(a(t.usd)[0]), num(a(t.usd)[1]));
}
