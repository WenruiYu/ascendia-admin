import * as React from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, Button, BlockStack, Box, InlineStack,
  TextField, Select, ChoiceList, Text, Banner, Modal, Tag, Icon
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { gqlAdmin } from "../utils/admin-gql.server";
import {
  Q_PRODUCTS_LIST,
  Q_PRODUCT_BY_HANDLE,
  Q_PRODUCT_ITINERARY_REFS,
  Q_METAOBJECTS_BY_TYPE,
  M_METAOBJECT_UPSERT_GENERIC,
  M_SET_PRODUCT_ITINERARY,
} from "../utils/gql-docs";

// ---------- Field keys (must match your Metaobject definition) ----------
const ITDAY_TYPE = "itinerary_day";
const F = {
  DAY_NUMBER: "day_number",
  TITLE: "title",
  DESCRIPTION: "description",
  ATTRACTIONS: "attractions",   // JSON array of attraction metaobject GIDs
  HOTEL: "hotel",               // single hotel metaobject GID
  MEALS: "meals",               // single-line OR list.single_line_text (Breakfast/Lunch/Dinner)
  LABEL: "label",               // display text, e.g., "Day 1 — Shanghai"
};

// ---------- Helpers ----------
function fieldsToMap(fields) {
  const m = {};
  for (const f of fields || []) m[f.key] = f.value;
  return m;
}
function parseJSON(jsonStr, fallback) {
  try { return JSON.parse(jsonStr ?? ""); } catch { return fallback; }
}
function slugify(s) {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0, 60);
}
function labelForDay(day_number, title) {
  const n = Number(day_number);
  const left = Number.isFinite(n) && n > 0 ? `Day ${n}` : "Day";
  return title ? `${left} — ${title}` : left;
}

// ---------- Attraction Selector Component ----------
function AttractionSelector({ attractions, selected, onChange, dayIndex }) {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const [tempSelected, setTempSelected] = React.useState([]);

  // Open modal and set temporary selection
  const handleOpen = () => {
    setTempSelected(selected || []);
    setModalOpen(true);
    setSearchValue("");
  };

  // Apply selection and close modal
  const handleApply = () => {
    onChange(tempSelected);
    setModalOpen(false);
  };

  // Cancel and close modal
  const handleCancel = () => {
    setModalOpen(false);
    setSearchValue("");
  };

  // Toggle attraction selection
  const toggleAttraction = (attractionId) => {
    setTempSelected(prev => {
      if (prev.includes(attractionId)) {
        return prev.filter(id => id !== attractionId);
      } else {
        return [...prev, attractionId];
      }
    });
  };

  // Remove attraction from selection (from tag)
  const removeAttraction = (attractionId) => {
    onChange((selected || []).filter(id => id !== attractionId));
  };

  // Filter attractions based on search
  const filteredAttractions = React.useMemo(() => {
    if (!searchValue) return attractions;
    const search = searchValue.toLowerCase();
    return attractions.filter(a => 
      a.title.toLowerCase().includes(search) ||
      (a.location && a.location.toLowerCase().includes(search))
    );
  }, [attractions, searchValue]);

  // Get selected attraction objects
  const selectedAttractions = React.useMemo(() => {
    return attractions.filter(a => (selected || []).includes(a.id));
  }, [attractions, selected]);

  return (
    <>
      {/* Main display with tags */}
      <Box>
        <Text as="div" variant="headingSm" tone="subdued">
          Attractions ({selectedAttractions.length} selected)
        </Text>
        <Box paddingBlockStart="100">
          <InlineStack gap="100" wrap>
            {selectedAttractions.map(a => (
              <Tag key={a.id} onRemove={() => removeAttraction(a.id)}>
                {a.title}
              </Tag>
            ))}
            <Button size="slim" onClick={handleOpen} icon={SearchIcon}>
              {selectedAttractions.length > 0 ? "Edit" : "Select"} Attractions
            </Button>
          </InlineStack>
        </Box>
      </Box>

      {/* Selection Modal */}
      <Modal
        open={modalOpen}
        onClose={handleCancel}
        title={`Select Attractions for Day ${dayIndex + 1}`}
        primaryAction={{
          content: `Apply (${tempSelected.length} selected)`,
          onAction: handleApply,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleCancel,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {/* Search field */}
            <TextField
              label="Search attractions"
              labelHidden
              value={searchValue}
              onChange={setSearchValue}
              placeholder="Search by name or location..."
              prefix={<Icon source={SearchIcon} />}
              clearButton
              onClearButtonClick={() => setSearchValue("")}
              autoComplete="off"
            />

            {/* Results count */}
            <Text as="p" variant="bodyMd" tone="subdued">
              {filteredAttractions.length} attractions found
              {searchValue && ` matching "${searchValue}"`}
            </Text>

            {/* Attraction list */}
            <div style={{ height: "400px", overflowY: "auto", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-200)", padding: "var(--p-space-200)" }}>
              <BlockStack gap="100">
                {filteredAttractions.length === 0 ? (
                  <Box padding="400">
                    <BlockStack gap="200">
                      <Text as="p" variant="headingMd" alignment="center" tone="subdued">
                        No attractions found
                      </Text>
                      <Text as="p" variant="bodyMd" alignment="center" tone="subdued">
                        Try adjusting your search
                      </Text>
                    </BlockStack>
                  </Box>
                ) : (
                  filteredAttractions.map(attraction => {
                    const isSelected = tempSelected.includes(attraction.id);
                    return (
                      <Box
                        key={attraction.id}
                        padding="200"
                        borderWidth="025"
                        borderColor={isSelected ? "success" : "border"}
                        borderRadius="200"
                        background={isSelected ? "bg-surface-success" : "bg-surface"}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight={isSelected ? "semibold" : "regular"}>
                              {attraction.title}
                            </Text>
                            {attraction.location && (
                              <Text as="span" variant="bodySm" tone="subdued">
                                📍 {attraction.location}
                              </Text>
                            )}
                          </BlockStack>
                          <Button
                            size="slim"
                            variant={isSelected ? "primary" : "secondary"}
                            onClick={() => toggleAttraction(attraction.id)}
                          >
                            {isSelected ? "Selected" : "Select"}
                          </Button>
                        </InlineStack>
                      </Box>
                    );
                  })
                )}
              </BlockStack>
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}

// Parse a metaobject node -> plain day object
function parseFieldsToDay(node) {
  if (!node) return null;
  const m = fieldsToMap(node.fields);
  const dayNumber = parseInt(m[F.DAY_NUMBER] ?? "0", 10);
  if (!Number.isFinite(dayNumber) || dayNumber <= 0) return null;

  // Parse description from rich text format if it's stored as JSON
  let description = "";
  const rawDescription = m[F.DESCRIPTION];
  if (rawDescription) {
    try {
      const parsed = JSON.parse(rawDescription);
      // Extract text from rich text structure
      if (parsed?.children?.[0]?.children?.[0]?.value) {
        description = parsed.children[0].children[0].value;
      }
    } catch {
      // If parsing fails, treat as plain string (backward compatibility)
      description = rawDescription;
    }
  }

  // meals may be stored as a single string OR as a JSON array (for list fields)
  let meals = [];
  const rawMeals = m[F.MEALS];
  if (typeof rawMeals === "string" && rawMeals.length > 0) {
    const trimmed = rawMeals.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      meals = parseJSON(trimmed, []);
    } else {
      meals = [rawMeals];
    }
  }

  return {
    id: node.id,
    handle: node.handle,
    day_number: dayNumber,
    title: m[F.TITLE] || "",
    description,
    hotel: m[F.HOTEL] || "",
    meals,
    attraction_ids: parseJSON(m[F.ATTRACTIONS], []),
  };
}

// ---------- Loader ----------
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Products for dropdown
  const pRes = await admin.graphql(Q_PRODUCTS_LIST, { variables: { first: 100 } });
  const pJson = await pRes.json();
  const productOptions = (pJson?.data?.products?.edges || []).map(e => ({
    id: e.node.id,
    label: e.node.title || e.node.handle,
    value: e.node.handle,
  }));

  // Attractions & Hotels master lists
  const aRes = await admin.graphql(Q_METAOBJECTS_BY_TYPE, { variables: { type: "attraction", first: 250 }});
  const aJson = await aRes.json();
  const attractions = (aJson?.data?.metaobjects?.nodes || []).map(n => {
    const m = fieldsToMap(n.fields);
    return { 
      id: n.id, 
      title: m.title || n.handle,
      location: m.location || "" // Include location for search/display
    };
  });

  const hRes = await admin.graphql(Q_METAOBJECTS_BY_TYPE, { variables: { type: "hotel", first: 250 }});
  const hJson = await hRes.json();
  const hotels = (hJson?.data?.metaobjects?.nodes || []).map(n => {
    const m = fieldsToMap(n.fields);
    return { id: n.id, name: m.name || n.handle };
  });

  return json({ productOptions, attractions, hotels });
};

// ---------- Action ----------
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "loadProduct") {
    const handle = form.get("handle");
    const p1 = await gqlAdmin(admin, Q_PRODUCT_BY_HANDLE, { handle });
    const product = p1?.productByHandle;
    if (!product) return json({ intent, error: "Product not found" }, { status: 404 });

    const refs = await gqlAdmin(admin, Q_PRODUCT_ITINERARY_REFS, { id: product.id });
    const nodes = refs?.product?.metafield?.references?.nodes || [];
    const days = nodes.map(parseFieldsToDay).filter(Boolean).sort((a,b)=>a.day_number - b.day_number);
    return json({ intent, product, days });
  }

  if (intent === "save") {
    const productId = form.get("productId");
    const payload = JSON.parse(form.get("payload") || "[]"); // [{day_number,title,description,hotel,meals[],attraction_ids[]}]

    const gidSuffix = (productId || "").split("/").pop();
    const createdIds = [];

    for (const d of payload) {
      const dayNum = parseInt(d.day_number, 10);
      if (!Number.isFinite(dayNum) || dayNum <= 0) continue;

      const handle = `${ITDAY_TYPE}-${gidSuffix}-day-${String(dayNum).padStart(2,"0")}-${slugify(d.title || "")}`.slice(0, 60);
      const safeLabel = d.label || labelForDay(dayNum, d.title || "");

      // Convert plain text to rich text format for the description field
      const descriptionValue = d.description 
        ? JSON.stringify({
            type: "root",
            children: [{
              type: "paragraph",
              children: [{
                type: "text",
                value: d.description
              }]
            }]
          })
        : JSON.stringify({
            type: "root",
            children: []
          });

      const fields = [
        { key: F.DAY_NUMBER, value: String(dayNum) },
        { key: F.TITLE, value: d.title || "" },
        { key: F.DESCRIPTION, value: descriptionValue },
        { key: F.LABEL, value: safeLabel },
        ...(d.hotel ? [{ key: F.HOTEL, value: d.hotel }] : []),
        { key: F.ATTRACTIONS, value: JSON.stringify(Array.isArray(d.attraction_ids) ? d.attraction_ids : []) },
      ];

      // --- Meals handling (list.single_line_text_field always expects JSON array) ---
      const chosen = Array.isArray(d.meals) ? d.meals.filter(Boolean) : [];
      // Always send as JSON array since the field type is list.single_line_text_field
      if (chosen.length > 0) {
        fields.push({ key: F.MEALS, value: JSON.stringify(chosen) });
      }
      // If no meals selected, omit the field so days can be blank

      const up = await gqlAdmin(admin, M_METAOBJECT_UPSERT_GENERIC, {
        type: ITDAY_TYPE,
        handle,
        fields,
      });

      const err = up?.metaobjectUpsert?.userErrors?.[0];
      if (err?.message) {
        throw new Error("Metaobject upsert error: " + err.message);
      }

      const moId = up?.metaobjectUpsert?.metaobject?.id;
      if (moId) createdIds.push(moId);
    }

    // Write product.custom.itinerary_days as list.metaobject_reference (JSON string of IDs)
    await gqlAdmin(admin, M_SET_PRODUCT_ITINERARY, {
      productId,
      value: JSON.stringify(createdIds),
    });

    // Re-read for consistency
    const back = await gqlAdmin(admin, Q_PRODUCT_ITINERARY_REFS, { id: productId });
    const nodes = back?.product?.metafield?.references?.nodes || [];
    const days = nodes.map(parseFieldsToDay).filter(Boolean).sort((a,b)=>a.day_number - b.day_number);

    return json({ intent: "save", linked: createdIds.length, days });
  }

  return json({ ok: true });
};

// ---------- UI ----------
export default function ItineraryBuilderPage() {
  const { productOptions, attractions, hotels } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [handle, setHandle] = React.useState("");
  const [product, setProduct] = React.useState(null);
  const [days, setDays] = React.useState([]);
  const baselineRef = React.useRef("[]");
  const [dirty, setDirty] = React.useState(false);

  const isBusy =
    ["loading","submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";

  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    if (fetcher.data.intent === "loadProduct") {
      if (fetcher.data.error) {
        shopify.toast.show(fetcher.data.error, { isError: true });
        setProduct(null);
        setDays([]);
        baselineRef.current = "[]";
        setDirty(false);
        return;
      }
      setProduct(fetcher.data.product || null);
      setDays(fetcher.data.days || []);
      baselineRef.current = JSON.stringify(fetcher.data.days || []);
      setDirty(false);
      if (fetcher.data.product?.title) {
        shopify.toast.show(`Loaded: ${fetcher.data.product.title}`);
      }
    }

    if (fetcher.data.intent === "save") {
      const newDays = fetcher.data.days ?? days;
      baselineRef.current = JSON.stringify(newDays);
      setDays(newDays);
      setDirty(false);
      shopify.toast.show(`Saved ${fetcher.data.linked} day(s)`);
    }
  }, [fetcher.state, fetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark form dirty when days change vs baseline
  React.useEffect(() => {
    const now = JSON.stringify(days);
    setDirty(now !== baselineRef.current);
  }, [days]);

  function loadProduct() {
    if (!handle) {
      shopify.toast.show("请选择产品", { isError: true });
      return;
    }
    fetcher.submit({ intent: "loadProduct", handle }, { method: "post" });
  }

  function addDay() {
    const nextNum =
      (days.reduce((mx, d) => Math.max(mx, Number(d.day_number) || 0), 0) || 0) + 1;
    setDays(prev => [
      ...prev,
      { day_number: nextNum, title: "", description: "", hotel: "", meals: [], attraction_ids: [] },
    ]);
  }

  function updateDay(idx, patch) {
    setDays(prev => prev.map((d,i) => i===idx ? { ...d, ...patch } : d));
  }

  function removeDay(idx) {
    setDays(prev => prev.filter((_,i)=>i!==idx));
  }

  function saveAll() {
    if (!product) {
      shopify.toast.show("请先选择产品", { isError: true });
      return;
    }
    fetcher.submit(
      {
        intent: "save",
        productId: product.id,
        payload: JSON.stringify(days),
      },
      { method: "post" },
    );
  }

  const productIdShort = product?.id?.replace("gid://shopify/Product/","");

  return (
    <Page>
      <TitleBar title="Itinerary builder">
        <button onClick={saveAll} disabled={!product || !dirty}>
          Save itinerary
        </button>
      </TitleBar>

      <Layout>
        {/* Product picker */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Select product</Text>
              <InlineStack gap="300" align="start">
                <Select
                  label="Product"
                  labelHidden
                  options={
                    productOptions.length
                      ? productOptions.map(o => ({ label: o.label, value: o.value }))
                      : [{ label: "No products found", value: "" }]
                  }
                  value={handle}
                  onChange={setHandle}
                  placeholder="Choose a product"
                />
                <Button variant="primary" loading={isBusy} disabled={!handle} onClick={loadProduct}>
                  Load
                </Button>
                {productIdShort && (
                  <Button
                    url={`shopify:admin/products/${productIdShort}`}
                    target="_blank"
                    variant="plain"
                  >
                    View product
                  </Button>
                )}
              </InlineStack>
              {product && (
                <Banner tone="success">
                  Loaded: <b>{product.title}</b> (<code>{product.handle}</code>)
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Days editor */}
        {product && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Days</Text>
                  <InlineStack gap="200">
                    <Button onClick={addDay}>Add day</Button>
                    <Button variant="primary" onClick={saveAll} disabled={!dirty || isBusy}>
                      Save
                    </Button>
                  </InlineStack>
                </InlineStack>

                {days.length === 0 ? (
                  <Banner tone="info">No days yet. Click “Add day”.</Banner>
                ) : (
                  <BlockStack gap="300">
                    {days.map((d, idx) => (
                      <Box
                        key={`day-${idx}-${d.day_number}`}
                        padding="300"
                        borderWidth="025"
                        borderColor="border"
                        borderRadius="200"
                      >
                        <InlineStack align="space-between" gap="200">
                          <InlineStack gap="200" align="start">
                            <TextField
                              label="Day #"
                              type="number"
                              value={String(d.day_number || "")}
                              onChange={(v)=>updateDay(idx, { day_number: parseInt(v||"0",10) || "" })}
                              autoComplete="off"
                            />
                            <TextField
                              label="Title"
                              value={d.title}
                              onChange={(v)=>updateDay(idx, { title: v })}
                              autoComplete="off"
                            />
                          </InlineStack>
                          <Button tone="critical" variant="plain" onClick={() => removeDay(idx)}>
                            Remove
                          </Button>
                        </InlineStack>

                        <Box paddingBlockStart="200">
                          <TextField
                            label="Description"
                            value={d.description}
                            multiline={4}
                            onChange={(v)=>updateDay(idx, { description: v })}
                          />
                        </Box>

                        <Box paddingBlockStart="200">
                          <InlineStack gap="400" align="start">
                            <div style={{ minWidth: 280 }}>
                              <Text as="div" variant="headingSm" tone="subdued">Hotel</Text>
                              <Select
                                label="Hotel"
                                labelHidden
                                options={[
                                  { label: "(none)", value: "" },
                                  ...hotels.map(h => ({ label: h.name, value: h.id })),
                                ]}
                                value={d.hotel || ""}
                                onChange={(v)=>updateDay(idx, { hotel: v })}
                              />
                            </div>

                            <div style={{ minWidth: 320 }}>
                              <AttractionSelector
                                attractions={attractions}
                                selected={d.attraction_ids || []}
                                onChange={(vals)=>updateDay(idx, { attraction_ids: vals })}
                                dayIndex={idx}
                              />
                            </div>
                          </InlineStack>
                        </Box>

                        <Box paddingBlockStart="200">
                          <Text as="div" variant="headingSm" tone="subdued">Meals</Text>
                          <ChoiceList
                            title="Meals"
                            titleHidden
                            allowMultiple
                            choices={[
                              { label: "Breakfast", value: "Breakfast" },
                              { label: "Lunch", value: "Lunch" },
                              { label: "Dinner", value: "Dinner" },
                            ]}
                            selected={Array.isArray(d.meals) ? d.meals : []}
                            onChange={(vals)=>updateDay(idx, { meals: vals })}
                          />
                        </Box>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
