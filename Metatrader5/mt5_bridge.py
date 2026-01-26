from fastapi import FastAPI
from pydantic import BaseModel
import MetaTrader5 as mt5
import time
import os
from typing import Optional, List, Dict, Any

app = FastAPI()

# ✅ Mets le bon chemin exact du terminal MT5
TERMINAL_PATH = r"E:\MetaTrader5\terminal64.exe"

MAGIC = 20260117
DEVIATION = 30


# ---------------- Models ----------------
class LoginReq(BaseModel):
    login: int
    password: str
    server: str


class OrderReq(LoginReq):
    symbol: str
    volume: float
    orderMode: str  # MARKET_BUY, MARKET_SELL, BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP
    entryPrice: Optional[float] = None  # for pending
    sl: Optional[float] = None
    tp: Optional[float] = None
    comment: Optional[str] = "InvestPro"


class CloseReq(LoginReq):
    ticket: int
    volume: Optional[float] = None


class OrderCancelReq(LoginReq):
    order: int


class HistoryReq(LoginReq):
    from_ts: int
    to_ts: int


class SymbolsReq(LoginReq):
    category: Optional[str] = None


class ModifySLTPReq(LoginReq):
    ticket: int
    sl: Optional[float] = None
    tp: Optional[float] = None


class TickReq(LoginReq):
    symbol: str


class TicksReq(LoginReq):
    symbols: List[str]


class SymbolInfoReq(LoginReq):
    symbol: str


# ---------------- Helpers ----------------
def init_mt5():
    if not os.path.exists(TERMINAL_PATH):
        return False, f"terminal64.exe introuvable: {TERMINAL_PATH}"

    # Déjà initialisé ?
    try:
        if mt5.terminal_info() is not None:
            return True, ""
    except Exception:
        pass

    ok = mt5.initialize(path=TERMINAL_PATH, portable=True)
    if not ok:
        return False, f"MT5 initialize failed: {mt5.last_error()}"
    return True, ""


def ensure_login(login: int, password: str, server: str):
    ok, err = init_mt5()
    if not ok:
        return False, err
    if not mt5.login(login, password=password, server=server):
        return False, f"MT5 login failed: {mt5.last_error()}"
    return True, ""


def ensure_symbol(symbol: str):
    if not mt5.symbol_select(symbol, True):
        return False, f"symbol_select failed: {mt5.last_error()}"

    info = mt5.symbol_info(symbol)
    tick = mt5.symbol_info_tick(symbol)
    if info is None or tick is None:
        return False, f"symbol_info/tick failed: {mt5.last_error()}"
    return True, (info, tick)


def detect_category(path_str: str):
    p = (path_str or "").lower()
    if "forex" in p or "fx" in p or "currency" in p:
        return "forex"
    if "crypto" in p or "coin" in p:
        return "crypto"
    if "index" in p or "indices" in p:
        return "indices"
    if "metal" in p or "gold" in p or "xau" in p or "silver" in p:
        return "metals"
    return "other"


# ---------------- Routes ----------------
@app.get("/health")
def health():
    return {"ok": True, "ts": int(time.time())}


@app.post("/mt5/test")
def mt5_test(req: LoginReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    info = mt5.account_info()
    if info is None:
        return {"ok": False, "error": f"account_info failed: {mt5.last_error()}"}

    return {
        "ok": True,
        "snapshot": {
            "balance": round(float(info.balance), 2),
            "equity": round(float(info.equity), 2),
            "profit": round(float(info.profit), 2),
            "currency": str(info.currency),
            "updatedAt": int(time.time() * 1000),
        },
    }


@app.post("/mt5/symbols")
def mt5_symbols(req: SymbolsReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    syms = mt5.symbols_get()
    if syms is None:
        return {"ok": True, "symbols": []}

    cat = (req.category or "all").lower()
    out = []
    for s in syms:
        name = str(s.name)
        path_str = str(getattr(s, "path", "") or "")
        c = detect_category(path_str)

        if cat not in ["all", ""]:
            if c != cat:
                continue

        out.append({"name": name, "path": path_str, "category": c})

    return {"ok": True, "symbols": out}


@app.post("/mt5/symbol_info")
def mt5_symbol_info(req: SymbolInfoReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    symbol = req.symbol.strip()
    ok_sym, sym_data = ensure_symbol(symbol)
    if not ok_sym:
        return {"ok": False, "error": sym_data}

    info, _tick = sym_data
    return {
        "ok": True,
        "info": {
            "ok": True,
            "name": symbol,
            "tick_size": float(info.trade_tick_size),
            "tick_value": float(info.trade_tick_value),
            "digits": int(info.digits),
            "min_lot": float(info.volume_min),
            "lot_step": float(info.volume_step),
        },
    }


@app.post("/mt5/tick")
def mt5_tick(req: TickReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    symbol = req.symbol.strip()
    ok_sym, sym_data = ensure_symbol(symbol)
    if not ok_sym:
        return {"ok": False, "error": sym_data}

    info, tick = sym_data
    return {
        "ok": True,
        "tick": {
            "symbol": symbol,
            "bid": float(tick.bid),
            "ask": float(tick.ask),
            "digits": int(info.digits),
            "time": int(getattr(tick, "time", 0)),
        },
    }


# ✅ batch ticks (pour prix actuel dans tables)
@app.post("/mt5/ticks")
def mt5_ticks(req: TicksReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    out: Dict[str, Any] = {}
    for sym in (req.symbols or []):
        symbol = str(sym).strip()
        if not symbol:
            continue

        ok_sym, sym_data = ensure_symbol(symbol)
        if not ok_sym:
            out[symbol] = {"ok": False, "error": sym_data}
            continue

        info, tick = sym_data
        out[symbol] = {
            "ok": True,
            "bid": float(tick.bid),
            "ask": float(tick.ask),
            "digits": int(info.digits),
            "time": int(getattr(tick, "time", 0)),
        }

    return {"ok": True, "ticks": out}


@app.post("/mt5/positions")
def mt5_positions(req: LoginReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    pos = mt5.positions_get()
    if pos is None:
        return {"ok": True, "positions": []}

    out = []
    for p in pos:
        out.append(
            {
                "ticket": int(p.ticket),
                "symbol": str(p.symbol),
                "type": int(p.type),
                "volume": float(p.volume),
                "price_open": float(p.price_open),
                "sl": float(p.sl),
                "tp": float(p.tp),
                "profit": float(p.profit),
                "time": int(p.time),
            }
        )
    return {"ok": True, "positions": out}


@app.post("/mt5/orders")
def mt5_orders(req: LoginReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    orders = mt5.orders_get()
    if orders is None:
        return {"ok": True, "orders": []}

    out = []
    for o in orders:
        out.append(
            {
                "ticket": int(o.ticket),
                "symbol": str(o.symbol),
                "type": int(o.type),
                "volume_current": float(o.volume_current),
                "price_open": float(o.price_open),
                "sl": float(o.sl),
                "tp": float(o.tp),
                "time_setup": int(o.time_setup),
                "comment": str(o.comment),
            }
        )
    return {"ok": True, "orders": out}


@app.post("/mt5/order_cancel")
def mt5_order_cancel(req: OrderCancelReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    request = {
        "action": mt5.TRADE_ACTION_REMOVE,
        "order": int(req.order),
        "magic": MAGIC,
        "comment": "InvestPro Cancel",
    }

    result = mt5.order_send(request)
    if result is None:
        return {"ok": False, "error": f"order_send(cancel) failed: {mt5.last_error()}"}

    return {"ok": True, "result": result._asdict()}


@app.post("/mt5/close")
def mt5_close(req: CloseReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    positions = mt5.positions_get(ticket=req.ticket)
    if positions is None or len(positions) == 0:
        return {"ok": False, "error": "Position introuvable"}

    p = positions[0]
    symbol = p.symbol
    volume = float(req.volume) if req.volume else float(p.volume)

    ok_sym, sym_data = ensure_symbol(symbol)
    if not ok_sym:
        return {"ok": False, "error": sym_data}
    _info, tick = sym_data

    close_type = mt5.ORDER_TYPE_SELL if p.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
    price = float(tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask)

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "position": int(p.ticket),
        "symbol": symbol,
        "volume": volume,
        "type": close_type,
        "price": price,
        "deviation": DEVIATION,
        "magic": MAGIC,
        "comment": "InvestPro Close",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(request)
    if result is None:
        return {"ok": False, "error": f"order_send(close) failed: {mt5.last_error()}"}

    return {"ok": True, "result": result._asdict()}


@app.post("/mt5/modify_sltp")
def mt5_modify_sltp(req: ModifySLTPReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    positions = mt5.positions_get(ticket=req.ticket)
    if positions is None or len(positions) == 0:
        return {"ok": False, "error": "Position introuvable"}

    p = positions[0]
    symbol = p.symbol

    new_sl = float(req.sl) if req.sl is not None else float(p.sl)
    new_tp = float(req.tp) if req.tp is not None else float(p.tp)

    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": int(p.ticket),
        "symbol": symbol,
        "sl": new_sl,
        "tp": new_tp,
        "magic": MAGIC,
        "comment": "InvestPro SLTP",
    }

    result = mt5.order_send(request)
    if result is None:
        return {"ok": False, "error": f"order_send(SLTP) failed: {mt5.last_error()}"}

    return {"ok": True, "result": result._asdict()}


@app.post("/mt5/order")
def mt5_order(req: OrderReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    symbol = req.symbol.strip()
    if not symbol:
        return {"ok": False, "error": "Missing symbol"}

    ok_sym, sym_data = ensure_symbol(symbol)
    if not ok_sym:
        return {"ok": False, "error": sym_data}
    _info, tick = sym_data

    mode = req.orderMode.upper().strip()
    volume = float(req.volume)
    if volume <= 0:
        return {"ok": False, "error": "Volume invalide"}

    sl = float(req.sl) if req.sl else 0.0
    tp = float(req.tp) if req.tp else 0.0
    comment = req.comment or "InvestPro"

    # Market
    if mode in ["MARKET_BUY", "MARKET_SELL"]:
        order_type = mt5.ORDER_TYPE_BUY if mode == "MARKET_BUY" else mt5.ORDER_TYPE_SELL
        price = float(tick.ask if mode == "MARKET_BUY" else tick.bid)

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": price,
            "sl": sl,
            "tp": tp,
            "deviation": DEVIATION,
            "magic": MAGIC,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(request)
        if result is None:
            return {"ok": False, "error": f"order_send failed: {mt5.last_error()}"}
        return {"ok": True, "mode": mode, "result": result._asdict()}

    # Pending
    pending_map = {
        "BUY_LIMIT": mt5.ORDER_TYPE_BUY_LIMIT,
        "SELL_LIMIT": mt5.ORDER_TYPE_SELL_LIMIT,
        "BUY_STOP": mt5.ORDER_TYPE_BUY_STOP,
        "SELL_STOP": mt5.ORDER_TYPE_SELL_STOP,
    }
    if mode not in pending_map:
        return {"ok": False, "error": f"orderMode invalide: {mode}"}

    if req.entryPrice is None or float(req.entryPrice) <= 0:
        return {"ok": False, "error": "entryPrice requis pour un ordre pending"}

    entry_price = float(req.entryPrice)
    order_type = pending_map[mode]

    request = {
        "action": mt5.TRADE_ACTION_PENDING,
        "symbol": symbol,
        "volume": volume,
        "type": order_type,
        "price": entry_price,
        "sl": sl,
        "tp": tp,
        "deviation": DEVIATION,
        "magic": MAGIC,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    result = mt5.order_send(request)
    if result is None:
        return {"ok": False, "error": f"order_send(pending) failed: {mt5.last_error()}"}
    return {"ok": True, "mode": mode, "result": result._asdict()}


@app.post("/mt5/history")
def mt5_history(req: HistoryReq):
    ok, err = ensure_login(req.login, req.password, req.server)
    if not ok:
        return {"ok": False, "error": err}

    deals = mt5.history_deals_get(req.from_ts, req.to_ts)
    if deals is None:
        return {"ok": True, "deals": []}

    out = []
    for d in deals:
        out.append(
            {
                "ticket": int(d.ticket),
                "order": int(d.order),
                "position_id": int(d.position_id),
                "time": int(d.time),
                "symbol": str(d.symbol),
                "type": int(d.type),
                "entry": int(d.entry),
                "volume": float(d.volume),
                "price": float(d.price),
                "profit": float(d.profit),
                "commission": float(d.commission),
                "swap": float(d.swap),
                "comment": str(d.comment),
            }
        )
    return {"ok": True, "deals": out}


@app.on_event("shutdown")
def shutdown_event():
    try:
        mt5.shutdown()
    except Exception:
        pass
