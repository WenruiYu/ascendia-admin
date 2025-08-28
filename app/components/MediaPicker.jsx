import * as React from "react";
import {
  Modal, Button, TextField, InlineStack, BlockStack, Text, Box, Banner, Select, Spinner
} from "@shopify/polaris";
import { useFetcher } from "@remix-run/react";

// Render a square thumbnail from a normalized item: {preview, filename}
function Thumb({ item, size = 140 }) {
  const src = item?.preview || "";
  const alt = item?.filename || "image";
  const style = {
    width: size,
    height: size,
    objectFit: "cover",
    borderRadius: 8,
    display: "block",
    background: "#f6f6f7",
    border: "1px solid var(--p-color-border, #ddd)",
  };
  return src ? <img src={src} alt={alt} style={style} /> : <div style={style} />;
}

function ReorderableList({ items, onMoveUp, onMoveDown, onRemove, heroId, onSetHero }) {
  return (
    <BlockStack gap="200">
      {items.map((n, idx) => (
        <Box key={n.id} padding="200" borderWidth="025" borderColor="border" borderRadius="150">
          <InlineStack align="space-between" blockAlign="center" gap="200">
            <InlineStack gap="200" blockAlign="center">
              <Thumb item={n} size={64} />
              <div>
                <Text as="div" variant="bodyMd">{n.filename || n.label || n.id}</Text>
                {heroId === n.id && <Text as="div" tone="success" variant="bodySm">Hero</Text>}
              </div>
            </InlineStack>
            <InlineStack gap="100">
              <Button onClick={() => onSetHero(n.id)} variant="plain">Set as hero</Button>
              <Button onClick={() => onMoveUp(idx)} variant="plain" disabled={idx===0}>↑</Button>
              <Button onClick={() => onMoveDown(idx)} variant="plain" disabled={idx===items.length-1}>↓</Button>
              <Button tone="critical" variant="plain" onClick={() => onRemove(n.id)}>Remove</Button>
            </InlineStack>
          </InlineStack>
        </Box>
      ))}
    </BlockStack>
  );
}

export default function MediaPicker({
                                      open,
                                      onClose,
                                      multiple = true,
                                      initialSelected = [],   // array of normalized items OR ids; we normalize below
                                      onConfirm,
                                    }) {
  const fetcher = useFetcher();

  // normalize initial selection into ids + node map
  const initialIds = React.useMemo(
    () => initialSelected.map((x) => (typeof x === "string" ? x : x.id)).filter(Boolean),
    [initialSelected]
  );

  const [term, setTerm] = React.useState("");
  const [library, setLibrary] = React.useState([]); // normalized items
  const [selectedIds, setSelectedIds] = React.useState(initialIds);
  const [heroId, setHeroId] = React.useState(initialIds[0] || null);

  // local uploads
  const [localFiles, setLocalFiles] = React.useState([]);

  // pagination
  const [pageSize, setPageSize] = React.useState("60");
  const [pageInfo, setPageInfo] = React.useState({ hasNextPage: false, endCursor: null });
  const [pageStack, setPageStack] = React.useState([{ after: null, pageNum: 1 }]);
  const [pageNum, setPageNum] = React.useState(1);

  // loading
  const inFlightRef = React.useRef(false);
  const [loadingList, setLoadingList] = React.useState(false);

  // debounce search
  const [debouncedTerm, setDebouncedTerm] = React.useState(term);
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(term), 350);
    return () => clearTimeout(t);
  }, [term]);

  const loadPage = React.useCallback((opts = {}) => {
    const { after = null, reset = false } = opts;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const first = parseInt(pageSize, 10) || 60;
    const payload = { intent: "media.list", first: String(first) };
    // (Optional) You could pass a `query` to server and let it use Files API search.

    if (after) payload.after = after;

    setLoadingList(true);
    fetcher.submit(payload, { method: "post", action: "/app/media" });

    if (reset) {
      setPageStack([{ after: null, pageNum: 1 }]);
      setPageNum(1);
    }
  }, [fetcher, pageSize]);

  // open / change triggers
  React.useEffect(() => {
    if (!open) return;
    if (inFlightRef.current) return;
    loadPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debouncedTerm, pageSize]);

  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    if (fetcher.data.intent === "media.list") {
      setLibrary(fetcher.data.images || []);
      setPageInfo(fetcher.data.pageInfo || { hasNextPage: false, endCursor: null });
      setLoadingList(false);
      inFlightRef.current = false;
    }

    if (fetcher.data.intent === "media.uploadLocal") {
      if (fetcher.data.images?.length) {
        // show newly uploaded immediately
        setLibrary((prev) => [...fetcher.data.images, ...prev]);
        setSelectedIds((prev) => [...fetcher.data.images.map((n) => n.id), ...prev]);
        if (!heroId && fetcher.data.images[0]) setHeroId(fetcher.data.images[0].id);
      }
      // refresh once more to reflect Admin indexing
      setTimeout(() => loadPage({ reset: true }), 1200);
    }
  }, [fetcher.state, fetcher.data, heroId, loadPage]);

  function nextPage() {
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) return;
    setPageStack((prev) => [...prev, { after: pageInfo.endCursor, pageNum: prev.length + 1 }]);
    setPageNum((n) => n + 1);
    loadPage({ after: pageInfo.endCursor });
  }
  function prevPage() {
    if (pageStack.length <= 1) return;
    const newStack = pageStack.slice(0, -1);
    const prevTop = newStack[newStack.length - 1];
    setPageStack(newStack);
    setPageNum(prevTop.pageNum);
    loadPage({ after: prevTop.after || null });
  }
  function refresh() {
    if (!open) return;
    if (inFlightRef.current) return;
    loadPage({ reset: true });
  }

  function toggleSelect(id) {
    if (!multiple) {
      setSelectedIds([id]);
      setHeroId(id);
      return;
    }
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function confirm() {
    const nodes = library.filter((n) => selectedIds.includes(n.id));
    onConfirm?.({
      heroId: heroId && selectedIds.includes(heroId) ? heroId : selectedIds[0] || null,
      galleryIds: selectedIds,
      nodes,
    });
    onClose?.();
  }

  const uploading = fetcher.state === "submitting";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="选择图片"
      primaryAction={{ content: "添加所选", onAction: confirm, disabled: selectedIds.length === 0 }}
      secondaryActions={[{ content: "取消", onAction: onClose }]}
      large
    >
      <Modal.Section>
        <BlockStack gap="500">

          {/* Local upload */}
          <Box>
            <Text as="h3" variant="headingSm">上传文件</Text>
            <InlineStack gap="200" align="start" blockAlign="center">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  const fd = new FormData();
                  fd.append("intent", "media.uploadLocal");
                  for (const f of files) fd.append("files", f, f.name);
                  fetcher.submit(fd, { method: "post", action: "/app/media", encType: "multipart/form-data" });
                  e.target.value = "";
                }}
              />
              <Button onClick={refresh} disabled={loadingList || uploading}>刷新</Button>
            </InlineStack>
          </Box>

          {/* Controls */}
          <Box>
            <InlineStack gap="300" align="start" blockAlign="center" wrap={false}>
              <TextField
                label="搜索媒体库（客户端占位，不影响后端）"
                labelHidden
                value={term}
                onChange={setTerm}
                autoComplete="off"
                placeholder="（暂未接后端搜索）"
              />
              <Select
                label="每页数量"
                labelHidden
                value={pageSize}
                onChange={setPageSize}
                options={[
                  { label: "30", value: "30" },
                  { label: "60", value: "60" },
                  { label: "120", value: "120" },
                  { label: "250 (最大)", value: "250" },
                ]}
              />
              <div style={{ minWidth: 120, textAlign: "right" }}>
                <Text variant="bodySm">第 {pageNum} 页</Text>
              </div>
              <InlineStack gap="150">
                <Button onClick={prevPage} disabled={pageStack.length <= 1}>上一页</Button>
                <Button onClick={nextPage} disabled={!pageInfo.hasNextPage}>下一页</Button>
              </InlineStack>
            </InlineStack>
          </Box>

          {/* Library */}
          {loadingList ? (
            <Box padding="300" minHeight="140">
              <InlineStack gap="300" blockAlign="center">
                <Spinner accessibilityLabel="Loading media" size="small" />
                <Text variant="bodyMd">正在加载媒体库，请稍候…</Text>
              </InlineStack>
            </Box>
          ) : library.length === 0 ? (
            <Banner tone="info">媒体库暂无图片。请上传或刷新。</Banner>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 14,
              }}
            >
              {library.map((n) => {
                const active = selectedIds.includes(n.id);
                const name = n.filename || n.label || n.id;
                return (
                  <div
                    key={n.id}
                    onClick={() => toggleSelect(n.id)}
                    title={name}
                    style={{
                      border: active ? "2px solid #2a6ae9" : "1px solid var(--p-color-border, #ddd)",
                      borderRadius: 12,
                      padding: 8,
                      cursor: "pointer",
                      background: active ? "rgba(42,106,233,0.05)" : "white",
                    }}
                  >
                    <div style={{ position: "relative" }}>
                      <Thumb item={n} size={140} />
                      {heroId === n.id && (
                        <div style={{
                          position: "absolute", top: 8, left: 8,
                          background: "#2a6ae9", color: "#fff", fontSize: 12,
                          padding: "2px 6px", borderRadius: 6
                        }}>Hero</div>
                      )}
                    </div>
                    <div style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: "#637381",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}>
                      {name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected */}
          {selectedIds.length > 0 && !loadingList && (
            <>
              <Text as="h3" variant="headingSm">已选图片</Text>
              <ReorderableList
                items={selectedIds.map(id => library.find(n => n.id === id)).filter(Boolean)}
                heroId={heroId}
                onSetHero={(id) => setHeroId(id)}
                onMoveUp={(idx) => {
                  setSelectedIds(prev => {
                    const next = prev.slice();
                    const t = next[idx]; next[idx] = next[idx - 1]; next[idx - 1] = t;
                    return next;
                  });
                }}
                onMoveDown={(idx) => {
                  setSelectedIds(prev => {
                    const next = prev.slice();
                    const t = next[idx]; next[idx] = next[idx + 1]; next[idx + 1] = t;
                    return next;
                  });
                }}
                onRemove={(id) => {
                  setSelectedIds(prev => prev.filter(x => x !== id));
                  if (heroId === id) setHeroId(null);
                }}
              />
            </>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
