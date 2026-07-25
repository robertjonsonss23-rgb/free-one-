import { BundleManager } from "../components/BundleManager";
import type { ApiPanel, Bundle } from "../types/order";

interface BundlesPageProps {
  apis: ApiPanel[];
  bundles: Bundle[];
  onAddBundle: (bundle: {
    name: string;
    apiId: string;
    views: string;
    likes: string;
    shares: string;
    saves: string;
    comments: string;
    reposts: string;
  }) => void;
  onUpdateBundle: (
    id: string,
    bundle: {
      name: string;
      apiId: string;
      views: string;
      likes: string;
      shares: string;
      saves: string;
      comments: string;
      reposts: string;
    }
  ) => void;
  onDeleteBundle: (id: string) => void;
}

export function BundlesPage({ apis, bundles, onAddBundle, onUpdateBundle, onDeleteBundle }: BundlesPageProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <BundleManager
        apis={apis}
        bundles={bundles}
        onAddBundle={onAddBundle}
        onUpdateBundle={onUpdateBundle}
        onDeleteBundle={onDeleteBundle}
      />
    </div>
  );
}
