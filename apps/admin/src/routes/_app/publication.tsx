import { Alert, Badge, Button, Card, Group, Stack, Table, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { COLLECTIONS, SETTINGS_LABEL, type PublicationChange, type PublicationState } from "@wayfarers-rest/shared";
import { IconCloudUpload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import type { Draft } from "../../api/draft";
import { draftQuery, publicationQuery, useContentMutation } from "../../api/queries";
import { formatDateTime } from "../../components/format";
import { AnchorLink } from "../../components/links";
import { QueryGate } from "../../components/QueryGate";
import { WriteFailure } from "../../components/WriteFailure";
import { titleOf } from "../../editor/titles";

export const Route = createFileRoute("/_app/publication")({ component: PublicationPage });

const KIND_COLORS: Record<PublicationChange["kind"], string> = { created: "teal", updated: "lantern", archived: "gray", unarchived: "blue" };

function PublicationPage() {
  const { t } = useTranslation();
  const publication = useQuery(publicationQuery);
  return (
    <Stack gap="md">
      <Title order={2}>{t("publication.title")}</Title>
      <QueryGate query={publication}>{(state) => <PublicationView state={state} />}</QueryGate>
    </Stack>
  );
}

function PublicationView({ state }: { state: PublicationState }) {
  const { t } = useTranslation();
  const draft = useQuery(draftQuery).data;
  const publish = useContentMutation(() => api.call("publish", { body: { draftVersion: state.draftVersion } }));
  const count = state.changes.length;

  const confirm = () =>
    modals.openConfirmModal({
      title: t("publication.confirmTitle"),
      children: <Text size="sm">{t("publication.confirmText", { count })}</Text>,
      labels: { confirm: t("publication.publish"), cancel: t("common.cancel") },
      onConfirm: () => publish.mutate(undefined, { onSuccess: () => notifications.show({ color: "teal", message: t("publication.done") }) }),
    });

  return (
    <>
      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Text fw={600}>{state.published ? t("publication.lastAt", { date: formatDateTime(state.published.publishedAt) }) : t("publication.never")}</Text>
            <Text size="sm" c="dimmed">
              {count === 0 ? t("publication.upToDate") : t("publication.pending", { count })}
            </Text>
          </div>
          <Button leftSection={<IconCloudUpload size={16} />} disabled={count === 0} loading={publish.isPending} onClick={confirm}>
            {t("publication.publish")}
          </Button>
        </Group>
      </Card>

      <WriteFailure error={publish.error} draft={draft} />
      {count === 0 ? (
        <Alert color="teal">{t("publication.nothing")}</Alert>
      ) : (
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("publication.what")}</Table.Th>
              <Table.Th>{t("publication.item")}</Table.Th>
              <Table.Th>{t("publication.change")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {state.changes.map((change) => (
              <Table.Tr key={`${change.collection}/${change.id}`}>
                <Table.Td>{change.collection === "settings" ? SETTINGS_LABEL : COLLECTIONS[change.collection].singular}</Table.Td>
                <Table.Td>
                  <ChangeLink change={change} draft={draft} />
                </Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light" color={KIND_COLORS[change.kind]}>
                    {t(`publication.kind.${change.kind}`)}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}

function ChangeLink({ change, draft }: { change: PublicationChange; draft: Draft | undefined }) {
  if (change.collection === "settings") {
    return (
      <AnchorLink to="/settings" size="sm">
        {SETTINGS_LABEL}
      </AnchorLink>
    );
  }
  const item = draft?.byId[change.collection].get(change.id);
  return (
    <AnchorLink to="/c/$collection/$id" params={{ collection: change.collection, id: change.id }} size="sm">
      {item ? titleOf(change.collection, item) : change.id}
    </AnchorLink>
  );
}
