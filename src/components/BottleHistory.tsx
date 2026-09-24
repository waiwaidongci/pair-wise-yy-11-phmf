import { useMemo, useState } from "react";
import { bottleHistory, bottleSummary, findProfile } from "../domain/archive";
import { hydroStatus } from "../domain/rules";
import { useStore } from "../state/store";

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function BottleHistory() {
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const no = query.trim().toUpperCase();

  const profile = useMemo(
    () => (no ? findProfile(state.profiles, no) : undefined),
    [state.profiles, no],
  );
  const events = useMemo(
    () => (no ? bottleHistory(state.ledger, no) : []),
    [state.ledger, no],
  );
  const summary = useMemo(
    () => (no ? bottleSummary(state.ledger, no) : null),
    [state.ledger, no],
  );
  const openOrder = useMemo(
    () => state.orders.find((o) => o.bottleNo === no),
    [state.orders, no],
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>气瓶档案</p>
          <h2>单瓶历史查询</h2>
        </div>
      </div>
      <div className="history-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入瓶号，如 TANK-108（不区分大小写）"
        />
      </div>

      {no && !profile && events.length === 0 && (
        <p className="empty">档案中未找到瓶号 {no}</p>
      )}

      {profile && summary && (
        <div className="history-result">
          <div className="history-profile">
            <h3>{profile.bottleNo}</h3>
            <span className={`hydro-tag ${hydroStatus(profile.hydroDue).expired ? "tag-expired" : "tag-ok"}`}>
              {hydroStatus(profile.hydroDue).label}
            </span>
            <div className="queue-meta">
              <span>水容积 <b>{profile.volume} L</b></span>
              <span>水检到期 <b>{profile.hydroDue}</b></span>
              <span>累计充填 <b>{summary.fillCount}</b> 次</span>
              <span>最近签收人 <b>{summary.lastOperator ?? "—"}</b></span>
              {openOrder && (
                <span className="warn-text">
                  当前有未结工单（{openOrder.status === "holding" ? "待处理区" : "队列中"}）
                </span>
              )}
            </div>
          </div>

          <h4>配比与签收记录</h4>
          {events.length === 0 ? (
            <p className="empty">该瓶暂无充填/处理记录</p>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>单号</th><th>时间</th><th>目标氧/氦</th><th>实测氧/氦</th>
                  <th>气源批次</th><th>签收人</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) =>
                  e.kind === "fill" ? (
                    <tr key={e.voucherNo}>
                      <td className="mono">{e.voucherNo}</td>
                      <td>{fmtFull(e.signedAt)}</td>
                      <td>{e.targetO2}% / {e.targetHe}%</td>
                      <td><b>{e.measuredO2}% / {e.measuredHe}%</b></td>
                      <td>{e.sourceBatch}</td>
                      <td>{e.operator}</td>
                    </tr>
                  ) : (
                    <tr key={e.refNo} className="inspect-row">
                      <td className="mono">{e.refNo}</td>
                      <td>{fmtFull(e.at)}</td>
                      <td colSpan={3}>检验处理：{e.reason}｜{e.note}</td>
                      <td>{e.operator}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
