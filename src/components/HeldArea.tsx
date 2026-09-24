import { useState } from "react";
import { useStore } from "../store";
import { cancelOrder, cancelledOrders, heldOrders, ledgerStore } from "../ledger/orders";
import { daysUntil, mixLabel } from "../rules/filling";

export default function HeldArea() {
  const orders = useStore(ledgerStore);
  const held = heldOrders(orders);
  const cancelled = cancelledOrders(orders);
  const [reason, setReason] = useState<Record<string, string>>({});

  return (
    <section className="panel held">
      <div className="heading">
        <div>
          <p>台账 · 留待处理区</p>
          <h2>到期 / 待处理瓶</h2>
        </div>
        <span className="count">{held.length} 瓶扣留</span>
      </div>

      {held.length === 0 && <p className="empty">没有水检到期瓶。</p>}

      <div className="cards">
        {held.map((o) => {
          const days = daysUntil(o.hydroDue);
          return (
            <article key={o.id} className="card blocked">
              <div className="card-top">
                <h3>{o.bottleNo}</h3>
                <span className="badge held">禁止充填</span>
              </div>
              <p className="card-line">
                {o.waterVolume}L · 余压 {o.residualBar}bar · {mixLabel(o.target)}
              </p>
              <p className="reason">扣留原因：{o.holdReason ?? "水检到期"}</p>
              <p className="card-line">水检到期日 {o.hydroDue}（已过期 {-days} 天）</p>
              <div className="cancel-row">
                <input
                  placeholder="撤单/放行备注（可选）"
                  value={reason[o.id] ?? ""}
                  onChange={(e) => setReason((p) => ({ ...p, [o.id]: e.target.value }))}
                />
                <button onClick={() => cancelOrder(o.id, reason[o.id] ?? "水检到期，移出作业队列")}>
                  撤单移出
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {cancelled.length > 0 && (
        <>
          <h3 className="sub">已撤单留痕</h3>
          <ul className="cancel-list">
            {cancelled.map((o) => (
              <li key={o.id}>
                <b>{o.bottleNo}</b>
                <span>{o.id} · {o.cancelledReason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
