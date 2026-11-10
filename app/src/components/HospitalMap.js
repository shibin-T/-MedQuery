// A live street map of the hospitals (OpenStreetMap + Leaflet), numbered like the list.
// Phones: react-native-webview. Web: an iframe.
import React from "react";
import { Platform, View } from "react-native";
import { useTheme } from "../theme";

function html(origin, places, accent) {
  const data = JSON.stringify({ origin: origin ? [origin.lat, origin.lon] : null, places: places.filter(p => p.lat != null).map(p => ({ n: p.rank, name: p.name, km: p.km, phone: p.phone || "", lat: p.lat, lon: p.lon, er: !!p.er })) }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>html,body,#m{height:100%;margin:0}.pin{background:${accent};color:#fff;border:2px solid #fff;border-radius:50%;width:26px;height:26px;display:grid;place-items:center;font:700 12px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.4)}.pin.er{background:#e0122f}.me{background:#1a73e8;border:3px solid #fff;border-radius:50%;width:14px;height:14px;box-shadow:0 0 0 4px rgba(26,115,232,.3)}.pop b{display:block;font:600 14px system-ui}.pop span{font:13px system-ui;color:#555}</style>
</head><body><div id="m"></div><script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script><script>
var D=${data};
if(!window.L){document.getElementById('m').innerHTML='<p style="font:15px system-ui;padding:16px;color:#555">The map needs an internet connection. Use the list and Directions instead.</p>';}else{
var m=L.map('m',{zoomControl:true});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);
var pts=[];
if(D.origin){L.marker(D.origin,{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[14,14]})}).addTo(m);pts.push(D.origin);}
D.places.forEach(function(p){var d=document.createElement('div');d.className='pop';var b=document.createElement('b');b.textContent=p.n+'. '+p.name;var s=document.createElement('span');s.textContent=(p.km!=null?'≈ '+(p.km<10?p.km.toFixed(1):Math.round(p.km))+' km':'')+(p.er?' · 24-hour emergency':'')+(p.phone?' · '+p.phone:'');d.appendChild(b);d.appendChild(s);
L.marker([p.lat,p.lon],{icon:L.divIcon({className:'',html:'<div class="pin'+(p.er?' er':'')+'">'+p.n+'</div>',iconSize:[26,26]})}).addTo(m).bindPopup(d);pts.push([p.lat,p.lon]);});
if(pts.length)m.fitBounds(pts,{padding:[30,30],maxZoom:15});else m.setView([20,78],4);
}
</script></body></html>`;
}

export default function HospitalMap({ origin, places, height = 320 }) {
  const t = useTheme();
  const src = html(origin, places, t.accent);
  if (Platform.OS === "web") {
    return <View style={{ height, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: t.rule }}>
      {React.createElement("iframe", { srcDoc: src, title: "Map of hospitals", style: { border: 0, width: "100%", height: "100%" } })}
    </View>;
  }
  const { WebView } = require("react-native-webview");
  return <View style={{ height, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: t.rule }}>
    <WebView originWhitelist={["*"]} source={{ html: src }} style={{ flex: 1 }} setSupportMultipleWindows={false} accessibilityLabel="Map of hospitals" />
  </View>;
}
