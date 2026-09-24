import type { FillVoucher, InspectRecord, LedgerEvent, WorkOrder } from "./types";

// ============================================================
// 台账模块：只追加（append-only）、不可覆盖。
// 签收生成充填凭证，送检生成处理记录，二者都不可再修改。
// ============================================================

/** 深度冻结，确保签收记录生成后不可被意外覆盖 */
export function freezeEvent<T extends LedgerEvent>(event: T): Readonly<T> {
  return Object.freeze({ ...event }) as Readonly<T>;
}

function pad(n: number, width = 4): string {
  return String(n).padStart(width, "0");
}

export function nextVoucherNo(ledger: LedgerEvent[], at: Date): string {
  const y = at.getFullYear();
  const count = ledger.filter((e) => e.kind === "fill").length + 1;
  return `QF${y}${pad(count)}`;
}

export function nextInspectRef(ledger: LedgerEvent[], at: Date): string {
  const y = at.getFullYear();
  const count = ledger.filter((e) => e.kind === "inspect").length + 1;
  return `JC${y}${pad(count)}`;
}

/** 工单完成 -> 生成不可覆盖的充填签收凭证 */
export function appendFillVoucher(
  ledger: LedgerEvent[],
  params: {
    order: WorkOrder;
    measuredO2: number;
    measuredHe: number;
    sourceBatch: string;
    operator: string;
    at: Date;
  },
): Readonly<FillVoucher> {
  const voucher: FillVoucher = {
    kind: "fill",
    voucherNo: nextVoucherNo(ledger, params.at),
    orderId: params.order.id,
    bottleNo: params.order.bottleNo,
    volume: params.order.volume,
    hydroDue: params.order.hydroDue,
    targetPressure: params.order.targetPressure,
    targetO2: params.order.targetO2,
    targetHe: params.order.targetHe,
    measuredO2: params.measuredO2,
    measuredHe: params.measuredHe,
    sourceBatch: params.sourceBatch.trim(),
    operator: params.operator.trim(),
    signedAt: params.at.toISOString(),
  };
  return freezeEvent(voucher);
}

/** 到期瓶转检验 -> 生成不可覆盖的处理记录 */
export function appendInspectRecord(
  ledger: LedgerEvent[],
  params: { order: WorkOrder; reason: string; note: string; operator: string; at: Date },
): Readonly<InspectRecord> {
  const record: InspectRecord = {
    kind: "inspect",
    refNo: nextInspectRef(ledger, params.at),
    orderId: params.order.id,
    bottleNo: params.order.bottleNo,
    reason: params.reason,
    note: params.note.trim(),
    operator: params.operator.trim(),
    at: params.at.toISOString(),
  };
  return freezeEvent(record);
}

/** 台账全量：按时间倒序，同时间按单号倒序 */
export function listLedger(ledger: LedgerEvent[]): LedgerEvent[] {
  return [...ledger].sort((a, b) => {
    const t = eventTime(b).localeCompare(eventTime(a));
    if (t !== 0) return t;
    return eventRef(b).localeCompare(eventRef(a));
  });
}

function eventTime(e: LedgerEvent): string {
  return e.kind === "fill" ? e.signedAt : e.at;
}

function eventRef(e: LedgerEvent): string {
  return e.kind === "fill" ? e.voucherNo : e.refNo;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 导出充填凭证 CSV（含 UTF-8 BOM，便于 Excel 打开） */
export function ledgerToCsv(ledger: LedgerEvent[]): string {
  const header = [
    "单号", "瓶号", "水容积(L)", "水检到期日", "目标终压(bar)",
    "目标氧(%)", "目标氦(%)", "实测氧(%)", "实测氦(%)",
    "气源批次", "操作员", "签收时间",
  ];
  const rows = ledger
    .filter((e): e is FillVoucher => e.kind === "fill")
    .map((v) => [
      v.voucherNo, v.bottleNo, v.volume, v.hydroDue, v.targetPressure,
      v.targetO2, v.targetHe, v.measuredO2, v.measuredHe,
      v.sourceBatch, v.operator, v.signedAt,
    ].map(csvCell).join(","));
  return "﻿" + [header.join(","), ...rows].join("\r\n");
}
