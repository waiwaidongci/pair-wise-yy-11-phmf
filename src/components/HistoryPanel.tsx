import { useState } from "react";
import { useStore } from "../store";
import { archiveStore, historyByBottle, type SignedRecord } from "../archive/records";
import { mixLabel } from "../rules/filling";
import { formatDateTime } from "../lib/format";

function RecordCard({ r }: { r: SignedRecord }) {
  return (
    <article className="archive-card">
      <div className="card-top">
        <h3>{r.bottleNo}</h3>
        <span className="lock">🔒 不可覆盖</span>
      </div>
      <p className="card-line">
        {r.waterVolume}L · 目标 {mixLabel(r.target)}（{r.target.o2}/{r.target.he}）→ 实测{" "}
        <b>
          O₂ {r.actualO2}% / He {r.actualHe}%
        </b>
      </p>
      <p className="card-line">
        余压 {r.residualBar}bar → {r.targetPressure}bar · 气源批次 {r.sourceBatch}
      </p>
      <p className="card-line">
        签收人 <b>{r.operator}</b> · {formatDateTime(r.signedAt)}
      </p>
      <small>
        签收单 {r.id} · 来源工单 {r.orderId} · 水检 {r.hydroDue}
      </small>
    </article>
  );
}

export default function HistoryPanel() {
  const records = useStore(archiveStore);
  const [query, setQuery] = useState("");
  const result = query.trim() ? historyByBottle(records, query) : null;

  return (
    <section className="panel archive">
      <div className="heading">
        <div>
          <p>档案 · 签收记录（只追加）</p>
          <h2>气瓶档案 / 单瓶历史</h2>
        </div>
        <span className="count">共 {records.length} 条签收</span>
      </div>

      <div className="lookup">
        <input
          placeholder="输入瓶号查询单瓶历史（配比、气源批次、签收人）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          <button onClick={() => setQuery("")}>清除</button>
        )}
      </div>

      {result !== null && (
        <div className="lookup-result">
          <h3 className="sub">
            {query.trim().toUpperCase()} 的历史 · {result.length} 条
          </h3>
          {result.length === 0 && <p className="empty">该瓶号没有签收记录。</p>}
          <div className="cards">
            {result.map((r) => (
              <RecordCard key={r.id} r={r} />
            ))}
          </div>
        </div>
      )}

      {result === null && (
        <div className="cards">
          {records.map((r) => (
            <RecordCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </section>
  );
}
