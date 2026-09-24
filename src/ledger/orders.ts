// 台账模块：在制（未签收）工单。与规则、档案分开实现。

import { createPersistentStore, type PersistentStore } from "../store";
import { daysUntil, isOverdue, type Mix } from "../rules/filling";

export type WorkStatus = "queued" | "in_progress" | "held";

export interface WorkOrder {
  id: string;
  bottleNo: string;
  /** 水容积 L */
  waterVolume: number;
  /** 水检到期日 ISO yyyy-mm-dd */
  hydroDue: string;
  /** 余压 bar */
  residualBar: number;
  target: Mix;
  /** 目标工作压力 bar，登记时取自规则 */
  targetPressure: number;
  status: WorkStatus;
  createdAt: string;
  /** 留待处理原因（水检到期等） */
  holdReason?: string;
  startedAt?: string;
  /** 撤单原因（撤单后不再进入队列） */
  cancelledReason?: string;
}

export interface RegisterInput {
  bottleNo: string;
  waterVolume: number;
  hydroDue: string;
  residualBar: number;
  target: Mix;
  /** 目标工作压力 bar，登记时取自规则模块 */
  targetPressure: number;
}

export const normalizeBottleNo = (s: string) => s.trim().toUpperCase();

function iso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

let seq = 0;
export function newOrderId(): string {
  seq += 1;
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return `WO-${stamp}-${String(seq).padStart(3, "0")}`;
}

const seedOrders: WorkOrder[] = [
  {
    id: newOrderId(),
    bottleNo: "TANK-204",
    waterVolume: 12,
    hydroDue: iso(12),
    residualBar: 55,
    target: { o2: 21, he: 0 },
    targetPressure: 200,
    status: "queued",
    createdAt: new Date().toISOString(),
  },
  {
    id: newOrderId(),
    bottleNo: "TANK-219",
    waterVolume: 11,
    hydroDue: iso(48),
    residualBar: 30,
    target: { o2: 32, he: 0 },
    targetPressure: 200,
    status: "queued",
    createdAt: new Date().toISOString(),
  },
  {
    id: newOrderId(),
    bottleNo: "TANK-231",
    waterVolume: 24,
    hydroDue: iso(-6),
    residualBar: 10,
    target: { o2: 18, he: 40 },
    targetPressure: 200,
    status: "held",
    holdReason: "水检已过期 6 天，禁止充填，待送检",
    createdAt: new Date().toISOString(),
  },
  {
    id: newOrderId(),
    bottleNo: "TANK-188",
    waterVolume: 12,
    hydroDue: iso(200),
    residualBar: 215,
    target: { o2: 32, he: 0 },
    targetPressure: 200,
    status: "queued",
    createdAt: new Date().toISOString(),
  },
  {
    id: newOrderId(),
    bottleNo: "TANK-260",
    waterVolume: 8.5,
    hydroDue: iso(3),
    residualBar: 0,
    target: { o2: 30, he: 15 },
    targetPressure: 200,
    status: "queued",
    createdAt: new Date().toISOString(),
  },
];

export const ledgerStore: PersistentStore<WorkOrder[]> = createPersistentStore(
  "fill.ledger.v1",
  seedOrders
);

/** 未结工单占用查询：存在有效（未撤单/未签收）的同瓶号工单 */
export function findOpenOrder(orders: WorkOrder[], bottleNo: string): WorkOrder | undefined {
  const key = normalizeBottleNo(bottleNo);
  return orders.find((o) => !o.cancelledReason && normalizeBottleNo(o.bottleNo) === key);
}

export function holdReasonFor(order: WorkOrder, today = new Date()): string {
  const days = daysUntil(order.hydroDue, today);
  if (days < 0) return `水检已过期 ${-days} 天，禁止充填，待送检`;
  return "水检到期，禁止充填";
}

export interface RegisterResult {
  ok: boolean;
  reason?: string;
  order?: WorkOrder;
}

/**
 * 登记：未结工单只提示占用，不重复建单；到期瓶进入留待处理区并写原因。
 */
export function registerOrder(input: RegisterInput): RegisterResult {
  const bottleNo = normalizeBottleNo(input.bottleNo);
  if (!bottleNo) return { ok: false, reason: "请填写瓶号" };
  if (!Number.isFinite(input.waterVolume) || input.waterVolume <= 0)
    return { ok: false, reason: "请填写正确的水容积（L）" };
  if (!input.hydroDue) return { ok: false, reason: "请选择水检到期日" };
  if (!Number.isFinite(input.residualBar) || input.residualBar < 0)
    return { ok: false, reason: "请填写正确的余压（bar）" };

  const existing = findOpenOrder(ledgerStore.getState(), bottleNo);
  if (existing) {
    return {
      ok: false,
      reason: `瓶号 ${bottleNo} 已有未结工单 ${existing.id}（${statusLabel(
        existing.status
      )}），已占用，不能重复登记`,
    };
  }

  const overdue = isOverdue(input.hydroDue);
  const order: WorkOrder = {
    id: newOrderId(),
    bottleNo,
    waterVolume: input.waterVolume,
    hydroDue: input.hydroDue,
    residualBar: input.residualBar,
    target: input.target,
    targetPressure: input.targetPressure,
    status: overdue ? "held" : "queued",
    createdAt: new Date().toISOString(),
    holdReason: overdue ? holdReasonFor({ hydroDue: input.hydroDue } as WorkOrder) : undefined,
  };

  ledgerStore.setState((prev) => [...prev, order]);
  return { ok: true, order };
}

export function startOrder(id: string) {
  ledgerStore.setState((prev) =>
    prev.map((o) =>
      o.id === id && o.status === "queued"
        ? { ...o, status: "in_progress", startedAt: new Date().toISOString() }
        : o
    )
  );
}

export function cancelOrder(id: string, reason: string) {
  ledgerStore.setState((prev) =>
    prev.map((o) =>
      o.id === id && !o.cancelledReason
        ? { ...o, cancelledReason: reason.trim() || "操作员撤单" }
        : o
    )
  );
}

/** 签收后从台账移除（由档案模块追加不可覆盖记录） */
export function removeOrder(id: string) {
  ledgerStore.setState((prev) => prev.filter((o) => o.id !== id));
}

/** 有效队列：未撤单、未到期，按水检剩余天数升序（越临近越靠前） */
export function fillQueue(orders: WorkOrder[], today = new Date()): WorkOrder[] {
  return orders
    .filter((o) => !o.cancelledReason && !isOverdue(o.hydroDue, today))
    .sort((a, b) => daysUntil(a.hydroDue, today) - daysUntil(b.hydroDue, today));
}

/** 留待处理区：未撤单但水检到期，过期最久的在前 */
export function heldOrders(orders: WorkOrder[], today = new Date()): WorkOrder[] {
  return orders
    .filter((o) => !o.cancelledReason && isOverdue(o.hydroDue, today))
    .sort((a, b) => daysUntil(a.hydroDue, today) - daysUntil(b.hydroDue, today));
}

/** 已撤单（仅留痕，不进入队列） */
export function cancelledOrders(orders: WorkOrder[]): WorkOrder[] {
  return orders.filter((o) => o.cancelledReason);
}

export function statusLabel(status: WorkStatus): string {
  return status === "queued" ? "待充填" : status === "in_progress" ? "充填中" : "留待处理";
}
