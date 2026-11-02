"use client";
import { useActionState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/validation";

/**
 * useActionState + a toast for every result. The toast is shown as soon as the
 * action returns (not in an effect), so it still appears when the form is
 * re-mounted with fresh data after saving.
 */
export function useActionToast<T = undefined>(
  action: (prev: ActionResult<T> | null, form: FormData) => Promise<ActionResult<T>>,
) {
  const [state, formAction, pending] = useActionState<ActionResult<T> | null, FormData>(async (prev, form) => {
    const res = await action(prev, form);
    if (res) {
      if (res.ok) toast.success(res.message ?? "Saved.");
      else toast.error(res.error);
    }
    return res;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return { state, formAction, pending, errors };
}
