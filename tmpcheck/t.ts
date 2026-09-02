import { backtest, defaultConfig } from "../src/lib/backtest";
// forte tendência de alta com ruído
const price:number[]=[]; let p=100;
for(let i=0;i<168;i++){ p*= 1+0.004+0.004*Math.sin(i/5); price.push(p); }
const coin:any={id:"x",symbol:"x",name:"X",image:"",current_price:p,price_change_percentage_24h:5,total_volume:1e9,market_cap:2e10,sparkline_in_7d:{price}};
const r=backtest(coin,defaultConfig);
console.log({trades:r.trades.length,win:r.winRate.toFixed(1),ret:r.totalReturnPct.toFixed(2),bh:r.buyHoldPct.toFixed(2)});
