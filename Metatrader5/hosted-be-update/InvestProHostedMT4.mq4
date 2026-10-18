#property strict
#property version "1.10"
#property description "Lecture seule InvestPro : export local, aucun ordre, aucune DLL."
input bool AllowTradingPassword=false;
input int ExpectedLogin=0;
input string ExpectedServer="";
input string ExpectedCurrency="";
string Q(string s){string o="\"";for(int i=0;i<StringLen(s);i++){ushort c=StringGetCharacter(s,i);if(c==34)o+="\\\"";else if(c==92)o+="\\\\";else if(c<32)o+=StringFormat("\\u%04x",(int)c);else o+=StringSubstr(s,i,1);}return o+"\"";}
string Day(datetime t){string s=TimeToString(t,TIME_DATE);StringReplace(s,".","-");return s;}
bool Valid(){return IsConnected()&&AccountNumber()==ExpectedLogin&&AccountServer()==ExpectedServer&&AccountCurrency()==ExpectedCurrency;}
int OnInit(){EventSetTimer(15);return INIT_SUCCEEDED;}
void OnDeinit(const int reason){EventKillTimer();}
void OnTimer(){
 if(!Valid()){Comment("InvestPro : attente de connexion au compte attendu.");return;}
 if(AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)&&!AllowTradingPassword){Comment("InvestPro : utiliser un acces investisseur en lecture seule.");return;}
 double balance=AccountBalance(),inflows=0,outflows=0,total=0,firstAmount=0;
 datetime firstTime=0;int firstTicket=0,firstType=-1;
 string stamp=Day(TimeGMT())+"T"+TimeToString(TimeGMT(),TIME_SECONDS)+"Z",rows="";int count=OrdersHistoryTotal();
 for(int i=0;i<count;i++){
  if(!OrderSelect(i,SELECT_BY_POS,MODE_HISTORY))return;
  int kind=OrderType();double movement=OrderProfit()+OrderCommission()+OrderSwap();
  if(!MathIsValidNumber(movement))return;
  if(kind==OP_BUY||kind==OP_SELL||kind==6){
   total+=movement;
   if(kind==6){inflows+=MathMax(0,movement);outflows+=MathMax(0,-movement);}
   datetime when=OrderCloseTime()>0?OrderCloseTime():OrderOpenTime();
   if(movement!=0&&(firstTime==0||when<firstTime||(when==firstTime&&OrderTicket()<firstTicket))){firstTime=when;firstTicket=OrderTicket();firstAmount=movement;firstType=kind;}
  }
  if((OrderType()!=OP_BUY&&OrderType()!=OP_SELL)||OrderCloseTime()==0)continue;
  double pnl=OrderProfit()+OrderCommission()+OrderSwap();
  if(!MathIsValidNumber(pnl)||!MathIsValidNumber(OrderOpenPrice())||OrderOpenPrice()<=0)return;
  if(StringLen(rows)>0)rows+=",";
  rows+="{\"external_id\":"+Q("mt4:"+IntegerToString(OrderTicket()))+",\"symbol\":"+Q(OrderSymbol())+",\"direction\":"+Q(OrderType()==OP_BUY?"buy":"sell")+",\"entry_price\":"+DoubleToString(OrderOpenPrice(),10)+",\"trade_date\":"+Q(Day(OrderCloseTime()))+",\"result_amount\":"+DoubleToString(pnl,8)+"}";
 }
 if(!Valid()||OrdersHistoryTotal()!=count||MathAbs(AccountBalance()-balance)>0.000001)return;
 bool detected=(firstType==6&&firstAmount>0&&MathAbs(balance-total)<=0.01);
 double reference=detected?firstAmount:MathMax(0,balance);
 string funding="{\"inflows\":"+DoubleToString(inflows,8)+",\"outflows\":"+DoubleToString(outflows,8)+",\"reference_balance\":"+DoubleToString(reference,8)+",\"reference_method\":"+Q(detected?"first_deposit":"first_sync_balance")+"}";
 string json="{\"platform\":\"MT4\",\"login\":"+Q(IntegerToString(AccountNumber()))+",\"server\":"+Q(AccountServer())+",\"currency\":"+Q(AccountCurrency())+",\"balance\":"+DoubleToString(AccountBalance(),8)+",\"equity\":"+DoubleToString(AccountEquity(),8)+",\"observed_at\":"+Q(stamp)+",\"warnings\":[\"MT4 : historique charge par le terminal ; disponibilite selon le broker. Dates du calendrier broker.\"],\"funding\":"+funding+",\"trades\":["+rows+"]}";
 int f=FileOpen("investpro.tmp",FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);if(f==INVALID_HANDLE)return;FileWriteString(f,json);FileClose(f);
 if(FileMove("investpro.tmp",0,"investpro.json",FILE_REWRITE))Comment("InvestPro : export local actualise. Compte ",ExpectedLogin);
}
