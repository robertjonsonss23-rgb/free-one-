import { APIManager } from "../components/APIManager";
import type { ApiPanel } from "../types/order";

interface APIsPageProps {
  apis: ApiPanel[];
  onAddApi: (api: { name: string; url: string; key: string; currency?: string }) => void;
  onEditApi: (id: string, api: { name: string; url: string; key: string; currency?: string }) => void;
  onDeleteApi: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onFetchServices: (id: string) => void;
  fetchingApiId: string | null;
}

export function APIsPage({ apis, onAddApi, onEditApi, onDeleteApi, onToggleStatus, onFetchServices, fetchingApiId }: APIsPageProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <APIManager
        apis={apis}
        onAddApi={onAddApi}
        onEditApi={onEditApi}
        onDeleteApi={onDeleteApi}
        onToggleStatus={onToggleStatus}
        onFetchServices={onFetchServices}
        fetchingApiId={fetchingApiId}
      />
    </div>
  );
}
