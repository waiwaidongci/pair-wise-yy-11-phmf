import { useMemo, useState } from "react";
import { useStore } from "../store";
import { rulesStore } from "../rules/settings";
import {
  buildFillPlan,
  checkCompletion,
  deviation,
  mixLabel,
} from "../rules/filling";
import { startOrder, type WorkOrder } from "../ledger/orders";
import { signOff } from "../archive/records";

interface Props {
  order: WorkOrder;
  onClose: () => void;
  onSigned: (recordId: string, bottleNo: string) => void;
}

const gasName: Record<string, string> = {
  O2: "纯氧",
  HE: "纯氦",
  AIR: "空气",
  MIX: "混合气",
};

export default function WorkDialog({ order, onClose, onSigned }: Props) {
  const rules = useStore(rulesStore);

  // 开工前按余压和目标比给出分压步骤（规则模块计算）
  const plan = useMemo(
    () => buildFillPlan(order.residualBar, order.target, { ...rules, workingPressure: order.targetPressure }),
    [order, rules]
  );

  const [actualO2, setActualO2] = useState("");
  const [actualHe, setActualHe] = useState("");
  const [sourceBatch, setSourceBatch] = useState("");
  const [operator, setOperator] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nO2 = actualO2 === "" ? null : Number(actualO2);
  const nHe = actualHe === "" ? null : Number(actualHe);
  const missing = checkCompletion({ actualO2: nO2, actualHe: nHe, sourceBatch, operator });

  const devO2 = nO2 === null || !Number.isFinite(nO2) ? null : deviation(nO2, order.target.o2);
  const devHe = nHe === null || !Number.isFinite(nHe) ? null : deviation(nHe, order.target.he);
  const overTolerance =
    (devO2 !== null && Math.abs(devO2) > rules.tolerancePct) ||
    (devHe !== null && Math.abs(devHe) > rules.tolerancePct);

  const canSign = missing.length === 0 && plan.feasible;

  const sign = () => {
    if (!plan.feasible) {
      setError(plan.reason ?? "充填方案不可行");
      return;
    }
    if (missing.length > 0) {
      setError(`缺项不能签收：请补全 ${missing.join("、")}`);
      return;
    }
    const record = signOff(order, {
      actualO2: nO2 as number,
      actualHe: nHe as number,
      sourceBatch,
      operator,
      steps: plan.steps,
    });
    onSigned(record.id, order.bottleNo);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>{order.id} · 分压充填作业</p>
            <h2>{order.bottleNo}</h2>
          </div>
          <button onClick={onClose}>关闭</button>
        </div>

        <div className="kv-grid">
          <div><small>水容积</small><b>{order.waterVolume} L</b></div>
          <div><small>水检到期</small><b>{order.hydroDue}</b></div>
          <div><small>登记余压</small><b>{order.residualBar} bar</b></div>
          <div><small>目标工作压力</small><b>{order.targetPressure} bar</b></div>
          <div><small>目标配比</small><b>{mixLabel(order.target)}</b></div>
          <div><small>状态</small><b>{order.status === "in_progress" ? "充填中" : "待充填"}</b></div>
        </div>

        {!plan.feasible && <div className="alert error">{plan.reason}</div>}

        {plan.needsVent && <div className="alert warn">⚠ {plan.steps[0].note}</div>}

        <h3 className="sub">开工前分压步骤</h3>
        <ol className="steps">
          {plan.steps.map((s) => (
            <li key={s.order} className={"step " + s.action}>
              <span className="step-no">{s.order}</span>
              <div>
                <b>
                  {s.action === "vent" ? "泄压" : "充填"} · {gasName[s.gas]}：{s.fromBar} → {s.toBar} bar
                  （{s.action === "vent" ? "泄放" : "+"}
                  {s.deltaBar} bar）
                </b>
                <p>{s.note}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="assumption">{plan.assumption}</p>

        {order.status === "queued" && (
          <button className="primary" onClick={() => startOrder(order.id)}>
            开始充填（标记充填中）
          </button>
        )}

        <h3 className="sub">完成签收</h3>
        <div className="field-grid">
          <label>
            <span>实测氧含量（%）*</span>
            <input type="number" value={actualO2} onChange={(e) => setActualO2(e.target.value)} placeholder="如 32" />
            {devO2 !== null && (
              <small className={Math.abs(devO2) > rules.tolerancePct ? "warn-text" : "ok-text"}>
                与目标偏差 {devO2 > 0 ? "+" : ""}
                {devO2} 个百分点
              </small>
            )}
          </label>
          <label>
            <span>实测氦含量（%）*</span>
            <input type="number" value={actualHe} onChange={(e) => setActualHe(e.target.value)} placeholder="如 0" />
            {devHe !== null && (
              <small className={Math.abs(devHe) > rules.tolerancePct ? "warn-text" : "ok-text"}>
                与目标偏差 {devHe > 0 ? "+" : ""}
                {devHe} 个百分点
              </small>
            )}
          </label>
          <label>
            <span>气源批次 *</span>
            <input value={sourceBatch} onChange={(e) => setSourceBatch(e.target.value)} placeholder="如 O2-B2409 / AIR-C91" />
          </label>
          <label>
            <span>操作员（签收人）*</span>
            <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="签名/工号" />
          </label>
        </div>

        {missing.length > 0 && <div className="alert error">缺项不能签收：{missing.join("、")}</div>}
        {missing.length === 0 && overTolerance && (
          <div className="alert warn">
            实测配比偏差超过规则允许的 ±{rules.tolerancePct} 个百分点，建议复检后再签收（缺项规则不受影响）。
          </div>
        )}
        {error && <div className="alert error">{error}</div>}

        <div className="actions">
          <button className="primary" disabled={!canSign} onClick={sign}>
            签收并生成不可覆盖记录
          </button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
