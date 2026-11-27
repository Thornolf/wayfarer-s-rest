// A reference to an item of another collection, picked by its title in a searchable list. A
// reference that points nowhere stays visible, in red; an archived target says so.

import { MultiSelect, Select } from "@mantine/core";
import { adminMeta, type CollectionName } from "@wayfarers-rest/shared";
import { useTranslation } from "react-i18next";
import type { Item } from "../../editor/references";
import { formatPath } from "../../editor/paths";
import { titleOf } from "../../editor/titles";
import { errorAt } from "../../editor/validate";
import { useFormContext } from "./FormContext";
import type { ValueInputProps } from "./ValueInput";

const fits = (item: Item, where: Record<string, string> | undefined) => Object.entries(where ?? {}).every(([key, expected]) => item[key] === expected);

export function RefInput({ schema, label, help, required, value, path, many }: ValueInputProps & { many: boolean }) {
  const { t } = useTranslation();
  const { change, errors, draft } = useFormContext();
  const meta = adminMeta(schema);
  const collection = meta?.ref as CollectionName;
  const selected = (many ? ((value as string[] | undefined) ?? []) : value === undefined ? [] : [value as string]).map(String);
  const items = draft?.items[collection] ?? [];
  const known = new Set(items.map((item) => String(item.id)));
  const missing = selected.filter((id) => !known.has(id));

  const data = [
    ...items
      .filter((item) => selected.includes(String(item.id)) || (item.archived !== true && fits(item, meta?.refWhere)))
      .map((item) => {
        const title = titleOf(collection, item);
        return { value: String(item.id), label: item.archived === true ? t("form.archivedOption", { title }) : title };
      }),
    ...missing.map((id) => ({ value: id, label: t("form.missingOption", { id }) })),
  ];
  const shared = {
    label,
    description: help,
    withAsterisk: required,
    data,
    searchable: true,
    nothingFoundMessage: t("form.nothingFound"),
    error: errorAt(errors, formatPath(path), true) ?? (draft && missing.length > 0 ? t("form.missingReference") : undefined),
    disabled: !draft,
  };

  return many ? (
    <MultiSelect {...shared} value={selected} onChange={(next) => change(path, next)} clearable />
  ) : (
    <Select {...shared} value={selected[0] ?? null} onChange={(next) => change(path, next ?? undefined)} clearable={!required} />
  );
}
