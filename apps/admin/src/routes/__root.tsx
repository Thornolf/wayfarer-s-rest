import { Center, Stack, Text, Title } from "@mantine/core";
import type { QueryClient } from "@tanstack/react-query";
import { Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

function NotFound() {
  const { t } = useTranslation();
  return (
    <Center mih="60vh">
      <Stack align="center" gap="xs">
        <Title order={2}>{t("notFound.title")}</Title>
        <Text c="dimmed">{t("notFound.text")}</Text>
        <Link to="/">{t("notFound.back")}</Link>
      </Stack>
    </Center>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  notFoundComponent: NotFound,
});
