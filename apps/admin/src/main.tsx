import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./app.css";
import "./i18n";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient, router } from "./router";
import { EditLocaleProvider } from "./state/editLocale";
import { theme } from "./theme";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} forceColorScheme="dark">
      <QueryClientProvider client={queryClient}>
        <EditLocaleProvider>
          <ModalsProvider>
            <Notifications position="bottom-right" />
            <RouterProvider router={router} />
          </ModalsProvider>
        </EditLocaleProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
