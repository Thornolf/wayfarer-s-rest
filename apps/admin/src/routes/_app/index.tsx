import { Card, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { COLLECTION_NAMES, COLLECTIONS } from "@wayfarers-rest/shared";
import { useTranslation } from "react-i18next";
import { draftQuery, publicationQuery } from "../../api/queries";
import { formatDateTime } from "../../components/format";
import { AnchorLink } from "../../components/links";
import { QueryGate } from "../../components/QueryGate";

export const Route = createFileRoute("/_app/")({ component: OverviewPage });

function OverviewPage() {
  const { t } = useTranslation();
  const draft = useQuery(draftQuery);
  const publication = useQuery(publicationQuery).data;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>{t("nav.overview")}</Title>
        {publication && (
          <Text c="dimmed" size="sm">
            {publication.published ? t("publication.lastAt", { date: formatDateTime(publication.published.publishedAt) }) : t("publication.never")}
            {" · "}
            <AnchorLink to="/publication" size="sm">
              {t("publication.pending", { count: publication.changes.length })}
            </AnchorLink>
          </Text>
        )}
      </div>
      <QueryGate query={draft}>
        {({ items }) => (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            {COLLECTION_NAMES.map((collection) => {
              const live = items[collection].filter((item) => item.archived !== true);
              const ai = live.filter((item) => item.aiGenerated === true).length;
              return (
                <Card key={collection} withBorder>
                  <Group justify="space-between" align="baseline">
                    <AnchorLink to="/c/$collection" params={{ collection }} fw={600} c="bright">
                      {COLLECTIONS[collection].label}
                    </AnchorLink>
                    <Text size="xl" fw={600}>
                      {live.length}
                    </Text>
                  </Group>
                  {live.length < items[collection].length && (
                    <Text size="xs" c="dimmed">
                      {t("overview.archived", { count: items[collection].length - live.length })}
                    </Text>
                  )}
                  {ai > 0 && (
                    <AnchorLink to="/c/$collection" params={{ collection }} search={{ ai: true }} size="xs" c="grape.4">
                      {t("overview.toRewrite", { count: ai })}
                    </AnchorLink>
                  )}
                </Card>
              );
            })}
          </SimpleGrid>
        )}
      </QueryGate>
    </Stack>
  );
}
