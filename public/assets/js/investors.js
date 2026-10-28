import './app.js';
const D = [['FY22', 116, 24], ['FY25', 1343, 671], ['FY26', 2775, 1394]];
const max = 2775;
document.getElementById('bars').innerHTML = D.map(([y, r, p]) => `<div style="margin-bottom:14px"><b class="small">${y}</b>
  <div class="bar-row" style="margin-top:4px"><span class="small muted">Revenue</span><div class="meter" style="margin:0"><i style="width:${(r / max) * 100}%"></i></div><b class="num small">${r.toLocaleString()}</b></div>
  <div class="bar-row" style="margin-top:4px"><span class="small muted">Net profit</span><div class="meter" style="margin:0"><i style="width:${(p / max) * 100}%;background:var(--navy-700)"></i></div><b class="num small">${p.toLocaleString()}</b></div></div>`).join('');
