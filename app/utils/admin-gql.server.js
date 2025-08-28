export async function gqlAdmin(admin, query, variables = {}) {
  const res = await admin.graphql(query, { variables });
  const json = await res.json();

  if (!json || !json.data) {
    throw new Error("Admin GraphQL: empty response");
  }
  for (const k of Object.keys(json.data)) {
    const op = json.data[k];
    if (op && Array.isArray(op.userErrors) && op.userErrors.length) {
      const msgs = op.userErrors.map((e) => e.message).join("; ");
      throw new Error(`Admin GraphQL userErrors: ${msgs}`);
    }
  }
  return json.data;
}
