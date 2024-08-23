# deepbook_grid_robot
A simple grid strategy trading robot working upon deepbook-v2 in Sui network. This program was written in TypeScript, and one should formulate your custodian account and adjust the file config.json before running. These codes were made intended to learn interactions around deepbook, comments and improvements are welcome!

text fomat for config.json:
<code>
  "BASE_COIN_TYPE": "0x2::sui::SUI",   //token 1 type
  "QUOTE_COIN_TYPE": "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN", //token 2 type
  "poolId": "0x4405b50d791fd3346754e8171aaab6bc2ed26c2c46efdd033c14b30ae507ac33",  //poolId, here is SUI-USDC pool
  "mnemonic":"trigger swim reunion gate hen black real deer light nature trial dust",// your wallet seed phase
  "lowerprice": 0.757,//lowest price for bot running
  "gridnum": 55, // the total number of grids, <100
  "amount": 70, //the amount each one grid will trade
  "pricegap": 0.004,  //smallest price difference between grids
  "accountCap": "0x770cbeb75fd2b....", //custodian account address, you can find it in Cetus's Deepbook UI
  "expireTimestamp": 1773961013385, 
  "sleepperiod": 2500, //loop period =2.5s
  "trend_adj_mode": 0, // a extra mode which can allow bot slightly adjusting the grid price under a trend
  "trend_adj_scale": 0.1,
  "equi_ratio_mode":0,// =1 then shift to equivalent ratio grids mode, otherwise keep the equivalent difference grids mode
  "priceratiogap":1.004,// price ratio between each grid in equivalent ratio grids mode
  "price_decimals":4 
</code>

Suika.sui
