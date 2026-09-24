import type { Ratio, RegisterInput, WorkOrder } from "./types";

// ============================================================
// 规则模块：只包含可独立计算的业务规则，不依赖 UI、台账与档案
// ============================================================

const DAY_MS = 24 * 60 * 60 * 1000;

/** 以当地日历零点计算"水检剩余天数"，到期日当天为 0 天 */
export function daysUntil(dateStr: string, today = new Date()): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((target - now) / DAY_MS);
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function toDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface HydroStatus {
  daysLeft: number;
  expired: boolean;
  near: boolean;
  label: string;
}

/** 水检状态：剩余 <0 天为到期瓶，<7 天为临期提醒 */
export function hydroStatus(hydroDue: string, today = new Date()): HydroStatus {
  const daysLeft = daysUntil(hydroDue, today);
  const expired = daysLeft < 0;
  const near = !expired && daysLeft <= 7;
  const label = expired
    ? `水检已过期 ${-daysLeft} 天`
    : daysLeft === 0
      ? "水检今日到期"
      : `水检剩余 ${daysLeft} 天`;
  return { daysLeft, expired, near, label };
}

/** 队列排序：水检剩余天数升序（最紧急在前），同天数先登记的在前 */
export function sortQueue<T extends WorkOrder>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const da = daysUntil(a.hydroDue);
    const db = daysUntil(b.hydroDue);
    if (da !== db) return da - db;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** 进入待处理区的标准原因 */
export function expiredReason(hydroDue: string): string {
  const s = hydroStatus(hydroDue);
  return `${s.label}（到期日 ${hydroDue}），禁止充填，转检验处理`;
}

// ---------------- 分压充填步骤 ----------------

export interface PlanStep {
  /** 序号 */
  seq: number;
  /** vent=泄压；o2/he/air/n2=加注对应气体 */
  type: "vent" | "o2" | "he" | "air" | "n2";
  title: string;
  /** 该步完成后压力表读数（bar），泄压步骤为泄压目标值 */
  pressureAfter: number;
  /** 本步加注/泄放气量，按水容积折算 L */
  gasVolume: number;
  detail: string;
}

export interface FillPlan {
  mode: "air" | "n2";
  /** 假设：残气按空气(O2 21%)计 */
  assumption: string;
  ventFirst: boolean;
  residualKeep: number;
  ventTo: number;
  o2Add: number;
  heAdd: number;
  topUp: number;
  steps: PlanStep[];
  warnings: string[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 依据余压与目标氧氦比给出分压步骤。
 * 物料平衡模型（假设残气为空气：O2 21% / N2 79%，不含氦）：
 *   纯氦加注量 He = P*fh（氦只能来自纯氦）；
 *   氧平衡：残气氧 + 纯氧 + 补压气氧 = P*fo；
 *   压平：start + O2 + He + 补压 = P。
 * 补压气：fo >= 21%*(1-fh) 用空气，否则用纯氮（低氧 Trimix）。
 * 余压超过可保留上限时先泄压（题目要求余压高于目标值先泄压），
 * 再按 纯氧 -> 纯氦 -> 空气/纯氮补压 顺序加注。
 */
export function buildFillPlan(
  residual: number,
  target: { pressure: number } & Ratio,
  volume: number,
): FillPlan | { error: string } {
  const P = target.pressure;
  const fo = target.o2 / 100;
  const fh = target.he / 100;
  const warnings: string[] = [];

  if (!(P > 0)) return { error: "目标压力必须大于 0" };
  if (!(residual >= 0)) return { error: "余压不能为负" };
  if (fo < 0 || fh < 0 || fo + fh > 1)
    return { error: "目标氧、氦比例无效（需 ≥0 且氧+氦 ≤100%）" };
  if (fo > 0.4) warnings.push(`目标氧含量 ${(fo * 100).toFixed(0)}% 超过 40%，纯氧分压有燃爆风险，请复核`);
  const ppO2 = fo * P;
  if (ppO2 > 16) warnings.push(`目标氧分压 ${ppO2.toFixed(1)} bar 偏高（>16 bar），注意纯氧加注安全`);

  const R = 0.21;  // 残气/空气含氧分率
  const REST = 1 - R; // 0.79

  // 空气可补足目标氧的最低氧分率（低于此值需用纯氮补压）
  const useAir = fo + 1e-9 >= R * (1 - fh);
  const mode: "air" | "n2" = useAir ? "air" : "n2";

  let p0max = P;
  let o2Add = 0;
  const heAdd = P * fh;

  if (useAir) {
    // 空气补压：纯氧加注重 = P*(fo-0.21*(1-fh))/0.79，与余压无关
    o2Add = (P * (fo - R * (1 - fh))) / REST;
    p0max = (P * (1 - fo - fh)) / REST;
  } else {
    // 纯氮补压：纯氧加注重 = P*fo - start*21%，上限取氧约束与总量约束的小值
    p0max = Math.min((P * fo) / R, (P * (1 - fo - fh)) / REST);
  }
  p0max = Math.max(0, Math.min(P, p0max));

  const ventFirst = residual > p0max + 0.05;
  const start = ventFirst ? p0max : Math.min(residual, P);

  if (!useAir) {
    o2Add = Math.max(0, P * fo - start * R);
    if (ventFirst) warnings.push("目标为低氧混合气，残气含氧过高，须先泄压再用纯氮补压");
  }
  const topUp = Math.max(0, P - start - o2Add - heAdd);

  const steps: PlanStep[] = [];
  let seq = 1;
  let cursor = start;

  if (ventFirst) {
    steps.push({
      seq: seq++,
      type: "vent",
      title: "泄压",
      pressureAfter: round1(p0max),
      gasVolume: round1((residual - p0max) * volume),
      detail:
        `余压 ${round1(residual)} bar 高于可保留上限 ${round1(p0max)} bar，` +
        `先泄压至 ${round1(p0max)} bar`,
    });
  } else if (residual > P + 0.05) {
    // 余压已高于目标终压（极端情况），直接泄到终压
    steps.push({
      seq: seq++,
      type: "vent",
      title: "泄压",
      pressureAfter: P,
      gasVolume: round1((residual - P) * volume),
      detail: `余压 ${round1(residual)} bar 已高于目标终压 ${P} bar，先泄压至 ${P} bar`,
    });
    cursor = P;
  }

  if (o2Add > 0.05) {
    cursor += o2Add;
    steps.push({
      seq: seq++,
      type: "o2",
      title: "加注纯氧",
      pressureAfter: round1(cursor),
      gasVolume: round1(o2Add * volume),
      detail: `充入纯氧至压力 ${round1(cursor)} bar（加注约 ${round1(o2Add)} bar 分压）`,
    });
  }
  if (heAdd > 0.05) {
    cursor += heAdd;
    steps.push({
      seq: seq++,
      type: "he",
      title: "加注纯氦",
      pressureAfter: round1(cursor),
      gasVolume: round1(heAdd * volume),
      detail: `充入纯氦至压力 ${round1(cursor)} bar（加注约 ${round1(heAdd)} bar 分压）`,
    });
  }
  if (topUp > 0.05) {
    cursor += topUp;
    const type = mode === "air" ? "air" : "n2";
    steps.push({
      seq,
      type,
      title: mode === "air" ? "空气补压至终压" : "纯氮补压至终压",
      pressureAfter: round1(P),
      gasVolume: round1(topUp * volume),
      detail:
        mode === "air"
          ? `用空气补压至终压 ${P} bar（约 ${round1(topUp)} bar 分压），充分混合后测氧/氦`
          : `用纯氮补压至终压 ${P} bar（约 ${round1(topUp)} bar 分压），充分混合后测氧/氦`,
    });
  }
  void cursor;

  return {
    mode,
    assumption: "残气按空气（O2 21% / N2 79%，不含氦）估算，作业后以实测氧氦比为准",
    ventFirst,
    residualKeep: round1(p0max),
    ventTo: round1(p0max),
    o2Add: round1(Math.max(0, o2Add)),
    heAdd: round1(Math.max(0, heAdd)),
    topUp: round1(topUp),
    steps,
    warnings,
  };
}

// ---------------- 签收校验 ----------------

export interface SignOffDraft {
  measuredO2: string;
  measuredHe: string;
  sourceBatch: string;
  operator: string;
}

export type SignOffProblem =
  | { field: "measuredO2" | "measuredHe" | "sourceBatch" | "operator"; reason: string };

/** 签收缺项/无效项校验：缺项不能签收 */
export function validateSignOff(draft: SignOffDraft): SignOffProblem[] {
  const problems: SignOffProblem[] = [];
  if (draft.measuredO2.trim() === "") problems.push({ field: "measuredO2", reason: "实测氧含量未填写" });
  else if (!(Number(draft.measuredO2) >= 0 && Number(draft.measuredO2) <= 100))
    problems.push({ field: "measuredO2", reason: "实测氧含量需在 0~100% 之间" });

  if (draft.measuredHe.trim() === "") problems.push({ field: "measuredHe", reason: "实测氦含量未填写" });
  else if (!(Number(draft.measuredHe) >= 0 && Number(draft.measuredHe) <= 100))
    problems.push({ field: "measuredHe", reason: "实测氦含量需在 0~100% 之间" });

  // 仅当氧、氦各自都有效时才校验二者之和，避免重复报错
  const o2Num = Number(draft.measuredO2);
  const heNum = Number(draft.measuredHe);
  const o2Valid = o2Num >= 0 && o2Num <= 100;
  const heValid = heNum >= 0 && heNum <= 100;
  if (draft.measuredO2.trim() !== "" && draft.measuredHe.trim() !== "" && o2Valid && heValid && o2Num + heNum > 100.001)
    problems.push({ field: "measuredHe", reason: "实测氧+氦超过 100%" });

  if (draft.sourceBatch.trim() === "") problems.push({ field: "sourceBatch", reason: "气源批次未填写" });
  if (draft.operator.trim() === "") problems.push({ field: "operator", reason: "操作员未填写" });
  return problems;
}

/** 实测与目标偏差提示（不阻断签收，仅提醒） */
export function ratioDeviation(target: Ratio, measured: Ratio): { o2: number; he: number } {
  return { o2: measured.o2 - target.o2, he: measured.he - target.he };
}

// ---------------- 登记校验 ----------------

export function validateRegister(input: Partial<RegisterInput>): string | null {
  if (!input.bottleNo || !input.bottleNo.trim()) return "请填写瓶号";
  if (!(Number(input.volume) > 0)) return "水容积需为大于 0 的升数";
  if (!input.hydroDue) return "请选择水检到期日";
  if (!Number.isFinite(Number(input.residual)) || Number(input.residual) < 0) return "余压不能为负";
  if (!(Number(input.targetPressure) > 0)) return "目标终压需大于 0";
  const o = Number(input.targetO2);
  const h = Number(input.targetHe);
  if (!(o >= 0 && h >= 0 && o + h <= 100)) return "目标氧氦比无效：需 ≥0 且 氧+氦 ≤100%";
  return null;
}
