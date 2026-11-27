// Draws the fields of an object schema, one input each, in the order the schema declares them.

import { ActionIcon, Button, Group, SimpleGrid, Text, Tooltip } from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { blankValue } from "../../editor/blank";
import { formFields, type FormField, type FormWidget } from "../../editor/fields";
import type { Path } from "../../editor/paths";
import { useFormContext } from "./FormContext";
import { ValueInput } from "./ValueInput";

/** Widgets that need the whole width of the form. */
const WIDE: readonly FormWidget[] = ["group", "list", "noun", "template", "json"];
/** Blocks that an optional field shows only once asked for: an empty block is not "no block". */
const BLOCKS: readonly FormWidget[] = ["group", "range", "noun"];

type Props = {
  schema: z.ZodType;
  value: unknown;
  path: Path;
  /** Fields drawn elsewhere by the screen (the archive button, the AI badge). */
  hidden?: readonly string[];
};

export function SchemaFields({ schema, value, path, hidden = [] }: Props) {
  const fields = formFields(schema).filter((field) => !hidden.includes(field.key));
  const values = (value ?? {}) as Record<string, unknown>;
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" verticalSpacing="md">
      {fields.map((field) => (
        <div key={field.key} className={WIDE.includes(field.widget) ? "wide-field" : undefined}>
          <FieldInput field={field} value={values[field.key]} path={[...path, field.key]} />
        </div>
      ))}
    </SimpleGrid>
  );
}

function FieldInput({ field, value, path }: { field: FormField; value: unknown; path: Path }) {
  const { t } = useTranslation();
  const { change } = useFormContext();
  const optionalBlock = !field.required && BLOCKS.includes(field.widget);

  if (optionalBlock && value === undefined) {
    return (
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Button variant="default" size="xs" style={{ flexShrink: 0 }} leftSection={<IconPlus size={14} />} onClick={() => change(path, blankValue(field.schema))}>
          {field.label}
        </Button>
        {field.meta?.help && (
          <Text size="xs" c="dimmed">
            {field.meta.help}
          </Text>
        )}
      </Group>
    );
  }

  return (
    <ValueInput
      schema={field.schema}
      widget={field.widget}
      label={field.label}
      help={field.meta?.help}
      required={field.required}
      fallback={field.fallback}
      value={value}
      path={path}
      action={
        optionalBlock ? (
          <Tooltip label={t("form.removeBlock")}>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t("form.removeBlock")} onClick={() => change(path, undefined)}>
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        ) : undefined
      }
    />
  );
}
