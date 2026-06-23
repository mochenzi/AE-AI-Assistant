import { useEffect, useState } from "react";
import type { CachedModel } from "../shared/types";
import { effectiveContextWindow } from "../shared/modelSelection";

export const MANUAL_MODEL_VALUE = "__manual_model__";

function contextLabel(model: CachedModel): string {
  const context = effectiveContextWindow(model);
  if (!context) return model.id;
  const label =
    context >= 1_000_000
      ? `${context / 1_000_000}M`
      : context >= 1_000
        ? `${Math.round(context / 1_000)}K`
        : String(context);
  return `${model.id} · ${label}`;
}

export function ModelPicker({
  models,
  value,
  onChange,
  ariaLabel,
}: {
  models: CachedModel[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const isListed = models.some(({ id }) => id === value);
  const [manual, setManual] = useState(models.length === 0 || !isListed);

  useEffect(() => {
    setManual(models.length === 0 || !models.some(({ id }) => id === value));
  }, [models, value]);

  if (manual || models.length === 0) {
    return (
      <div className="model-picker manual">
        <input
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="输入模型 ID"
        />
        {models.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setManual(false);
              if (!models.some(({ id }) => id === value))
                onChange(models[0].id);
            }}
          >
            返回模型列表
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="model-picker">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          if (event.target.value === MANUAL_MODEL_VALUE) setManual(true);
          else onChange(event.target.value);
        }}
      >
        {models.map((model) => (
          <option value={model.id} key={model.id}>
            {contextLabel(model)}
          </option>
        ))}
        <option value={MANUAL_MODEL_VALUE}>手动输入模型…</option>
      </select>
    </div>
  );
}
