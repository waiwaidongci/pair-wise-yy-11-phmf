import { useMemo, useState } from "react";
import "./styles.css";
import { useStore } from "./store";
import { ledgerStore, fillQueue, heldOrders } from "./ledger/orders";
import { archiveStore } from "./archive/records";
import RegisterForm from "./components/RegisterForm";
import QueueBoard from "./components/QueueBoard";
import HeldArea from "./components/HeldArea";
import HistoryPanel from "./components/HistoryPanel";
import RulesPanel from "./components/RulesPanel";
import WorkDialog from "./components/WorkDialog";
import type { WorkOrder } from "./ledger/orders";

function App() {
  const orders = useStore(ledgerStore);
  const records = useStore(archiveStore);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const queue = fillQueue(orders);
  const held = heldOrders(orders);
  const inProgress = queue.filter((o) => o.status === "in_progress").length;
  const activeOrder: WorkOrder | undefined = useMemo(
    () => orders.find((o) => o.id === activeId),
    [orders, activeId]
  );

  const metrics = [
    { label: "待充填", value: queue.length },
    { label: "充填中", value: inProgress },
    { label: "到期扣留", value: held.length },
    { label: "签收档案", value: records.length },
  ];

  const onSigned = (recordId: string, bottleNo: string) => {
    setActiveId(null);
    setToast(`签收成功：${bottleNo}，已生成不可覆盖记录 ${recordId}`);
    window.setTimeout(() => setToast(null), 3200);
  };

  return (
    <main className="app">
      <header className="hero">
        <p>hxyfront-62010 · 气瓶充填作业面 · Port 62010</p>
        <h1>潜水气瓶充填作业台</h1>
        <span>
          登记瓶号、水容积、水检到期日、余压与目标氧氦比；队列按水检剩余天数排序，到期瓶进入留待处理区；
          开工前给出分压步骤，完成后填写实测配比、气源批次与操作员方可签收，档案只追加、不可覆盖。
        </span>
      </header>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <div className="layout">
        <div className="side">
          <RegisterForm />
          <RulesPanel />
        </div>
        <div className="main-col">
          <QueueBoard onOpen={(o) => setActiveId(o.id)} />
          <HeldArea />
        </div>
      </div>

      <HistoryPanel />

      {activeOrder && (
        <WorkDialog order={activeOrder} onClose={() => setActiveId(null)} onSigned={onSigned} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

export default App;
