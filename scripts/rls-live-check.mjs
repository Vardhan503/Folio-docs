// Live row-level security check against a real Supabase project.
//
// Signs in as two existing users with the publishable key (exactly what the
// browser can do, no service-role key), creates a throwaway document, checks
// every sharing rule through the real Data API, and deletes the document.
//
// Usage (migrations 001–003 applied, two users created):
//   FOLIO_OWNER_EMAIL=... FOLIO_OWNER_PASSWORD=... \
//   FOLIO_COLLABORATOR_EMAIL=... FOLIO_COLLABORATOR_PASSWORD=... \
//   npm run test:rls-live
//
// NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are read
// from the environment or .env.local. Nothing secret is printed.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // Optional: the variables may come from the environment instead.
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See the usage notes at the top of this script.`);
    process.exit(2);
  }
  return value;
}

loadEnvFile();
const url = required("NEXT_PUBLIC_SUPABASE_URL");
const key = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const owner = { email: required("FOLIO_OWNER_EMAIL"), password: required("FOLIO_OWNER_PASSWORD") };
const collaborator = {
  email: required("FOLIO_COLLABORATOR_EMAIL"),
  password: required("FOLIO_COLLABORATOR_PASSWORD"),
};

const options = { auth: { persistSession: false, autoRefreshToken: false } };

async function signIn({ email, password }, label) {
  const client = createClient(url, key, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`Could not sign in as the ${label} (${error.code ?? error.status}).`);
    process.exit(2);
  }
  return { client, id: data.user.id };
}

let passed = 0;
const failures = [];
function check(ok, label) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL  ${label}`);
  }
}

/** Rows an update or delete actually changed (RLS silently filters rows out). */
async function changed(query, column = "id") {
  const { data, error } = await query.select(column);
  return error ? -1 : data.length;
}

const A = await signIn(owner, "owner");
const B = await signIn(collaborator, "collaborator");
const anon = createClient(url, key, options);

const { data: created, error: createError } = await A.client
  .from("documents")
  .insert({ owner_id: A.id, title: "RLS live check (safe to delete)" })
  .select("id")
  .single();
if (createError) {
  console.error(`Owner could not create a test document (${createError.code}).`);
  process.exit(1);
}
const doc = created.id;

try {
  // Ownership on insert.
  const forged = await A.client.from("documents").insert({ owner_id: B.id, title: "Forged" });
  check(Boolean(forged.error), "nobody can create a document owned by someone else");
  check(
    (await changed(A.client.from("documents").update({ title: "Owner rename" }).eq("id", doc))) === 1,
    "owner can rename their document",
  );

  // Unshared user.
  const unsharedRead = await B.client.from("documents").select("id").eq("id", doc);
  check(unsharedRead.data?.length === 0, "unshared user cannot read the document");
  check(
    (await changed(B.client.from("documents").update({ title: "hijack" }).eq("id", doc))) === 0,
    "unshared user cannot update the document",
  );
  const unsharedLookup = await B.client.rpc("find_share_recipient", {
    p_document_id: doc,
    p_email: owner.email,
  });
  check(Boolean(unsharedLookup.error), "non-owner cannot resolve emails for the document");
  const selfGrant = await B.client
    .from("document_shares")
    .insert({ document_id: doc, user_id: B.id, role: "editor" });
  check(Boolean(selfGrant.error), "non-owner cannot grant themselves access");

  // Owner shares as viewer.
  const lookup = await A.client.rpc("find_share_recipient", {
    p_document_id: doc,
    p_email: collaborator.email.toUpperCase(),
  });
  check(lookup.data === B.id, "owner resolves a collaborator by exact email");
  const unknown = await A.client.rpc("find_share_recipient", {
    p_document_id: doc,
    p_email: "no-such-user@folio.invalid",
  });
  check(!unknown.error && unknown.data === null, "unknown email resolves to null");
  const share = await A.client
    .from("document_shares")
    .insert({ document_id: doc, user_id: B.id, role: "viewer" });
  check(!share.error, "owner shares the document as viewer");
  const duplicate = await A.client
    .from("document_shares")
    .insert({ document_id: doc, user_id: B.id, role: "editor" });
  check(duplicate.error?.code === "23505", "a duplicate share is rejected");

  // Viewer.
  const viewerRead = await B.client.from("documents").select("id, title").eq("id", doc);
  check(viewerRead.data?.length === 1, "viewer can read the shared document");
  check(
    (await changed(B.client.from("documents").update({ title: "viewer edit" }).eq("id", doc))) === 0,
    "viewer cannot rename",
  );
  check(
    (await changed(
      B.client.from("documents").update({ content: { type: "doc", content: [] } }).eq("id", doc),
    )) === 0,
    "viewer cannot edit content",
  );
  check(
    (await changed(B.client.from("documents").update({ owner_id: B.id }).eq("id", doc))) === -1,
    "viewer cannot change owner_id",
  );
  check(
    (await changed(
      B.client.from("document_shares").update({ role: "editor" }).eq("document_id", doc),
      "document_id",
    )) <= 0,
    "viewer cannot promote themselves",
  );

  // Owner promotes to editor.
  check(
    (await changed(
      A.client
        .from("document_shares")
        .update({ role: "editor" })
        .eq("document_id", doc)
        .eq("user_id", B.id),
      "document_id",
    )) === 1,
    "owner changes the role to editor",
  );
  const role = await A.client
    .from("document_shares")
    .select("role")
    .eq("document_id", doc)
    .eq("user_id", B.id)
    .single();
  check(role.data?.role === "editor", "the share now has the editor role");

  // Editor.
  check(
    (await changed(B.client.from("documents").update({ title: "Edited by editor" }).eq("id", doc))) === 1,
    "editor can rename",
  );
  check(
    (await changed(
      B.client
        .from("documents")
        .update({ content: { type: "doc", content: [{ type: "paragraph" }] } })
        .eq("id", doc),
    )) === 1,
    "editor can edit content",
  );
  check(
    (await changed(B.client.from("documents").update({ owner_id: B.id }).eq("id", doc))) === -1,
    "editor cannot change owner_id",
  );
  check(
    (await changed(
      B.client.from("documents").update({ created_at: "2000-01-01T00:00:00Z" }).eq("id", doc),
    )) === -1,
    "editor cannot change created_at",
  );
  check(
    (await changed(B.client.from("documents").delete().eq("id", doc))) === 0,
    "editor cannot delete the document",
  );
  const editorGrant = await B.client
    .from("document_shares")
    .insert({ document_id: doc, user_id: A.id, role: "viewer" });
  check(Boolean(editorGrant.error), "editor cannot grant access");
  check(
    (await changed(
      B.client.from("document_shares").update({ role: "viewer" }).eq("document_id", doc),
      "document_id",
    )) <= 0,
    "editor cannot change permissions",
  );
  check(
    (await changed(
      B.client.from("document_shares").delete().eq("document_id", doc),
      "document_id",
    )) <= 0,
    "editor cannot revoke access",
  );
  const editorLookup = await B.client.rpc("find_share_recipient", {
    p_document_id: doc,
    p_email: owner.email,
  });
  check(Boolean(editorLookup.error), "editor cannot resolve emails for sharing");

  // Owner cannot transfer ownership through the API either.
  check(
    (await changed(A.client.from("documents").update({ owner_id: B.id }).eq("id", doc))) === -1,
    "owner cannot change owner_id",
  );

  // Revocation.
  const revoke = await A.client
    .from("document_shares")
    .delete()
    .eq("document_id", doc)
    .eq("user_id", B.id);
  check(!revoke.error, "owner revokes access");
  const revokedRead = await B.client.from("documents").select("id").eq("id", doc);
  check(revokedRead.data?.length === 0, "revoked user can no longer read the document");
  check(
    (await changed(
      B.client.from("documents").update({ content: { type: "doc", content: [] } }).eq("id", doc),
    )) === 0,
    "revoked user can no longer save",
  );
  const revokedShares = await B.client.from("document_shares").select("role").eq("document_id", doc);
  check(revokedShares.data?.length === 0, "revoked user no longer sees the share");

  // Signed-out requests.
  const anonRead = await anon.from("documents").select("id").limit(1);
  check(Boolean(anonRead.error) || anonRead.data?.length === 0, "anonymous users cannot read documents");
  const anonLookup = await anon.rpc("find_share_recipient", { p_document_id: doc, p_email: owner.email });
  check(Boolean(anonLookup.error), "anonymous users cannot call find_share_recipient");
  check(
    (await changed(anon.from("documents").delete().eq("id", doc))) <= 0,
    "anonymous users cannot delete documents",
  );

  // Deletion: viewers can't delete; the owner's delete also removes the shares.
  const reshare = await A.client
    .from("document_shares")
    .insert({ document_id: doc, user_id: B.id, role: "viewer" });
  check(!reshare.error, "owner shares the document again as viewer");
  check(
    (await changed(B.client.from("documents").delete().eq("id", doc))) === 0,
    "viewer cannot delete the document",
  );
  check(
    (await changed(A.client.from("documents").delete().eq("id", doc))) === 1,
    "owner deletes the document",
  );
  const deletedRead = await B.client.from("documents").select("id").eq("id", doc);
  check(deletedRead.data?.length === 0, "collaborator can no longer read the deleted document");
  const deletedShares = await A.client.from("document_shares").select("user_id").eq("document_id", doc);
  check(
    !deletedShares.error && deletedShares.data.length === 0,
    "deleting the document removes its shares",
  );
} finally {
  const cleanup = await A.client.from("documents").delete().eq("id", doc);
  if (cleanup.error) console.error(`Could not delete the test document ${doc}; delete it manually.`);
  await Promise.all([A.client.auth.signOut(), B.client.auth.signOut()]);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
