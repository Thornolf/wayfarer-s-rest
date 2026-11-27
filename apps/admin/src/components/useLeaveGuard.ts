// Asks before leaving a form with changes that were not saved.

import { useBlocker } from "@tanstack/react-router";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

/** Returns a function to call right before a navigation the form itself decides (after a save). */
export function useLeaveGuard(dirty: boolean): () => void {
  const { t } = useTranslation();
  const allowed = useRef(false);
  useBlocker({
    shouldBlockFn: () => dirty && !allowed.current && !window.confirm(t("form.leaveConfirm")),
    enableBeforeUnload: () => dirty && !allowed.current,
  });
  return () => {
    allowed.current = true;
  };
}
