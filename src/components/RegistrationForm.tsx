import { useMemo, useState } from "react";
import { todayStr, validateRegister } from "../domain/rules";
import { useStore } from "../state/store";
import type { RegisterInput } from "../domain/types";

const PRESETS = [
  { label: "空气 21/0", o2: 21, he: 0 },
  { label: "高氧 EAN32", o2: 32, he: 0 },
  { label: "EAN36", o2: 36, he: 0 },
  { label: "Trimix 18/45", o2: 18, he: 45 },
  { label: "Trimix 16/40", o2: 16, he: 40 },
];

interface FormState {
  bottleNo: string;
  volume: string;
  hydroDue: string;
  residual: string;
  targetPressure: string;
  targetO2: string;
  targetHe: string;
}

const EMPTY: FormState = {
  bottleNo: "",
  volume: "12",
  hydroDue: "",
  residual: "",
  targetPressure: "200",
  targetO2: "21",
  targetHe: "0",
};

export function RegistrationForm() {
  const { register, state } = useStore();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const occupied = useMemo(() => {
    const no = form.bottleNo.trim().toUpperCase();
    return no ? state.orders.find((o) => o.bottleNo === no) : undefined;
  }, [form.bottleNo, state.orders]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: Partial<RegisterInput> = {
      bottleNo: form.bottleNo,
      volume: Number(form.volume),
      hydroDue: form.hydroDue,
      residual: Number(form.residual),
      targetPressure: Number(form.targetPressure),
      targetO2: Number(form.targetO2),
      targetHe: Number(form.targetHe),
    };
    const problem = validateRegister(input);
    if (problem) {
      setError(problem);
      return;
    }
    const result = register(input as RegisterInput);
    if (result.occupied) {
      setNotice(`瓶号 ${result.occupied.bottleNo} 已有未结工单 ${result.occupied.id}（占用中），已再次登记，请核对`);
    } else {
      setNotice(`瓶号 ${form.bottleNo.trim().toUpperCase()} 已登记入队`);
    }
    setForm(EMPTY);
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>气瓶登记</p>
          <h2>新增待充瓶</h2>
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="field-grid">
          <label>
            <span>瓶号 *</span>
            <input value={form.bottleNo} onChange={set("bottleNo")} placeholder="如 TANK-204" />
          </label>
          <label>
            <span>水容积（L）*</span>
            <input type="number" step="0.1" min="0" value={form.volume} onChange={set("volume")} />
          </label>
          <label>
            <span>水检到期日 *</span>
            <input type="date" value={form.hydroDue} min="2000-01-01" onChange={set("hydroDue")} />
          </label>
          <label>
            <span>余压（bar）*</span>
            <input type="number" step="1" min="0" value={form.residual} onChange={set("residual")} placeholder="如 55" />
          </label>
          <label>
            <span>目标终压（bar）*</span>
            <input type="number" step="1" min="1" value={form.targetPressure} onChange={set("targetPressure")} />
          </label>
          <div className="ratio-pair">
            <label>
              <span>目标氧 % *</span>
              <input type="number" step="0.1" min="0" max="100" value={form.targetO2} onChange={set("targetO2")} />
            </label>
            <label>
              <span>目标氦 % *</span>
              <input type="number" step="0.1" min="0" max="100" value={form.targetHe} onChange={set("targetHe")} />
            </label>
          </div>
        </div>

        <div className="chips preset-chips">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              onClick={() =>
                setForm((f) => ({ ...f, targetO2: String(p.o2), targetHe: String(p.he) }))
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        {occupied && (
          <div className="banner banner-info">
            ⚠ 该瓶存在未结工单 {occupied.id}（{occupied.status === "holding" ? "待处理区" : "充填队列"}），仅作占用提示
          </div>
        )}
        {error && <div className="banner banner-error">{error}</div>}
        {notice && !error && <div className="banner banner-ok">{notice}</div>}

        <div className="form-actions">
          <button className="primary" type="submit">登记入队</button>
          <span className="hint">到期瓶登记后自动进入待处理区并记录原因 · 今日 {todayStr()}</span>
        </div>
      </form>
    </section>
  );
}
