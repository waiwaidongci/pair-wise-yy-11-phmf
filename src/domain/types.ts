// 领域数据模型：工单、气瓶档案、台账事件

/** 目标/实测氧氦比（百分数，0~100） */
export interface Ratio {
  o2: number;
  he: number;
}

/** 气瓶档案（档案模块）：一瓶一档的静态信息 */
export interface BottleProfile {
  bottleNo: string;
  /** 水容积 L */
  volume: number;
  /** 水检到期日 YYYY-MM-DD */
  hydroDue: string;
  firstRegisteredAt: string;
  updatedAt: string;
}

/** 未结充填工单（作业队列中的在制品） */
export interface WorkOrder {
  id: string;
  bottleNo: string;
  volume: number;
  hydroDue: string;
  /** 余压 bar */
  residual: number;
  /** 目标充填终压 bar */
  targetPressure: number;
  targetO2: number;
  targetHe: number;
  createdAt: string;
  status: "queued" | "holding";
  /** 进入待处理区的原因 */
  holdReason: string;
}

/** 充填签收记录（台账）：一经生成即冻结，不可覆盖 */
export interface FillVoucher {
  kind: "fill";
  voucherNo: string;
  orderId: string;
  bottleNo: string;
  volume: number;
  hydroDue: string;
  targetPressure: number;
  targetO2: number;
  targetHe: number;
  measuredO2: number;
  measuredHe: number;
  /** 气源批次 */
  sourceBatch: string;
  /** 签收人/操作员 */
  operator: string;
  signedAt: string;
}

/** 到期瓶送检/处理记录（台账中的非充填事件，同样不可覆盖） */
export interface InspectRecord {
  kind: "inspect";
  refNo: string;
  orderId: string;
  bottleNo: string;
  reason: string;
  note: string;
  operator: string;
  at: string;
}

export type LedgerEvent = FillVoucher | InspectRecord;

/** 新瓶登记输入 */
export interface RegisterInput {
  bottleNo: string;
  volume: number;
  hydroDue: string;
  residual: number;
  targetPressure: number;
  targetO2: number;
  targetHe: number;
}
