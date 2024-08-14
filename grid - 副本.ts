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


const SUI_COIN_TYPE = "0x2::sui::SUI";
const USDC_COIN_TYPE =
  "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
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
import { bcs } from "@mysten/sui/bcs";


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
    const poolId = "0x4405b50d791fd3346754e8171aaab6bc2ed26c2c46efdd033c14b30ae507ac33";//SUI-USDC pool
    txb.moveCall({
        typeArguments: [tokenType1, tokenType2],
        target: `0xdee9::clob_v2::place_limit_order`,
        arguments: [
            txb.object(poolId),
			txb.pure(orderID),
            txb.pure(Math.floor(price * 1000000)),
            txb.pure(quantity),
			txb.pure(selfMatchingPrevention),
            txb.pure(isBid),
            txb.pure(Math.floor(expireTimestamp)),
            txb.pure(restriction),
            txb.object(SUI_CLOCK_OBJECT_ID),
            txb.object(normalizeSuiObjectId(accountCap)),
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
		sender=account.getPublicKey();
		const result=(await client_sui.devInspectTransactionBlock({transactionBlock:txb, sender: sender})).results[0].returnValues.map(([bytes, _]) => {
      const opt = bcs.option(bcs.U64).parse(Uint8Array.from(bytes));
      return opt == null ? void 0 : BigInt(opt);
    });
		return { bestBidPrice: result[0], bestAskPrice: result[1] };
	}
async function cancel_all_orders(poolId: string,account,client_sui,accountCap) {
		const txb = new TransactionBlock();
		txb.setGasBudget(2000000000);
		txb.moveCall({
			typeArguments: [SUI_COIN_TYPE,USDC_COIN_TYPE],
			target: `0xdee9::clob_v2::cancel_all_orders`,
			arguments: [txb.object(poolId),
			txb.object(normalizeSuiObjectId(accountCap)),
			],
		});
	sender=account.getPublicKey();
	await client_sui.devInspectTransactionBlock({transactionBlock:txb, sender: sender});
	
	return 1;
}


const dex = new Dex("https://fullnode.mainnet.sui.io:443")
const mnemonic = "scissors priority envelope ....";//主账户钱包助记词
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

const lowerprice=0.93;//网格运行最低价格
const gridnum=10;//网格数量
const gridamount=1 * 10 **9;//每网格下单的SUI的数量
const pricegap=0.01;//相邻网格之间的价差
const upperprice=lowerprice+gridnum*pricegap//网格运行最高价格
const accountCap='0x770cbeb75fd2bd48e85e91717b0f4672ac0831e05d71c8be7a9abd4938c4586f'; //托管子账户地址，可以去CETUS上DEEPBOOK的UI里查看地址，并存入代币
const expireTimestamp=4877104494842;//过期时间:2124年
const sleepperiod=3500; //循环周期：3.5秒
let i=0;
var orderstates:number[] = new Array(gridnum)




await cancel_all_orders("0x4405b50d791fd3346754e8171aaab6bc2ed26c2c46efdd033c14b30ae507ac33",account,client_sui,accountCap);
console.log("已经清除所有挂单");

const result = await getMarketPrice("0x4405b50d791fd3346754e8171aaab6bc2ed26c2c46efdd033c14b30ae507ac33",account,client_sui);
let BidPrice=Number(result.bestBidPrice)*0.000001
let AskPrice=Number(result.bestBidPrice)*0.000001
console.log("当前Bid价格"+BidPrice+",Ask价格"+AskPrice);
let lastBidprice=BidPrice;
let lastAskprice=AskPrice;


while (i<gridnum){
if (lowerprice+i*pricegap<BidPrice){

placeLimitOrder(
    SUI_COIN_TYPE,
    USDC_COIN_TYPE,
    lowerprice+i*pricegap,
    gridamount,
    true,
    expireTimestamp,
    0,
    accountCap,
    txb,
	i);
	orderstates[i]=1;
}
if (lowerprice+i*pricegap>AskPrice){
placeLimitOrder(
    SUI_COIN_TYPE,
    USDC_COIN_TYPE,
    lowerprice+i*pricegap,
    gridamount,
    false,
    expireTimestamp,
    0,
    accountCap,
    txb,
	i);
	orderstates[i]=-1;
}
i+=1;
}

txb.setGasBudget(1000000000);
const result1 = await SignAndSubmitTXB(txb, account.client, account.keypair);
console.log('网格订单初始化成功，区间['+lowerprice+','+upperprice+'],网格数量'+gridnum+'.', result1.confirmedLocalExecution);

await setTimeout(5000);
let flag=0;

//网格循环
while (true){
let result_temp = await getMarketPrice("0x4405b50d791fd3346754e8171aaab6bc2ed26c2c46efdd033c14b30ae507ac33",account,client_sui);
BidPrice=Number(result_temp.bestBidPrice)*0.000001
AskPrice=Number(result_temp.bestBidPrice)*0.000001
console.log("当前Bid价格"+BidPrice+",Ask价格"+AskPrice);

if (BidPrice>lowerprice & AskPrice<upperprice){
	i=0;
let	txb = new TransactionBlock();
	sender = account.getPublicKey();
	txb.setSender(sender);
	while (i<gridnum){
		if ((lowerprice+i*pricegap-lastBidprice)*(lowerprice+i*pricegap-Bidprice)<0 | Math.abs(lowerprice+i*pricegap-Bidprice)<0.001 | Math.abs(lowerprice+i*pricegap-Askprice)<0.001){
		orderstates[i]=0;
		}
		if (orderstates[i]==0 & Bidprice-lowerprice-i*pricegap>pricegap){
		placeLimitOrder(
			SUI_COIN_TYPE,
			USDC_COIN_TYPE,
			lowerprice+i*pricegap,
			gridamount,
			true,
			expireTimestamp,
			0,
			accountCap,
			txb,
			i);
			orderstates[i]=1;
			console.log("补充Bid单:"+(lowerprice+i*pricegap)+"当前最高Bid价格:"+Bidprice);
			flag=1;
		}
		if (orderstates[i]==0 & lowerprice+i*pricegap-Askprice>pricegap){
		placeLimitOrder(
			SUI_COIN_TYPE,
			USDC_COIN_TYPE,
			lowerprice+i*pricegap,
			gridamount,
			false,
			expireTimestamp,
			0,
			accountCap,
			txb,
			i);
			orderstates[i]=1;
			console.log("补充Ask单:"+(lowerprice+i*pricegap)+"当前最低Ask价格:"+Askprice);
			flag=1;
		}
		
	i+=1;
	}
	
	if (flag==1){
		await SignAndSubmitTXB(txb, account.client, account.keypair);
	}
	
}
flag=0;
lastBidprice=BidPrice;
lastAskprice=AskPrice;
await setTimeout(sleepperiod);
}










