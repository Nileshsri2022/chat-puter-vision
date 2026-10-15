// Render smoke tests for the profile section (the account button's dialog).
//
// Same approach as artifactsPanel.test.tsx: `renderToStaticMarkup` runs no
// effects, so this pins structure and copy — the account details shown, the
// editable drafts prefilled from the effective profile, and the save guard —
// not the KV reads/writes behind Save (those are in account.test.ts).

import { test, expect } from "bun:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileDialog } from "@/components/ProfileDialog";
import type { BackendUser } from "@/lib/backend";
import type { AppProfile, ProfileInfo } from "@/lib/profile";

const USER: BackendUser = {
  uuid: "u1",
  username: "ada",
  email: "ada@example.com",
  email_confirmed: true,
  created_ts: 1700000000,
  subscribed: false,
};

const PUTER_PROFILE: ProfileInfo = { name: "Ada", picture: null, bio: null };

const APP_PROFILE: AppProfile = {
  version: 1,
  displayName: "App Name",
  bio: "App bio",
  picture: "data:image/png;base64,AAAA",
  updatedAt: 1,
};

const render = (overrides: Partial<ComponentProps<typeof ProfileDialog>> = {}) =>
  renderToStaticMarkup(
    <ProfileDialog
      user={USER}
      puterProfile={PUTER_PROFILE}
      appProfile={null}
      onClose={() => {}}
      onSave={async () => {}}
      onSignOut={() => {}}
      {...overrides}
    />,
  );

test("renders the logged-in user's account details", () => {
  const html = render();
  expect(html).toContain("@ada");
  expect(html).toContain("ada@example.com");
  expect(html).toContain("Confirmed");
  expect(html).toContain("Member since");
  expect(html).toContain("Free plan");
  expect(html).toContain("Sign out");
  expect(html).toMatch(/role="dialog"/);
});

test("hides the account section while the user is still loading", () => {
  const html = render({ user: null });
  expect(html).not.toContain("Member since");
  expect(html).not.toContain("ada@example.com");
});

test("drafts are prefilled from the app profile over the Puter profile", () => {
  const html = render({ appProfile: APP_PROFILE });
  expect(html).toContain('value="App Name"');
  expect(html).toContain("App bio");
  // The custom picture renders and carries its remove control.
  expect(html).toContain(APP_PROFILE.picture);
  expect(html).toContain("Remove this app&#x27;s picture");
});

test("save is disabled while the draft matches the stored profile", () => {
  const html = render({
    appProfile: { ...APP_PROFILE, bio: null, picture: null },
  });
  const saveAttrs = /<button([^>]*)>\s*Save changes\s*</.exec(html)?.[1] ?? "";
  expect(saveAttrs).toContain('disabled=""');
});

test("falls back to the Puter profile name and an initial avatar", () => {
  const html = render();
  expect(html).toContain('value="Ada"');
  // No picture anywhere: the avatar is the initial of the shown name.
  expect(html).toMatch(/profile-avatar-fallback[^>]*>A</);
  // And with no custom picture there is nothing to remove.
  expect(html).not.toContain("Remove this app");
});

test("flags a temporary account", () => {
  const html = render({ user: { ...USER, is_temp: true } });
  expect(html).toContain("Temporary account");
});
