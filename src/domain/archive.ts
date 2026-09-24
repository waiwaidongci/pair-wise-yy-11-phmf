import type { BottleProfile, LedgerEvent } from "./types";

// ============================================================
// 档案模块：管理气瓶静态档案（瓶号、水容积、水检到期日），
// 并基于台账事件提供单瓶历史（配比与签收人）查询。
// 与台账分离：档案可更新，台账只追加。
// ============================================================

export function normalizeNo(no: string): string {
  return no.trim().toUpperCase();
}

export function upsertProfile(
  profiles: BottleProfile[],
  input: { bottleNo: string; volume: number; hydroDue: string; at: string },
): BottleProfile[] {
  const bottleNo = normalizeNo(input.bottleNo);
  const existing = profiles.find((p) => p.bottleNo === bottleNo);
  if (existing) {
    return profiles.map((p) =>
      p.bottleNo === bottleNo
        ? { ...p, volume: input.volume, hydroDue: input.hydroDue, updatedAt: input.at }
        : p,
    );
  }
  const profile: BottleProfile = {
    bottleNo,
    volume: input.volume,
    hydroDue: input.hydroDue,
    firstRegisteredAt: input.at,
    updatedAt: input.at,
  };
  return [...profiles, profile];
}

export function findProfile(profiles: BottleProfile[], bottleNo: string): BottleProfile | undefined {
  return profiles.find((p) => p.bottleNo === normalizeNo(bottleNo));
}

/** 单瓶历史：该瓶全部台账事件，按时间倒序（最近一次签收在前），同时间按单号倒序 */
export function bottleHistory(ledger: LedgerEvent[], bottleNo: string): LedgerEvent[] {
  const no = normalizeNo(bottleNo);
  return ledger
    .filter((e) => normalizeNo(e.bottleNo) === no)
    .sort((a, b) => {
      const t = eventTime(b).localeCompare(eventTime(a));
      if (t !== 0) return t;
      return eventRef(b).localeCompare(eventRef(a));
    });
}

export function eventTime(e: LedgerEvent): string {
  return e.kind === "fill" ? e.signedAt : e.at;
}

export function eventRef(e: LedgerEvent): string {
  return e.kind === "fill" ? e.voucherNo : e.refNo;
}

/** 该瓶累计充填次数与最近一次签收人 */
export function bottleSummary(ledger: LedgerEvent[], bottleNo: string) {
  const fills = bottleHistory(ledger, bottleNo).filter(
    (e): e is Extract<LedgerEvent, { kind: "fill" }> => e.kind === "fill",
  );
  return {
    fillCount: fills.length,
    lastOperator: fills[0]?.operator ?? null,
    lastSignedAt: fills[0]?.signedAt ?? null,
  };
}
