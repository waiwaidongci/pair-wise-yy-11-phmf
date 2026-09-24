import { useMemo, useState } from "react";
import type { WorkOrder } from "../domain/types";
import { buildFillPlan, hydroStatus } from "../domain/rules";
import { useStore } from "../state/store";
import { PlanSteps } from "./PlanSteps";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function QueueCard({ order, onSign }: { order: WorkOrder; onSign: (o: WorkOrder) => void }) {
  const [open, setOpen] = useState(false);
  const hs = hydroStatus(order.hydroDue);
  const plan = useMemo(
    () =>
      buildFillPlan(
        order.residual,
        { pressure: order.targetPressure, o2: order.targetO2, he: order.targetHe },
        order.volume,
      ),
    [order],
  );
  const ventFirst = !("error" in plan) && plan.ventFirst;
  const ventTo = !("error" in plan) ? plan.ventTo : 0;

  return (
    <article className={`queue-card ${hs.near ? "near" : ""}`}>
      <header className="queue-head">
        <div className="queue-id">
          <h3>{order.bottleNo}</h3>
          <span className="mono">{order.id}</span>
        </div>
        <div className={`hydro-tag ${hs.expired ? "tag-expired" : hs.near ? "tag-near" : "tag-ok"}`}>
          {hs.label}
        </div>
      </header>

      <div className="queue-meta">
        <span>水容积 <b>{order.volume} L</b></span>
        <span>余压 <b className={ventFirst ? "warn-text" : ""}>{order.residual} bar</b></span>
        <span>目标终压 <b>{order.targetPressure} bar</b></span>
        <span>
          目标比 <b>O₂ {order.targetO2}% / He {order.targetHe}%</b>
        </span>
        <span className="muted">登记于 {fmtTime(order.createdAt)}</span>
      </div>

      {ventFirst && (
        <div className="banner banner-warn">
          余压高于可保留上限 {ventTo} bar，开工须先泄压
        </div>
      )}

      <div className="queue-actions">
        <button onClick={() => setOpen((v) => !v)}>
          {open ? "收起分压步骤" : "查看分压步骤"}
        </button>
        <button className="primary" onClick={() => onSign(order)}>
          充填完成 · 签收
        </button>
      </div>

      {open && (
        "error" in plan ? (
          <div className="banner banner-error">{plan.error}</div>
        ) : (
          <PlanSteps plan={plan} />
        )
      )}
    </article>
  );
}

export function QueuePanel({ onSign }: { onSign: (o: WorkOrder) => void }) {
  const { queued } = useStore();
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>待充填队列</p>
          <h2>作业队列 <span className="count">{queued.length}</span></h2>
        </div>
        <span className="hint">按水检剩余天数升序，临期（≤7天）优先</span>
      </div>
      {queued.length === 0 ? (
        <p className="empty">当前没有待充填气瓶</p>
      ) : (
        <div className="card-list">
          {queued.map((o) => (
            <QueueCard key={o.id} order={o} onSign={onSign} />
          ))}
        </div>
      )}
    </section>
  );
}
