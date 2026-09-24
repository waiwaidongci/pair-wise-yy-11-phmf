import { useMemo, useState } from "react";
import type { FillVoucher, WorkOrder } from "../domain/types";
import { ratioDeviation, validateSignOff, type SignOffDraft } from "../domain/rules";
import { useStore } from "../state/store";

const EMPTY: SignOffDraft = { measuredO2: "", measuredHe: "", sourceBatch: "", operator: "" };

export function SignOffModal({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const { signOff, state } = useStore();
  const [draft, setDraft] = useState<SignOffDraft>({
    ...EMPTY,
    measuredO2: String(order.targetO2),
    measuredHe: String(order.targetHe),
  });
  const [submitted, setSubmitted] = useState(false);

  // 签收后从台账中读取由台账模块生成的不可覆盖凭证
  const voucher = state.ledger.find(
    (e): e is FillVoucher => e.kind === "fill" && e.orderId === order.id,
  );

  const problems = useMemo(() => validateSignOff(draft), [draft]);
  const missingFields = problems.map((p) => p.field);
  const deviation = useMemo(() => {
    const o = Number(draft.measuredO2);
    const h = Number(draft.measuredHe);
    if (!Number.isFinite(o) || !Number.isFinite(h)) return null;
    return ratioDeviation({ o2: order.targetO2, he: order.targetHe }, { o2: o, he: h });
  }, [draft, order]);

  const set = (k: keyof SignOffDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const trySign = () => {
    setSubmitted(true);
    if (validateSignOff(draft).length > 0) return;
    signOff(order.id, {
      measuredO2: Number(draft.measuredO2),
      measuredHe: Number(draft.measuredHe),
      sourceBatch: draft.sourceBatch,
      operator: draft.operator,
    });
  };

  const fieldCls = (f: keyof SignOffDraft) =>
    submitted && missingFields.includes(f) ? "invalid" : "";

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {voucher ? (
          <div className="done-box">
            <div className="done-stamp">已签收 · 记录冻结</div>
            <h2>{voucher.bottleNo} 充填完成</h2>
            <p>
              签收记录已写入台账，凭证号 <b className="mono">{voucher.voucherNo}</b>，
              记录不可覆盖、不可删除。
            </p>
            <dl className="done-detail">
              <div><dt>实测配比</dt><dd>O₂ {voucher.measuredO2}% / He {voucher.measuredHe}%</dd></div>
              <div><dt>气源批次</dt><dd>{voucher.sourceBatch}</dd></div>
              <div><dt>签收人</dt><dd>{voucher.operator}</dd></div>
              <div><dt>签收时间</dt><dd>{new Date(voucher.signedAt).toLocaleString("zh-CN")}</dd></div>
            </dl>
            <button className="primary" onClick={onClose}>关闭</button>
          </div>
        ) : (
          <>
            <div className="heading">
              <div>
                <p>完成签收</p>
                <h2>{order.bottleNo} <span className="mono small">{order.id}</span></h2>
              </div>
              <button onClick={onClose}>×</button>
            </div>

            <div className="sign-target">
              目标终压 {order.targetPressure} bar · 目标 O₂ {order.targetO2}% / He {order.targetHe}%
            </div>

            <div className="field-grid">
              <label className={fieldCls("measuredO2")}>
                <span>实测氧含量 % *</span>
                <input
                  type="number" step="0.1" min="0" max="100"
                  value={draft.measuredO2} onChange={set("measuredO2")}
                />
              </label>
              <label className={fieldCls("measuredHe")}>
                <span>实测氦含量 % *</span>
                <input
                  type="number" step="0.1" min="0" max="100"
                  value={draft.measuredHe} onChange={set("measuredHe")}
                />
              </label>
              <label className={fieldCls("sourceBatch")}>
                <span>气源批次 *</span>
                <input value={draft.sourceBatch} onChange={set("sourceBatch")} placeholder="如 EAN-A20260920" />
              </label>
              <label className={fieldCls("operator")}>
                <span>操作员（签收人）*</span>
                <input value={draft.operator} onChange={set("operator")} placeholder="实名签字" />
              </label>
            </div>

            {deviation && (Math.abs(deviation.o2) > 1 || Math.abs(deviation.he) > 1) && (
              <div className="banner banner-warn">
                实测与目标偏差：O₂ {deviation.o2 > 0 ? "+" : ""}{deviation.o2.toFixed(1)}%，
                He {deviation.he > 0 ? "+" : ""}{deviation.he.toFixed(1)}%（超过 ±1%，请确认后再签收）
              </div>
            )}

            {submitted && problems.length > 0 && (
              <div className="banner banner-error">
                缺项不能签收：
                <ul>
                  {problems.map((p) => <li key={p.field}>{p.reason}</li>)}
                </ul>
              </div>
            )}

            <div className="form-actions">
              <button onClick={onClose}>取消</button>
              <button
                className="primary"
                onClick={trySign}
                disabled={problems.length > 0}
                title={problems.length > 0 ? "存在缺项，不能签收" : ""}
              >
                确认签收并冻结记录
              </button>
            </div>
            <p className="hint">签收后自动生成不可覆盖台账记录；缺项或数值无效时签收按钮不可用。</p>
          </>
        )}
      </div>
    </div>
  );
}
