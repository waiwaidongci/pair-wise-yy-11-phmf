import { useState } from "react";
import type { WorkOrder } from "../domain/types";
import { hydroStatus } from "../domain/rules";
import { useStore } from "../state/store";

function HoldingCard({ order }: { order: WorkOrder }) {
  const { inspect } = useStore();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [operator, setOperator] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hs = hydroStatus(order.hydroDue);

  const submit = () => {
    if (!note.trim()) {
      setError("请填写处理说明（如送检安排）");
      return;
    }
    if (!operator.trim()) {
      setError("请填写操作员");
      return;
    }
    inspect(order.id, { reason: order.holdReason, note, operator });
  };

  return (
    <article className="queue-card holding-card">
      <header className="queue-head">
        <div className="queue-id">
          <h3>{order.bottleNo}</h3>
          <span className="mono">{order.id}</span>
        </div>
        <div className="hydro-tag tag-expired">{hs.label}</div>
      </header>

      <div className="queue-meta">
        <span>水容积 <b>{order.volume} L</b></span>
        <span>余压 <b>{order.residual} bar</b></span>
        <span>原计划比 <b>O₂ {order.targetO2}% / He {order.targetHe}%</b></span>
      </div>

      <div className="banner banner-error">留待原因：{order.holdReason}</div>

      <div className="queue-actions">
        <button onClick={() => setOpen((v) => !v)}>
          {open ? "收起处理单" : "填写检验处理单"}
        </button>
      </div>

      {open && (
        <div className="inspect-form">
          <div className="field-grid">
            <label>
              <span>处理说明 *</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：已联系送检，停用待复检" />
            </label>
            <label>
              <span>操作员 *</span>
              <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="实名签字" />
            </label>
          </div>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-actions">
            <button className="danger" onClick={submit}>确认转检验（生成不可覆盖记录）</button>
          </div>
        </div>
      )}
    </article>
  );
}

export function HoldingPanel() {
  const { holding } = useStore();
  return (
    <section className="panel holding-panel">
      <div className="heading">
        <div>
          <p>留待处理区</p>
          <h2>到期 / 异常瓶 <span className="count danger-count">{holding.length}</span></h2>
        </div>
        <span className="hint">水检过期瓶禁止进入充填队列</span>
      </div>
      {holding.length === 0 ? (
        <p className="empty">暂无到期瓶</p>
      ) : (
        <div className="card-list">
          {holding.map((o) => (
            <HoldingCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </section>
  );
}
