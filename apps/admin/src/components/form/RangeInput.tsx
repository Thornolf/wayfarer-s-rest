// A range: a minimum and a maximum, side by side.

import { Group, Input, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { formatPath } from "../../editor/paths";
import { errorAt } from "../../editor/validate";
import { useFormContext } from "./FormContext";
import type { ValueInputProps } from "./ValueInput";

export function RangeInput({ label, help, required, value, path, action }: ValueInputProps) {
  const { t } = useTranslation();
  const { change, errors } = useFormContext();
  const range = (value ?? {}) as { min?: number; max?: number };
  const bound = (key: "min" | "max") => (
    <NumberInput
      aria-label={`${label} — ${t(`form.${key}`)}`}
      placeholder={t(`form.${key}`)}
      value={range[key] ?? ""}
      onChange={(next) => change([...path, key], typeof next === "number" ? next : undefined)}
      min={0}
      error={errors[formatPath([...path, key])] !== undefined}
      style={{ flex: 1 }}
    />
  );
  return (
    <Input.Wrapper label={label} description={help} error={errorAt(errors, formatPath(path), true)} withAsterisk={required}>
      <Group gap="xs" wrap="nowrap" mt={4}>
        {bound("min")}
        <Input.Label c="dimmed">{t("form.rangeTo")}</Input.Label>
        {bound("max")}
        {action}
      </Group>
    </Input.Wrapper>
  );
}
