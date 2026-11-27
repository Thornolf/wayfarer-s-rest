// The list of a collection: the title, the short fields of its schema, the marks of each item and
// when it last changed. Click a header to sort, a row to open the item.

import { Table, Text } from "@mantine/core";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import type { CollectionName, Entry, Publication } from "@wayfarers-rest/shared";
import { IconArrowDown, IconArrowUp } from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Draft } from "../api/draft";
import { cellText, listColumns, type CellWords } from "../editor/columns";
import { titleOf } from "../editor/titles";
import { EntryBadges } from "./EntryBadges";
import { formatDateTime } from "./format";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});
const helper = createColumnHelper<typeof features, Entry>();

type Props = { collection: CollectionName; entries: Entry[]; draft: Draft | undefined; published: Publication | null | undefined };

export function EntriesTable({ collection, entries, draft, published }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const columns = useMemo(() => {
    const words: CellWords = {
      yes: t("common.yes"),
      no: t("common.no"),
      titleOfRef: (field, id) => {
        const target = field.meta?.ref;
        const item = target && draft?.byId[target].get(id);
        return target && item ? titleOf(target, item) : id;
      },
    };
    return helper.columns([
      helper.accessor((entry) => titleOf(collection, entry.data), {
        id: "title",
        header: t("list.title"),
        sortFn: "text",
        cell: ({ row, getValue }) => (
          <>
            <Text size="sm" fw={500}>
              {getValue()}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {row.original.id}
            </Text>
          </>
        ),
      }),
      ...listColumns(collection).map((field) =>
        helper.accessor((entry) => cellText(field, entry.data[field.key], words), { id: field.key, header: field.label, sortFn: "alphanumeric" }),
      ),
      helper.display({ id: "marks", header: "", cell: ({ row }) => <EntryBadges entry={row.original} published={published} /> }),
      helper.accessor("updatedAt", { header: t("list.updatedAt"), sortFn: "text", cell: ({ getValue }) => formatDateTime(getValue()) }),
    ]);
  }, [collection, draft, published, t]);

  const table = useTable({ features, columns, data: entries, initialState: { sorting: [{ id: "title", desc: false }] } });

  return (
    <Table.ScrollContainer minWidth={640}>
      <Table highlightOnHover verticalSpacing="xs" className="entries-table">
        <Table.Thead>
          {table.getHeaderGroups().map((group) => (
            <Table.Tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <Table.Th key={header.id} className={header.column.getCanSort() ? "sortable-header" : undefined} onClick={header.column.getToggleSortingHandler()}>
                    <table.FlexRender header={header} />
                    {sorted === "asc" && <IconArrowUp size={12} />}
                    {sorted === "desc" && <IconArrowDown size={12} />}
                  </Table.Th>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Thead>
        <Table.Tbody>
          {table.getRowModel().rows.map((row) => (
            <Table.Tr key={row.id} onClick={() => void navigate({ to: "/c/$collection/$id", params: { collection, id: row.original.id } })}>
              {row.getAllCells().map((cell) => (
                <Table.Td key={cell.id}>
                  <table.FlexRender cell={cell} />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
