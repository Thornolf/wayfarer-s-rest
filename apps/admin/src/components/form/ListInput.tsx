// A list whose rows are each drawn from their own schema: add, remove, reorder. Rows that carry a
// weight show their share of the total, which is what the weight means.

import { ActionIcon, Badge, Button, Group, Input, Paper, Stack, Text } from "@mantine/core";
import { adminMeta, elementOf } from "@wayfarers-rest/shared";
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { blankElement } from "../../editor/blank";
import { widgetOf } from "../../editor/fields";
import { formatPath } from "../../editor/paths";
import { weightShares } from "../../editor/weights";
import { useFormContext } from "./FormContext";
import { SchemaFields } from "./SchemaFields";
import { ValueInput, type ValueInputProps } from "./ValueInput";

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

export function ListInput({ schema, label, help, required, value, path }: ValueInputProps) {
  const { t } = useTranslation();
  const { change, errors } = useFormContext();
  const rows = (value as unknown[] | undefined) ?? [];
  const element = elementOf(schema);
  if (!element) return null;
  const widget = widgetOf(element);
  const rowLabel = adminMeta(element)?.label ?? label;
  const shares = weightShares(rows);

  const move = (from: number, to: number) => {
    const next = [...rows];
    next.splice(to, 0, ...next.splice(from, 1));
    change(path, next);
  };

  return (
    <Input.Wrapper label={label} description={help} error={errors[formatPath(path)]} withAsterisk={required}>
      <Stack gap="xs" mt={6}>
        {rows.map((row, index) => (
          // Rows have no identity of their own: their position is the only key there is.
          <Paper key={index} withBorder p="sm" bg="dark.7">
            <Group justify="space-between" mb="xs">
              <Group gap="xs">
                <Text size="xs" c="dimmed" fw={600}>
                  {t("form.rowNumber", { number: index + 1 })}
                </Text>
                {shares[index] !== undefined && (
                  <Badge size="sm" variant="light" color="gray">
                    {percent.format(shares[index])}
                  </Badge>
                )}
              </Group>
              <Group gap={4}>
                <ActionIcon variant="subtle" color="gray" size="sm" disabled={index === 0} aria-label={t("form.moveUp")} onClick={() => move(index, index - 1)}>
                  <IconArrowUp size={14} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="gray" size="sm" disabled={index === rows.length - 1} aria-label={t("form.moveDown")} onClick={() => move(index, index + 1)}>
                  <IconArrowDown size={14} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" size="sm" aria-label={t("form.removeRow")} onClick={() => change(path, rows.filter((_, other) => other !== index))}>
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Group>
            {widget === "group" ? (
              <SchemaFields schema={element} value={row} path={[...path, index]} />
            ) : (
              <ValueInput schema={element} widget={widget} label={rowLabel} required value={row} path={[...path, index]} />
            )}
          </Paper>
        ))}
        <div>
          <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => change([...path, rows.length], blankElement(schema))}>
            {t("form.addRow")}
          </Button>
        </div>
      </Stack>
    </Input.Wrapper>
  );
}
