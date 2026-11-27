import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { isFailure } from "../api/client";
import { sessionQuery } from "../api/queries";
import { AppFrame } from "../components/shell/AppFrame";

/** Everything but the login screen: needs a session, and is drawn inside the frame. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(sessionQuery);
    } catch (error) {
      if (isFailure(error, "unauthorized")) throw redirect({ to: "/login", search: { redirect: location.href } });
      throw error;
    }
  },
  component: () => (
    <AppFrame>
      <Outlet />
    </AppFrame>
  ),
});
