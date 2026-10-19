import { convertImagesToPNG, needsConversion } from "@/lib/utils/imageConversion";
import { MAX_ATTACHMENTS } from "@/lib/attachments";
import { cn } from "@/lib/utils";
import { modelSupportsVision, type ModelCatalog } from "@/lib/models";
import { useState, useRef, useEffect } from "react";
import { ArrowUp, Paperclip, X, Square, Mic, Sparkles, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelSelector } from "./ModelSelector";
import { useToast } from "@/hooks/use-toast";
import { transcribeAudio } from "@/lib/speech";
import {
  MAX_RECORDING_SECONDS,
  formatDuration,
  pickRecorderMimeType,
} from "@/lib/audio";
import { extractText } from "@/lib/ocr";
import { checkAuthStatus } from "@/lib/backend";
import { usePuterImage } from "@/hooks/usePuterImage";
import { isContextImageItem, type ContextGroup } from "@/lib/contextGroups";
import "./ChatInput.css";


interface PendingImage {
  file: File;
  /** Object URL for the preview; revoked when the attachment is dropped. */
  previewUrl: string;
}

interface ChatInputProps {
  onSend: (message: string, model?: string, images?: File[]) => void;
  onStop?: () => void;
  /**
   * Starts an image generation. `images` are the attachments the turn edits:
   * the image model receives their pixels, so the prompt can refer to "the
   * image" and mean it.
   */
  onGenerateImage?: (prompt: string, images?: File[]) => Promise<void>;
  isGeneratingImage?: boolean;
  disabled?: boolean;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  modelCatalog?: ModelCatalog | null;
  /**
   * Explicit Context Group injected from the Contexts panel via `← Inject into input`.
   * Displayed as a dismissible pill above the composer box.
   */
  injectedContext?: ContextGroup | null;
  /** Clears the currently injected Context Group pill. */
  onClearInjectedContext?: () => void;
  /** Prefills the textarea (inline edit mode). */
  initialValue?: string;
  /** Compact rendering for inline editing (shorter box, no outer padding). */
  compact?: boolean;
  /** Shows a Cancel button; used for inline editing. */
  onCancel?: () => void;
}

/** Turn a getUserMedia/MediaRecorder failure into something actionable. */
function microphoneErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access was blocked. Allow it in your browser's site settings and try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No microphone was found. Connect one and try again.";
  if (name === "NotReadableError" || name === "AbortError")
    return "The microphone is already in use by another app.";
  if (name === "NotSupportedError")
    return "This browser cannot record audio.";
  return error instanceof Error && error.message
    ? error.message
    : "Allow microphone access to use voice input.";
}

export const ChatInput = ({ onSend, onStop, onGenerateImage, isGeneratingImage, disabled, selectedModel, onModelChange, modelCatalog, injectedContext, onClearInjectedContext, initialValue, compact, onCancel }: ChatInputProps) => {
  const [input, setInput] = useState(initialValue ?? "");
  // Attachments live in one array so the preview at index N is always the file
  // at index N — the OCR button and the remove button act on what they show.
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);  // For attaching images to messages
  const [imageGenerationMode, setImageGenerationMode] = useState(false);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [ocrIndex, setOcrIndex] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRecordingRef = useRef(false);
  const pendingImagesRef = useRef<PendingImage[]>([]);
  const { toast } = useToast();

  // Vision support comes from the live model catalog (modalities data);
  // keyword matching is only the offline fallback inside modelSupportsVision.
  const modelSupportsImages = modelSupportsVision(selectedModel, modelCatalog ?? null);
  // In image-generation mode the *image* model reads the attachment, not the
  // chat model, so the chat model's vision support says nothing about whether
  // attaching is possible. Gating on it there hid the whole feature.
  const canAttachImages = imageGenerationMode || modelSupportsImages;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (disabled || isUploading || isGeneratingImage) return;
    const message = input.trim();

    if (imageGenerationMode && onGenerateImage) {
      if (!message) return;
      // The attachments are the edit base, not a chat message: they go to the
      // image model, so the chat model's vision gate does not apply. They are
      // cleared here because the call consumes them.
      const images = pendingImages.map((image) => image.file);
      setInput("");
      clearImages();
      void onGenerateImage(message, images.length > 0 ? images : undefined);
      return;
    }

    // A text-only model can't carry attachments: never send what the composer
    // isn't showing (the API rejects image parts for those models anyway).
    const images = modelSupportsImages
      ? pendingImages.map((image) => image.file)
      : [];
    if (message || images.length > 0) {
      onSend(message, selectedModel, images.length > 0 ? images : undefined);
      setInput("");
      clearImages();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === "Escape" && onCancel) {
      onCancel();
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length > 0) {
      const capacity = MAX_ATTACHMENTS - pendingImages.length;
      if (capacity <= 0) {
        toast({
          title: "Attachment limit reached",
          description: `A message can carry up to ${MAX_ATTACHMENTS} images.`,
          duration: 3000,
        });
        if (imageInputRef.current) imageInputRef.current.value = "";
        return;
      }

      setIsProcessingImages(true);
      const validFiles = files.filter(file => file.type.startsWith('image/'));

      if (validFiles.length === 0) {
        toast({
          title: "No valid images",
          description: "Please select image files only.",
          variant: "destructive",
          duration: 3000,
        });
        setIsProcessingImages(false);
        return;
      }

      // Auto-convert unsupported formats (AVIF, HEIC, etc.) to PNG
      const needsConversionFiles = validFiles.filter(file => needsConversion(file.type));

      let filesToUse = validFiles;
      if (needsConversionFiles.length > 0) {
        const formatNames = needsConversionFiles.map(f => f.type.replace('image/', '').toUpperCase()).join(', ');
        toast({
          title: "Converting images",
          description: `Converting ${formatNames} to PNG format...`,
          duration: 3000,
        });

        try {
          filesToUse = await convertImagesToPNG(validFiles);
          toast({
            title: "Conversion complete",
            description: `Successfully converted ${needsConversionFiles.length} image(s) to PNG`,
            duration: 2000,
          });
        } catch (error) {
          toast({
            title: "Conversion failed",
            description: error instanceof Error ? error.message : "Failed to convert images",
            variant: "destructive",
            duration: 5000,
          });
          setIsProcessingImages(false);
          return;
        }
      }

      const accepted = filesToUse.slice(0, capacity);
      if (accepted.length < filesToUse.length) {
        toast({
          title: "Some images were not added",
          description: `A message can carry up to ${MAX_ATTACHMENTS} images.`,
          duration: 3000,
        });
      }
      // Previews are object URLs built in file order, so preview[i] is
      // accepted[i] no matter which file the browser read first.
      setPendingImages((prev) => [
        ...prev,
        ...accepted.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ]);
      setIsProcessingImages(false);
    }

    // Reset image input
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const clearImages = () => {
    pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setPendingImages([]);
  };

  const removeImage = (index: number) => {
    const removed = pendingImages[index];
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const clearRecordTimer = () => {
    if (recordTimerRef.current !== null) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  /** Release the microphone, whether or not a recording is in flight. */
  const releaseStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const transcribeRecording = async (blob: Blob) => {
    setRecordingState("transcribing");
    try {
      const text = await transcribeAudio(blob);
      setInput((prev) => (prev ? prev + " " : "") + text);
    } catch (error) {
      toast({
        title: "Transcription failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setRecordingState("idle");
    }
  };

  const toggleRecording = async () => {
    if (recordingState === "recording") {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (recordingState !== "idle") return;
    if (!checkAuthStatus()) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to use voice input.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({
        title: "Voice input unavailable",
        description: "This browser cannot record audio. Microphone access also needs a secure context (localhost or HTTPS).",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Ask for a container we know the transcription APIs accept; without an
      // explicit type some browsers report an empty `mimeType`, which would
      // upload the audio as application/octet-stream.
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      audioChunksRef.current = [];
      discardRecordingRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        clearRecordTimer();
        releaseStream();
        mediaRecorderRef.current = null;
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        if (discardRecordingRef.current) return;
        void transcribeRecording(
          new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" })
        );
      };
      // A timeslice keeps the chunks flowing so a long recording is still
      // captured if the tab is backgrounded mid-sentence.
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      setRecordSeconds(0);
      setRecordingState("recording");
      clearRecordTimer();
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((seconds) => {
          const next = seconds + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            // Long recordings cost credits per second and grow past the
            // provider's input cap; stop on our own and say so.
            toast({
              title: "Recording stopped",
              description: `Voice input stops automatically after ${Math.round(
                MAX_RECORDING_SECONDS / 60
              )} minutes.`,
              duration: 4000,
            });
            mediaRecorderRef.current?.stop();
          }
          return next;
        });
      }, 1000);
    } catch (error) {
      clearRecordTimer();
      releaseStream();
      mediaRecorderRef.current = null;
      toast({
        title: "Microphone unavailable",
        description: microphoneErrorMessage(error),
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  // Stop the microphone when the composer goes away (conversation switch,
  // closing the inline editor) instead of leaving a live capture behind.
  useEffect(() => {
    return () => {
      discardRecordingRef.current = true;
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // Already stopped.
      }
      clearRecordTimer();
      releaseStream();
      // The ref is read at unmount so previews added since mount are freed too.
      pendingImagesRef.current.forEach((image) =>
        URL.revokeObjectURL(image.previewUrl)
      );
    };
  }, []);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  // Switching to a text-only model hides the previews, so the attachments are
  // dropped here rather than lingering invisibly until the next send. In
  // image-generation mode the attachments belong to the image model, so they
  // stay: dropping them there would throw away the picture the user is about
  // to edit.
  useEffect(() => {
    if (
      imageGenerationMode ||
      modelSupportsImages ||
      pendingImagesRef.current.length === 0
    )
      return;
    pendingImagesRef.current.forEach((image) =>
      URL.revokeObjectURL(image.previewUrl)
    );
    pendingImagesRef.current = [];
    setPendingImages([]);
    toast({
      title: "Images removed",
      description: "The selected model cannot read images.",
      duration: 4000,
    });
  }, [imageGenerationMode, modelSupportsImages, toast]);

  const extractFromImage = async (index: number) => {
    const file = pendingImages[index]?.file;
    if (!file || ocrIndex !== null) return;
    if (!checkAuthStatus()) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to extract text.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    setOcrIndex(index);
    try {
      const text = await extractText(file);
      setInput((prev) => (prev ? prev + "\n\n" : "") + text);
      toast({ title: "Text extracted", duration: 2000 });
    } catch (error) {
      toast({
        title: "Text extraction failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setOcrIndex(null);
    }
  };

  const hasMessage = input.trim().length > 0;
  const canSubmit = imageGenerationMode
    ? hasMessage && Boolean(onGenerateImage)
    : hasMessage ||
      (modelSupportsImages && pendingImages.length > 0) ||
      Boolean(injectedContext && injectedContext.items.length > 0);

  const primaryContextImage = injectedContext?.items.find(isContextImageItem);
  const { src: injectedContextThumb } = usePuterImage(
    primaryContextImage?.refKind === "drive" ? primaryContextImage.ref : undefined,
    primaryContextImage?.refKind === "data" ? primaryContextImage.ref : undefined
  );

  // Only explicit attachments on this turn trigger the attachment edit hint;
  // reusable conversation context is selected explicitly via `injectedContext`
  // rather than automatically locking onto the last image in the chat.
  const editHint =
    imageGenerationMode && pendingImages.length > 0
      ? `${pendingImages.length} attached image${
          pendingImages.length === 1 ? "" : "s"
        } will be edited.`
      : null;

  return (
    <div className={cn("composer-wrap", compact && "composer-wrap-compact")}>
      <form onSubmit={handleSubmit} className="composer-form">
        {/* Image previews */}
        {canAttachImages && pendingImages.length > 0 && (
          <div className="composer-previews">
            {pendingImages.map((image, index) => (
              <div key={index} className="composer-preview group">
                <img
                  src={image.previewUrl}
                  alt={`Upload ${index + 1}`}
                  className="composer-preview-img"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="composer-preview-ocr"
                  onClick={() => extractFromImage(index)}
                  disabled={ocrIndex !== null}
                  title="Extract text from image"
                >
                  {ocrIndex === index ? (
                    <div className="composer-mini-spinner" />
                  ) : (
                    <ScanText className="composer-mini-icon" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="composer-preview-remove"
                  onClick={() => removeImage(index)}
                >
                  <X className="composer-mini-icon" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {injectedContext && (
          <div className="composer-context-pill" role="status" aria-live="polite">
            {injectedContextThumb && (
              <img
                src={injectedContextThumb}
                alt=""
                className="composer-context-pill-thumb"
              />
            )}
            <span className="composer-context-pill-title">
              {injectedContext.title}
            </span>
            {onClearInjectedContext && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="composer-context-pill-remove tap-expand"
                onClick={onClearInjectedContext}
                title="Remove injected context"
                aria-label={`Remove context ${injectedContext.title}`}
              >
                <X className="composer-mini-icon" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}

        {editHint && (
          <p className="composer-edit-hint" aria-live="polite">
            {editHint}
          </p>
        )}

        <div className="composer-box">
          <Textarea
            id={compact ? undefined : "chat-message-input"}
            name="message"
            aria-label={imageGenerationMode ? "Image prompt" : "Message"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              imageGenerationMode
                ? pendingImages.length > 0
                  ? "Describe the change to make…"
                  : "Describe an image to generate…"
                : modelSupportsImages
                  ? "Message (images supported)…"
                  : "Message FreeTalk…"
            }
            disabled={disabled || isGeneratingImage}
            rows={1}
            autoFocus={compact}
            className="composer-textarea"
          />
          <div className="composer-toolbar">
            <div className="composer-tools">
              {onGenerateImage && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "composer-tool-btn",
                    imageGenerationMode && "composer-tool-btn-active"
                  )}
                  onClick={() => setImageGenerationMode((mode) => !mode)}
                  disabled={disabled || isGeneratingImage}
                  aria-pressed={imageGenerationMode}
                  title={imageGenerationMode ? "Turn off image generation" : "Generate image"}
                  aria-label={imageGenerationMode ? "Turn off image generation" : "Generate image"}
                >
                  {isGeneratingImage ? (
                    <div className="composer-spinner" aria-hidden="true" />
                  ) : (
                    <Sparkles className="composer-tool-icon" aria-hidden="true" />
                  )}
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="composer-tool-btn"
                onClick={toggleRecording}
                // A live recording must stay stoppable — including while a
                // reply is streaming, when the composer is otherwise disabled.
                disabled={
                  recordingState === "transcribing" ||
                  (recordingState === "idle" &&
                    (disabled || isGeneratingImage))
                }
                title={
                  recordingState === "recording"
                    ? `Stop recording (${formatDuration(recordSeconds)})`
                    : "Voice input"
                }
                aria-label={
                  recordingState === "recording" ? "Stop recording" : "Voice input"
                }
              >
                {recordingState === "transcribing" ? (
                  <div className="composer-spinner" aria-hidden="true" />
                ) : (
                  <Mic className={cn("composer-tool-icon", recordingState === "recording" && "composer-mic-recording")} aria-hidden="true" />
                )}
              </Button>
              {recordingState === "recording" && (
                <span className="composer-recording-time" aria-live="polite">
                  {formatDuration(recordSeconds)}
                </span>
              )}
              {onModelChange && (
                <ModelSelector
                  selectedModel={selectedModel || "gpt-5.4-nano"}
                  onModelChange={onModelChange}
                />
              )}
            </div>
            <div className="composer-send-group">
              {canAttachImages && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="composer-tool-btn"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={disabled || pendingImages.length >= MAX_ATTACHMENTS || isProcessingImages}
                  title="Attach images"
                  aria-label="Attach images"
                >
                  {isProcessingImages ? (
                    <div className="composer-spinner" aria-hidden="true" />
                  ) : (
                    <Paperclip className="composer-tool-icon" aria-hidden="true" />
                  )}
                </Button>
              )}
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="composer-cancel-btn"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              )}
              {disabled && onStop ? (
                <Button
                  type="button"
                  size="icon"
                  onClick={onStop}
                  className="composer-send-btn"
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <Square className="composer-tool-icon" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSubmit || disabled || isGeneratingImage || isUploading}
                  className="composer-send-btn"
                  title={imageGenerationMode ? "Generate image" : "Send message"}
                  aria-label={imageGenerationMode ? "Generate image" : "Send message"}
                >
                  <ArrowUp className="composer-tool-icon" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {canAttachImages && (
          <input
            id="image-file-input"
            name="images"
            aria-label="Attach images"
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="composer-hidden-input"
            onChange={handleImageSelect}
          />
        )}

      </form>
    </div>
  );
};
