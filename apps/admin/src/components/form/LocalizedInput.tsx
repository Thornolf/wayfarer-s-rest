// A text written once per language. The form shows the language being written; another language
// left empty is flagged, with the French it falls back to.

import { Badge, Text, Textarea, TextInput } from "@mantine/core";
import { adminMeta, DEFAULT_LOCALE } from "@wayfarers-rest/shared";
import { useTranslation } from "react-i18next";
import { formatPath } from "../../editor/paths";
import { errorAt } from "../../editor/validate";
import { useFormContext } from "./FormContext";
import type { ValueInputProps } from "./ValueInput";

type Props = Pick<ValueInputProps, "schema" | "label" | "help" | "required" | "value" | "path"> & {
  /** A sentence rather than a name: drawn on several lines. */
  long?: boolean;
};

export function LocalizedInput({ schema, label, help, required, value, path, long = false }: Props) {
  const { t } = useTranslation();
  const { change, errors, locale } = useFormContext();
  const texts = (value ?? {}) as Record<string, string | undefined>;
  const french = texts[DEFAULT_LOCALE] ?? "";
  const translating = locale !== DEFAULT_LOCALE;
  const untranslated = translating && french !== "" && !texts[locale];
  const slots = adminMeta(schema)?.slots;

  const description = (
    <>
      {help}
      {slots && slots.length > 0 && (
        <Text span size="xs" display="block" ff="monospace">
          {t("form.slots", { slots: slots.map((slot) => `{${slot}}`).join(" ") })}
        </Text>
      )}
      {translating && french !== "" && (
        <Text span size="xs" display="block" fs="italic">
          {t("form.frenchIs", { text: french })}
        </Text>
      )}
    </>
  );
  const shared = {
    label: (
      <>
        {label}{" "}
        <Badge size="xs" variant="light" color={untranslated ? "yellow" : "gray"} ml={4}>
          {untranslated ? t("form.toTranslate") : locale.toUpperCase()}
        </Badge>
      </>
    ),
    description,
    error: errors[formatPath([...path, locale])] ?? errorAt(errors, formatPath(path), true),
    withAsterisk: required && !translating,
    value: texts[locale] ?? "",
    placeholder: translating ? french : undefined,
    lang: locale,
  };
  const write = (text: string) => change([...path, locale], text === "" ? undefined : text);

  return long ? (
    <Textarea {...shared} autosize minRows={2} onChange={(event) => write(event.currentTarget.value)} />
  ) : (
    <TextInput {...shared} onChange={(event) => write(event.currentTarget.value)} />
  );
}
