import { useStore } from "../store";
import { fillQueue, ledgerStore, statusLabel, type WorkOrder } from "../ledger/orders";
import { daysUntil, mixLabel } from "../rules/filling";
import { rulesStore } from "../rules/settings";

interface Props {
  onOpen: (order: WorkOrder) => void;
}

export default function QueueBoard({ onOpen }: Props) {
  const orders = useStore(ledgerStore);
  const rules = useStore(rulesStore);
  const queue = fillQueue(orders);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>台账 · 待充填队列</p>
          <h2>作业队列</h2>
        </div>
        <span className="count">按水检剩余天数升序 · {queue.length} 瓶</span>
      </div>

      {queue.length === 0 && <p className="empty">暂无待充填气瓶，先在左侧登记。</p>}

      <div className="cards">
        {queue.map((o) => {
          const days = daysUntil(o.hydroDue);
          const urgent = days <= rules.warnDays;
          const overPress = o.residualBar > o.targetPressure;
          return (
            <article key={o.id} className={"card" + (o.status === "in_progress" ? " active" : "")}>
              <div className="card-top">
                <h3>{o.bottleNo}</h3>
                <span className={"badge " + o.status}>{statusLabel(o.status)}</span>
              </div>
              <p className="card-line">
                {o.waterVolume}L · 余压 <b>{o.residualBar}</b>/{o.targetPressure}bar ·{" "}
                {mixLabel(o.target)}
              </p>
              <p className="card-line">
                水检 {o.hydroDue} ·{" "}
                <span className={urgent ? "warn-text" : ""}>
                  {days === 0 ? "今日到期" : `剩余 ${days} 天`}
                </span>
                {overPress && <span className="danger-tag"> 余压过高需泄压</span>}
              </p>
              <div className="card-foot">
                <small>{o.id}</small>
                <button className="primary sm" onClick={() => onOpen(o)}>
                  作业
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
