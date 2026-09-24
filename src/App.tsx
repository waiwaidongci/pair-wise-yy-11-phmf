import { useMemo, useState } from "react";
import "./styles.css";
import { StoreProvider, useStore } from "./state/store";
import { RegistrationForm } from "./components/RegistrationForm";
import { QueuePanel } from "./components/QueuePanel";
import { HoldingPanel } from "./components/HoldingPanel";
import { SignOffModal } from "./components/SignOffModal";
import { BottleHistory } from "./components/BottleHistory";
import { LedgerPanel } from "./components/LedgerPanel";
import { hydroStatus } from "./domain/rules";
import type { WorkOrder } from "./domain/types";

type Tab = "work" | "history" | "ledger";

function Metrics() {
  const { state, queued, holding } = useStore();
  const fills = state.ledger.filter((e) => e.kind === "fill");
  const nearCount = queued.filter((o) => hydroStatus(o.hydroDue).near).length;
  const avgO2 = fills.length
    ? (fills.reduce((s, e) => s + (e.kind === "fill" ? e.measuredO2 : 0), 0) / fills.length).toFixed(1)
    : "—";

  const metrics = [
    { label: "待充填", value: queued.length, note: nearCount ? `含 ${nearCount} 瓶临期` : "按水检天数排序" },
    { label: "待处理区", value: holding.length, note: "水检过期瓶" },
    { label: "实测平均氧含量", value: avgO2 === "—" ? "—" : `${avgO2}%`, note: "来自已签收记录" },
    { label: "签收凭证", value: fills.length, note: "不可覆盖" },
  ];

  return (
    <section className="metrics">
      {metrics.map((m) => (
        <article key={m.label}>
          <small>{m.label}</small>
          <strong>{m.value}</strong>
          <span className="metric-note">{m.note}</span>
        </article>
      ))}
    </section>
  );
}

function Workspace() {
  const [tab, setTab] = useState<Tab>("work");
  const [signing, setSigning] = useState<WorkOrder | null>(null);
  const { state } = useStore();

  const tabs: Array<{ key: Tab; label: string; badge?: number }> = useMemo(
    () => [
      { key: "work", label: "作业面" },
      { key: "history", label: "单瓶档案 / 历史" },
      { key: "ledger", label: `充填台账 (${state.ledger.length})` },
    ],
    [state.ledger.length],
  );

  return (
    <>
      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "work" && (
        <div className="work-grid">
          <RegistrationForm />
          <div className="work-columns">
            <HoldingPanel />
            <QueuePanel onSign={setSigning} />
          </div>
        </div>
      )}
      {tab === "history" && <BottleHistory />}
      {tab === "ledger" && <LedgerPanel />}

      {signing && (
        <SignOffModal
          // 工单签收后会从队列移除，关闭即结束
          order={signing}
          onClose={() => setSigning(null)}
        />
      )}
    </>
  );
}

function App() {
  return (
    <StoreProvider>
      <main className="app">
        <section className="hero">
          <p>hxyfront-62010 · 气瓶充填作业面</p>
          <h1>潜水气瓶充填记录</h1>
          <span>
            登记瓶号、水容积、水检到期日、余压与目标氧氦比；队列按水检剩余天数排序，到期瓶自动进入待处理区。
            开工按余压与目标比生成分压步骤（余压超限先泄压），完成后凭实测氧氦比、气源批次与操作员签收，签收记录不可覆盖。
          </span>
        </section>
        <Metrics />
        <Workspace />
        <footer className="foot">
          规则（分压/排序/校验）、台账（只追加凭证）、档案（气瓶信息与单瓶历史）分层独立实现 · 数据保存在浏览器本地
        </footer>
      </main>
    </StoreProvider>
  );
}

export default App;
