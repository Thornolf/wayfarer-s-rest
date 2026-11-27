import { Chip, Group, SegmentedControl, Stack, Text, TextInput, Title } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ARCHIVED_FILTERS, COLLECTIONS } from "@wayfarers-rest/shared";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { draftQuery, entriesQuery, publicationQuery, type EntryFilters } from "../../../api/queries";
import { EntriesTable } from "../../../components/EntriesTable";
import { ButtonLink } from "../../../components/links";
import { QueryGate } from "../../../components/QueryGate";
import { parseCollectionParam } from "../../../state/collectionParam";

type ArchivedFilter = (typeof ARCHIVED_FILTERS)[number];
/** The filters of the list live in the URL: a filtered list can be bookmarked and comes back as it was. */
type ListSearch = { search?: string; archived?: Exclude<ArchivedFilter, "exclude">; ai?: true };

export const Route = createFileRoute("/_app/c/$collection/")({
  params: { parse: parseCollectionParam },
  validateSearch: (search: Record<string, unknown>): ListSearch => ({
    ...(typeof search.search === "string" && search.search !== "" ? { search: search.search } : {}),
    ...(search.archived === "include" || search.archived === "only" ? { archived: search.archived } : {}),
    ...(search.ai === true ? { ai: true as const } : {}),
  }),
  component: CollectionPage,
});

function CollectionPage() {
  const { t } = useTranslation();
  const { collection } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters: EntryFilters = {
    archived: search.archived ?? "exclude",
    ...(search.ai ? { aiGenerated: true } : {}),
    ...(search.search ? { search: search.search } : {}),
  };
  const entries = useQuery(entriesQuery(collection, filters));
  const draft = useQuery(draftQuery).data;
  const publication = useQuery(publicationQuery).data;
  const update = (changes: Partial<ListSearch>) => void navigate({ search: (previous) => ({ ...previous, ...changes }), replace: true });
  const typeSearch = useDebouncedCallback((text: string) => update({ search: text === "" ? undefined : text }), 250);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>{COLLECTIONS[collection].label}</Title>
        <ButtonLink to="/create/$collection" params={{ collection }} leftSection={<IconPlus size={16} />}>
          {t("list.create")}
        </ButtonLink>
      </Group>
      <Group gap="md">
        <TextInput
          key={collection}
          placeholder={t("list.search")}
          leftSection={<IconSearch size={16} />}
          defaultValue={search.search ?? ""}
          onChange={(event) => typeSearch(event.currentTarget.value)}
          w={260}
        />
        <SegmentedControl
          size="xs"
          data={ARCHIVED_FILTERS.map((value) => ({ value, label: t(`list.archived.${value}`) }))}
          value={search.archived ?? "exclude"}
          onChange={(next) => update({ archived: next === "exclude" ? undefined : (next as ListSearch["archived"]) })}
        />
        <Chip size="xs" color="grape" checked={search.ai === true} onChange={(checked) => update({ ai: checked ? true : undefined })}>
          {t("list.aiOnly")}
        </Chip>
      </Group>
      <QueryGate query={entries}>
        {(list) =>
          list.length === 0 ? (
            <Text c="dimmed" py="xl" ta="center">
              {t("list.empty")}
            </Text>
          ) : (
            <>
              <EntriesTable collection={collection} entries={list} draft={draft} published={publication?.published} />
              <Text size="xs" c="dimmed">
                {t("list.count", { count: list.length })}
              </Text>
            </>
          )
        }
      </QueryGate>
    </Stack>
  );
}
