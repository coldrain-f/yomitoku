import { Navigate, useParams } from "react-router-dom";
import type { ReadingItem } from "../../types";
import { PreviewScreen } from "./AdminScreens";

interface AdminPreviewRouteProps {
  items: ReadingItem[];
  onEdit: (item: ReadingItem) => void;
  onHold: (item: ReadingItem) => void;
  onPublish: (item: ReadingItem) => void;
  onDelete: (item: ReadingItem) => void;
  onBack: () => void;
}

export function AdminPreviewRoute({
  items,
  onEdit,
  onHold,
  onPublish,
  onDelete,
  onBack,
}: AdminPreviewRouteProps) {
  const { itemId } = useParams();
  const item = items.find((entry) => entry.id === itemId);

  if (!item) return <Navigate to="/admin/readings" replace />;

  return (
    <PreviewScreen
      item={item}
      onEdit={() => onEdit(item)}
      onHold={() => onHold(item)}
      onPublish={() => onPublish(item)}
      onDelete={() => onDelete(item)}
      onBack={onBack}
    />
  );
}
