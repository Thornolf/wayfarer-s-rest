// A whole form drawn from a schema: the language tabs, the fields, and whatever the stored item
// holds that the schema no longer knows.

import { Alert, Button, Code, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@wayfarers-rest/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import type { Draft } from "../api/draft";
import { unknownKeys } from "../editor/fields";
import type { Path } from "../editor/paths";
import { missingTranslations } from "../editor/translation";
import type { FieldErrors } from "../editor/validate";
import { useEditLocale } from "../state/editLocale";
import { FormContext } from "./form/FormContext";
import { SchemaFields } from "./form/SchemaFields";

type Props = {
  schema: z.ZodType;
  value: Record<string, unknown>;
  change: (path: Path, next: unknown) => void;
  errors: FieldErrors;
  draft: Draft | undefined;
  idLocked: boolean;
  hidden?: readonly string[];
};

export function EntryForm({ schema, value, change, errors, draft, idLocked, hidden }: Props) {
  const { t } = useTranslation();
  const { locale, setLocale } = useEditLocale();
  const context = useMemo(() => ({ change, errors, draft, locale, idLocked }), [change, errors, draft, locale, idLocked]);
  const unknown = unknownKeys(schema, value);

  const tabs = LOCALES.map((candidate) => {
    const missing = candidate === DEFAULT_LOCALE ? 0 : missingTranslations(schema, value, candidate).length;
    return {
      value: candidate,
      label: (
        <Group gap={6} wrap="nowrap" justify="center">
          {t(`locales.${candidate}`)}
          {missing > 0 && (
            <Text span size="xs" c="yellow">
              {t("form.missingCount", { count: missing })}
            </Text>
          )}
        </Group>
      ),
    };
  });

  return (
    <FormContext value={context}>
      <Stack gap="md">
        <Group gap="sm">
          <Text size="sm" c="dimmed">
            {t("form.editLocale")}
          </Text>
          <SegmentedControl size="xs" data={tabs} value={locale} onChange={(next) => setLocale(next as Locale)} />
        </Group>
        <SchemaFields schema={schema} value={value} path={[]} {...(hidden ? { hidden } : {})} />
        {unknown.length > 0 && (
          <Alert color="yellow" title={t("form.unknownKeys")}>
            <Code block>{JSON.stringify(Object.fromEntries(unknown.map((key) => [key, value[key]])), null, 2)}</Code>
            <Button mt="sm" size="xs" variant="default" onClick={() => unknown.forEach((key) => change([key], undefined))}>
              {t("form.dropUnknownKeys")}
            </Button>
          </Alert>
        )}
      </Stack>
    </FormContext>
  );
}
