import { useState } from "react";
import { useStore } from "../store";
import { rulesStore } from "../rules/settings";
import { mixLabel, validateMix, type Mix } from "../rules/filling";
import { registerOrder } from "../ledger/orders";

function defaultHydroDue(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function RegisterForm() {
  const rules = useStore(rulesStore);
  const [bottleNo, setBottleNo] = useState("");
  const [waterVolume, setWaterVolume] = useState("");
  const [hydroDue, setHydroDue] = useState(defaultHydroDue());
  const [residualBar, setResidualBar] = useState("");
  const [o2, setO2] = useState("21");
  const [he, setHe] = useState("0");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const nO2 = Number(o2);
  const nHe = Number(he);
  const mix: Mix = { o2: nO2, he: nHe };
  const mixError = o2 !== "" && he !== "" ? validateMix(mix) : null;
  const n2Balance = Number.isFinite(nO2) && Number.isFinite(nHe) ? 100 - nO2 - nHe : NaN;

  const reset = () => {
    setBottleNo("");
    setWaterVolume("");
    setHydroDue(defaultHydroDue());
    setResidualBar("");
    setO2("21");
    setHe("0");
  };

  const submit = () => {
    if (mixError) {
      setMessage({ kind: "error", text: mixError });
      return;
    }
    const result = registerOrder({
      bottleNo,
      waterVolume: Number(waterVolume),
      hydroDue,
      residualBar: Number(residualBar),
      target: mix,
      targetPressure: rules.workingPressure,
    });
    if (result.ok && result.order) {
      const o = result.order;
      setMessage({
        kind: "ok",
        text:
          o.status === "held"
            ? `已登记 ${o.bottleNo}（单号 ${o.id}），水检到期，已进入留待处理区：${o.holdReason}`
            : `已登记 ${o.bottleNo}（单号 ${o.id}），进入待充填队列，目标压力 ${o.targetPressure}bar`,
      });
      reset();
    } else {
      setMessage({ kind: "error", text: result.reason ?? "登记失败" });
    }
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>台账 · 登记</p>
          <h2>气瓶登记</h2>
        </div>
      </div>
      <div className="field-grid">
        <label>
          <span>瓶号 *</span>
          <input
            value={bottleNo}
            placeholder="如 TANK-301"
            onChange={(e) => setBottleNo(e.target.value)}
          />
        </label>
        <label>
          <span>水容积（L）*</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={waterVolume}
            placeholder="如 12"
            onChange={(e) => setWaterVolume(e.target.value)}
          />
        </label>
        <label>
          <span>水检到期日 *</span>
          <input type="date" value={hydroDue} onChange={(e) => setHydroDue(e.target.value)} />
        </label>
        <label>
          <span>余压（bar）*</span>
          <input
            type="number"
            min="0"
            step="1"
            value={residualBar}
            placeholder="登记时表压"
            onChange={(e) => setResidualBar(e.target.value)}
          />
        </label>
        <label>
          <span>目标氧含量（%）*</span>
          <input type="number" min="0" max="100" step="0.5" value={o2} onChange={(e) => setO2(e.target.value)} />
        </label>
        <label>
          <span>目标氦含量（%）*</span>
          <input type="number" min="0" max="100" step="0.5" value={he} onChange={(e) => setHe(e.target.value)} />
        </label>
      </div>

      <div className={"mix-preview" + (mixError ? " invalid" : "")}>
        <span className="tag">{mixLabel(mix)}</span>
        <span>
          氧 {Number.isFinite(nO2) ? nO2 : "--"}% · 氦 {Number.isFinite(nHe) ? nHe : "--"}% ·
          氮/空气余量 {Number.isFinite(n2Balance) ? Math.max(n2Balance, 0).toFixed(1) : "--"}%
        </span>
        {mixError && <em className="error-text">{mixError}</em>}
        <small>目标工作压力取规则设置：{rules.workingPressure}bar</small>
      </div>

      {message && <div className={"alert " + message.kind}>{message.text}</div>}

      <div className="actions">
        <button className="primary" onClick={submit}>
          登记入册
        </button>
        <button onClick={reset}>清空</button>
      </div>
    </section>
  );
}
