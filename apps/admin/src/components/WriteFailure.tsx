// Why the server refused a write, in French, with what to do about it.

import { Alert, Button, Stack, Text } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isFailure } from "../api/client";
import type { Draft } from "../api/draft";
import { failureText } from "../api/failures";
import { IssueList } from "./IssueList";

export function WriteFailure({ error, draft }: { error: unknown; draft: Draft | undefined }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  if (!error) return null;
  const issues = isFailure(error) ? error.details?.issues : undefined;
  return (
    <Alert color="red" title={failureText(error, t)}>
      <Stack gap="sm" align="flex-start">
        {issues && issues.length > 0 && <IssueList issues={issues} draft={draft} />}
        {isFailure(error, "versionConflict") && (
          <>
            <Text size="sm">{t("form.conflictHelp")}</Text>
            <Button size="xs" variant="default" onClick={() => void queryClient.invalidateQueries()}>
              {t("form.reload")}
            </Button>
          </>
        )}
      </Stack>
    </Alert>
  );
}
