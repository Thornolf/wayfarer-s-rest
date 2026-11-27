// The page of one item: its form, what can be done to it (save, archive, mark as rewritten), and
// what the server answered.

import { Badge, Button, Grid, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { COLLECTIONS, versionEtag, type CollectionName, type EntryDetail } from "@wayfarers-rest/shared";
import { IconArchive, IconArchiveOff, IconCheck, IconDeviceFloppy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { draftQuery, publicationQuery, useContentMutation } from "../api/queries";
import { titleOf } from "../editor/titles";
import { EntryAside } from "./EntryAside";
import { EntryBadges } from "./EntryBadges";
import { EntryForm } from "./EntryForm";
import { useFormDraft } from "./form/useFormDraft";
import { useLeaveGuard } from "./useLeaveGuard";
import { WriteFailure } from "./WriteFailure";
import { serverFieldErrors } from "../api/failures";

/** Drawn by the page itself, not as form fields. */
const HEADER_FIELDS = ["archived", "aiGenerated"];

export function EntryEditor({ collection, detail }: { collection: CollectionName; detail: EntryDetail }) {
  const { t } = useTranslation();
  const { entry } = detail;
  const { schema, singular } = COLLECTIONS[collection];
  const params = { collection, id: entry.id };
  const form = useFormDraft(schema, entry.data);
  const draft = useQuery(draftQuery).data;
  const publication = useQuery(publicationQuery).data?.published;
  useLeaveGuard(form.dirty);

  const save = useContentMutation((data: Record<string, unknown>) =>
    api.call("putEntry", { params, headers: { "if-match": versionEtag(entry.version) }, body: { data } }),
  );
  const archive = useContentMutation((archived: boolean) => api.call(archived ? "archiveEntry" : "unarchiveEntry", { params }));
  const busy = save.isPending || archive.isPending;
  const errors = { ...serverFieldErrors(save.error), ...(form.checked.ok ? {} : form.checked.errors) };

  const write = (changes: Record<string, unknown> = {}) => {
    if (!form.checked.ok) {
      notifications.show({ color: "red", message: t("form.fixErrors") });
      return;
    }
    save.mutate({ ...(form.checked.data as Record<string, unknown>), ...changes }, { onSuccess: () => notifications.show({ color: "teal", message: t("form.saved") }) });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" c="dimmed">
            {singular} · <Text span ff="monospace">{entry.id}</Text>
          </Text>
          <Group gap="sm">
            <Title order={2}>{titleOf(collection, form.value)}</Title>
            <EntryBadges entry={entry} published={publication} />
            {form.dirty && (
              <Badge size="sm" variant="outline" color="yellow">
                {t("form.unsaved")}
              </Badge>
            )}
          </Group>
        </div>
        <Group gap="xs">
          {entry.aiGenerated && (
            <Button variant="default" leftSection={<IconCheck size={16} />} disabled={busy} onClick={() => write({ aiGenerated: false })}>
              {t("entry.markRewritten")}
            </Button>
          )}
          <Tooltip label={t("entry.saveFirst")} disabled={!form.dirty}>
            <Button
              variant="default"
              leftSection={entry.archived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
              disabled={busy || form.dirty}
              onClick={() => archive.mutate(!entry.archived)}
            >
              {entry.archived ? t("entry.unarchive") : t("entry.archive")}
            </Button>
          </Tooltip>
          <Button leftSection={<IconDeviceFloppy size={16} />} loading={save.isPending} disabled={!form.dirty || archive.isPending} onClick={() => write()}>
            {t("form.save")}
          </Button>
        </Group>
      </Group>

      <WriteFailure error={save.error ?? archive.error} draft={draft} />

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <EntryForm schema={schema} value={form.value} change={form.change} errors={errors} draft={draft} idLocked hidden={HEADER_FIELDS} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <EntryAside collection={collection} detail={detail} draft={draft} publication={publication} />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
