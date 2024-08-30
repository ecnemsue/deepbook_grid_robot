import { getSuiPrice} from "@7kprotocol/sdk-ts";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { generateMnemonic } from 'bip39';
import { Secp256k1Keypair } from '@mysten/sui.js/keypairs/secp256k1';
import { Spot } from 'chakra-sdk';
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { normalizeSuiObjectId } from "@mysten/sui.js/utils";
import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import {
  decodeSuiPrivateKey,
  encodeSuiPrivateKey,
} from '@mysten/sui.js/cryptography';
import {depositCoin,withdrawCoin, borrowCoin, flashloan,repayFlashLoan, SignAndSubmitTXB, mergeCoins} from 'navi-sdk/dist/libs/PTB'
import { CoinInfo, Pool, PoolConfig } from "navi-sdk/dist/types";
import { AccountManager } from "navi-sdk/dist/libs/AccountManager";
import { CETUS, getConfig, pool, Sui, USDC, USDT, vSui } from 'navi-sdk/dist/address';
import { SignAndSubmitTXB } from 'navi-sdk/dist/libs/PTB'
import dotenv from 'dotenv';
import { NAVISDKClient } from "navi-sdk";
import { CoinInfo, Pool, PoolConfig, OptionType } from 'navi-sdk/src/types';
dotenv.config();
import { Dex } from "kriya-dex-sdk/dist/sdk/dex";
import { setTimeout } from 'timers/promises';
import { normalizeSuiObjectId } from '@mysten/sui.js/utils';
import configFile from './config.json';
import { bcs } from "@mysten/sui/bcs";

const SUI_COIN_TYPE = configFile.BASE_COIN_TYPE;
const USDC_COIN_TYPE =configFile.QUOTE_COIN_TYPE;
const poolId = configFile.poolId;//SUI-USDC pool

function fixed(int, n=4):number{
return Number(int.toFixed(n));
}


function init_girdprice(iseqratio,gridnum,lowerprice,pricegap,priceratiogap,decimals){
if (gridnum<=0){return;}

let price:number[] = new Array(gridnum);
let sum=0;
for(let i=0;i<gridnum;i++){
price[i]= fixed(iseqratio==1? lowerprice*(priceratiogap**i): lowerprice+pricegap*i,decimals);
sum+=price[i];
}
return [price,sum];
}

async function getTokenPrice(id, vsCoin = USDC_COIN_TYPE) {
    try {
        const response = await fetch(`${PRICES_API}/price?ids=${id}&vsCoin=${vsCoin}`);
        const prices = (await response.json());
        return prices?.[id]?.price || 0;
    }
    catch (error) {
        return 0;
    }
}



async function placeLimitOrder(
    tokenType1,
    tokenType2,
    price: number,
    quantity: number,
    isBid: boolean,
    expireTimestamp: number,
    restriction: number,
    accountCap: string ,
    txb,
	orderID,
	selfMatchingPrevention: SelfMatchingPreventionStyle = 0,
): TransactionBlock {
    txb.moveCall({
        typeArguments: [tokenType1, tokenType2],
        target: `0xdee9::clob_v2::place_limit_order`,
        arguments: [
            txb.object(poolId),
			txb.pure(orderID),
            txb.pure(Math.floor(Number(price.toFixed(4)) * 1000000)),
            txb.pure(quantity),
			txb.pure(selfMatchingPrevention),
            txb.pure(isBid),
            txb.pure(expireTimestamp),
            txb.pure(restriction),
            txb.object(SUI_CLOCK_OBJECT_ID),
            txb.object(accountCap),
        ],
    });
    return txb;
}
async function getMarketPrice(poolId: string,account,client_sui) {
		const txb = new TransactionBlock();
		txb.setGasBudget(2000000000);
		txb.moveCall({
			typeArguments: [SUI_COIN_TYPE,USDC_COIN_TYPE],
			target: `0xdee9::clob_v2::get_market_price`,
			arguments: [txb.object(poolId)],
		});
		let sender=account.getPublicKey();
		const result=(await client_sui.devInspectTransactionBlock({transactionBlock:txb, sender: sender})).results[0].returnValues.map(([bytes, _]) => {
      const opt = bcs.option(bcs.u64()).parse(Uint8Array.from(bytes));
      return opt == null ? void 0 : BigInt(opt);
    });
		return { bestBidPrice: result[0], bestAskPrice: result[1] };
	}
async function cancel_all_orders(poolId: string,account,client_sui,accountCap) {
		const txb = new TransactionBlock();
		txb.moveCall({
			typeArguments: [SUI_COIN_TYPE,USDC_COIN_TYPE],
			target: `0xdee9::clob_v2::cancel_all_orders`,
			arguments: [txb.object(poolId),
			txb.object(normalizeSuiObjectId(accountCap)),
			],
		});
	let sender=account.getPublicKey();
	txb.setSender(sender);
	txb.setGasBudget(1000000000);
	await SignAndSubmitTXB(txb, account.client, account.keypair);
	
	return 1;
}

async function cancel_order(poolId: string,account,client_sui,accountCap,orderID,txb) {
		txb.moveCall({
			typeArguments: [SUI_COIN_TYPE,USDC_COIN_TYPE],
			target: `0xdee9::clob_v2::cancel_order`,
			arguments: [txb.object(poolId),
			txb.pure(BigInt(orderID)),
			txb.object(normalizeSuiObjectId(accountCap)),
			],
		});
	return 1;
}

async function list_open_orders(poolId: string,account,client_sui,accountCap) {
		const txb = new TransactionBlock();
		txb.moveCall({
			typeArguments: [SUI_COIN_TYPE,USDC_COIN_TYPE],
			target: `0xdee9::clob_v2::list_open_orders`,
			arguments: [txb.object(poolId),
			txb.object(normalizeSuiObjectId(accountCap)),
			],
		});
	let sender=account.getPublicKey();
	txb.setSender(sender);
	txb.setGasBudget(1000000000);
	const Order = bcs.struct('Order', {
	orderId: bcs.u64(),
	clientOrderId: bcs.u64(),
	price: bcs.u64(),
	originalQuantity: bcs.u64(),
	quantity: bcs.u64(),
	isBid: bcs.bool(),
	owner: bcs.u256(),
	expireTimestamp: bcs.u64(),
	selfMatchingPrevention: bcs.u8(),
});
	const result=(await client_sui.devInspectTransactionBlock({transactionBlock:txb, sender: sender}));
	let anb=bcs.vector(Order).parse(Uint8Array.from(result.results[0].returnValues[0][0]));
	return anb;
}

async function account_balances(poolId: string,account,client_sui,accountCap) {
		const txb = new TransactionBlock();
		txb.moveCall({
			typeArguments: [SUI_COIN_TYPE,USDC_COIN_TYPE],
			target: `0xdee9::clob_v2::account_balance`,
			arguments: [txb.object(poolId),
			txb.object(accountCap),
			],
		});
	let sender=account.getPublicKey();
	txb.setSender(sender);
	txb.setGasBudget(1000000000);
	const result=(await client_sui.devInspectTransactionBlock({transactionBlock:txb, sender: sender})).results[0].returnValues.map(([bytes, _]) => {
    const opt = bcs.u64().parse(Uint8Array.from(bytes));
    return BigInt(opt);
    });
//	console.log(result);
	return {base_avail: result[0], base_locked: result[1], quote_avail:result[2], quote_locked:result[3]};
}


async function main() {

/* const signer=getsigner(pk); */

//const dex = new Dex("https://fullnode.mainnet.sui.io:443")
const mnemonic = configFile.mnemonic;
const client = new NAVISDKClient({mnemonic: mnemonic, networkType: "mainnet", numberOfAccounts: 1});
const client_sui = new SuiClient({ url: getFullnodeUrl('mainnet') });
let txb = new TransactionBlock();
//const todesCoin: CoinInfo = Sui;
//const toswapCoin: CoinInfo = vSui;
const config = await getConfig();
const account = client.accounts[0];
let sender = account.getPublicKey();
txb.setSender(sender);
// get sui price using sdk or from else where
//const suiPrice = await getSuiPrice();
//const lastprice=suiPrice;
//const PRICES_API = "https://prices.7k.ag";
//const suiPrice = await getTokenPrice("0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI");



// 从config文件中获取变量
const equi_ratio_mode=configFile.equi_ratio_mode;//等比网格模式
const lowerprice = configFile.lowerprice;//网格运行最低价格
const gridnum = configFile.gridnum;//网格数量
const amount = fixed(configFile.amount,2);//每网格下单的SUI的数量
const gridamount=amount * 10 **9;
const pricegap = configFile.pricegap;//相邻网格之间的价差(等差模式)
const priceratiogap=configFile.priceratiogap;////相邻网格之间的价比(等比模式)
const upperprice=equi_ratio_mode==1? lowerprice*(priceratiogap**gridnum) : lowerprice+gridnum*pricegap;//网格运行最高价格
const accountCap = configFile.accountCap;//托管子账户地址，可以去CETUS上DEEPBOOK的UI里查看地址，并存入代币
const expireTimestamp = configFile.expireTimestamp;//过期时间
const sleepperiod = configFile.sleepperiod;//循环周期：2.5秒
const MEVmode = configFile.trend_adj_mode; //开启trend_adj模式
const MEV_scale = configFile.trend_adj_scale;
const price_decimals=configFile.price_decimals;//价格精度(小数点)




const [grid_price, pricesum] = init_girdprice(equi_ratio_mode,gridnum,lowerprice,pricegap,priceratiogap,price_decimals);

let i=0;
var j=0;
var loopcount=0;
var orderstates:number[] = new Array(gridnum).fill(0);
var mev:number[] = new Array(gridnum).fill(0);



await cancel_all_orders(poolId,account,client_sui,accountCap);
console.log("已经清除所有挂单");

const result = await getMarketPrice(poolId,account,client_sui);
let BidPrice=Number(result.bestBidPrice)*0.000001
let AskPrice=Number(result.bestAskPrice)*0.000001
console.log("当前Bid价格"+BidPrice+",Ask价格"+AskPrice);
let lastBidprice=BidPrice;
let lastAskprice=AskPrice;

await setTimeout(2000);
while (i<gridnum){
if (grid_price[i]<BidPrice){

placeLimitOrder(
    SUI_COIN_TYPE,
    USDC_COIN_TYPE,
    grid_price[i],
    gridamount,
    true,
    expireTimestamp,
    0,
    accountCap,
    txb,
	i);
	orderstates[i]=1;
	mev[i]=0;
}
if (grid_price[i]>AskPrice){
placeLimitOrder(
    SUI_COIN_TYPE,
    USDC_COIN_TYPE,
    grid_price[i],
    gridamount,
    false,
    expireTimestamp,
    0,
    accountCap,
    txb,
	i);
	orderstates[i]=-1;
	mev[i]=0;
}
i+=1;
}

txb.setGasBudget(2000000000);
const result1 = (await SignAndSubmitTXB(txb, account.client, account.keypair)).effects.status.status;
if (result1=='success'){
console.log('网格订单初始化成功，区间['+lowerprice+','+upperprice+'],网格数量'+gridnum+'.', result1.confirmedLocalExecution);
}
else{
console.log('网格订单初始化失败! 请检查托管账户余额是否充足');
return;
}


//获取余额信息
let balances=await account_balances(poolId,account,client_sui,accountCap);
let base_a:number=Number((Number(balances.base_avail)*10**(-9)).toFixed(1));
let base_l:number=Number((Number(balances.base_locked)*10**(-9)).toFixed(1));
let quote_a:number=Number((Number(balances.quote_avail)*10**(-6)).toFixed(1));
let quote_l:number=Number((Number(balances.quote_locked)*10**(-6)).toFixed(1));
let balance_u =(BidPrice*(base_a+base_l)+quote_a+quote_l).toFixed(1);
console.log('账户总价值:'+(balance_u)+' USDC,其中可用sui:'+base_a+',下单锁定sui:'+base_l+',可用USDC:'+quote_a+',锁定USDC:'+quote_l);	
//维护真实OrderID数组
var order_real_Id:BigInt[] = new Array(gridnum).fill(BigInt(0));
let order_list=await list_open_orders(poolId,account,client_sui,accountCap);
let list_index=0;
while (list_index<order_list.length){
order_real_Id[Number(BigInt(order_list[list_index].clientOrderId))]=BigInt(order_list[list_index].orderId);
list_index+=1;
}
//console.table(order_list,['orderId','clientOrderId','price','isBid']);

await setTimeout(5000);
var flag=0;
var ticknum=-1;
var lastfinishnum=-1;
while (true){
try{
	let result_temp = await getMarketPrice(poolId,account,client_sui);
	BidPrice=Number((Number(result_temp.bestBidPrice)*0.000001).toFixed(4));
	AskPrice=Number((Number(result_temp.bestAskPrice)*0.000001).toFixed(4));
	if (loopcount%3==0){
		console.log("当前Bid价格"+BidPrice+",Ask价格"+AskPrice);
	}
} 
catch (e:any){
    console.log(e,'Network error at getting price')
	BidPrice=0;
	AskPrice=0;
}
let flag_fin=0;

if (BidPrice>lowerprice-pricegap*2 & AskPrice<upperprice+pricegap*2){
	i=0;
let	txb = new TransactionBlock();
	txb.setSender(sender);
	while (i<gridnum){
		if ((grid_price[i]+mev[i]*MEV_scale*pricegap<AskPrice & orderstates[i]==-1)| ( orderstates[i]==1 & grid_price[i]-mev[i]*MEV_scale*pricegap>BidPrice)|(order_real_Id[i]==BigInt(0) & orderstates[i]!=0)){
		j+=1;
		console.log((orderstates[i]==1?"Bid单:":"Ask单:")+(grid_price[i]-orderstates[i]*mev[i]*MEV_scale*pricegap)+",Id="+order_real_Id[i]+"已成交，总成交量:"+j*amount);
		orderstates[i]=0;
		flag_fin=1;
		if (Math.abs(grid_price[i]-BidPrice)<Math.abs(grid_price[lastfinishnum]-BidPrice)| flag_fin==0){
			lastfinishnum=i;
		}
		}
		if (orderstates[i]==0 & i!=lastfinishnum & quote_a>amount*(grid_price[i]) & i+1<gridnum & (BidPrice-grid_price[i]>pricegap+mev[i+1]*MEV_scale*pricegap| BidPrice-grid_price[i]>pricegap*0.4 &orderstates[i+1]==0)){
		placeLimitOrder(
			SUI_COIN_TYPE,
			USDC_COIN_TYPE,
			grid_price[i],
			gridamount,
			true,
			expireTimestamp,
			0,
			accountCap,
			txb,
			i);
			orderstates[i]=1;
			mev[i]=0;
			order_real_Id[i]=BigInt(-1);
			console.log("补充Bid单:"+(grid_price[i])+"当前最高Bid价格:"+BidPrice);
			flag=1;
		}
		if (orderstates[i]==0 & i!=lastfinishnum &base_a> amount  & i-1>=0 & ((grid_price[i]-AskPrice>pricegap+mev[i-1]*MEV_scale*pricegap)| (grid_price[i]-AskPrice>pricegap*0.4 & orderstates[i-1]==0))){
		placeLimitOrder(
			SUI_COIN_TYPE,
			USDC_COIN_TYPE,
			grid_price[i],
			gridamount,
			false,
			expireTimestamp,
			0,
			accountCap,
			txb,
			i);
			orderstates[i]=-1;
			order_real_Id[i]=BigInt(-1);
			mev[i]=0;
			console.log("补充Ask单:"+(grid_price[i])+"当前最低Ask价格:"+AskPrice);
			flag=1;
		}
		
	i+=1;

//MEV行为
	if (MEVmode==1& equi_ratio_mode!=1 &base_a> amount & orderstates[i]==-1 & grid_price[i]-AskPrice<MEV_scale*1.5*pricegap  & mev[i]==0& order_real_Id[i]!=BigInt(0)& grid_price[i]>AskPrice*1.0001){
		await cancel_order(poolId,account,client_sui,accountCap,order_real_Id[i],txb);
		placeLimitOrder(
				SUI_COIN_TYPE,
				USDC_COIN_TYPE,
				grid_price[i]+MEV_scale*pricegap,
				gridamount,
				false,
				expireTimestamp,
				0,
				accountCap,
				txb,
				i);	
		console.log('尝试调整订单价格'+(grid_price[i])+ '，当前最低Ask价格：'+AskPrice);
		ticknum=i;
		flag=1;
	}
	if (MEVmode==1 & equi_ratio_mode!=1 &quote_a>amount*(grid_price[i])	 & orderstates[i]==1 & BidPrice-lowerprice-i*pricegap<MEV_scale*1.5*pricegap  &  mev[i]==0 & order_real_Id[i]!=BigInt(0) & grid_price[i]<BidPrice*0.9999){
		cancel_order(poolId,account,client_sui,accountCap,order_real_Id[i],txb);
		placeLimitOrder(
				SUI_COIN_TYPE,
				USDC_COIN_TYPE,
				grid_price[i]-MEV_scale*pricegap,
				gridamount,
				true,
				expireTimestamp,
				0,
				accountCap,
				txb,
				i);		
		console.log('尝试调整订单价格'+(grid_price[i])+'，当前最低Bid价格：'+BidPrice);
		ticknum=i;
		flag=1;	
	}
	}
	if (flag==1){
		txb.setGasBudget(1000000000);
			try{
			let txresult= (await SignAndSubmitTXB(txb, account.client, account.keypair)).effects.status.status;	
			console.log(txresult);
			if (ticknum>=0 & txresult=='success'){
			mev[ticknum]=1;
			}	
			} 
			catch (e:any){
				console.log(e,'Network error at sending txb')
			}

	}
	
}

if (flag==1 | loopcount%15==0){
//更新真实OrderId数组
	try{
		let order_list=await list_open_orders(poolId,account,client_sui,accountCap);
		let list_index=0;
		order_real_Id = new Array(gridnum).fill(BigInt(0));
		while (list_index<order_list.length){
			order_real_Id[Number(BigInt(order_list[list_index].clientOrderId))]=BigInt(order_list[list_index].orderId);
			list_index+=1;
		}
		if(loopcount%90==0){
			console.log("更新OrderId完毕:");
			console.table(order_list,['orderId','clientOrderId','price','isBid']);
			
		//更新账户余额
		balances=await account_balances(poolId,account,client_sui,accountCap);
		base_a=Number((Number(balances.base_avail)*10**(-9)).toFixed(1));
		base_l=Number((Number(balances.base_locked)*10**(-9)).toFixed(1));
		quote_a=Number((Number(balances.quote_avail)*10**(-6)).toFixed(1));
		quote_l=Number((Number(balances.quote_locked)*10**(-6)).toFixed(1));
		balance_u =(BidPrice*(base_a+base_l)+quote_a+quote_l).toFixed(1);
		let date: Date = new Date();
		console.log('账户总价值:'+(balance_u)+' USDC,其中可用sui:'+base_a+',下单锁定sui:'+base_l+',可用USDC:'+quote_a+',锁定USDC:'+quote_l+', at '+date.toLocaleString());	
		} 
	} 
	catch (e:any){
				console.log(e,'Network error at updating OrderId')
		}
}
flag=0;
lastBidprice=BidPrice;
lastAskprice=AskPrice;
loopcount+=1;
ticknum=-1;
await setTimeout(sleepperiod);
}
}
main().then().catch(console.warn);









