// The frame around every screen: the bar at the top (publish, sign out) and the collections on
// the left, each with the number of its live items.

import { AppShell, Badge, Burger, Button, Divider, Group, Indicator, ScrollArea, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { COLLECTION_NAMES, COLLECTIONS, SETTINGS_LABEL } from "@wayfarers-rest/shared";
import { IconAdjustments, IconCloudUpload, IconHome, IconLogout } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api, usesFakeServer } from "../../api";
import { draftQuery, publicationQuery } from "../../api/queries";
import { ButtonLink, NavItemLink } from "../links";

export function AppFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [opened, { toggle, close }] = useDisclosure();
  const draft = useQuery(draftQuery).data;
  const pending = useQuery(publicationQuery).data?.changes.length ?? 0;
  const logout = useMutation({
    mutationFn: () => api.call("logout"),
    onSettled: async () => {
      queryClient.clear();
      await router.navigate({ to: "/login", search: {} });
    },
  });

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 250, breakpoint: "sm", collapsed: { mobile: !opened } }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label={t("nav.menu")} />
            <Title order={4}>{t("app.name")}</Title>
            {usesFakeServer && (
              <Badge variant="light" color="yellow">
                {t("app.fakeServer")}
              </Badge>
            )}
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Indicator label={pending} size={18} disabled={pending === 0}>
              <ButtonLink to="/publication" size="xs" variant={pending > 0 ? "filled" : "default"} leftSection={<IconCloudUpload size={16} />}>
                {t("publication.publish")}
              </ButtonLink>
            </Indicator>
            <Button size="xs" variant="subtle" color="gray" leftSection={<IconLogout size={16} />} onClick={() => logout.mutate()}>
              {t("nav.logout")}
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea>
          <NavItemLink to="/" label={t("nav.overview")} leftSection={<IconHome size={16} />} activeOptions={{ exact: true }} onClick={close} />
          <Divider my="xs" label={t("nav.content")} labelPosition="left" />
          {COLLECTION_NAMES.map((collection) => (
            <NavItemLink
              key={collection}
              to="/c/$collection"
              params={{ collection }}
              label={COLLECTIONS[collection].label}
              onClick={close}
              rightSection={
                <Text size="xs" c="dimmed">
                  {draft?.items[collection].filter((item) => item.archived !== true).length ?? ""}
                </Text>
              }
            />
          ))}
          <Divider my="xs" />
          <NavItemLink to="/settings" label={SETTINGS_LABEL} leftSection={<IconAdjustments size={16} />} onClick={close} />
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
