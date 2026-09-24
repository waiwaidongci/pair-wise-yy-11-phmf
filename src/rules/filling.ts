// 规则模块：与「台账」「档案」分开实现
// 只负责可复用的领域规则计算，不持有在制工单状态。

export interface Mix {
  /** 目标氧 %（体积分数） */
  o2: number;
  /** 目标氦 %（体积分数） */
  he: number;
}

export interface RuleSettings {
  /** 标准工作压力 bar（目标压力缺省值） */
  workingPressure: number;
  /** 水检临近提醒天数（剩余天数小于等于该值在队列中预警） */
  warnDays: number;
  /** 实测配比与目标比允许偏差（百分点），超过仅警告，不阻止签收 */
  tolerancePct: number;
}

export interface FillStep {
  order: number;
  action: "vent" | "add" | "fill";
  gas: "O2" | "HE" | "AIR" | "MIX";
  /** 该步操作前表压 bar */
  fromBar: number;
  /** 该步操作后表压 bar */
  toBar: number;
  /** 本步加/泄压力 bar */
  deltaBar: number;
  note: string;
}

export interface FillPlan {
  feasible: boolean;
  reason?: string;
  /** 余压是否高于目标压力，需先泄压 */
  needsVent: boolean;
  steps: FillStep[];
  assumption: string;
}

export const DEFAULT_RULES: RuleSettings = {
  workingPressure: 200,
  warnDays: 30,
  tolerancePct: 2,
};

export function mixLabel(m: Mix): string {
  if (m.he > 0) return `Trimix ${m.o2.toFixed(0)}/${m.he.toFixed(0)}`;
  if (Math.abs(m.o2 - 21) < 0.5) return "空气";
  return `EAN${m.o2.toFixed(0)}`;
}

/** 校验目标氧氦比是否合法（空气补压可实现） */
export function validateMix(m: Mix): string | null {
  if (!Number.isFinite(m.o2) || !Number.isFinite(m.he)) return "氧氦比必须是数字";
  if (m.o2 <= 0 || m.o2 > 100) return "氧含量必须在 0~100% 之间";
  if (m.he < 0 || m.he >= 100) return "氦含量必须在 0~100% 之间";
  if (m.o2 + m.he > 100) return "氧含量与氦含量之和不能超过 100%";
  // 最后用空气(21% O2)补压，目标氧不能低于补压空气带来的氧
  if (m.o2 < 0.21 * (100 - m.he) - 1e-9) {
    return `氧含量过低：${mixLabel(m)} 无法用空气补压实现（氧至少约 ${Math.ceil(
      0.21 * (100 - m.he)
    )}%），需用氮/氦底气`;
  }
  return null;
}

/** 水检剩余天数（到期日 00:00 与今天 00:00 的整天差） */
export function daysUntil(isoDate: string, today = new Date()): number {
  const due = new Date(`${isoDate}T00:00:00`);
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

/** 到期判定：剩余天数 < 0 入留待处理区 */
export function isOverdue(isoDate: string, today = new Date()): boolean {
  return daysUntil(isoDate, today) < 0;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 分压充填步骤计算（道尔顿分压，忽略温度/压缩因子修正）。
 *
 * - 余压 > 目标压力：第一步先泄压至 0bar，再按空瓶分压流程充填。
 * - 余压 ≤ 目标压力（续充）：先纯氧、再纯氦、最后空气补压。
 *   空气含 21% 氧，纯氧增量必须扣除空气补压带入的氧，否则终氧偏高：
 *     dHe = d × fHe
 *     dO2 = d × (fO2 − 0.21×(1−fHe)) / 0.79
 *     dAir = d − dHe − dO2
 *   续充模型假定瓶内余气与目标配比一致；余气成分未知时应先泄放。
 */
export function buildFillPlan(
  residualBar: number,
  mix: Mix,
  rules: RuleSettings
): FillPlan {
  const error = validateMix(mix);
  if (error) return { feasible: false, reason: error, needsVent: false, steps: [], assumption: "" };
  if (!Number.isFinite(residualBar) || residualBar < 0) {
    return { feasible: false, reason: "余压必须为不小于 0 的数字", needsVent: false, steps: [], assumption: "" };
  }

  const target = rules.workingPressure;
  const fo2 = mix.o2 / 100;
  const fhe = mix.he / 100;

  const steps: FillStep[] = [];
  let cursor = residualBar;
  let order = 1;
  let needsVent = false;
  let assumption =
    "续充模型：假定瓶内余气与目标配比一致；若余气成分未知，应先泄放到安全余压后再按分压比例充填。";

  const push = (step: Omit<FillStep, "order">) => steps.push({ order: order++, ...step });

  // 余压高于目标压力：先泄压至 0，再按空瓶充填
  if (residualBar > target + 1e-9) {
    needsVent = true;
    assumption = "余压高于目标压力，已泄放至 0bar，后续按空瓶分压流程充填。";
    push({
      action: "vent",
      gas: "MIX",
      fromBar: r1(residualBar),
      toBar: 0,
      deltaBar: r1(residualBar),
      note: `余压 ${r1(residualBar)}bar 高于目标压力 ${target}bar，先泄压至 0bar`,
    });
    cursor = 0;
  }

  const deficit = target - cursor;
  const dHe = deficit * fhe;
  const dO2 = (deficit * (fo2 - 0.21 * (1 - fhe))) / 0.79;
  const dAir = deficit - dHe - dO2;

  if (dO2 > 0.05) {
    push({
      action: "add",
      gas: "O2",
      fromBar: r1(cursor),
      toBar: r1(cursor + dO2),
      deltaBar: r1(dO2),
      note: `先充纯氧：加压 ${r1(dO2)}bar（已扣除空气补压将带入的 21% 氧）`,
    });
    cursor += dO2;
  }
  if (dHe > 0.05) {
    push({
      action: "add",
      gas: "HE",
      fromBar: r1(cursor),
      toBar: r1(cursor + dHe),
      deltaBar: r1(dHe),
      note: `再充纯氦：加压 ${r1(dHe)}bar（目标氦 ${mix.he}% 的分压）`,
    });
    cursor += dHe;
  }
  if (dAir > 0.05) {
    push({
      action: "fill",
      gas: "AIR",
      fromBar: r1(cursor),
      toBar: target,
      deltaBar: r1(dAir),
      note: `最后空气补压：加压 ${r1(dAir)}bar 至工作压力 ${target}bar`,
    });
  }
  if (steps.length === 0) {
    push({
      action: "fill",
      gas: "AIR",
      fromBar: r1(residualBar),
      toBar: target,
      deltaBar: 0,
      note: `余压 ${r1(residualBar)}bar 已等于目标压力 ${target}bar，无需充填`,
    });
  }

  return {
    feasible: true,
    needsVent,
    steps,
    assumption,
  };
}

/** 签收校验：缺项不能签收 */
export interface CompletionInput {
  actualO2: number | null;
  actualHe: number | null;
  sourceBatch: string;
  operator: string;
}

export function checkCompletion(input: CompletionInput): string[] {
  const missing: string[] = [];
  if (input.actualO2 === null || !Number.isFinite(input.actualO2)) missing.push("实测氧含量");
  if (input.actualHe === null || !Number.isFinite(input.actualHe)) missing.push("实测氦含量");
  if (!input.sourceBatch.trim()) missing.push("气源批次");
  if (!input.operator.trim()) missing.push("操作员");
  return missing;
}

/** 实测与目标配比偏差（百分点） */
export function deviation(actual: number, target: number): number {
  return Math.round((actual - target) * 10) / 10;
}
