import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  BottleProfile,
  LedgerEvent,
  RegisterInput,
  WorkOrder,
} from "../domain/types";
import { hydroStatus, sortQueue, todayStr, toDateStr } from "../domain/rules";
import { normalizeNo, upsertProfile } from "../domain/archive";
import { appendFillVoucher, appendInspectRecord } from "../domain/ledger";

// ============================================================
// 作业面状态：orders=在制工单（队列/待处理），profiles=气瓶档案，
// ledger=不可覆盖台账。持久化于 localStorage。
// ============================================================

const STORAGE_KEY = "fill-station-state-v1";

export interface AppState {
  orders: WorkOrder[];
  profiles: BottleProfile[];
  ledger: LedgerEvent[];
}

type Action =
  | { type: "register"; input: RegisterInput; at: Date }
  | {
      type: "signoff";
      orderId: string;
      measuredO2: number;
      measuredHe: number;
      sourceBatch: string;
      operator: string;
      at: Date;
    }
  | { type: "inspect"; orderId: string; reason: string; note: string; operator: string; at: Date }
  | { type: "hydrate"; state: AppState }
  | { type: "resetDemo" };

function makeOrder(input: RegisterInput, at: Date): WorkOrder {
  const status = hydroStatus(input.hydroDue, at).expired ? "holding" : "queued";
  return {
    id: `WO-${at.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    bottleNo: normalizeNo(input.bottleNo),
    volume: input.volume,
    hydroDue: input.hydroDue,
    residual: input.residual,
    targetPressure: input.targetPressure,
    targetO2: input.targetO2,
    targetHe: input.targetHe,
    createdAt: at.toISOString(),
    status,
    holdReason: status === "holding" ? expiredHoldReason(input.hydroDue) : "",
  };
}

function expiredHoldReason(hydroDue: string): string {
  const s = hydroStatus(hydroDue);
  return `${s.label}（到期日 ${hydroDue}），禁止充填，转检验处理`;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "register": {
      const order = makeOrder(action.input, action.at);
      return {
        orders: [...state.orders, order],
        profiles: upsertProfile(state.profiles, {
          bottleNo: action.input.bottleNo,
          volume: action.input.volume,
          hydroDue: action.input.hydroDue,
          at: action.at.toISOString(),
        }),
        ledger: state.ledger,
      };
    }
    case "signoff": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || order.status !== "queued") return state;
      const voucher = appendFillVoucher(state.ledger, {
        order,
        measuredO2: action.measuredO2,
        measuredHe: action.measuredHe,
        sourceBatch: action.sourceBatch,
        operator: action.operator,
        at: action.at,
      });
      return {
        orders: state.orders.filter((o) => o.id !== order.id),
        profiles: state.profiles,
        ledger: [...state.ledger, voucher],
      };
    }
    case "inspect": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || order.status !== "holding") return state;
      const record = appendInspectRecord(state.ledger, {
        order,
        reason: action.reason,
        note: action.note,
        operator: action.operator,
        at: action.at,
      });
      return {
        orders: state.orders.filter((o) => o.id !== order.id),
        profiles: state.profiles,
        ledger: [...state.ledger, record],
      };
    }
    case "hydrate":
      return action.state;
    case "resetDemo":
      return buildSeedState();
    default:
      return state;
  }
}

// ---------------- 演示种子数据 ----------------

function seedState(): AppState {
  const now = new Date();
  const offset = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return toDateStr(d);
  };
  const iso = (daysAgo: number, hour = 9) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 12, 0, 0);
    return d.toISOString();
  };

  const base: Array<Omit<WorkOrder, "id" | "createdAt">> = [
    { bottleNo: "TANK-204", volume: 12, hydroDue: offset(5), residual: 55, targetPressure: 200, targetO2: 21, targetHe: 0, status: "queued", holdReason: "" },
    { bottleNo: "TANK-219", volume: 11.1, hydroDue: offset(120), residual: 30, targetPressure: 220, targetO2: 32, targetHe: 0, status: "queued", holdReason: "" },
    { bottleNo: "TANK-231", volume: 24, hydroDue: offset(-3), residual: 10, targetPressure: 200, targetO2: 18, targetHe: 45, status: "holding", holdReason: "" },
    { bottleNo: "DX-118", volume: 12, hydroDue: offset(200), residual: 180, targetPressure: 230, targetO2: 16, targetHe: 40, status: "queued", holdReason: "" },
  ];
  const orders: WorkOrder[] = base.map((o, i) => ({
    ...o,
    holdReason: o.status === "holding" ? expiredHoldReason(o.hydroDue) : "",
    id: `WO-SEED-${i + 1}`,
    createdAt: iso(1, 8 + i),
  }));

  const profiles: BottleProfile[] = [
    { bottleNo: "TANK-204", volume: 12, hydroDue: offset(5), firstRegisteredAt: iso(60), updatedAt: iso(1) },
    { bottleNo: "TANK-219", volume: 11.1, hydroDue: offset(120), firstRegisteredAt: iso(45), updatedAt: iso(1) },
    { bottleNo: "TANK-231", volume: 24, hydroDue: offset(-3), firstRegisteredAt: iso(30), updatedAt: iso(1) },
    { bottleNo: "DX-118", volume: 12, hydroDue: offset(200), firstRegisteredAt: iso(20), updatedAt: iso(1) },
    { bottleNo: "TANK-108", volume: 11.1, hydroDue: offset(300), firstRegisteredAt: iso(90), updatedAt: iso(12) },
  ];

  let ledger: LedgerEvent[] = [];
  const prev1 = new Date(now);
  prev1.setDate(prev1.getDate() - 12);
  ledger = [
    ...ledger,
    appendFillVoucher(ledger, {
      order: {
        id: "WO-HIST-1", bottleNo: "TANK-108", volume: 11.1, hydroDue: offset(300),
        residual: 40, targetPressure: 200, targetO2: 32, targetHe: 0,
        createdAt: iso(12), status: "queued", holdReason: "",
      },
      measuredO2: 32.4, measuredHe: 0, sourceBatch: "EAN-A20260910", operator: "李潜",
      at: prev1,
    }),
  ];
  const prev2 = new Date(now);
  prev2.setDate(prev2.getDate() - 3);
  ledger = [
    ...ledger,
    appendFillVoucher(ledger, {
      order: {
        id: "WO-HIST-2", bottleNo: "TANK-219", volume: 11.1, hydroDue: offset(120),
        residual: 25, targetPressure: 220, targetO2: 32, targetHe: 0,
        createdAt: iso(3), status: "queued", holdReason: "",
      },
      measuredO2: 31.8, measuredHe: 0, sourceBatch: "EAN-A20260920", operator: "周岸",
      at: prev2,
    }),
  ];

  return { orders, profiles, ledger };
}

function buildSeedState(): AppState {
  return seedState();
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.orders) && Array.isArray(parsed.profiles) && Array.isArray(parsed.ledger)) {
        return parsed;
      }
    }
  } catch {
    // 存储损坏时回落到演示数据
  }
  return buildSeedState();
}

// ---------------- Context ----------------

interface StoreApi {
  state: AppState;
  queued: WorkOrder[];
  holding: WorkOrder[];
  register: (input: RegisterInput) => { occupied?: WorkOrder };
  signOff: (
    orderId: string,
    draft: { measuredO2: number; measuredHe: number; sourceBatch: string; operator: string },
  ) => void;
  inspect: (orderId: string, params: { reason: string; note: string; operator: string }) => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储空间不足时仅保留内存态
    }
  }, [state]);

  const register = useCallback((input: RegisterInput) => {
    // 未结工单只提示占用，不阻止登记新瓶；但同瓶号的未结工单应提示
    const occupied = state.orders.find(
      (o) => o.bottleNo === normalizeNo(input.bottleNo),
    );
    dispatch({ type: "register", input, at: new Date() });
    return { occupied };
  }, [state.orders]);

  const signOff = useCallback<StoreApi["signOff"]>((orderId, draft) => {
    dispatch({ type: "signoff", orderId, ...draft, at: new Date() });
  }, []);

  const inspect = useCallback<StoreApi["inspect"]>((orderId, params) => {
    dispatch({ type: "inspect", orderId, ...params, at: new Date() });
  }, []);

  const resetDemo = useCallback(() => dispatch({ type: "resetDemo" }), []);

  const value = useMemo<StoreApi>(() => {
    const holding = sortQueue(state.orders.filter((o) => o.status === "holding"));
    const queued = sortQueue(state.orders.filter((o) => o.status === "queued"));
    return { state, queued, holding, register, signOff, inspect, resetDemo };
  }, [state, register, signOff, inspect, resetDemo]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}

export { todayStr };
