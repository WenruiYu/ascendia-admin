import * as React from "react";
import { json } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import {
  Page, Layout, Card, Button, BlockStack, Spinner, Banner, Text
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { listImages, uploadLocalFiles } from "../utils/files.server";

// ----- Action -----
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "media.list") {
    const first = parseInt(form.get("first") || "120", 10);
    const res = await listImages(admin, { limit: first });
    return json({ intent, ...res });
  }

  if (intent === "media.uploadLocal") {
    const files = form.getAll("files");
    const uploaded = await uploadLocalFiles(admin, files);
    return json({ intent, images: uploaded });
  }

  return json({ ok: true });
};

export default function MediaLibraryPage() {
  const fetcher = useFetcher();
  const [library, setLibrary] = React.useState([]);
  const [loadingList, setLoadingList] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const inFlightRef = React.useRef(false);

  // Initial load
  React.useEffect(() => {
    if (inFlightRef.current) return;
    refresh();
  }, []);

  // Handle responses
  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    if (fetcher.data.intent === "media.list") {
      setLibrary(fetcher.data.images || []);
      setLoadingList(false);
      inFlightRef.current = false;
    }

    if (fetcher.data.intent === "media.uploadLocal") {
      if (fetcher.data.images?.length) {
        // Prepend newly uploaded for immediate visibility
        setLibrary((prev) => [...fetcher.data.images, ...prev]);
        // Also trigger a refresh shortly after so Admin indexing is reflected
        setTimeout(() => refresh(), 1200);
      }
      setUploading(false);
    }
  }, [fetcher.state, fetcher.data]);

  const refresh = React.useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoadingList(true);
    fetcher.submit({ intent: "media.list", first: "120" }, { method: "post", action: "/app/media" });
  }, [fetcher]);

  const handleUpload = (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("intent", "media.uploadLocal");
    for (const file of files) formData.append("files", file);

    fetcher.submit(formData, {
      method: "post",
      action: "/app/media",
      encType: "multipart/form-data",
    });
    event.target.value = "";
  };

  return (
    <Page>
      <TitleBar title="Media Library" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <Button onClick={refresh} disabled={loadingList}>
                  Refresh
                </Button>
                <label>
                  <Button variant="primary" disabled={uploading}>
                    {uploading ? "Uploading..." : "Upload Images"}
                  </Button>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleUpload}
                  />
                </label>
              </div>

              {loadingList && (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <Spinner size="large" /> <Text>Loading images…</Text>
                </div>
              )}

              {!loadingList && library.length === 0 && (
                <Banner tone="info">No media found. Upload some images!</Banner>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                {library.map((img) => (
                  <div
                    key={img.id}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      padding: 8,
                      textAlign: "center",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        paddingBottom: "100%",
                        position: "relative",
                        marginBottom: 6,
                        background: "#f6f6f7",
                        borderRadius: 6,
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={img.preview}
                        alt={img.filename}
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                    <Text variant="bodySm" truncate>
                      {img.filename || img.label}
                    </Text>
                  </div>
                ))}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
