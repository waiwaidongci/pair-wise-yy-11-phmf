import { useMemo } from "react";
import type { FillVoucher, InspectRecord } from "../domain/types";
import { ledgerToCsv, listLedger } from "../domain/ledger";
import { useStore } from "../state/store";

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function LedgerPanel() {
  const { state, resetDemo } = useStore();
  const events = useMemo(() => listLedger(state.ledger), [state.ledger]);
  const fillCount = state.ledger.filter((e) => e.kind === "fill").length;
  const inspectCount = state.ledger.filter((e) => e.kind === "inspect").length;

  const exportCsv = () => {
    const blob = new Blob([ledgerToCsv(state.ledger)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `充填台账_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>充填台账（只追加）</p>
          <h2>
            不可覆盖记录 <span className="count">{fillCount}</span>
            <span className="count inspect-count">{inspectCount} 条检验处理</span>
          </h2>
        </div>
        <div className="heading-actions">
          <button onClick={exportCsv} disabled={fillCount === 0}>导出充填凭证 CSV</button>
          <button onClick={resetDemo} title="清空本地数据并恢复演示数据">重置演示数据</button>
        </div>
      </div>
      <p className="hint ledger-hint">
        台账记录在签收瞬间生成并冻结，界面不提供修改或删除入口；检验处理记录同样只追加。
      </p>

      {events.length === 0 ? (
        <p className="empty">台账为空</p>
      ) : (
        <div className="ledger-list">
          {events.map((e) =>
            e.kind === "fill" ? <FillRow key={e.voucherNo} v={e} /> : <InspectRow key={e.refNo} r={e} />,
          )}
        </div>
      )}
    </section>
  );
}

function FillRow({ v }: { v: FillVoucher }) {
  return (
    <article className="ledger-row fill-row">
      <div className="ledger-no">
        <span className="ledger-kind">充填签收</span>
        <b className="mono">{v.voucherNo}</b>
        <span className="frozen-tag">已冻结</span>
      </div>
      <div className="ledger-body">
        <h3>{v.bottleNo} <small>{v.volume} L · 终压 {v.targetPressure} bar</small></h3>
        <div className="ledger-meta">
          <span>目标 <b>O₂ {v.targetO2}% / He {v.targetHe}%</b></span>
          <span>实测 <b>O₂ {v.measuredO2}% / He {v.measuredHe}%</b></span>
          <span>气源批次 <b>{v.sourceBatch}</b></span>
          <span>签收人 <b>{v.operator}</b></span>
          <span className="muted">{fmtFull(v.signedAt)}</span>
        </div>
      </div>
    </article>
  );
}

function InspectRow({ r }: { r: InspectRecord }) {
  return (
    <article className="ledger-row inspect-ledger-row">
      <div className="ledger-no">
        <span className="ledger-kind kind-inspect">检验处理</span>
        <b className="mono">{r.refNo}</b>
        <span className="frozen-tag">已冻结</span>
      </div>
      <div className="ledger-body">
        <h3>{r.bottleNo}</h3>
        <div className="ledger-meta">
          <span>{r.reason}</span>
          <span>说明 <b>{r.note}</b></span>
          <span>操作员 <b>{r.operator}</b></span>
          <span className="muted">{fmtFull(r.at)}</span>
        </div>
      </div>
    </article>
  );
}
