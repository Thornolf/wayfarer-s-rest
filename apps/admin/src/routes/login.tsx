import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, usesFakeServer } from "../api";
import { failureText } from "../api/failures";
import { isFailure } from "../api/client";
import { FAKE_PASSWORD } from "../fake/password";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" && search.redirect.startsWith("/") ? { redirect: search.redirect } : {},
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { redirect } = Route.useSearch();
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => api.call("login", { body: { password } }),
    onSuccess: async () => {
      queryClient.clear();
      await router.navigate({ href: redirect ?? "/" });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password !== "") login.mutate();
  };

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w={380} component="form" onSubmit={submit}>
        <Stack gap="md">
          <div>
            <Title order={2}>{t("app.name")}</Title>
            <Text c="dimmed" size="sm">
              {t("login.subtitle")}
            </Text>
          </div>
          <PasswordInput label={t("login.password")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} autoFocus autoComplete="current-password" />
          {login.isError && <Alert color="red">{isFailure(login.error, "unauthorized") ? t("login.wrong") : failureText(login.error, t)}</Alert>}
          {usesFakeServer && <Alert color="lantern">{t("login.fakeHint", { password: FAKE_PASSWORD })}</Alert>}
          <Button type="submit" loading={login.isPending}>
            {t("login.submit")}
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
