// One value, one input: picks the component that edits a widget. A new kind of field is added
// here, next to the widget name it answers to.

import { Code, Fieldset, Group, Input, MultiSelect, NumberInput, Select, Switch, Text, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { optionsOf, type FormWidget } from "../../editor/fields";
import { formatPath, type Path } from "../../editor/paths";
import { errorAt } from "../../editor/validate";
import { useFormContext } from "./FormContext";
import { ListInput } from "./ListInput";
import { LocalizedInput } from "./LocalizedInput";
import { NounInput } from "./NounInput";
import { RangeInput } from "./RangeInput";
import { RefInput } from "./RefInput";
import { SchemaFields } from "./SchemaFields";

export type ValueInputProps = {
  schema: z.ZodType;
  widget: FormWidget;
  label: string;
  help?: string | undefined;
  required: boolean;
  /** What the schema fills in when the value is left out. */
  fallback?: unknown;
  value: unknown;
  path: Path;
  /** Shown next to the title of a block: the button that removes an optional block. */
  action?: ReactNode;
};

const numberOrNothing = (input: number | string): number | undefined => (typeof input === "number" ? input : undefined);

export function ValueInput(props: ValueInputProps) {
  const { schema, widget, label, help, required, fallback, value, path, action } = props;
  const { t } = useTranslation();
  const { change, errors, idLocked } = useFormContext();
  const key = formatPath(path);
  const error = errors[key];
  const common = { label, description: help, error, withAsterisk: required };
  const set = (next: unknown) => change(path, next);
  const blockLegend = (
    <Group gap="xs">
      <Text fw={600} size="sm">
        {label}
      </Text>
      {action}
    </Group>
  );

  switch (widget) {
    case "id": {
      const locked = idLocked && path.length === 1;
      return (
        <TextInput
          {...common}
          description={locked ? t("form.idLocked") : help}
          value={(value as string | undefined) ?? ""}
          onChange={(event) => set(event.currentTarget.value)}
          disabled={locked}
          styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
          spellCheck={false}
        />
      );
    }
    case "text":
      return <TextInput {...common} value={(value as string | undefined) ?? ""} onChange={(event) => set(event.currentTarget.value)} />;
    case "number":
      return <NumberInput {...common} value={(value as number | undefined) ?? ""} onChange={(next) => set(numberOrNothing(next))} min={0} />;
    case "ratio":
      return (
        <NumberInput
          {...common}
          value={(value as number | undefined) ?? ""}
          onChange={(next) => set(numberOrNothing(next))}
          min={0}
          max={1}
          step={0.05}
          decimalScale={3}
        />
      );
    case "boolean":
      return fallback === undefined && !required ? (
        <Select
          {...common}
          data={[
            { value: "true", label: t("common.yes") },
            { value: "false", label: t("common.no") },
          ]}
          value={value === undefined ? null : String(value)}
          onChange={(next) => set(next === null ? undefined : next === "true")}
          placeholder={t("form.unset")}
          clearable
        />
      ) : (
        <Switch label={label} description={help} error={error} checked={(value ?? fallback) === true} onChange={(event) => set(event.currentTarget.checked)} mt={4} />
      );
    case "select": {
      const data = Object.entries(optionsOf(schema)).map(([option, optionLabel]) => ({ value: option, label: optionLabel }));
      return (
        <Select
          {...common}
          data={data}
          value={(value as string | undefined) ?? null}
          onChange={(next) => set(next ?? undefined)}
          clearable={!required && fallback === undefined}
          searchable={data.length > 8}
          allowDeselect={false}
        />
      );
    }
    case "multiselect": {
      const data = Object.entries(optionsOf(schema)).map(([option, optionLabel]) => ({ value: option, label: optionLabel }));
      return <MultiSelect {...common} data={data} value={(value as string[] | undefined) ?? []} onChange={set} clearable />;
    }
    case "ref":
    case "refs":
      return <RefInput {...props} many={widget === "refs"} />;
    case "localized":
    case "template":
      return <LocalizedInput {...props} long={widget === "template"} />;
    case "noun":
      return <NounInput {...props} legend={blockLegend} />;
    case "range":
      return <RangeInput {...props} />;
    case "list":
      return <ListInput {...props} />;
    case "group":
      return (
        <Fieldset legend={blockLegend}>
          {help && (
            <Text size="xs" c="dimmed" mb="sm">
              {help}
            </Text>
          )}
          {error && (
            <Text size="xs" c="red" mb="sm">
              {error}
            </Text>
          )}
          <SchemaFields schema={schema} value={value} path={path} />
        </Fieldset>
      );
    case "json":
      return (
        <Input.Wrapper label={label} description={t("form.readOnlyJson")} error={errorAt(errors, key, true)}>
          <Code block>{JSON.stringify(value, null, 2)}</Code>
        </Input.Wrapper>
      );
  }
}
