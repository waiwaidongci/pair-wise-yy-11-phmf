import { useState } from "react";
import { useStore } from "../store";
import { rulesStore, updateRules } from "../rules/settings";

export default function RulesPanel() {
  const rules = useStore(rulesStore);
  const [workingPressure, setWorkingPressure] = useState(String(rules.workingPressure));
  const [warnDays, setWarnDays] = useState(String(rules.warnDays));
  const [tolerancePct, setTolerancePct] = useState(String(rules.tolerancePct));
  const [saved, setSaved] = useState(false);

  const save = () => {
    const wp = Number(workingPressure);
    const wd = Number(warnDays);
    const tol = Number(tolerancePct);
    if (!Number.isFinite(wp) || wp <= 0) return;
    if (!Number.isFinite(wd) || wd < 0) return;
    if (!Number.isFinite(tol) || tol < 0) return;
    updateRules({ workingPressure: wp, warnDays: wd, tolerancePct: tol });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <section className="panel rules">
      <div className="heading">
        <div>
          <p>规则模块 · 参数与计算规则</p>
          <h2>作业规则</h2>
        </div>
      </div>

      <div className="field-grid">
        <label>
          <span>标准工作压力（bar）</span>
          <input type="number" min="1" value={workingPressure} onChange={(e) => setWorkingPressure(e.target.value)} />
                    <small>新登记瓶的目标压力；余压高于该值时先泄压至 0bar</small>
        </label>
        <label>
          <span>水检临近预警（天）</span>
          <input type="number" min="0" value={warnDays} onChange={(e) => setWarnDays(e.target.value)} />
          <small>剩余天数 ≤ 该值在队列中预警；已过期入留待处理区</small>
        </label>
        <label>
          <span>配比允许偏差（百分点）</span>
          <input type="number" min="0" step="0.5" value={tolerancePct} onChange={(e) => setTolerancePct(e.target.value)} />
          <small>实测超出仅警告；缺项一律不能签收</small>
        </label>
      </div>

      <ul className="rule-notes">
        <li>分压顺序：先纯氧、再纯氦、最后空气补压（道尔顿分压模型）。</li>
        <li>余压高于目标压力：开工步骤第一条为泄压。</li>
        <li>续充计算假定余气与目标配比一致；余气成分未知时应先泄放。</li>
        <li>目标氧不得低于空气补压极限（21% × 非氦余量）。</li>
      </ul>

      <div className="actions">
        <button className="primary" onClick={save}>
          保存规则
        </button>
        {saved && <span className="ok-text">已保存</span>}
      </div>
    </section>
  );
}
