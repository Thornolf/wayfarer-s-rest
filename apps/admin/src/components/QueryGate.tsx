// What a screen shows while its data is on the way, or when the server refused.

import { Alert, Center, Loader } from "@mantine/core";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { failureText } from "../api/failures";

export function QueryGate<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  const { t } = useTranslation();
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) return <Alert color="red" title={t("errors.title")}>{failureText(query.error, t)}</Alert>;
  return (
    <Center py="xl">
      <Loader />
    </Center>
  );
}
