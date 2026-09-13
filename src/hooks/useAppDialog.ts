import { useCallback, useState } from "react";
import type { DialogConfig } from "../types";

export function useAppDialog() {
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [dialogError, setDialogError] = useState("");

  const closeDialog = useCallback(() => {
    setDialog(null);
    setDialogError("");
  }, []);

  const openDialog = useCallback((value: DialogConfig) => {
    setDialogError("");
    setDialog(value);
  }, []);

  return {
    closeDialog,
    dialog,
    dialogError,
    openDialog,
    setDialogError,
  };
}
