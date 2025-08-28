export const Q_PRODUCT_BY_HANDLE = `
  query ProductByHandle($handle: String!) {
    productByHandle(handle: $handle) { id handle title }
  }
`;

export const Q_PRODUCT_SEASON_CAL = `
  query GetSeasonCalendar($id: ID!) {
    product(id: $id) {
      id
      metafield(namespace:"custom", key:"season_calendar") {
        id
        type
        value
      }
    }
  }
`;

export const Q_METAOBJECTS_BY_IDS = `
  query MetaobjectsByIds($ids:[ID!]!) {
    nodes(ids:$ids) {
      ... on Metaobject {
        id
        handle
        type { name }
        fields { key value }
      }
    }
  }
`;

export const M_METAOBJECT_UPSERT = `
  mutation UpsertSeasonDate($type:String!, $handle:String!, $fields:[MetaobjectFieldInput!]!) {
    metaobjectUpsert(
      handle: { type: $type, handle: $handle }
      metaobject: { fields: $fields }
    ) {
      metaobject { id handle }
      userErrors { field message }
    }
  }
`;

export const M_METAFIELDS_SET = `
  mutation MetafieldsSet($metafields:[MetafieldsSetInput!]!) {
    metafieldsSet(metafields:$metafields) {
      metafields { id key namespace type value }
      userErrors { field message }
    }
  }
`;

export const Q_PRODUCTS_LIST = `
  query ProductsList($first: Int!, $query: String) {
    products(first: $first, query: $query, sortKey: TITLE) {
      edges {
        node { id title handle }
      }
    }
  }
`;

export const Q_PRODUCT_SEASON_CAL_REFS = `
  query ProductSeasonCal($id: ID!) {
    product(id: $id) {
      id
      metafield(namespace: "custom", key: "season_calendar") {
        references(first: 250) {
          nodes {
            __typename
            ... on Metaobject {
              id
              handle
              type
              fields { key value }
            }
          }
        }
      }
    }
  }
`;

// Product's itinerary day refs (custom.itinerary_days)
export const Q_PRODUCT_ITINERARY_REFS = `
  query ProductItinerary($id: ID!) {
    product(id: $id) {
      id
      metafield(namespace: "custom", key: "itinerary_days") {
        references(first: 250) {
          nodes {
            __typename
            ... on Metaobject {
              id
              handle
              type
              fields { key value }
            }
          }
        }
      }
    }
  }
`;

// ✅ value must be a JSON string (e.g. '["gid://shopify/Metaobject/…","…"]')
export const M_SET_PRODUCT_ITINERARY = `
  mutation SetProductItinerary($productId: ID!, $value: String!) {
    metafieldsSet(metafields: [{
      ownerId: $productId,
      namespace: "custom",
      key: "itinerary_days",
      type: "list.metaobject_reference",
      value: $value
    }]) {
      metafields { id key namespace type value }
      userErrors { field message }
    }
  }
`;

// Files listing — ask for preview + image URLs for safety.
export const Q_FILES = `#graphql
  query Files($first: Int!, $after: String, $query: String) {
    files(first: $first, after: $after, query: $query) {
      nodes {
        __typename
        ... on MediaImage {
          id
          preview {
            image { url }
          }
          image {
            url
            altText
          }
        }
        ... on GenericFile {
          id
          preview {
            image { url }
          }
          url
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// List metaobjects of a type with fields
export const Q_METAOBJECTS_BY_TYPE = `
  query MetaobjectsByType($type: String!, $first: Int!, $after: String) {
    metaobjects(type: $type, first: $first, after: $after) {
      nodes {
        id
        handle
        type
        fields { key value }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// Get one metaobject by ID
export const Q_METAOBJECT_BY_ID = `
  query MetaobjectById($id: ID!) {
    node(id: $id) {
      ... on Metaobject {
        id
        handle
        type
        fields { key value }
      }
    }
  }
`;

// Upsert (create/update) a metaobject by (type, handle)
export const M_METAOBJECT_UPSERT_GENERIC = `
  mutation UpsertMetaobject($type: String!, $handle: String!, $fields: [MetaobjectFieldInput!]!) {
    metaobjectUpsert(
      handle: { type: $type, handle: $handle }
      metaobject: { fields: $fields }
    ) {
      metaobject { id handle type }
      userErrors { field message }
    }
  }
`;

// Delete (optional)
export const M_METAOBJECT_DELETE = `
  mutation DeleteMetaobject($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;

// List Files (images only)
export const Q_FILES_SEARCH = `
  query Files($first: Int!, $after: String, $query: String) {
    files(first: $first, after: $after, query: $query) {
      nodes {
        __typename
        ... on MediaImage {
          id
          image { id url width height altText }
          createdAt
          alt
          mimeType
          fileErrors { code message }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// Get files by IDs
export const Q_FILES_BY_IDS = `
  query FilesByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on MediaImage {
        id
        image { id url width height altText }
      }
    }
  }
`;

// Upload files (URLs or staged upload) — simplest path: remote URLs
export const M_FILE_CREATE = `
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        ... on MediaImage { id image { id url width height altText } }
      }
      userErrors { code message field }
    }
  }
`;
