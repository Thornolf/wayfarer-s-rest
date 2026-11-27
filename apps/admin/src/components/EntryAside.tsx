// Beside the form of an item: who points to it, and how it differs from what the phone has.

import { Card, List, Stack, Text } from "@mantine/core";
import { COLLECTIONS, SETTINGS_LABEL, settingsSchema, type CollectionName, type EntryDetail, type Publication } from "@wayfarers-rest/shared";
import { useTranslation } from "react-i18next";
import type { Draft } from "../api/draft";
import { changedFields } from "../editor/diff";
import { pathLabels } from "../editor/labels";
import { usedBy } from "../editor/references";
import { titleOf } from "../editor/titles";
import { formatDateTime } from "./format";
import { AnchorLink } from "./links";

type Props = { collection: CollectionName; detail: EntryDetail; draft: Draft | undefined; publication: Publication | null | undefined };

export function EntryAside({ collection, detail, draft, publication }: Props) {
  const { t } = useTranslation();
  const { entry, published, revisions } = detail;
  const users = draft ? usedBy(draft.items, { schema: settingsSchema, value: draft.settings }, { collection, id: entry.id }) : [];
  const changed = published ? changedFields(COLLECTIONS[collection].schema, published.data, entry.data) : [];
  const upToDate = publication !== undefined && entry.version <= (publication?.version ?? 0);

  return (
    <Stack gap="md">
      <Card withBorder>
        <Text fw={600} size="sm" mb="xs">
          {t("entry.onPhone")}
        </Text>
        {!published && <Text size="sm">{t("entry.neverPublished")}</Text>}
        {published && upToDate && <Text size="sm">{t("entry.upToDate")}</Text>}
        {published && !upToDate && (
          <>
            <Text size="sm">{t("entry.changedFields", { count: changed.length })}</Text>
            <List size="sm">
              {changed.map((field) => (
                <List.Item key={field.key}>{field.label}</List.Item>
              ))}
            </List>
          </>
        )}
        <Text size="xs" c="dimmed" mt="xs">
          {t("entry.savedAt", { date: formatDateTime(entry.updatedAt) })}
          {revisions.length > 0 && ` · ${t("entry.revisions", { count: revisions.length })}`}
        </Text>
      </Card>

      <Card withBorder>
        <Text fw={600} size="sm" mb="xs">
          {t("entry.usedBy")}
        </Text>
        {users.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t("entry.usedByNobody")}
          </Text>
        ) : (
          <List size="sm" spacing={4}>
            {users.map((user) => {
              const schema = user.collection === "settings" ? settingsSchema : COLLECTIONS[user.collection].schema;
              const item = user.collection === "settings" ? undefined : draft?.byId[user.collection].get(user.id);
              return (
                <List.Item key={`${user.collection}/${user.id}/${user.path}`}>
                  {user.collection === "settings" ? (
                    <AnchorLink to="/settings" size="sm">
                      {SETTINGS_LABEL}
                    </AnchorLink>
                  ) : (
                    <AnchorLink to="/c/$collection/$id" params={{ collection: user.collection, id: user.id }} size="sm">
                      {COLLECTIONS[user.collection].singular} « {item ? titleOf(user.collection, item) : user.id} »
                    </AnchorLink>
                  )}
                  <Text span size="xs" c="dimmed">
                    {` — ${pathLabels(schema, user.path).join(" › ")}`}
                  </Text>
                </List.Item>
              );
            })}
          </List>
        )}
      </Card>
    </Stack>
  );
}
