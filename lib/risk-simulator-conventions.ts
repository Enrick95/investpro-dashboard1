import { getInstrument, SUGGESTED_ASSETS, type Instrument } from "./risk-simulator";

export type SizingConvention = Instrument & {
  contractSize: number;
  sizingKind: "standard_lot" | "point_value" | "asset_units";
  displayUnit: string;
  displayStep: number;
  displayMinimum: number;
};

/** Display conventions only: neither contract specifications nor order steps from a broker. */
export function getSizingConvention(symbol: string): SizingConvention | null {
  // The caller resolves equivalent aliases first. Do not let getInstrument split a composite ticker.
  if (!/^[A-Z0-9]+$/.test(symbol)) return null;
  const instrument = getInstrument(symbol);
  if ((instrument.market === "forex" || instrument.market === "metals") && instrument.contractSize) {
    return { ...instrument, contractSize: instrument.contractSize, sizingKind: "standard_lot", displayUnit: "lot standard", displayStep: 0.01, displayMinimum: 0.01 };
  }
  if (instrument.market === "indices" && instrument.profitCurrency) {
    // The result is an amount of profit currency per index point, never a broker lot count.
    return { ...instrument, contractSize: 1, sizingKind: "point_value", displayUnit: instrument.profitCurrency + "/point", displayStep: 0.01, displayMinimum: 0.01 };
  }
  const crypto = SUGGESTED_ASSETS.find(item => item.symbol === symbol && item.market === "crypto");
  if (crypto?.profitCurrency === "USD" && /^[A-Z]+USD$/.test(symbol)) {
    // One calculation unit is one coin/token. No CFD lot-to-coin relationship is implied.
    return { ...crypto, contractSize: 1, sizingKind: "asset_units", displayUnit: symbol.slice(0, -3), displayStep: 1e-8, displayMinimum: 1e-8 };
  }
  return null;
}
