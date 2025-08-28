import { gqlAdmin } from "./admin-gql.server";

/** Retry helper for throttles / flakes */
export async function withRetry(fn, retries = 3, delay = 700) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function basenameFromUrl(url = "") {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(last);
  } catch {
    return "";
  }
}

/** Query all files with stable preview thumbnails */
const Q_FILES_GQL = `
  query FilesList($first: Int!, $after: String) {
    files(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        __typename
        ... on MediaImage {
          id
          alt
          preview { image { url } }
          image { url width height }
          originalSource { url }
        }
        ... on GenericFile {
          id
          alt
          url
          preview { image { url } }
        }
        ... on Video {
          id
          alt
          preview { image { url } }
          originalSource { url }
        }
      }
    }
  }
`;

export async function listImages(admin, { limit = 100 } = {}) {
  const pageSize = Math.min(250, Math.max(1, limit));
  const res = await withRetry(async () => {
    const r = await admin.graphql(Q_FILES_GQL, { variables: { first: pageSize } });
    return await r.json();
  });

  const nodes = res?.data?.files?.nodes || [];
  const images = nodes
    .map((n) => {
      const preview =
        n?.preview?.image?.url ||
        n?.image?.url ||
        n?.originalSource?.url ||
        n?.url ||
        "";

      if (!preview) return null;

      const filename =
        basenameFromUrl(n?.originalSource?.url || "") ||
        basenameFromUrl(n?.url || "") ||
        basenameFromUrl(preview) ||
        n?.alt ||
        "image";

      return {
        id: n.id,          // use the File's id directly
        preview,
        filename,
        label: filename,
      };
    })
    .filter(Boolean);

  const pageInfo = res?.data?.files?.pageInfo || { hasNextPage: false, endCursor: null };
  return { images, pageInfo };
}

/** Resolve specific file nodes by IDs (for edit forms, etc.) */
const Q_FILES_BY_IDS = `
  query FilesByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      id
      ... on MediaImage {
        alt
        preview { image { url } }
        image { url width height altText }
        originalSource { url }
      }
      ... on GenericFile {
        alt
        url
        preview { image { url } }
      }
      ... on Video {
        alt
        preview { image { url } }
        originalSource { url }
      }
    }
  }
`;

export async function filesByIds(admin, ids = []) {
  const clean = (ids || []).filter(Boolean);
  if (clean.length === 0) return [];

  const res = await withRetry(async () => {
    const r = await admin.graphql(Q_FILES_BY_IDS, { variables: { ids: clean } });
    return await r.json();
  });

  const nodes = res?.data?.nodes || [];
  return nodes
    .map((n) => {
      if (!n?.id) return null;
      const preview =
        n?.preview?.image?.url ||
        n?.image?.url ||
        n?.originalSource?.url ||
        n?.url ||
        "";

      if (!preview) return null;

      const filename =
        basenameFromUrl(n?.originalSource?.url || "") ||
        basenameFromUrl(n?.url || "") ||
        basenameFromUrl(preview) ||
        n?.alt ||
        "image";

      return { id: n.id, preview, filename, label: filename };
    })
    .filter(Boolean);
}

/* -------------------- Uploads (stagedUploadsCreate -> S3 -> fileCreate) -------------------- */

const M_STAGED_UPLOADS_CREATE = `
  mutation StagedUploads($inputs: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $inputs) {
      stagedTargets {
        resourceUrl
        url
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

/** NOTE: Remove adminGraphqlApiId — not present on File union */
const M_FILE_CREATE = `
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        ... on MediaImage {
          alt
          preview { image { url } }
          image { url width height }
          originalSource { url }
        }
        ... on GenericFile {
          alt
          url
          preview { image { url } }
        }
        ... on Video {
          alt
          preview { image { url } }
          originalSource { url }
        }
      }
      userErrors { field message }
    }
  }
`;

/**
 * Upload local files; return normalized objects for the UI:
 *   { id, preview, filename, label }
 */
export async function uploadLocalFiles(admin, files) {
  if (!files?.length) return [];

  // 1) staged upload targets
  const inputs = files.map((f) => ({
    resource: "IMAGE",
    filename: f.name || "upload.jpg",
    mimeType: f.type || "image/jpeg",
    httpMethod: "POST",
  }));

  const staged = await withRetry(async () => {
    const resp = await admin.graphql(M_STAGED_UPLOADS_CREATE, { variables: { inputs } });
    const json = await resp.json();
    const errs = json?.data?.stagedUploadsCreate?.userErrors || [];
    if (errs.length) throw new Error("stagedUploadsCreate: " + JSON.stringify(errs));
    return json;
  });

  const targets = staged?.data?.stagedUploadsCreate?.stagedTargets || [];
  if (targets.length !== files.length) throw new Error("staged targets count mismatch");

  // 2) upload each file to S3 using the browser-provided File blobs
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const t = targets[i];

    const body = new FormData();
    for (const p of t.parameters || []) body.append(p.name, p.value);
    body.append("file", f, f.name || "upload.jpg");

    await withRetry(async () => {
      const up = await fetch(t.url, { method: "POST", body });
      if (!up.ok) {
        const txt = await up.text().catch(() => "");
        throw new Error(`S3 upload failed: ${up.status} ${txt}`);
      }
      return true;
    });
  }

  // 3) create file records
  const created = await withRetry(async () => {
    const resources = targets.map((t, idx) => ({
      originalSource: t.resourceUrl,
      alt: files[idx].name || "",
      contentType: "IMAGE",
    }));
    const resp = await admin.graphql(M_FILE_CREATE, { variables: { files: resources } });
    const json = await resp.json();
    const errs = json?.data?.fileCreate?.userErrors || [];
    if (errs.length) throw new Error("fileCreate: " + JSON.stringify(errs));
    return json?.data?.fileCreate?.files || [];
  });

  // normalize
  return created.map((n) => {
    const preview =
      n?.preview?.image?.url ||
      n?.image?.url ||
      n?.originalSource?.url ||
      n?.url ||
      "";

    const filename =
      basenameFromUrl(n?.originalSource?.url || "") ||
      basenameFromUrl(n?.url || "") ||
      basenameFromUrl(preview) ||
      n?.alt ||
      "image";

    return {
      id: n.id,   // ✅ use File.id only
      preview,
      filename,
      label: filename,
    };
  });
}
