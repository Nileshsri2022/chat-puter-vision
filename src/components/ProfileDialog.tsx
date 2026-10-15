import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  AtSign,
  BadgeCheck,
  Calendar,
  Camera,
  LogOut,
  Mail,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { BackendUser } from "@/lib/backend";
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  cleanProfileField,
  prepareAvatarDataUrl,
  type AppProfile,
  type ProfileInfo,
} from "@/lib/profile";
import "./ProfileDialog.css";

/** What Save hands back to the app to persist. */
export interface ProfilePatch {
  displayName: string | null;
  bio: string | null;
  picture: string | null;
}

interface ProfileDialogProps {
  /** The signed-in user from puter.auth.getUser(); details section hides while null. */
  user: BackendUser | null;
  /** The account's Puter profile — read-only, and the fallback under edits. */
  puterProfile: ProfileInfo | null;
  /** This app's stored profile, when one has been saved. */
  appProfile: AppProfile | null;
  onClose: () => void;
  /** Persist the patch; resolves once the outcome is known (never throws). */
  onSave: (patch: ProfilePatch) => Promise<void>;
  onSignOut: () => void;
}

const cleanName = (v: string) => cleanProfileField(v, "displayName");
const cleanBio = (v: string) => cleanProfileField(v, "bio");

/**
 * The account section behind the rail's account button: the user's Puter
 * account details (read-only) and the name / bio / avatar they can edit in
 * this app.
 *
 * Same dialog rules as TextPreviewDialog: Escape is bound on `document`,
 * focus starts on Close and returns to the trigger, the scrim closes.
 * Closing without saving discards the drafts — Discard makes that explicit.
 */
export const ProfileDialog = ({
  user,
  puterProfile,
  appProfile,
  onClose,
  onSave,
  onSignOut,
}: ProfileDialogProps) => {
  const initialName = appProfile?.displayName ?? puterProfile?.name ?? null;
  const initialBio = appProfile?.bio ?? puterProfile?.bio ?? null;
  const initialPicture = appProfile?.picture ?? null;

  const [nameDraft, setNameDraft] = useState(initialName ?? "");
  const [bioDraft, setBioDraft] = useState(initialBio ?? "");
  const [pictureDraft, setPictureDraft] = useState<string | null>(initialPicture);
  const [saving, setSaving] = useState(false);
  const [busyPicture, setBusyPicture] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();
    return () => {
      const el = restoreRef.current;
      if (el instanceof HTMLElement) el.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const dirty =
    cleanName(nameDraft) !== initialName ||
    cleanBio(bioDraft) !== initialBio ||
    pictureDraft !== initialPicture;

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setBusyPicture(true);
    try {
      const dataUrl = await prepareAvatarDataUrl(file);
      setPictureDraft(dataUrl);
    } catch (error) {
      toast({
        title: "Couldn't use that image",
        description:
          error instanceof Error ? error.message : "Please pick another image and try again.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setBusyPicture(false);
      // Allow picking the same file again after a failed attempt.
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave({
        displayName: cleanName(nameDraft),
        bio: cleanBio(bioDraft),
        picture: pictureDraft,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setNameDraft(initialName ?? "");
    setBioDraft(initialBio ?? "");
    setPictureDraft(initialPicture);
  };

  // The avatar falls back through: this app's picture → the Puter profile
  // picture → the initial of whatever name is on screen.
  const avatarSrc = pictureDraft ?? puterProfile?.picture ?? null;
  const shownName = cleanName(nameDraft) ?? user?.username ?? "";
  const initial = shownName.slice(0, 1).toUpperCase() || "?";

  const memberSince = user?.created_ts
    ? new Date(user.created_ts * 1000).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })
    : null;
  // Chip only when the backend actually reported a state.
  const emailConfirmed =
    user?.email_confirmed ??
    (user?.requires_email_confirmation !== undefined
      ? !user.requires_email_confirmation
      : null);

  return (
    <div
      className="profile-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Your profile"
      onClick={onClose}
    >
      <div className="profile-dialog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="profile-dialog-header">
          <h2 className="profile-dialog-title">Profile</h2>
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon"
            className="profile-dialog-close tap-expand"
            onClick={onClose}
            title="Close profile"
            aria-label="Close profile"
          >
            <X className="profile-dialog-close-icon" aria-hidden="true" />
          </Button>
        </div>

        <div className="profile-dialog-body">
          <div className="profile-avatar-row">
            <div className="profile-avatar-wrap">
              {avatarSrc ? (
                <img src={avatarSrc} alt="Your profile picture" className="profile-avatar" />
              ) : (
                <span className="profile-avatar profile-avatar-fallback" aria-hidden="true">
                  {initial}
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="profile-avatar-input"
                aria-label="Upload a profile picture"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <button
                type="button"
                className="profile-avatar-edit"
                onClick={() => fileRef.current?.click()}
                disabled={busyPicture}
                title="Upload a profile picture"
                aria-label="Upload a profile picture"
              >
                {busyPicture ? (
                  <span className="profile-avatar-spinner" aria-hidden="true" />
                ) : (
                  <Camera className="profile-avatar-edit-icon" aria-hidden="true" />
                )}
              </button>
              {pictureDraft && (
                <button
                  type="button"
                  className="profile-avatar-remove"
                  onClick={() => setPictureDraft(null)}
                  title="Remove this app's picture"
                  aria-label="Remove this app's picture"
                >
                  <X className="profile-avatar-remove-icon" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="profile-avatar-hint">
              <span className="profile-avatar-hint-name">
                {user ? `@${user.username}` : shownName || "Your account"}
              </span>
              <span className="profile-avatar-hint-sub">
                PNG, JPG or WebP. Resized and stored with your Puter account.
              </span>
            </div>
          </div>

          <div className="profile-fields">
            <div className="profile-field">
              <label className="profile-field-label" htmlFor="profile-display-name">
                Display name
              </label>
              <Input
                id="profile-display-name"
                value={nameDraft}
                maxLength={DISPLAY_NAME_MAX}
                placeholder={user?.username ?? "Add a name"}
                className="profile-field-input"
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <span className="profile-field-counter" aria-hidden="true">
                {nameDraft.length}/{DISPLAY_NAME_MAX}
              </span>
            </div>
            <div className="profile-field">
              <label className="profile-field-label" htmlFor="profile-bio">
                Bio
              </label>
              <Textarea
                id="profile-bio"
                value={bioDraft}
                maxLength={BIO_MAX}
                rows={3}
                placeholder="A few words about you"
                className="profile-field-bio"
                onChange={(e) => setBioDraft(e.target.value)}
              />
              <span className="profile-field-counter" aria-hidden="true">
                {bioDraft.length}/{BIO_MAX}
              </span>
            </div>
          </div>

          <p className="profile-scope-note">
            Your name, bio and picture are saved to this app's private storage in your
            Puter account, so they follow you across devices.
          </p>

          {user && (
            <div className="profile-details">
              <div className="profile-details-heading">Account details</div>
              <div className="profile-detail-row">
                <AtSign className="profile-detail-icon" aria-hidden="true" />
                <span className="profile-detail-label">Username</span>
                <span className="profile-detail-value">{user.username}</span>
              </div>
              {user.email && (
                <div className="profile-detail-row">
                  <Mail className="profile-detail-icon" aria-hidden="true" />
                  <span className="profile-detail-label">Email</span>
                  <span className="profile-detail-value">
                    {user.email}
                    {emailConfirmed !== null && (
                      <span
                        className={
                          emailConfirmed
                            ? "profile-detail-chip profile-detail-chip-ok"
                            : "profile-detail-chip"
                        }
                      >
                        {emailConfirmed ? "Confirmed" : "Not confirmed"}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {memberSince && (
                <div className="profile-detail-row">
                  <Calendar className="profile-detail-icon" aria-hidden="true" />
                  <span className="profile-detail-label">Member since</span>
                  <span className="profile-detail-value">{memberSince}</span>
                </div>
              )}
              {typeof user.subscribed === "boolean" && (
                <div className="profile-detail-row">
                  <BadgeCheck className="profile-detail-icon" aria-hidden="true" />
                  <span className="profile-detail-label">Plan</span>
                  <span className="profile-detail-value">
                    {user.subscribed ? "Puter paid plan" : "Free plan"}
                  </span>
                </div>
              )}
              {user.is_temp && (
                <div className="profile-detail-row profile-detail-row-warn">
                  <AlertTriangle className="profile-detail-icon" aria-hidden="true" />
                  <span className="profile-detail-label">Account</span>
                  <span className="profile-detail-value">Temporary account</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="profile-dialog-footer">
          <Button
            variant="ghost"
            className="profile-signout"
            onClick={onSignOut}
            disabled={saving}
          >
            <LogOut className="profile-signout-icon" aria-hidden="true" />
            Sign out
          </Button>
          <div className="profile-footer-actions">
            <Button
              variant="ghost"
              className="profile-discard"
              onClick={discard}
              disabled={!dirty || saving}
            >
              Discard
            </Button>
            <Button
              className="profile-save"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
