// réplica da fórmula antiga do backtest (antes da correção)
import { rsi, volatility } from "../src/lib/market";
function sma(s:number[],p:number){const x=s.slice(-p);return x.reduce((a,b)=>a+b,0)/x.length;}
const price:number[]=[]; let p0=100;
for(let i=0;i<168;i++){ p0*= 1+0.004+0.004*Math.sin(i/5); price.push(p0); }
const cfg={minConfidence:62,takeProfit:2.5,stopLoss:1.5};
let capital=100,openAt:number|null=null,trades=0,wins=0;
for(let i=50;i<price.length;i++){const w=price.slice(0,i+1);const pr=w[w.length-1];const r=rsi(w);const v=volatility(w.slice(-72));const trendUp=sma(w,12)>=sma(w,48);
let s=50; s+=trendUp?15:-12; if(r<35)s+=18; if(r>70)s-=20; s-=Math.min(18,v*4);
const c=Math.max(8,Math.min(92,Math.round(s)));
if(openAt===null){if(c>=cfg.minConfidence&&trendUp){openAt=pr;}}else{const ch=(pr/openAt-1)*100;if(ch>=cfg.takeProfit||ch<=-cfg.stopLoss||r>72||i===price.length-1){trades++;if(ch>0)wins++;capital*=1+ch/100;openAt=null;}}}
console.log({trades,win:trades?(wins/trades*100).toFixed(1):"0",ret:(capital-100).toFixed(2)});
