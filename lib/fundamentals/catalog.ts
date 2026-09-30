export const currencies: Record<string,{name:string;bank:string;url:string;focus:string}> = {
 EUR:{name:'Euro',bank:'Banque centrale européenne',url:'https://www.ecb.europa.eu/',focus:'Inflation, salaires, croissance et décisions de la BCE.'},
 USD:{name:'Dollar américain',bank:'Réserve fédérale',url:'https://www.federalreserve.gov/',focus:'Inflation CPI/PCE, emploi américain, rendements et décisions de la Fed.'},
 GBP:{name:'Livre sterling',bank:'Bank of England',url:'https://www.bankofengland.co.uk/',focus:'Inflation britannique, salaires, activité et décisions de la BoE.'},
 JPY:{name:'Yen japonais',bank:'Bank of Japan',url:'https://www.boj.or.jp/en/',focus:'Politique de la BoJ, inflation, salaires et communication sur le yen.'},
 CHF:{name:'Franc suisse',bank:'Banque nationale suisse',url:'https://www.snb.ch/',focus:'Inflation suisse, décisions de la BNS et contexte international.'},
 CAD:{name:'Dollar canadien',bank:'Banque du Canada',url:'https://www.bankofcanada.ca/',focus:'Inflation, emploi, décisions de la Banque du Canada et pétrole.'},
 AUD:{name:'Dollar australien',bank:'Reserve Bank of Australia',url:'https://www.rba.gov.au/',focus:'Inflation, emploi, décisions de la RBA et activité chinoise.'},
 NZD:{name:'Dollar néo-zélandais',bank:'Reserve Bank of New Zealand',url:'https://www.rbnz.govt.nz/',focus:'Inflation, emploi, activité et décisions de la RBNZ.'},
 XAU:{name:'Or',bank:'World Gold Council',url:'https://www.gold.org/',focus:'Taux réels américains, dollar, flux vers l’or et risque géopolitique.'}
};
export const pairs=['EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD','NZDUSD','CHFJPY','GBPCHF','AUDJPY','CADJPY','GBPJPY','EURJPY','AUDCHF','CADCHF','EURNZD','GBPCAD','NZDCAD','AUDCAD','EURGBP','EURCHF','EURCAD','EURAUD','GBPAUD','GBPNZD','AUDNZD','NZDJPY','NZDCHF','XAUUSD'];
export type Citation={start_index:number;end_index:number;url:string;title:string};
export type Brief={pair:string;generatedAt:string;blocks:{text:string;citations:Citation[]}[]};
export function safeSource(url:string){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
