import { Badge, Button, Group, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SETTINGS_LABEL, settingsSchema, versionEtag, type SettingsEntry } from "@wayfarers-rest/shared";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { draftQuery, publicationQuery, settingsQuery, useContentMutation } from "../../api/queries";
import { EntryForm } from "../../components/EntryForm";
import { useFormDraft } from "../../components/form/useFormDraft";
import { formatDateTime } from "../../components/format";
import { QueryGate } from "../../components/QueryGate";
import { useLeaveGuard } from "../../components/useLeaveGuard";
import { WriteFailure } from "../../components/WriteFailure";
import { serverFieldErrors } from "../../api/failures";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const settings = useQuery(settingsQuery);
  return <QueryGate query={settings}>{(loaded) => <SettingsForm key={loaded.settings.version} settings={loaded.settings} />}</QueryGate>;
}

function SettingsForm({ settings }: { settings: SettingsEntry }) {
  const { t } = useTranslation();
  const form = useFormDraft(settingsSchema, settings.data);
  const draft = useQuery(draftQuery).data;
  const published = useQuery(publicationQuery).data?.published;
  useLeaveGuard(form.dirty);
  const save = useContentMutation((data: SettingsEntry["data"]) => api.call("putSettings", { headers: { "if-match": versionEtag(settings.version) }, body: { data } }));
  const errors = { ...serverFieldErrors(save.error), ...(form.checked.ok ? {} : form.checked.errors) };

  const submit = () => {
    if (!form.checked.ok) {
      notifications.show({ color: "red", message: t("form.fixErrors") });
      return;
    }
    save.mutate(form.checked.data, { onSuccess: () => notifications.show({ color: "teal", message: t("form.saved") }) });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>{SETTINGS_LABEL}</Title>
            {published !== undefined && settings.version > (published?.version ?? 0) && (
              <Badge size="sm" variant="light" color="lantern">
                {t("badges.unpublished")}
              </Badge>
            )}
            {form.dirty && (
              <Badge size="sm" variant="outline" color="yellow">
                {t("form.unsaved")}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {t("entry.savedAt", { date: formatDateTime(settings.updatedAt) })}
          </Text>
        </div>
        <Button leftSection={<IconDeviceFloppy size={16} />} loading={save.isPending} disabled={!form.dirty} onClick={submit}>
          {t("form.save")}
        </Button>
      </Group>
      <WriteFailure error={save.error} draft={draft} />
      <EntryForm schema={settingsSchema} value={form.value} change={form.change} errors={errors} draft={draft} idLocked />
    </Stack>
  );
}
