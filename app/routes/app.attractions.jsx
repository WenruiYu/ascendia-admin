import * as React from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, Button, BlockStack, Box, InlineStack,
  TextField, Text, Banner
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { gqlAdmin } from "../utils/admin-gql.server";
import {
  Q_METAOBJECTS_BY_TYPE,
  Q_METAOBJECT_BY_ID,
  M_METAOBJECT_UPSERT_GENERIC,
  M_METAOBJECT_DELETE,
} from "../utils/gql-docs";
import MediaPicker from "../components/MediaPicker";
import { filesByIds } from "../utils/files.server";

function toMap(fields) {
  const m = {};
  for (const f of fields || []) m[f.key] = f.value;
  return m;
}
function slugify(s) {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0, 60);
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // list attractions (basic)
  const aRes = await admin.graphql(Q_METAOBJECTS_BY_TYPE, {
    variables: { type: "attraction", first: 100 },
  });
  const aJson = await aRes.json();
  const attractions = (aJson?.data?.metaobjects?.nodes || []).map((n) => {
    const F = toMap(n.fields);
    return {
      id: n.id,
      handle: n.handle,
      title: F.title || "",
      location: F.location || "",
      description: F.description || "",
      hero_image: F.hero_image || "", // ID
      gallery: (() => { try { return JSON.parse(F.gallery || "[]"); } catch { return []; } })(), // [ID]
    };
  });

  return json({ attractions });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save") {
    const title = form.get("title") || "";
    const location = form.get("location") || "";
    const description = form.get("description") || "";
    const hero_image = form.get("hero_image") || ""; // single ID
    const gallery = JSON.parse(form.get("gallery") || "[]"); // [ID]

    const handle = `attraction-${slugify(title) || Date.now()}`;

    const up = await gqlAdmin(admin, M_METAOBJECT_UPSERT_GENERIC, {
      type: "attraction",
      handle,
      fields: [
        { key: "title", value: title },
        { key: "location", value: location },
        { key: "description", value: description },
        { key: "hero_image", value: hero_image },
        { key: "gallery", value: JSON.stringify(gallery) },
      ],
    });

    return json({ ok: true, id: up.metaobjectUpsert?.metaobject?.id });
  }

  if (intent === "delete") {
    const id = form.get("id");
    if (!id) return json({ ok: false, error: "Missing id" }, { status: 400 });
    await gqlAdmin(admin, M_METAOBJECT_DELETE, { id });
    return json({ ok: true, deletedId: id });
  }

  if (intent === "loadOne") {
    const id = form.get("id");
    const one = await gqlAdmin(admin, Q_METAOBJECT_BY_ID, { id });
    const node = one?.node;
    const F = toMap(node?.fields || []);
    const heroId = F.hero_image || "";
    const galleryIds = (() => { try { return JSON.parse(F.gallery || "[]"); } catch { return []; } })();

    // Resolve previews for hero + gallery
    const resolved = await filesByIds(admin, [heroId, ...galleryIds].filter(Boolean));

    return json({
      ok: true,
      item: {
        id: node?.id,
        handle: node?.handle,
        title: F.title || "",
        location: F.location || "",
        description: F.description || "",
        hero_image: heroId,      // ID
        gallery: galleryIds,     // [ID]
        _mediaNodes: resolved,   // [{id, preview, filename}]
      },
    });
  }

  return json({ ok: true });
};

export default function AttractionsManager() {
  const { attractions } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [editing, setEditing] = React.useState({
    id: "",
    title: "",
    location: "",
    description: "",
    hero_image: "",   // ID
    gallery: [],      // [ID]
    _mediaNodes: [],  // [{id, preview, filename}]
  });

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const isBusy = ["loading","submitting"].includes(fetcher.state);

  function resetForm() {
    setEditing({
      id: "",
      title: "",
      location: "",
      description: "",
      hero_image: "",
      gallery: [],
      _mediaNodes: [],
    });
  }
  function loadItem(id) {
    fetcher.submit({ intent: "loadOne", id }, { method: "post" });
  }

  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.item) setEditing(fetcher.data.item);
    if (fetcher.data.deletedId) shopify.toast.show("Deleted");
    if (fetcher.data.id) shopify.toast.show("Saved");
  }, [fetcher.state, fetcher.data, shopify]);

  const mediaMap = React.useMemo(() => {
    const m = new Map();
    for (const n of editing._mediaNodes || []) m.set(n.id, n);
    return m;
  }, [editing._mediaNodes]);

  const heroNode = editing.hero_image ? mediaMap.get(editing.hero_image) : null;
  const galleryNodes = editing.gallery.map((id) => mediaMap.get(id)).filter(Boolean);

  return (
    <Page>
      <TitleBar title="Attractions" />
      <Layout>
        {/* Left: list */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Existing</Text>
              {attractions.length === 0 ? (
                <Banner tone="info">No attractions yet.</Banner>
              ) : (
                <Box padding="300">
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {attractions.map((a) => (
                      <li key={a.id} style={{ marginBottom: 8 }}>
                        <InlineStack gap="300" align="start">
                          <Text as="span" variant="bodyMd">
                            <b>{a.title}</b>{a.location ? ` — ${a.location}` : ""}
                          </Text>
                          <Button size="slim" onClick={() => loadItem(a.id)}>Edit</Button>
                          <fetcher.Form
                            method="post"
                            onSubmit={(e) => { if (!confirm("Delete this attraction?")) e.preventDefault(); }}
                          >
                            <input type="hidden" name="intent" value="delete" />
                            <input type="hidden" name="id" value={a.id} />
                            <Button tone="critical" variant="plain" size="slim" submit>
                              Delete
                            </Button>
                          </fetcher.Form>
                        </InlineStack>
                      </li>
                    ))}
                  </ul>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Right: editor */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">{editing.id ? "Edit attraction" : "New attraction"}</Text>

              <InlineStack gap="300" align="start">
                <TextField
                  label="Title"
                  value={editing.title}
                  onChange={(v)=>setEditing(s=>({...s,title:v}))}
                />
                <TextField
                  label="Location"
                  value={editing.location}
                  onChange={(v)=>setEditing(s=>({...s,location:v}))}
                />
              </InlineStack>

              <TextField
                label="Description"
                value={editing.description}
                multiline={4}
                onChange={(v)=>setEditing(s=>({...s,description:v}))}
              />

              {/* Images */}
              <Box paddingBlockStart="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">Images</Text>
                  <Button onClick={() => setPickerOpen(true)}>Choose images</Button>
                </InlineStack>

                {/* Hero preview */}
                <Box paddingBlockStart="200">
                  <Text as="span" variant="bodySm" tone="subdued">Hero image</Text>
                  <div
                    style={{
                      marginTop: 8,
                      width: 200,
                      height: 200,
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      background: "#f6f6f7",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {heroNode ? (
                      <img
                        src={heroNode.preview}
                        alt="Hero"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <Text tone="subdued">No hero selected</Text>
                    )}
                  </div>
                </Box>

                {/* Gallery previews */}
                <Box paddingBlockStart="300">
                  <Text as="span" variant="bodySm" tone="subdued">Gallery</Text>
                  {galleryNodes.length === 0 ? (
                    <Box paddingBlockStart="200">
                      <Banner tone="info">No gallery images selected.</Banner>
                    </Box>
                  ) : (
                    <div
                      style={{
                        marginTop: 8,
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                        gap: 10,
                      }}
                    >
                      {galleryNodes.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            width: "100%",
                            paddingBottom: "100%",
                            position: "relative",
                            borderRadius: 8,
                            overflow: "hidden",
                            border: "1px solid #ddd",
                            background: "#f6f6f7",
                          }}
                        >
                          <img
                            src={n.preview}
                            alt={n.filename || "image"}
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </Box>
              </Box>

              {/* Save / Reset */}
              <InlineStack gap="300">
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="save" />
                  <input type="hidden" name="title" value={editing.title} />
                  <input type="hidden" name="location" value={editing.location} />
                  <input type="hidden" name="description" value={editing.description} />
                  <input type="hidden" name="hero_image" value={editing.hero_image} />
                  <input type="hidden" name="gallery" value={JSON.stringify(editing.gallery)} />
                  <Button variant="primary" submit disabled={!editing.title} loading={isBusy}>
                    Save
                  </Button>
                </fetcher.Form>
                <Button onClick={resetForm} disabled={isBusy}>Reset</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Media Picker modal */}
      <MediaPicker
        open={pickerOpen}
        multiple
        initialSelected={
          (editing._mediaNodes || []).map((n) => ({ id: n.id, image: { url: n.preview } }))
        }
        onClose={() => setPickerOpen(false)}
        onConfirm={({ heroId, galleryIds, nodes }) => {
          setEditing((s) => ({
            ...s,
            hero_image: heroId || "",
            gallery: galleryIds || [],
            _mediaNodes: nodes?.map((n) =>
              n.preview ? n : { id: n.id, preview: n?.image?.url || "", filename: n.filename || "" }
            ) || [],
          }));
        }}
      />
    </Page>
  );
}
