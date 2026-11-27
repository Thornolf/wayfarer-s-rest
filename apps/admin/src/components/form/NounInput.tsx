// A name with the grammar the sentences need: gender, plural, elision, proper noun. A preview
// shows the name with its articles, as the summary will write it.

import { Fieldset, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text, Input } from "@mantine/core";
import { DEFAULT_LOCALE, GENDERS, nounPhrase, nounSchema, type Noun } from "@wayfarers-rest/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formFields } from "../../editor/fields";
import { formatPath } from "../../editor/paths";
import { prune } from "../../editor/prune";
import { useFormContext } from "./FormContext";
import { LocalizedInput } from "./LocalizedInput";
import type { ValueInputProps } from "./ValueInput";

/** The name as sentences will write it; nothing while it is not a valid noun yet. */
function preview(value: unknown): string | undefined {
  const parsed = nounSchema.safeParse(prune(value));
  if (!parsed.success) return undefined;
  const noun: Noun = parsed.data;
  const forms = [nounPhrase(noun, "le"), nounPhrase(noun, "un"), nounPhrase(noun, "de"), nounPhrase(noun, "a")];
  if (!noun.isPlural && !noun.proper) forms.push(nounPhrase(noun, "le", { plural: true }));
  return forms.join(" · ");
}

export function NounInput({ schema, help, value, path, legend }: ValueInputProps & { legend: ReactNode }) {
  const { t } = useTranslation();
  const { change, errors, locale } = useFormContext();
  const noun = (value ?? {}) as Partial<Noun>;
  const inner = Object.fromEntries(formFields(schema).map((field) => [field.key, field.schema]));
  const flag = (key: "proper" | "isPlural") => (
    <Switch label={t(`noun.${key}`)} checked={noun[key] === true} onChange={(event) => change([...path, key], event.currentTarget.checked || undefined)} />
  );
  const shown = locale === DEFAULT_LOCALE ? preview(value) : undefined;

  return (
    <Fieldset legend={legend}>
      <Stack gap="sm">
        {help && (
          <Text size="xs" c="dimmed">
            {help}
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <LocalizedInput schema={inner.text!} label={t("noun.text")} required value={noun.text} path={[...path, "text"]} />
          <LocalizedInput schema={inner.plural!} label={t("noun.plural")} help={t("noun.pluralHelp")} required={false} value={noun.plural} path={[...path, "plural"]} />
          <Input.Wrapper label={t("noun.gender")} error={errors[formatPath([...path, "gender"])]} withAsterisk>
            <div>
              <SegmentedControl
                data={Object.entries(GENDERS).map(([gender, genderLabel]) => ({ value: gender, label: genderLabel }))}
                value={noun.gender ?? ""}
                onChange={(next) => change([...path, "gender"], next)}
              />
            </div>
          </Input.Wrapper>
          <Select
            label={t("noun.elided")}
            description={t("noun.elidedHelp")}
            data={[
              { value: "auto", label: t("noun.elidedAuto") },
              { value: "true", label: t("noun.elidedYes") },
              { value: "false", label: t("noun.elidedNo") },
            ]}
            value={noun.elided === undefined ? "auto" : String(noun.elided)}
            onChange={(next) => change([...path, "elided"], next === "auto" || next === null ? undefined : next === "true")}
            allowDeselect={false}
          />
          {flag("proper")}
          {flag("isPlural")}
        </SimpleGrid>
        {shown && (
          <Text size="sm" c="dimmed">
            {t("noun.preview")} <Text span c="bright">{shown}</Text>
          </Text>
        )}
      </Stack>
    </Fieldset>
  );
}
