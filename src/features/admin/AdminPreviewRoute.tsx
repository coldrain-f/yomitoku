import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useI18n } from "../../lib/i18n";
import type { ReadingItem } from "../../types";
import { PreviewScreen } from "./AdminScreens";

interface AdminPreviewRouteProps {
  items: ReadingItem[];
  onHold: (item: ReadingItem) => void;
  onPublish: (item: ReadingItem) => void;
  onDelete: (item: ReadingItem) => void;
  onBack: () => void;
  onLoadItem: (itemId: string) => Promise<ReadingItem>;
}

export function AdminPreviewRoute({
  items,
  onHold,
  onPublish,
  onDelete,
  onBack,
  onLoadItem,
}: AdminPreviewRouteProps) {
  const { t } = useI18n();
  const { itemId } = useParams();
  const listedItem = items.find((entry) => entry.id === itemId);
  const hasDetail = Boolean(listedItem?.passage && listedItem.questions.length);
  const [loadedItem, setLoadedItem] = useState<ReadingItem | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const needsItemLoad = Boolean(itemId && !hasDetail);
  const item = hasDetail ? listedItem : loadedItem;

  useEffect(() => {
    if (!itemId || !needsItemLoad) return undefined;
    let active = true;
    setLoadFailed(false);
    void onLoadItem(itemId).then(
      (nextItem) => {
        if (active) setLoadedItem(nextItem);
      },
      () => {
        if (active) setLoadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [itemId, needsItemLoad, onLoadItem]);

  if (needsItemLoad && !loadFailed) {
    return <p className="route-restore-loading" role="status">{t("common.loading")}</p>;
  }
  if (!item) return <Navigate to="/admin/readings" replace />;

  return (
    <PreviewScreen
      item={item}
      onHold={() => onHold(item)}
      onPublish={() => onPublish(item)}
      onDelete={() => onDelete(item)}
      onBack={onBack}
    />
  );
}
