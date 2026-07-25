import { useMemo, useState } from "react";
import type { ApiPanel, ApiService, Bundle } from "../types/order";
import { Button, Card, Input, Select, EmptyState, StatusPill } from "./ui";

interface BundleManagerProps {
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

function filterServices(services: ApiService[], keywords: string[]) {
  const filtered = services.filter((service) => {
    const name = String(service.name || "").toLowerCase();
    return keywords.some((keyword) => name.includes(keyword));
  });
  return filtered.length > 0 ? filtered : services;
}

function getApiServices(apis: ApiPanel[], apiId: string) {
  return apis.find((api) => String(api.id || "").trim() === String(apiId || "").trim())?.services ?? [];
}

function ServiceSelect({
  options,
  value,
  onChange,
  placeholder,
  label,
}: {
  options: ApiService[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const query = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.name.toLowerCase().includes(query) ||
        opt.id.toLowerCase().includes(query)
    );
  }, [options, search]);

  const selectedOption = options.find((opt) => opt.id === value);

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-900 transition hover:border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
      >
        {selectedOption ? (
          <span className="flex items-center justify-between gap-2">
            <span className="truncate">{selectedOption.name}</span>
            <span className="flex-shrink-0 text-xs text-slate-400 font-mono">#{selectedOption.id}</span>
          </span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => { setIsOpen(false); setSearch(""); }}
          />
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="border-b border-slate-200 p-2 bg-slate-50">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services..."
                className="w-full text-sm"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">
                  No services found
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => { onChange(option.id); setIsOpen(false); setSearch(""); }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-indigo-50 ${
                      value === option.id ? "bg-indigo-50 text-indigo-700" : "text-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{option.name}</span>
                      <span className="flex-shrink-0 text-xs text-slate-400 font-mono">#{option.id}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
            {filteredOptions.length > 0 && (
              <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500 bg-slate-50">
                {filteredOptions.length} service{filteredOptions.length !== 1 ? "s" : ""} found
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function BundleManager({ apis, bundles, onAddBundle, onUpdateBundle, onDeleteBundle }: BundleManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [apiId, setApiId] = useState("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [shares, setShares] = useState("");
  const [saves, setSaves] = useState("");
  const [comments, setComments] = useState("");
  const [reposts, setReposts] = useState("");

  const viewOptions = useMemo(
    () => filterServices(getApiServices(apis, apiId), ["view", "views"]),
    [apis, apiId]
  );
  const likeOptions = useMemo(
    () => filterServices(getApiServices(apis, apiId), ["like", "likes"]),
    [apis, apiId]
  );
  const shareOptions = useMemo(
    () => filterServices(getApiServices(apis, apiId), ["share", "shares"]),
    [apis, apiId]
  );
  const saveOptions = useMemo(
    () => filterServices(getApiServices(apis, apiId), ["save", "saves"]),
    [apis, apiId]
  );
  const commentOptions = useMemo(
    () => filterServices(getApiServices(apis, apiId), ["comment", "comments"]),
    [apis, apiId]
  );
  const repostOptions = useMemo(
    () => filterServices(getApiServices(apis, apiId), ["repost", "reposts", "reshare"]),
    [apis, apiId]
  );

  const resetForm = () => {
    setName("");
    setApiId("");
    setViews("");
    setLikes("");
    setShares("");
    setSaves("");
    setComments("");
    setReposts("");
    setEditingBundleId(null);
    setShowForm(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Collections</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Service bundles</h2>
          <p className="mt-1 text-sm text-slate-500">Group services into reusable bundles for orders.</p>
        </div>
        <Button
          variant={showForm ? "secondary" : "primary"}
          onClick={() => {
            if (showForm) { resetForm(); return; }
            setShowForm(true);
          }}
          icon={
            !showForm && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            )
          }
        >
          {showForm ? "Close" : "Create bundle"}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            {editingBundleId ? "Edit bundle" : "New bundle"}
          </h3>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              if (!apiId) return;
              if (!views.trim() || !likes.trim() || !shares.trim() || !saves.trim()) return;
              const payload = {
                name: name.trim(),
                apiId,
                views: views.trim(),
                likes: likes.trim(),
                shares: shares.trim(),
                saves: saves.trim(),
                comments: comments.trim(),
                reposts: reposts.trim(),
              };
              if (editingBundleId) {
                onUpdateBundle(editingBundleId, payload);
              } else {
                onAddBundle(payload);
              }
              resetForm();
            }}
            className="space-y-4"
          >
            <Input
              label="Bundle name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Instagram Growth Package"
            />

            <Select
              label="API panel"
              value={apiId}
              onChange={(event) => {
                setApiId(event.target.value);
                setViews("");
                setLikes("");
                setShares("");
                setSaves("");
                setComments("");
                setReposts("");
              }}
              placeholder="Select API panel"
              options={apis.map((api) => ({
                value: api.id,
                label: `${api.name} (${api.services.length} services)`,
              }))}
            />

            {apiId && (
              <>
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-sm font-medium text-slate-700 mb-3">Service mapping</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ServiceSelect
                      options={viewOptions}
                      value={views}
                      onChange={setViews}
                      placeholder="Select Views service"
                      label="Views"
                    />
                    <ServiceSelect
                      options={likeOptions}
                      value={likes}
                      onChange={setLikes}
                      placeholder="Select Likes service"
                      label="Likes"
                    />
                    <ServiceSelect
                      options={shareOptions}
                      value={shares}
                      onChange={setShares}
                      placeholder="Select Shares service"
                      label="Shares"
                    />
                    <ServiceSelect
                      options={saveOptions}
                      value={saves}
                      onChange={setSaves}
                      placeholder="Select Saves service"
                      label="Saves"
                    />
                    <ServiceSelect
                      options={commentOptions}
                      value={comments}
                      onChange={setComments}
                      placeholder="Select Comments service"
                      label="Comments"
                    />
                    <ServiceSelect
                      options={repostOptions}
                      value={reposts}
                      onChange={setReposts}
                      placeholder="Select Reposts service"
                      label="Reposts"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <Button type="submit" variant="primary" disabled={!apiId}>
                {editingBundleId ? "Update bundle" : "Save bundle"}
              </Button>
              {editingBundleId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      {/* Bundle Cards */}
      {bundles.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          }
          title="No bundles yet"
          description="Create your first service bundle to streamline order creation."
          action={
            <Button variant="primary" onClick={() => setShowForm(true)}>Create bundle</Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {bundles.map((bundle) => (
            <Card key={bundle.id} padding="md" hover>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-slate-900 truncate">{bundle.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Panel: <span className="text-slate-700">{apis.find((api) => api.id === bundle.apiId)?.name ?? "—"}</span>
                  </p>
                </div>
                <StatusPill kind="brand">{Object.values(bundle.serviceIds).filter(Boolean).length} services</StatusPill>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: "Views", value: bundle.serviceIds.views, tone: "indigo" },
                  { label: "Likes", value: bundle.serviceIds.likes, tone: "pink" },
                  { label: "Shares", value: bundle.serviceIds.shares, tone: "sky" },
                  { label: "Saves", value: bundle.serviceIds.saves, tone: "violet" },
                  { label: "Comments", value: bundle.serviceIds.comments, tone: "emerald" },
                  { label: "Reposts", value: bundle.serviceIds.reposts, tone: "cyan" },
                ].map((item) => {
                  const tones: Record<string, string> = {
                    indigo: "bg-indigo-50 text-indigo-700",
                    pink: "bg-pink-50 text-pink-700",
                    sky: "bg-sky-50 text-sky-700",
                    violet: "bg-violet-50 text-violet-700",
                    emerald: "bg-emerald-50 text-emerald-700",
                    cyan: "bg-cyan-50 text-cyan-700",
                  };
                  return (
                    <div key={item.label} className={`rounded-md px-2.5 py-2 ${tones[item.tone] || "bg-slate-50"}`}>
                      <p className="text-[10px] uppercase tracking-wider font-medium opacity-80">{item.label}</p>
                      <p className="mt-0.5 text-xs font-mono truncate">{item.value || "—"}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingBundleId(bundle.id);
                    setName(bundle.name);
                    setApiId(bundle.apiId);
                    setViews(bundle.serviceIds.views);
                    setLikes(bundle.serviceIds.likes);
                    setShares(bundle.serviceIds.shares);
                    setSaves(bundle.serviceIds.saves);
                    setComments(bundle.serviceIds.comments || "");
                    setReposts(bundle.serviceIds.reposts || "");
                    setShowForm(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-600 hover:bg-rose-50"
                  onClick={() => {
                    if (window.confirm("Delete this bundle?")) {
                      onDeleteBundle(bundle.id);
                      if (editingBundleId === bundle.id) resetForm();
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
