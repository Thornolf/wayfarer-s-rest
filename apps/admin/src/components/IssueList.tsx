// Problems of the content, each told in French with the item and the field it is about, and a
// link to go and fix it.

import { List, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { COLLECTIONS, SETTINGS_LABEL, settingsSchema, type CheckIssue } from "@wayfarers-rest/shared";
import { useTranslation } from "react-i18next";
import type { Draft } from "../api/draft";
import { pathLabels } from "../editor/labels";
import { titleOf } from "../editor/titles";

function titleIn(draft: Draft | undefined, collection: keyof typeof COLLECTIONS, id: string): string {
  const item = draft?.byId[collection].get(id);
  return item ? titleOf(collection, item) : id;
}

export function IssueList({ issues, draft }: { issues: readonly CheckIssue[]; draft: Draft | undefined }) {
  const { t } = useTranslation();
  return (
    <List spacing="xs" size="sm">
      {issues.map((issue, index) => {
        const schema = issue.collection === "settings" ? settingsSchema : COLLECTIONS[issue.collection].schema;
        const where = pathLabels(schema, issue.path).join(" › ");
        const target = issue.target ? titleIn(draft, issue.target.collection, issue.target.id) : "";
        return (
          <List.Item key={index}>
            {issue.collection === "settings" ? (
              <Link to="/settings">{SETTINGS_LABEL}</Link>
            ) : (
              <Link to="/c/$collection/$id" params={{ collection: issue.collection, id: issue.id }}>
                {COLLECTIONS[issue.collection].singular} « {titleIn(draft, issue.collection, issue.id)} »
              </Link>
            )}
            {where && <Text span c="dimmed">{` — ${where}`}</Text>}
            {" : "}
            {t(`check.kind.${issue.kind}`, { target })}
          </List.Item>
        );
      })}
    </List>
  );
}
