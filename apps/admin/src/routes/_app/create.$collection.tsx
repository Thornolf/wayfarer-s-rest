import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { COLLECTIONS, versionEtag } from "@wayfarers-rest/shared";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { isFailure } from "../../api/client";
import { draftQuery, useContentMutation } from "../../api/queries";
import { EntryForm } from "../../components/EntryForm";
import { useFormDraft } from "../../components/form/useFormDraft";
import { useLeaveGuard } from "../../components/useLeaveGuard";
import { WriteFailure } from "../../components/WriteFailure";
import { serverFieldErrors } from "../../api/failures";
import { blankValue } from "../../editor/blank";
import type { Path } from "../../editor/paths";
import { slugify } from "../../editor/slug";
import { textOf } from "../../editor/titles";
import { parseCollectionParam } from "../../state/collectionParam";

export const Route = createFileRoute("/_app/create/$collection")({
  params: { parse: parseCollectionParam },
  component: CreatePage,
});

const HEADER_FIELDS = ["archived", "aiGenerated"];

function CreatePage() {
  const { collection } = Route.useParams();
  // Another collection is another form: start it blank.
  return <CreateForm key={collection} />;
}

function CreateForm() {
  const { t } = useTranslation();
  const { collection } = Route.useParams();
  const navigate = Route.useNavigate();
  const { schema, singular, titleField } = COLLECTIONS[collection];
  const [blank] = useState(() => blankValue(schema) as Record<string, unknown>);
  const form = useFormDraft(schema, blank);
  const draft = useQuery(draftQuery).data;
  const [tried, setTried] = useState(false);
  const idTyped = useRef(false);
  const allowLeaving = useLeaveGuard(form.dirty);

  /** Until an id is typed, it follows the title. */
  const change = (path: Path, next: unknown) => {
    form.change(path, next);
    if (path[0] === "id") idTyped.current = true;
    else if (path[0] === titleField && !idTyped.current) {
      const title = path.length === 1 ? textOf(next) : typeof next === "string" ? next : undefined;
      form.change(["id"], title === undefined ? undefined : slugify(title));
    }
  };

  const create = useContentMutation((data: Record<string, unknown>) =>
    api.call("putEntry", { params: { collection, id: String(data.id) }, headers: { "if-match": versionEtag(0) }, body: { data } }),
  );
  const submit = () => {
    setTried(true);
    if (!form.checked.ok) return;
    create.mutate(form.checked.data as Record<string, unknown>, {
      onSuccess: ({ entry }) => {
        allowLeaving();
        void navigate({ to: "/c/$collection/$id", params: { collection, id: entry.id } });
      },
    });
  };

  const taken = isFailure(create.error, "versionConflict");
  const errors = {
    ...serverFieldErrors(create.error),
    ...(taken ? { id: t("create.idTaken") } : {}),
    ...(tried && !form.checked.ok ? form.checked.errors : {}),
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" c="dimmed">
            {singular}
          </Text>
          <Title order={2}>{t("create.title")}</Title>
        </div>
        <Button leftSection={<IconDeviceFloppy size={16} />} loading={create.isPending} onClick={submit}>
          {t("create.submit")}
        </Button>
      </Group>
      {!taken && <WriteFailure error={create.error} draft={draft} />}
      <EntryForm schema={schema} value={form.value} change={change} errors={errors} draft={draft} idLocked={false} hidden={HEADER_FIELDS} />
    </Stack>
  );
}
