import type { buildVipPerformanceReport } from "./performance-report";

type Report = ReturnType<typeof buildVipPerformanceReport>;
type Row = Report["rows"][number];
export const VIP_REPORT_POSTER_WIDTH = 1080;
export const VIP_REPORT_POSTER_HEIGHT = 1350;
export const VIP_REPORT_ROWS_PER_PAGE = 12;
export type VipPerformancePosterOptions = { periodLabel: string; filterLabel: string; locale: "fr" | "en"; pageIndex: number; generatedAt: Date; signal?: AbortSignal };
export type VipPerformancePoster = { blob: Blob; pageIndex: number; pageCount: number; rowCount: number; kind: "trades" | "context"; filename: string };
type Page = { kind: "trades" | "context"; rows: Row[]; start: number; context: string[]; contextReferences?: number };
const colors = { bg: "#08110d", panel: "#142119", line: "#344733", gold: "#f0c77b", text: "#f1f2e7", muted: "#a1b49e", green: "#8fd7ac", red: "#ef9d91", blue: "#9dbec6" };
const font = (size: number, weight = 400) => `${weight} ${size}px Inter, "Segoe UI", Arial, sans-serif`;
let logoPromise: Promise<HTMLImageElement | null> | null = null;

function logo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) logoPromise = new Promise(resolve => {
    const image = new Image();
    const timeout = window.setTimeout(() => resolve(null), 4000);
    image.onload = () => { window.clearTimeout(timeout); resolve(image); };
    image.onerror = () => { window.clearTimeout(timeout); resolve(null); };
    image.src = "/logo.webp";
  });
  return logoPromise;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string, stroke?: string) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

/** Wrap every character, including long search terms; selection context is never silently cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (ctx.measureText(line ? `${line} ${word}` : word).width <= width) { line = line ? `${line} ${word}` : word; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of Array.from(word)) {
        if (line && ctx.measureText(line + character).width > width) { lines.push(line); line = ""; }
        line += character;
      }
    }
    if (line) lines.push(line);
    else if (!paragraph.trim()) lines.push("");
  }
  return lines.length ? lines : [""];
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = colors.text, weight = 400, align: CanvasTextAlign = "left") {
  ctx.font = font(size, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y); ctx.textAlign = "left";
}

function fit(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size: number, color: string, weight = 400, align: CanvasTextAlign = "left") {
  let actual = size;
  ctx.font = font(actual, weight);
  while (actual > 11 && ctx.measureText(value).width > width) { actual -= .5; ctx.font = font(actual, weight); }
  text(ctx, value, x, y, actual, color, weight, align);
}

function basis(report: Report, english: boolean): string[] {
  const lines = report.rBasis === "telegram_model"
    ? [english ? "Theoretical performance at the best announced TP." : "Performance théorique au meilleur TP annoncé."]
    : report.rBasis === "recorded"
      ? [english ? "Manually recorded R results." : "Résultats R saisis manuellement."]
      : report.rBasis === "mixed"
        ? [english ? "Recorded and theoretical R. Independent histories may contain the same trades." : "R saisis et théoriques. Historiques indépendants : certains trades peuvent figurer dans les deux sources."]
        : [english ? "Results follow the available trade history." : "Résultats selon l’historique disponible."];
  lines.push(english ? "R/R: average win / average loss. Win rate excludes BE." : "R/R : gain moyen / perte moyenne. Winrate hors BE.");
  return lines;
}

function pagePlan(ctx: CanvasRenderingContext2D, report: Report, options: VipPerformancePosterOptions): Page[] {
  ctx.font = font(16);
  const selection = wrap(ctx, options.filterLabel, 952);
  const pages: Page[] = [];
  let context = selection;
  let references: number | undefined;
  if (selection.length > 6) {
    ctx.font = font(21);
    const full = wrap(ctx, options.filterLabel, 900);
    for (let start = 0; start < full.length; start += 27) pages.push({ kind: "context", rows: [], start: 0, context: full.slice(start, start + 27) });
    references = pages.length;
    context = [options.locale === "en" ? `Full selection context: ${references === 1 ? "poster 1" : `posters 1–${references}`}.` : `Contexte complet de la sélection : ${references === 1 ? "affiche 1" : `affiches 1–${references}`}.`];
  }
  ctx.font = font(22, 500);
  const periodLines = wrap(ctx, options.periodLabel, 952);
  const rowStart = 605 + Math.max(0, context.length - 1) * 23 + Math.max(0, periodLines.length - 1) * 26;
  const rowCapacity = Math.max(1, Math.min(VIP_REPORT_ROWS_PER_PAGE, Math.floor((1215 - rowStart) / 46)));
  for (let start = 0; start < report.rows.length; start += rowCapacity) pages.push({ kind: "trades", rows: report.rows.slice(start, start + rowCapacity), start, context, contextReferences: references });
  if (!report.rows.length) pages.push({ kind: "trades", rows: [], start: 0, context, contextReferences: references });
  return pages;
}

function background(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, 1080, 1350);
  const glow = ctx.createRadialGradient(940, 70, 0, 940, 70, 650); glow.addColorStop(0, "#b5a25a20"); glow.addColorStop(1, "#08110d00"); ctx.fillStyle = glow; ctx.fillRect(0, 0, 1080, 1350);
  ctx.strokeStyle = "#a7c39708"; ctx.lineWidth = 1;
  for (let x = 40; x < 1080; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1350); ctx.stroke(); }
  for (let y = 40; y < 1350; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke(); }
  rounded(ctx, 30, 28, 1020, 1294, 28, "#08110d00", "#4c624033");
  ctx.strokeStyle = "#e3bd6940"; ctx.beginPath(); ctx.moveTo(64, 123); ctx.lineTo(1016, 123); ctx.stroke();
}

function brand(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, english: boolean) {
  if (image) { ctx.save(); ctx.beginPath(); ctx.arc(100, 81, 36, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(image, 64, 45, 72, 72); ctx.restore(); }
  else { rounded(ctx, 64, 45, 72, 72, 20, "#243121", "#96814b"); text(ctx, "IP", 100, 91, 28, colors.gold, 700, "center"); }
  text(ctx, "InvestPro", 155, 85, 38, colors.text, 650);
  text(ctx, "TRADING  /  VIP", 158, 108, 13, colors.gold, 600);
  text(ctx, english ? "PERFORMANCE REPORT" : "RAPPORT DE PERFORMANCE", 1016, 80, 14, colors.muted, 500, "right");
  text(ctx, english ? "YOUR SELECTED HISTORY" : "VOTRE HISTORIQUE SÉLECTIONNÉ", 1016, 104, 12, "#72866e", 400, "right");
}

function footer(ctx: CanvasRenderingContext2D, report: Report, options: VipPerformancePosterOptions, pageIndex: number, pageCount: number) {
  const english = options.locale === "en";
  ctx.strokeStyle = colors.line; ctx.beginPath(); ctx.moveTo(64, 1231); ctx.lineTo(1016, 1231); ctx.stroke();
  let y = 1253;
  ctx.font = font(14);
  for (const statement of basis(report, english)) {
    for (const line of wrap(ctx, statement, 952)) { text(ctx, line, 64, y, 14, colors.muted); y += 18; }
  }
  text(ctx, english ? "Trading involves risk. Past performance does not guarantee future results." : "Le trading comporte des risques. Les performances passées ne garantissent aucun résultat futur.", 64, 1304, 12, "#81947d");
  text(ctx, "investprotrading.fr", 64, 1330, 13, colors.gold, 500);
  text(ctx, `${pageIndex + 1} / ${pageCount}`, 1016, 1330, 13, colors.gold, 600, "right");
}

function drawContext(ctx: CanvasRenderingContext2D, page: Page, options: VipPerformancePosterOptions) {
  const english = options.locale === "en";
  text(ctx, english ? "SELECTION CONTEXT" : "CONTEXTE DE LA SÉLECTION", 64, 164, 15, colors.gold, 600);
  text(ctx, english ? "Every filter, in full." : "Tous les filtres, en détail.", 64, 213, 40, colors.text, 550);
  ctx.font = font(21, 500);
  const period = wrap(ctx, options.periodLabel, 900);
  let y = 253;
  for (const line of period) { text(ctx, line, 64, y, 21, colors.gold, 500); y += 28; }
  rounded(ctx, 64, y + 16, 952, 900, 20, colors.panel, colors.line);
  y += 58;
  for (const line of page.context) { text(ctx, line, 90, y, 21, colors.text); y += 30; }
}

function drawTrades(ctx: CanvasRenderingContext2D, page: Page, report: Report, options: VipPerformancePosterOptions) {
  const english = options.locale === "en";
  const locale = english ? "en-US" : "fr-FR";
  const number = (value: number, digits = 2) => new Intl.NumberFormat(locale, Math.abs(value) >= 1000000 || (value !== 0 && Math.abs(value) < 10 ** -digits) ? { notation: "scientific", maximumFractionDigits: digits } : { maximumFractionDigits: digits }).format(value);
  const r = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${number(value)} R`;
  text(ctx, english ? "YOUR VIP HISTORY" : "VOTRE HISTORIQUE VIP", 64, 162, 15, colors.gold, 600);
  text(ctx, english ? "The numbers. The full picture." : "Les chiffres. Une vue d’ensemble.", 64, 207, 39, colors.text, 550);
  ctx.font = font(22, 500); const period = wrap(ctx, options.periodLabel, 952);
  let y = 244;
  for (const line of period) { text(ctx, line, 64, y, 22, colors.gold, 500); y += 26; }
  y += 3;
  for (const line of page.context) { text(ctx, line, 64, y, 16, colors.muted); y += 23; }
  const metrics: { label: string; value: string; color: string; detail?: string; featured?: boolean }[] = [
    { label: "WIN / TP", value: String(report.counts.wins), color: colors.green },
    { label: "LOSS", value: String(report.counts.losses), color: colors.red },
    { label: "BREAKEVEN", value: String(report.counts.breakevens), color: colors.gold },
    { label: "WINRATE", value: report.winrate === null ? "—" : `${number(report.winrate, 1)} %`, color: colors.text },
    { label: english ? "CLOSED TRADES" : "TRADES CLÔTURÉS", value: String(report.counts.closed), color: colors.text },
    { label: english ? "RESULT" : "RÉSULTAT", value: r(report.totalR), color: report.totalR !== null && report.totalR < 0 ? colors.red : colors.gold, featured: true,
      detail: `${english ? 'Average R/R' : 'R/R moyen'} : ${report.rewardRiskRatio === null ? '—' : number(report.rewardRiskRatio)}` },
  ];
  const metricY = y + 17, gap = 14, width = (952 - gap * 2) / 3;
  metrics.forEach((metric, index) => {
    const x = 64 + index % 3 * (width + gap), top = metricY + Math.floor(index / 3) * 106;
    rounded(ctx, x, top, width, 94, 16, metric.featured ? '#25271a' : colors.panel, metric.featured ? '#8c7548' : colors.line);
    text(ctx, metric.label, x + 19, top + 24, 12, metric.featured ? colors.gold : colors.muted, 500);
    fit(ctx, metric.value, x + 19, top + (metric.detail ? 62 : 68), width - 38, metric.featured ? 42 : 35, metric.color, 600);
    if (metric.detail) fit(ctx, metric.detail, x + 19, top + 83, width - 38, 12, colors.muted);
  });
  y = metricY + 228;
  text(ctx, english ? `${report.counts.total} trades · ${report.counts.closed} closed` : `${report.counts.total} trades · ${report.counts.closed} clôturés`, 64, y, 17, colors.text, 500);
  fit(ctx, english ? `${report.counts.open} open · ${report.counts.review} to review · ${report.counts.cancelled} cancelled` : `${report.counts.open} ouverts · ${report.counts.review} à vérifier · ${report.counts.cancelled} annulés`, 1016, y, 530, 14, colors.muted, 400, "right");
  y += 37;
  text(ctx, english ? "TRADE HISTORY" : "HISTORIQUE DES TRADES", 64, y, 13, colors.gold, 600);
  text(ctx, page.rows.length ? `${page.start + 1}–${page.start + page.rows.length} / ${report.rows.length}` : "0 / 0", 1016, y, 13, colors.muted, 400, "right");
  y += 27;
  for (const [label, x] of [["DATE", 84], [english ? "ASSET" : "ACTIF", 222], [english ? "SIDE" : "SENS", 469], [english ? "OUTCOME" : "RÉSULTAT", 633]] as const) text(ctx, label, x, y, 11, "#849b7d", 500);
  text(ctx, "R", 991, y, 11, "#849b7d", 500, "right");
  y += 12;
  const rowHeight = Math.min(46, (1214 - y) / Math.max(page.rows.length, 1));
  page.rows.forEach((row, index) => {
    const top = y + index * rowHeight;
    if (index % 2 === 0) rounded(ctx, 64, top, 952, rowHeight - 3, 8, "#19261a8a");
    const parsed = new Date(row.date);
    const date = Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(parsed) : "—";
    fit(ctx, date, 84, top + 26, 122, 14, colors.muted);
    let symbolSize = 18; ctx.font = font(symbolSize, 550);
    let symbolLines = wrap(ctx, row.symbol, 220);
    while (symbolLines.length > 2 && symbolSize > 9) { symbolSize -= .5; ctx.font = font(symbolSize, 550); symbolLines = wrap(ctx, row.symbol, 220); }
    symbolLines.forEach((line, lineIndex) => text(ctx, line, 222, top + (symbolLines.length === 1 ? 23 : 14 + lineIndex * 14), symbolSize, colors.text, 550));
    text(ctx, row.source === "telegram" ? "Telegram" : english ? "Recorded" : "Saisi", 223, top + 38, 10, "#83987c");
    const side = row.direction === "buy" ? "BUY" : "SELL";
    text(ctx, side, 469, top + 26, 15, row.direction === "buy" ? colors.green : colors.red, 600);
    const outcome = row.outcome === "CANCELLED" ? english ? "CANCELLED" : "ANNULÉ" : row.outcome === "REVIEW" ? english ? "REVIEW" : "À VÉRIFIER" : row.outcome === "OPEN" ? english ? "OPEN" : "OUVERT" : row.outcome;
    const statusColor = row.status === "win" ? colors.green : row.status === "loss" ? colors.red : row.status === "breakeven" ? colors.gold : colors.blue;
    fit(ctx, outcome, 633, top + 26, 190, 17, statusColor, 600);
    fit(ctx, r(row.resultR), 991, top + 26, 155, 19, row.resultR === null ? colors.muted : row.resultR < 0 ? colors.red : colors.green, 550, "right");
  });
  if (!page.rows.length) text(ctx, english ? "No trade matches this selection." : "Aucun trade ne correspond à cette sélection.", 540, y + 80, 21, colors.muted, 400, "center");
}

/** The returned PNG blob is used unchanged for both preview and download. */
export async function renderVipPerformanceReportImage(report: Report, options: VipPerformancePosterOptions): Promise<VipPerformancePoster> {
  const canvas = document.createElement("canvas"); canvas.width = VIP_REPORT_POSTER_WIDTH; canvas.height = VIP_REPORT_POSTER_HEIGHT;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("REPORT_CANVAS_UNAVAILABLE");
  const pages = pagePlan(ctx, report, options);
  const requested = Number.isFinite(options.pageIndex) ? Math.trunc(options.pageIndex) : 0;
  const index = Math.max(0, Math.min(requested, pages.length - 1));
  const page = pages[index];
  const image = await logo();
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  background(ctx); brand(ctx, image, options.locale === "en");
  if (page.kind === "context") drawContext(ctx, page, options); else drawTrades(ctx, page, report, options);
  footer(ctx, report, options, index, pages.length);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("REPORT_IMAGE_EXPORT_FAILED")), "image/png"));
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const stamp = options.generatedAt.toISOString().slice(0, 10);
  return { blob, pageIndex: index, pageCount: pages.length, rowCount: page.rows.length, kind: page.kind, filename: `investpro-vip-rapport-${stamp}-${String(index + 1).padStart(2, "0")}-sur-${pages.length}.png` };
}
