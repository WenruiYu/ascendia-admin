import * as React from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Box,
  InlineStack,
  Select,
  TextField,
  Banner,
  Text,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

import { gqlAdmin } from "../utils/admin-gql.server";
import {
  Q_PRODUCT_BY_HANDLE,
  Q_PRODUCT_SEASON_CAL_REFS,
  Q_METAOBJECTS_BY_IDS,
  M_METAOBJECT_UPSERT,
  M_METAFIELDS_SET,
  Q_PRODUCTS_LIST,
} from "../utils/gql-docs";
const { useEffect, useRef, useState } = React;

// ----- Remix data hooks -----
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  // Fetch first 100 products; adjust if you need more
  const data = await admin.graphql(Q_PRODUCTS_LIST, {
    variables: { first: 100 },
  });
  const jsonRes = await data.json();
  const products = jsonRes?.data?.products?.edges?.map((e) => e.node) ?? [];
  // Send minimal info to the client for the dropdown
  const options = products.map((p) => ({
    label: p.title || p.handle,
    value: p.handle, // use handle as value to keep the rest of the code simple
    id: p.id,
  }));
  return json({ ok: true, productOptions: options });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  // Load existing product + dates by handle
  if (intent === "loadProduct") {
    const handle = form.get("handle");
    const d1 = await gqlAdmin(admin, Q_PRODUCT_BY_HANDLE, { handle });
    const product = d1.productByHandle;
    if (!product) return json({ intent, error: "Product not found" });

    // Read product metafield custom.season_calendar (list.metaobject_reference)
    const d2 = await gqlAdmin(admin, Q_PRODUCT_SEASON_CAL_REFS, { id: product.id });
    const refs = d2?.product?.metafield?.references?.nodes ?? [];
    const dates = refs
      .map(n => ({
        date: n.fields.find(f=>f.key==='date')?.value,
        season: (n.fields.find(f=>f.key==='season')?.value || "low").toLowerCase(),
        note: n.fields.find(f=>f.key==='note')?.value || ""
      }))
      .filter(d => d.date)
      .sort((a,b)=> a.date.localeCompare(b.date));
    return json({ intent, product, dates });
  }

  // Save (upsert all metaobjects + set the product metafield)
  if (intent === "save") {
    const productId = form.get("productId");
    const payload = JSON.parse(form.get("payload") || "[]"); // [{date,season,note}]
    const gidSuffix = productId.split("/").pop();
    const gids = [];

    for (const row of payload) {
      if (!row.date) continue;
      const moHandle = `season-${gidSuffix}-${row.date}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");

      const up = await gqlAdmin(admin, M_METAOBJECT_UPSERT, {
        type: "season_date",
        handle: moHandle,
        fields: [
          { key: "label", value: `${row.date} - ${(row.season || "low").toLowerCase()} season` },
          { key: "date", value: row.date },
          { key: "season", value: (row.season || "low").toLowerCase() },
          ...(row.note ? [{ key: "note", value: row.note }] : []),
        ],
      });
      gids.push(up.metaobjectUpsert.metaobject.id);
    }

    await gqlAdmin(admin, M_METAFIELDS_SET, {
      metafields: [
        {
          ownerId: productId,
          namespace: "custom",
          key: "season_calendar",
          type: "list.metaobject_reference",
          value: JSON.stringify(gids),
        },
      ],
    });

    return json({ intent: "save", linked: gids.length });
  }

  return json({ ok: true });
};

function MonthGrid({ year, month, selectedSet, onToggle, size="lg" }) {
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const numDays = daysInMonth(year, month);
  const title = first.toLocaleDateString(undefined, { year: "numeric", month: "long" });

  const baseCell = {
    width: size === "lg" ? 44 : 36,
    height: size === "lg" ? 44 : 36,
    borderRadius: 8,
    border: "1px solid var(--p-color-border, #dcdcdc)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    margin: 2,
    cursor: "pointer",
    userSelect: "none",
    fontWeight: 600,
  };

  const days = [];
  for (let i=0; i<startDow; i++) days.push(null);
  for (let d=1; d<=numDays; d++) days.push(d);

  const wkHeadStyle = {textAlign:"center", fontSize:12, opacity:0.7, fontWeight:600};

  return (
    <div style={{ minWidth: 360, padding: 8 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap: 4 }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(w => <div key={w} style={wkHeadStyle}>{w}</div>)}
        {days.map((d, idx) => {
          if (d === null) return <div key={`x${idx}`} />;
          const localISO = fmtLocalYYYYMMDD(new Date(year, month, d));
          const selected = selectedSet.has(localISO);
          return (
            <div
              key={localISO}
              onClick={() => onToggle(localISO)}
              title={localISO}
              style={{
                ...baseCell,
                background: selected ? "var(--p-color-bg-fill-brand, #2a6ae9)" : "white",
                color: selected ? "white" : "inherit",
                borderColor: selected ? "var(--p-color-border-strong, #1f4fb0)" : baseCell.border,
                boxShadow: selected ? "0 0 0 2px rgba(42,106,233,0.25)" : "none",
              }}
            >
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MultiMonthCalendar({ monthStart, monthsToShow=6, selected, onToggle, onPrev, onNext }) {
  const months = [];
  for (let i=0; i<monthsToShow; i++) {
    const m = addMonths(monthStart, i);
    months.push(<MonthGrid
      key={`${m.getFullYear()}-${m.getMonth()}`}
      year={m.getFullYear()}
      month={m.getMonth()}
      selectedSet={selected}
      onToggle={onToggle}
    />);
  }
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <button onClick={onPrev}>← Prev</button>
        <div style={{opacity:0.6, fontSize:12}}>Click days to toggle selection</div>
        <button onClick={onNext}>Next →</button>
      </div>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
        {months}
      </div>
    </div>
  );
}

// utils
function pad(n){ return n < 10 ? `0${n}` : `${n}`; }
function fmtLocalYYYYMMDD(dateObj){
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())}`;
}
function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function addMonths(date, n) { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; }

// ----- UI -----
export default function DeparturesPage() {
  const [dates, setDates] = React.useState([]); // [{date, season, note}]
  const [dirty, setDirty] = React.useState(false);
  const baselineRef = useRef("[]"); // JSON snapshot of last loaded/saved dates
  const fetcher = useFetcher();
  const { productOptions = [] } = useLoaderData();
  const shopify = useAppBridge();

  const [handle, setHandle] = React.useState("");
  const [product, setProduct] = React.useState(null);
  const [adding, setAdding] = React.useState({
    date: "",
    season: "low",  // default low to avoid mistakes
    note: "",
    rangeStart: "",
    rangeEnd: "",
    weekdays: "5,0",
    patternSeason: "low",
  });

  const [multi, setMulti] = React.useState({
    monthStart: new Date(),
    monthsToShow: 6,
    selected: new Set(),
  });

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    if (fetcher.data.intent === "loadProduct") {
      if (fetcher.data.error) {
        shopify.toast.show(fetcher.data.error, { isError: true });
        setProduct(null);
        setDates([]);
        baselineRef.current = "[]";
        setDirty(false);
        return;
      }
      setProduct(fetcher.data.product || null);
      setDates(fetcher.data.dates || []);
      baselineRef.current = JSON.stringify(fetcher.data.dates || []);
      setDirty(false);
      if (fetcher.data.product?.title) {
        shopify.toast.show(`Loaded: ${fetcher.data.product.title}`);
      }
    }

    if (fetcher.data.intent === "save") {
      shopify.toast.show(`Saved ${fetcher.data.linked} dates`);
      const newDates = fetcher.data.dates ?? dates;
      baselineRef.current = JSON.stringify(newDates);
      setDates(newDates);
      setDirty(false);
    }
  }, [fetcher.state, fetcher.data, shopify]);

  React.useEffect(() => {
    setDirty(JSON.stringify(dates) !== baselineRef.current);
  }, [dates]);

  function loadProduct() {
    if (!handle) {
      shopify.toast.show("Enter a product handle", { isError: true });
      return;
    }
    fetcher.submit({ intent: "loadProduct", handle }, { method: "post" });
  }

  function addSingleDate(input, season, note) {
    if (!input) return;
    const iso = (typeof input === "string")
      ? input
      : fmtLocalYYYYMMDD(input);

    if (dates.some(x => x.date === iso)) return;
    setDates(prev =>
      [...prev, { date: iso, season: season || "low", note: note || "" }]
        .sort((a,b) => a.date.localeCompare(b.date))
    );
  }

  function toggleSeason(iso) {
    setDates((prev) =>
      prev.map((x) =>
        x.date === iso ? { ...x, season: x.season === "high" ? "low" : "high" } : x,
      ),
    );
  }

  function removeDate(iso) {
    setDates((prev) => prev.filter((x) => x.date !== iso));
  }

  function bulkGenerate(rs, re, weekdays, season) {
    if (!rs || !re) return;
    const s = new Date(rs),
      e = new Date(re);
    const w = (weekdays || "")
      .split(",")
      .map((n) => parseInt(n, 10))
      .filter((n) => !Number.isNaN(n));
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      if (w.includes(d.getDay())) addSingleDate(d, season, "");
    }
  }

  function saveAll() {
    if (!product) {
      shopify.toast.show("Pick a product first", { isError: true });
      return;
    }
    fetcher.submit(
      { intent: "save", productId: product.id, payload: JSON.stringify(dates) },
      { method: "post" },
    );
  }

  const productId = product?.id?.replace("gid://shopify/Product/", "");

  return (
    <Page>
      <TitleBar title="Departure dates">
        <button onClick={saveAll} disabled={!product || dates.length === 0}>
          Save
        </button>
      </TitleBar>

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Select product</Text>
              <InlineStack gap="300" align="start">
                <Select
                  label="Product"
                  labelHidden
                  options={productOptions.length
                    ? productOptions.map(o => ({ label: o.label, value: o.value }))
                    : [{ label: "No products found", value: "" }]}
                  value={handle}
                  onChange={(v) => setHandle(v)}
                  placeholder="Choose a product"
                />
                <Button
                  variant="primary"
                  loading={isLoading}
                  onClick={loadProduct}
                  disabled={!handle}
                >
                  Load
                </Button>
                {productId && (
                  <Button
                    url={`shopify:admin/products/${productId}`}
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

        {product && (
          <>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Existing & new dates
                  </Text>

                  {dates.length === 0 && (
                    <Banner tone="info">No dates yet. Add some below.</Banner>
                  )}

                  <Box padding="300">
                    <ul style={{ columns: 2, listStyle: "none", padding: 0, margin: 0 }}>
                      {dates.map((d) => (
                        <li key={d.date} style={{ marginBottom: 8 }}>
                          <InlineStack gap="200" align="start">
                            <Button size="slim" onClick={() => toggleSeason(d.date)}>
                              {d.date}{d.season === "high" ? " — High" : ""}
                            </Button>
                            <Button
                              tone="critical"
                              size="slim"
                              onClick={() => removeDate(d.date)}
                              variant="plain"
                            >
                              Remove
                            </Button>
                            {d.note && (
                              <Box paddingInlineStart="200">
                                <Text as="span" variant="bodySm">
                                  Note: {d.note}
                                </Text>
                              </Box>
                            )}
                          </InlineStack>
                        </li>
                      ))}
                    </ul>
                  </Box>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Pick multiple dates (big calendar)</Text>

                  <InlineStack gap="200" align="start">
                    <Select
                      label="Season for selected"
                      labelHidden
                      options={[
                        { label: "Low", value: "low" },
                        { label: "High", value: "high" },
                      ]}
                      value={adding.season}
                      onChange={(v) => setAdding(a => ({ ...a, season: v }))}
                    />
                    <TextField
                      label="Note (to apply to selected)"
                      labelHidden
                      value={adding.note}
                      onChange={(v) => setAdding(a => ({ ...a, note: v }))}
                      placeholder="Optional note"
                    />
                  </InlineStack>

                  <Box paddingBlockStart="200">
                    <MultiMonthCalendar
                      monthStart={multi.monthStart}
                      monthsToShow={multi.monthsToShow}
                      selected={multi.selected}
                      onToggle={(iso) => {
                        setMulti(prev => {
                          const next = new Set(prev.selected);
                          if (next.has(iso)) next.delete(iso); else next.add(iso);
                          return { ...prev, selected: next };
                        });
                      }}
                      onPrev={() => setMulti(prev => ({ ...prev, monthStart: addMonths(prev.monthStart, -1) }))}
                      onNext={() => setMulti(prev => ({ ...prev, monthStart: addMonths(prev.monthStart, +1) }))}
                    />
                  </Box>

                  <InlineStack gap="200">
                    <Button
                      onClick={() => {
                        if (multi.selected.size === 0) return;
                        const bulk = Array.from(multi.selected);
                        for (const iso of bulk) {
                          addSingleDate(iso, adding.season, adding.note);
                        }
                      }}
                      variant="primary"
                      disabled={multi.selected.size === 0}
                    >
                      Add selected dates ({multi.selected.size})
                    </Button>

                    <Button
                      tone="critical"
                      onClick={() => setMulti(prev => ({ ...prev, selected: new Set() }))}
                      disabled={multi.selected.size === 0}
                    >
                      Clear selection
                    </Button>
                  </InlineStack>

                  <InlineStack>
                    <Button variant="primary" onClick={saveAll} disabled={!dates.length}>
                      Save dates to product
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </>
        )}
      </Layout>
    </Page>
  );
}
