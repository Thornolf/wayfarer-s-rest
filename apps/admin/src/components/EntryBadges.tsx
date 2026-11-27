// The small marks an item carries in lists and on its page.

import { Badge, Group } from "@mantine/core";
import type { Publication } from "@wayfarers-rest/shared";
import { useTranslation } from "react-i18next";

type Props = {
  entry: { version: number; archived: boolean; aiGenerated: boolean };
  /** The last publication; undefined while it is not known, null when there never was one. */
  published: Publication | null | undefined;
};

export function EntryBadges({ entry, published }: Props) {
  const { t } = useTranslation();
  return (
    <Group gap={6} wrap="nowrap">
      {entry.aiGenerated && (
        <Badge size="sm" variant="light" color="grape">
          {t("badges.ai")}
        </Badge>
      )}
      {entry.archived && (
        <Badge size="sm" variant="light" color="gray">
          {t("badges.archived")}
        </Badge>
      )}
      {published !== undefined && entry.version > (published?.version ?? 0) && (
        <Badge size="sm" variant="light" color="lantern">
          {t("badges.unpublished")}
        </Badge>
      )}
    </Group>
  );
}
