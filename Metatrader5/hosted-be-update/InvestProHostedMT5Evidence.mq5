#property strict
#property version "1.00"
#property description "Lecture seule InvestPro : export des SL de cloture, aucun ordre, aucune DLL."

// Python's TradeDeal does not expose DEAL_SL. The MQL5 history property is
// documented as the position's stop at closing for an exit deal. Do not replace
// this with ORDER_SL or a sampled open-position stop.
#define MAX_EVIDENCE_DEALS 1000

string Q(string s){
 string out="\"";
 for(int i=0;i<StringLen(s);i++){
  ushort c=StringGetCharacter(s,i);
  if(c==34)out+="\\\"";
  else if(c==92)out+="\\\\";
  else if(c<32)out+=StringFormat("\\u%04x",(int)c);
  else out+=StringSubstr(s,i,1);
 }
 return out+"\"";
}

bool WriteSnapshot(){
 if(!TerminalInfoInteger(TERMINAL_CONNECTED))return false;
 long login=AccountInfoInteger(ACCOUNT_LOGIN);
 string server=AccountInfoString(ACCOUNT_SERVER),currency=AccountInfoString(ACCOUNT_CURRENCY);
 if(login<=0||StringLen(server)==0||StringLen(currency)==0)return false;
 if(!HistorySelect(0,TimeCurrent()+86400))return false;
 int count=HistoryDealsTotal(),written=0;
 string rows="";
 // Most recent exits first. Omitted older positions receive no evidence;
 // Python still synchronizes their monetary history unchanged.
 for(int i=count-1;i>=0&&written<MAX_EVIDENCE_DEALS;i--){
  ulong ticket=HistoryDealGetTicket(i);
  if(ticket==0)return false;
  long kind=HistoryDealGetInteger(ticket,DEAL_TYPE),entry=HistoryDealGetInteger(ticket,DEAL_ENTRY);
  if((kind!=DEAL_TYPE_BUY&&kind!=DEAL_TYPE_SELL)||entry!=DEAL_ENTRY_OUT)continue;
  long position=HistoryDealGetInteger(ticket,DEAL_POSITION_ID);
  long reason=HistoryDealGetInteger(ticket,DEAL_REASON),stamp=HistoryDealGetInteger(ticket,DEAL_TIME_MSC);
  double price=HistoryDealGetDouble(ticket,DEAL_PRICE),volume=HistoryDealGetDouble(ticket,DEAL_VOLUME);
  double stop=HistoryDealGetDouble(ticket,DEAL_SL);
  string symbol=HistoryDealGetString(ticket,DEAL_SYMBOL);
  if(position<=0||stamp<=0||StringLen(symbol)==0||StringLen(symbol)>128||reason<0||reason>255
     ||!MathIsValidNumber(price)||price<=0||!MathIsValidNumber(volume)||volume<=0
     ||!MathIsValidNumber(stop)||stop<0)return false;
  if(written>0)rows+=",";
  rows+="{\"ticket\":"+Q((string)ticket)+",\"position_id\":"+Q((string)position)
       +",\"symbol\":"+Q(symbol)+",\"time_msc\":"+(string)stamp+",\"reason\":"+(string)reason
       +",\"price\":"+DoubleToString(price,16)+",\"volume\":"+DoubleToString(volume,16)
       +",\"stop_loss\":"+(stop>0?DoubleToString(stop,16):"null")+"}";
  written++;
 }
 if(!TerminalInfoInteger(TERMINAL_CONNECTED)||AccountInfoInteger(ACCOUNT_LOGIN)!=login
    ||AccountInfoString(ACCOUNT_SERVER)!=server||AccountInfoString(ACCOUNT_CURRENCY)!=currency
    ||HistoryDealsTotal()!=count)return false;
 string document="{\"schema\":\"investpro.mt5.exit-stop.v1\",\"login\":"+Q((string)login)
                 +",\"server\":"+Q(server)+",\"currency\":"+Q(currency)
                 +",\"observed_at_unix\":"+(string)((long)TimeGMT())+",\"deals\":["+rows+"]}";
 // Also bounded by Python in bytes. Even escaped 128-character symbols fit
 // safely below 500 kB for normal symbols; a large file is rejected by Python.
 int file=FileOpen("investpro-exit-stops.tmp",FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
 if(file==INVALID_HANDLE)return false;
 uint bytes=FileWriteString(file,document);
 FileFlush(file);FileClose(file);
 if(bytes==0)return false;
 return FileMove("investpro-exit-stops.tmp",0,"investpro-exit-stops.json",FILE_REWRITE);
}

int OnInit(){EventSetTimer(10);return INIT_SUCCEEDED;}
void OnDeinit(const int reason){EventKillTimer();}
void OnTimer(){WriteSnapshot();}
