// 档案模块：已签收记录。只追加（append-only），不提供任何修改/删除入口。
// 与台账、规则分开实现，独立存储键。

import { createPersistentStore, type PersistentStore } from "../store";
import { type FillStep, type Mix } from "../rules/filling";
import { removeOrder, type WorkOrder } from "../ledger/orders";

export interface SignedRecord {
  /** 签收单号 */
  id: string;
  /** 来源工单号 */
  orderId: string;
  bottleNo: string;
  waterVolume: number;
  hydroDue: string;
  residualBar: number;
  target: Mix;
  targetPressure: number;
  /** 实测氧 % */
  actualO2: number;
  /** 实测氦 % */
  actualHe: number;
  /** 气源批次 */
  sourceBatch: string;
  /** 操作员（签收人） */
  operator: string;
  /** 开工前分压步骤快照 */
  steps: FillStep[];
  signedAt: string;
  /** 固定标记：签收记录生成后不可覆盖 */
  readonly immutable: true;
}

let seq = 0;
function newRecordId(): string {
  seq += 1;
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, "");
  return `QR-${stamp}-${String(seq).padStart(4, "0")}`;
}

function signedSeedDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const seedRecords: SignedRecord[] = [
  {
    id: "QR-SEED-0001",
    orderId: "WO-SEED-0001",
    bottleNo: "TANK-219",
    waterVolume: 11,
    hydroDue: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 200);
      return d.toISOString().slice(0, 10);
    })(),
    residualBar: 40,
    target: { o2: 32, he: 0 },
    targetPressure: 200,
    actualO2: 32.4,
    actualHe: 0,
    sourceBatch: "O2-B2409 / AIR-C91",
    operator: "陈海",
    steps: [],
    signedAt: signedSeedDaysAgo(12),
    immutable: true,
  },
  {
    id: "QR-SEED-0002",
    orderId: "WO-SEED-0002",
    bottleNo: "TANK-204",
    waterVolume: 12,
    hydroDue: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 90);
      return d.toISOString().slice(0, 10);
    })(),
    residualBar: 60,
    target: { o2: 18, he: 40 },
    targetPressure: 200,
    actualO2: 18.6,
    actualHe: 39.5,
    sourceBatch: "O2-B2409 / HE-H77 / AIR-C91",
    operator: "林舟",
    steps: [],
    signedAt: signedSeedDaysAgo(34),
    immutable: true,
  },
];

export const archiveStore: PersistentStore<SignedRecord[]> = createPersistentStore(
  "fill.archive.v1",
  seedRecords
);

export interface SignInput {
  actualO2: number;
  actualHe: number;
  sourceBatch: string;
  operator: string;
  steps: FillStep[];
}

/**
 * 签收：生成不可覆盖记录并从台账移除工单。
 * 缺项校验由规则模块 checkCompletion 完成，调用方必须先校验。
 */
export function signOff(order: WorkOrder, input: SignInput): SignedRecord {
  const record: SignedRecord = Object.freeze({
    id: newRecordId(),
    orderId: order.id,
    bottleNo: order.bottleNo,
    waterVolume: order.waterVolume,
    hydroDue: order.hydroDue,
    residualBar: order.residualBar,
    target: { ...order.target },
    targetPressure: order.targetPressure,
    actualO2: input.actualO2,
    actualHe: input.actualHe,
    sourceBatch: input.sourceBatch.trim(),
    operator: input.operator.trim(),
    steps: input.steps.map((s) => ({ ...s })),
    signedAt: new Date().toISOString(),
    immutable: true,
  });

  // 仅追加，不读取后改写既有条目
  archiveStore.setState((prev) => [record, ...prev]);
  removeOrder(order.id);
  return record;
}

/** 单瓶历史：按瓶号精确查询，最近签收在前 */
export function historyByBottle(records: SignedRecord[], bottleNo: string): SignedRecord[] {
  const key = bottleNo.trim().toUpperCase();
  if (!key) return [];
  return records
    .filter((r) => r.bottleNo.toUpperCase() === key)
    .sort((a, b) => (a.signedAt < b.signedAt ? 1 : -1));
}
